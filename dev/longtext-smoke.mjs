/* 长文本分段处理（M2.2 核心管线）冒烟验证脚本（开发期工具）
 * 用法：先 `python dev/sse_mock.py`，再开另一个终端 `node dev/longtext-smoke.mjs`
 * 覆盖 6 组场景：
 *   1. 分割器·中文分隔（切点落句号，相邻段精确重叠 200 字）
 *   2. 分割器·硬切与短文本
 *   3. 管线 summarize（mock 回显要点 + 固定层级摘要）
 *   4. 管线 proofread 去重（逐字回显 + 去重后完整还原原文）
 *   5. 中止（AbortError 原样上抛，不包装为 ApiError）
 *   6. 段失败（ApiError 定位到"第 3 段"）
 * 依赖 dev/sse_mock.py 的非流式路由 /v1/plain/chat/completions；
 * TextSplitter / LongTextProcessor 为纯逻辑模块（无浏览器专属依赖），Node 18+ 可直接运行
 */
import { TextSplitter } from '../src/services/TextSplitter.js';
import { LongTextProcessor } from '../src/services/LongTextProcessor.js';
import { PromptBuilder } from '../src/prompts/PromptBuilder.js';
import { DeepSeekClient, ApiError } from '../src/api/DeepSeekClient.js';

const BASE = 'http://localhost:3999/v1/plain';
const SETTINGS = { apiKey: 'sk-test', model: 'deepseek-chat', customModel: '', endpoint: BASE };

let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name} ${extra}`);
  }
}

// 中文句子库：每句约 30 字（长度相近即可），10 句一轮约 300 字；
// 句与句之间仅以句号连接（无换行），保证切点落在单字符 '。' 上（cutLen=1 → 重叠精确）
const S = [
  '第一句：项目背景与目标明确，主要解决文档长文本处理的痛点',
  '第二句：整体方案采用 Map-Reduce 管线，先分段并行再统一合并',
  '第三句：分段器按照中文标点切分，滑动窗口重叠保证上下文连续',
  '第四句：每段请求完全独立进行，段与段之间互不影响互不阻塞',
  '第五句：并发数量默认四个，兼顾处理速度与接口调用压力',
  '第六句：遇到接口异常时准确定位到具体段号，便于排查修复',
  '第七句：用户取消操作时立即中止所有未完成的请求调用',
  '第八句：校对模式逐段回写文本，去重后完整还原原始内容',
  '第九句：摘要模式先提取各段要点，再合并生成层级式总结',
  '第十句：整个过程对用户透明，进度信息实时反馈到界面',
];

/** 生成 rounds 轮文本（每轮 10 句以句号连接），轮末补一个句号收尾 */
const makeText = (rounds) => Array(rounds).fill(S.join('。')).join('。') + '。';

const client = new DeepSeekClient();
const processor = new LongTextProcessor({ apiClient: client, promptBuilder: new PromptBuilder() });

// 场景 1：分割器·中文分隔（约 9000 字 → 5 段，切点落在 '。' 上）
{
  const text = makeText(30);
  const segments = TextSplitter.split(text, { chunkSize: 2000, overlap: 200 });

  check('分割: 段数 >= 3', segments.length >= 3, `实际: ${segments.length}`);
  let overlapOk = true;
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i].slice(-200) !== segments[i + 1].slice(0, 200)) {
      overlapOk = false;
      break;
    }
  }
  check('分割: 相邻段精确重叠 200 字', overlapOk);
}

// 场景 2：分割器·硬切与短文本（无任何分隔符 → 按窗口硬切）
{
  const hard = 'a'.repeat(4500);
  const hardSegs = TextSplitter.split(hard, { chunkSize: 2000, overlap: 200 });

  check('硬切: 段数 >= 3', hardSegs.length >= 3, `实际: ${hardSegs.length}`);
  check('硬切: 每段长度 <= 2000', hardSegs.every((s) => s.length <= 2000), `实际: ${hardSegs.map((s) => s.length).join(',')}`);
  check('硬切: 首段长度 === 2000', hardSegs[0].length === 2000, `实际: ${hardSegs[0].length}`);

  const short = TextSplitter.split('短文本');
  check('短文本: 原样返回单段', short.length === 1 && short[0] === '短文本', JSON.stringify(short));
}

// 场景 3：summarize 管线（mock 回显要点 + 固定层级摘要）
{
  // 约 3000 字、默认 chunkSize 2000 → 恰好 2 段：
  // 刻意避开"第 3 段"（mock 对段号 3 一律返回 401，留给场景 6 专用）
  const text = makeText(10);
  const progress = [];
  const result = await processor.process({
    text, mode: 'summarize', settings: SETTINGS,
    onProgress: (done, total) => progress.push([done, total])
  });

  check('summarize: 结果含"一句话结论"', result.includes('一句话结论'), `实际: ${result.slice(0, 120)}`);
  check('summarize: 结果含"核心要点"', result.includes('核心要点'));
  check('summarize: 结果含"逐段摘要"', result.includes('逐段摘要'));
  check('summarize: 逐段摘要含"### 第 1 段"', result.includes('### 第 1 段'));
  check('summarize: onProgress 末次 done===total', progress.length > 0 && progress[progress.length - 1][0] === progress[progress.length - 1][1], JSON.stringify(progress));
}

// 场景 4：proofread 去重（mock 逐字回显各段，去重拼接后必须逐字还原原文）
{
  const text = makeText(10);
  const result = await processor.process({ text, mode: 'proofread', settings: SETTINGS });

  check('proofread: 去重后结果 === 原始 text', result === text, `长度 ${result.length} vs ${text.length}`);
}

// 场景 5：中止（mock 每段 sleep 0.2s 后回显，300ms 后 abort → 原样抛 AbortError）
{
  const ac = new AbortController();
  const text = makeText(15);   // 约 4500 字，chunkSize 800 → 约 8 段
  const p = processor.process({
    text, mode: 'proofread', settings: SETTINGS, signal: ac.signal,
    splitOptions: { chunkSize: 800 }
  });
  setTimeout(() => ac.abort(), 300);

  let threw = null;
  try { await p; } catch (e) { threw = e; }

  check('中止: reject 且 e.name === AbortError', threw?.name === 'AbortError', `实际: ${threw?.name} ${threw?.message}`);
}

// 场景 6：段失败（约 6000 字 → 4 段，段号 3 被 mock 拒绝，错误定位段号）
{
  const text = makeText(20);
  let threw = null;
  try {
    await processor.process({ text, mode: 'summarize', settings: SETTINGS });
  } catch (e) { threw = e; }

  check('段失败: 抛 ApiError', threw instanceof ApiError, `实际: ${threw?.name}`);
  check('段失败: message 定位到第 3 段', threw?.message?.includes('第 3 段处理失败'), `实际: ${threw?.message}`);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
// 自然退出（不调 process.exit，避免 Windows 上 libuv 退出竞态的断言噪音）
process.exitCode = failed ? 1 : 0;
