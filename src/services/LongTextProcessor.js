/* ============================================
   M2.2 长文本分段处理核心管线（Map-Reduce）
   - Map：分段并发请求（默认 4 并发），段失败定位到段号，
     支持 AbortSignal 中止（原样上抛 AbortError，不包装）
   - Reduce：summarize 去重合并后请求层级摘要，附逐段要点；
     proofread 去重后直接拼接还原原文
   纯逻辑模块（无 DOM / 无 fetch），Node 可直接运行，
   依赖 TextSplitter 与 DeepSeekClient。
   ============================================ */
import { TextSplitter } from './TextSplitter.js';
import { ApiError } from '../api/DeepSeekClient.js';

/** 分段默认参数（供 controller 与测试覆盖） */
export const LONG_TEXT_DEFAULTS = { chunkSize: 2000, overlap: 200, concurrency: 4 };

export class LongTextProcessor {

  /**
   * @param {{apiClient: import('../api/DeepSeekClient.js').DeepSeekClient, promptBuilder: import('../prompts/PromptBuilder.js').PromptBuilder}} deps
   */
  constructor({ apiClient, promptBuilder }) {
    this.apiClient = apiClient;
    this.promptBuilder = promptBuilder;
  }

  /**
   * 长文本 Map-Reduce 管线
   * @param {{text: string, mode: 'summarize'|'proofread', settings: object, signal?: AbortSignal,
   *          onProgress?: (done: number, total: number) => void,
   *          splitOptions?: {chunkSize?: number, overlap?: number, concurrency?: number}}} params
   * @returns {Promise<string>} 最终结果文本
   * @throws {ApiError} 某段最终失败（message 前缀"第 N 段处理失败："）；中止时原样抛 AbortError（不包装）
   */
  async process({ text, mode, settings, signal, onProgress, splitOptions }) {
    const segments = TextSplitter.split(text, splitOptions);
    const total = segments.length;
    const concurrency = splitOptions?.concurrency ?? LONG_TEXT_DEFAULTS.concurrency;

    // Map 阶段：分批并发，批内任一失败则整体失败（段号已编入错误文案）
    const results = [];
    let done = 0;
    for (let i = 0; i < total; i += concurrency) {
      const batch = segments.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map((segment, k) =>
        this.#mapSegment(segment, i + k, total, mode, settings, signal)));
      results.push(...batchResults);
      done += batch.length;
      onProgress?.(done, total);
    }

    return this.#reduce(mode, results, settings, signal);
  }

  /**
   * 单段 Map 调用：失败包装为"第 N 段处理失败"的 ApiError（保留原始 code）；
   * 中止（AbortError）原样上抛，交由调用方识别
   */
  async #mapSegment(segment, index, total, mode, settings, signal) {
    try {
      const res = await this.apiClient.chat([
        { role: 'system', content: this.promptBuilder.buildSystemPrompt() },
        { role: 'user', content: this.promptBuilder.buildLongTextMapPrompt(mode, segment, index + 1, total) }
      ], settings, { signal });
      return res.content;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new ApiError(`第 ${index + 1} 段处理失败：${e.message}`, e.code || 'unknown');
    }
  }

  /**
   * Reduce 阶段：先去重叠，再按模式合并
   * - summarize：合并各段要点请求一次层级摘要，附上逐段要点
   * - proofread：各段回显的校对结果去重叠后直接拼接。
   *   注意 join 用空串而非分隔符：相邻段在原文中本就连续
   *   （重叠区被去重移除），插入任何分隔符都会破坏逐字还原
   */
  async #reduce(mode, results, settings, signal) {
    const deduped = this.#dedupOverlap(results);

    if (mode === 'proofread') {
      return deduped.join('');
    }

    const merged = deduped.join('\n\n---\n\n');
    const reduceRes = await this.apiClient.chat([
      { role: 'system', content: this.promptBuilder.buildSystemPrompt() },
      { role: 'user', content: this.promptBuilder.buildLongTextReducePrompt(mode, merged) }
    ], settings, { signal });

    const details = deduped.map((r, i) => `### 第 ${i + 1} 段\n${r}`).join('\n\n');
    return `${reduceRes.content}\n\n## 逐段摘要\n\n${details}`;
  }

  /**
   * 相邻结果去重叠：取前段尾部 200 字与后段头部 400 字，
   * 找前段尾部的最长后缀使后段头部以其开头，去掉后段头部的该重复部分
   * @param {string[]} results
   * @returns {string[]}
   */
  #dedupOverlap(results) {
    const deduped = [];
    for (const cur of results) {
      let segment = cur;
      if (deduped.length > 0) {
        const prev = deduped[deduped.length - 1];
        const tail = prev.slice(-200);
        const head = segment.slice(0, 400);
        // 从最长到最短尝试 tail 的后缀（最长后缀优先，重叠最多被去除）
        const maxLen = Math.min(tail.length, head.length);
        for (let len = maxLen; len > 0; len--) {
          const suffix = tail.slice(tail.length - len);
          if (head.startsWith(suffix)) {
            segment = segment.slice(suffix.length);
            break;
          }
        }
      }
      deduped.push(segment);
    }
    return deduped;
  }
}
