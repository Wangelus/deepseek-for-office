/* ============================================
   Skill 生成器（MD 标准文档 → 结构化 Skill YAML，AI 提取）
   职责：把用户编写的格式/文字标准文档（Markdown）交给 AI，
   提取为符合 Skill Schema 的 YAML，经校验后入库。
   （3.3 内置 Skill 搁置期间的临时方案；未来有可靠标准来源时，
   同样走 parse → validate → store 通道导入）

   扩展点：
   - .yml 直接导入（原 M3.4 规划）：复用 parseResponse 的剥围栏 + 校验逻辑
   - 编辑已有 Skill：基于 skill 对象生成"改写"提示词
   ============================================ */

import { parse } from './yaml.js';
import { SkillValidator } from './SkillValidator.js';

/** 生成参数：结构化输出 → 低温稳定；标准文档较长 → 高 token 上限 */
export const GENERATION_OPTIONS = { temperature: 0.3, maxTokens: 4096 };

/** 内嵌 Schema 规格说明（与 SkillValidator 校验规则保持一致） */
const SCHEMA_SPEC = `Skill Schema 规范（生成的 YAML 必须完全符合，仅输出 YAML 本身）：
- name: 必填字符串。Skill 显示名（简洁中文，如"公文写作规范"）
- version: 必填字符串。语义化版本，固定写 "1.0.0"
- description: 可选字符串。一句话简介
- system_prompt: 必填多行字符串。写作助手的核心行为规范，把标准文档中的总体要求
  （定位、语气、禁忌、质量标准）总结进去。可含以下占位符（原样保留不要改动）：
  {{#document_types}}    编译时替换为当前文种的结构要求
  {{#few_shot_examples}} 编译时替换为写作示例
  {{#terminology}}       编译时替换为相关术语参考
  {{user_instruction}}   编译时替换为用户本次指令
- document_types: 必填非空数组。标准文档中每个文种（如通知/报告/请示）一项：
  - name: 文种名（如"通知"）
  - template: 该文种的结构与格式要求（从标准文档对应章节提炼）
- few_shot_examples: 可选数组，最多 3 项，每项为 {role: user 或 assistant, content: 文本}。
  标准文档含示例时，抽取为 user（写作要求）/assistant（参考范文）配对；没有则省略该字段
- terminology: 可选数组。标准文档中的规范表述/术语：
  - term: 术语名
  - meaning: 释义
  - keywords: 可选字符串数组，检索关键词（用户输入中出现哪些词时该术语相关）
- format_rules: 可选数组，留空 []
不要输出任何解释文字，不要 Markdown 代码围栏。`;

export class SkillGenerator {

  /**
   * @param {{apiClient?: import('../api/DeepSeekClient.js').DeepSeekClient, validator?: SkillValidator}} deps
   *   apiClient 仅 generate() 需要；纯函数（buildMessages/parseResponse）可不传
   */
  constructor({ apiClient = null, validator = new SkillValidator() } = {}) {
    this.apiClient = apiClient;
    this.validator = validator;
  }

  /**
   * 构建生成请求消息（纯函数）
   * @param {string} mdText 标准文档全文
   * @returns {Array<{role: string, content: string}>}
   */
  buildMessages(mdText) {
    return [
      {
        role: 'system',
        content: `你是一名 Skill 定义生成器。用户提供一份写作标准/格式规范文档（Markdown），请把它提取为一份 Skill YAML 定义。\n\n${SCHEMA_SPEC}`
      },
      { role: 'user', content: mdText }
    ];
  }

  /**
   * 解析模型响应为 Skill（纯函数，不抛异常）：
   * 防御性剥 ```yaml 围栏（含围栏外解释文字）→ YAML 解析 → Schema 校验 → 附 id
   * @param {string} text 模型原始输出
   * @param {string} id 新 Skill 的 id（调用方生成，如 custom-{Date.now()}）
   * @returns {{ok: true, skill: object} | {ok: false, errors: string[]}} errors 为中文文案
   */
  parseResponse(text, id) {
    let cleaned = (text || '').trim();

    // 围栏提取：跳过开栏行（语言标记），截到闭栏或结尾
    const fenceIdx = cleaned.indexOf('```');
    if (fenceIdx !== -1) {
      const start = cleaned.indexOf('\n', fenceIdx) + 1;
      const end = cleaned.indexOf('```', start);
      cleaned = (end !== -1 ? cleaned.slice(start, end) : cleaned.slice(start)).trim();
    }

    let raw;
    try {
      raw = parse(cleaned);
    } catch (e) {
      return { ok: false, errors: [e.message] };
    }

    const result = this.validator.validate(raw);
    if (!result.ok) return { ok: false, errors: result.errors };

    return { ok: true, skill: { id, ...result.skill } };
  }

  /**
   * 生成 Skill：调 API → 解析 → 校验
   * @param {string} mdText 标准文档全文
   * @param {{apiKey: string, customModel: string, model: string, endpoint: string}} settings
   * @returns {Promise<{ok: true, skill: object} | {ok: false, errors: string[]}>}
   * @throws {import('../api/DeepSeekClient.js').ApiError} 网络/服务端错误（重试已内置）
   */
  async generate(mdText, settings) {
    const response = await this.apiClient.chat(this.buildMessages(mdText), settings, GENERATION_OPTIONS);
    return this.parseResponse(response.content, `custom-${Date.now()}`);
  }
}
