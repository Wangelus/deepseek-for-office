/* ============================================
   Skill 引擎（Prompt 编译）
   职责：根据 Skill + 文种 + 用户指令，编译最终 Prompt。
   自实现模板编译器：纯字符串替换，零依赖。
   替换顺序（保证文种模板内的占位符也被处理）：
   ① 文种模板 → ② few-shot 块 → ③ 术语块 → ④ {{user_instruction}} → ⑤ 清残留。

   Skill YAML 中可用的占位符：
   - {{#document_types}}     替换为选中文种的 template（未选/未命中回退第一个）
   - {{#few_shot_examples}}  替换为示例块（最多前 3 条）
   - {{#terminology}}        替换为术语检索命中块（最多 5 条，零命中清空）
   - {{user_instruction}}    任何出现处替换为用户指令

   扩展点：
   - M2.3 扩写/略写：字数目标作为编译参数扩展
   - M6 Agent：Agent 模式复用编译后的 system prompt
   ============================================ */

/** few-shot 示例最多注入条数 */
const MAX_FEW_SHOT = 3;

/** 术语检索最多注入条数 */
const MAX_TERMINOLOGY = 5;

/** 编译缓存上限（条）；满则整体清空重建 */
const CACHE_LIMIT = 32;

export class SkillEngine {

  /** 编译缓存：key → {system, user}；命中返回同一对象引用（冒烟测试以 === 断言） */
  #cache = new Map();

  /**
   * 编译入口：Skill + 文种 + 用户指令 → 最终 Prompt
   * @param {object} skill 归一化 Skill 对象（SkillValidator 输出 + id）
   * @param {{documentType?: string, userInstruction: string, documentContext?: string}} options
   *   documentContext 仅参与术语检索，不写入消息
   * @returns {{system: string, user: string}} user 为指令原样（文档上下文包裹由调用方处理）
   */
  compileSkillPrompt(skill, { documentType, userInstruction, documentContext = '' } = {}) {
    // 缓存 key 以控制字符分隔各字段，避免字段内容拼接歧义
    const key = [skill.id, skill.version, documentType || '', userInstruction, documentContext].join('\u0001');
    const cached = this.#cache.get(key);
    if (cached) return cached;

    const docType = this.#resolveDocumentType(skill, documentType);

    let system = skill.systemPrompt;

    // ① 文种模板（先注入；模板内的占位符随后续步骤一并替换）
    system = system.replace('{{#document_types}}', docType.template);

    // ② few-shot 示例块
    system = system.replace('{{#few_shot_examples}}', this.#renderFewShotBlock(skill.fewShotExamples));

    // ③ 术语检索块（检索输入 = 用户指令 + 选中文本）
    system = system.replace('{{#terminology}}', this.#renderTerminologyBlock(skill.terminology, `${userInstruction}\n${documentContext}`));

    // ④ 用户指令全局替换（split/join 覆盖所有出现处，replace 只换首个）
    system = system.split('{{user_instruction}}').join(userInstruction);

    // ⑤ 清理残留未知占位符（防御：Skill 作者笔误/未来占位符不留痕迹）
    system = system.replace(/\{\{[#/]?[a-zA-Z_][a-zA-Z0-9_]*\}\}/g, '').trim();

    const result = { system, user: userInstruction };
    this.#cache.set(key, result);
    if (this.#cache.size > CACHE_LIMIT) this.#cache.clear();
    return result;
  }

  /**
   * 解析文种：按 name 精确匹配；未指定或未命中回退第一个文种
   * （编译结果永远可用，不因选择错误而失败）
   * @param {object} skill
   * @param {string} [documentType]
   * @returns {{name: string, template: string}}
   */
  #resolveDocumentType(skill, documentType) {
    const fallback = skill.documentTypes[0];
    if (documentType) {
      const found = skill.documentTypes.find((dt) => dt.name === documentType);
      if (found) return found;
      if (fallback) {
        console.warn(`[DeepSeek] Skill ${skill.id} 无文种「${documentType}」，已回退默认文种「${fallback.name}」`);
      }
    }
    // 校验器保证 document_types 非空；此处兜底空模板防手写 Skill 对象
    return fallback || { name: '', template: '' };
  }

  /**
   * few-shot 示例块：最多前 3 条，按 role 打标签
   * @param {Array<{role: string, content: string}>} examples
   * @returns {string} 无示例返回空串（占位符被清空）
   */
  #renderFewShotBlock(examples) {
    const picked = (examples || []).slice(0, MAX_FEW_SHOT);
    if (picked.length === 0) return '';

    const lines = picked.map((ex, i) => {
      const label = ex.role === 'user' ? '用户要求' : '参考输出';
      return `示例 ${i + 1}（${label}）：\n${ex.content.trim()}`;
    });
    return `【写作示例】\n\n${lines.join('\n\n')}`;
  }

  /**
   * 术语检索：keywords 短语子串命中打分（无 keywords 回退 term 直匹配），
   * 按命中数降序取前 5；零命中返回空串（占位符被清空）
   * @param {Array<{term: string, meaning: string, keywords: string[]}>} terminology
   * @param {string} inputText 检索输入（指令 + 选中文本）
   * @returns {string}
   */
  #renderTerminologyBlock(terminology, inputText) {
    const scored = (terminology || [])
      .map((t) => ({ t, score: this.#scoreTerm(t, inputText) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_TERMINOLOGY);

    if (scored.length === 0) return '';

    const lines = scored.map((e) => `- ${e.t.term}：${e.t.meaning}`);
    return `【规范表述参考】涉及相关主题时使用准确表述：\n${lines.join('\n')}`;
  }

  /**
   * 单条术语打分：keywords 短语在输入中的出现次数之和（重复出现计多次）；
   * 无 keywords 条目回退 term 直匹配
   * @param {{term: string, keywords?: string[]}} t
   * @param {string} inputText
   * @returns {number}
   */
  #scoreTerm(t, inputText) {
    const keys = (t.keywords && t.keywords.length > 0) ? t.keywords : [t.term];
    let score = 0;
    for (const key of keys) {
      let idx = inputText.indexOf(key);
      while (idx !== -1) {
        score++;
        idx = inputText.indexOf(key, idx + key.length);
      }
    }
    return score;
  }
}
