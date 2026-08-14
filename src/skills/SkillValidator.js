/* ============================================
   Skill YAML Schema 校验
   职责：校验解析后的 YAML 对象是否符合 Skill Schema，通过后归一化为
   camelCase 的 Skill 对象（引擎 3.2 只消费该形状）。

   Schema（与 开发流程文档/架构拆分.md 3.1 一致）：
   - 必填：name / version / system_prompt / document_types（非空数组）
   - 可选：description / few_shot_examples / terminology / format_rules
   - terminology 条目可带 keywords（3.2 术语检索用，可选 string 数组）
   - 未知多余字段忽略（向前兼容，M4 扩展 format_rules 结构时不破坏）

   扩展点：
   - M4 格式检查：format_rules 的结构校验在此收紧
   - M3.4 自定义 Skill：导入校验复用本模块
   ============================================ */

/** Skill 校验错误：message 为聚合后的中文错误清单（逐行一条） */
export class SkillValidationError extends Error {
  constructor(errors) {
    super(errors.join('\n'));
    this.name = 'SkillValidationError';
    this.errors = errors;
  }
}

/** few_shot_examples 允许的 role 取值 */
const FEW_SHOT_ROLES = ['user', 'assistant'];

/** 校验错误聚合上限（防止异常文件刷屏） */
const MAX_ERRORS = 10;

export class SkillValidator {

  /**
   * 校验并归一化 Skill 对象
   * @param {object} raw 解析后的 YAML 对象
   * @returns {{ok: true, skill: object} | {ok: false, errors: string[]}}
   *   ok=true 时 skill 为 camelCase 归一化对象（含 id 之外的字段，id 由调用方按文件名附加）
   */
  validate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, errors: ['Skill 文件内容必须为键值对结构'] };
    }

    const errors = [];
    const str = (v) => typeof v === 'string' && v.trim() !== '';

    // ── 必填字段 ──
    if (!str(raw.name)) errors.push('字段 name 缺失或为空（Skill 显示名）');
    if (raw.version === undefined || raw.version === null || String(raw.version).trim() === '') {
      errors.push('字段 version 缺失或为空（语义化版本，如 1.0.0）');
    }
    if (!str(raw.system_prompt)) errors.push('字段 system_prompt 缺失或为空');

    // ── document_types：必填非空数组 ──
    if (!Array.isArray(raw.document_types) || raw.document_types.length === 0) {
      errors.push('字段 document_types 缺失或为空数组（至少定义一个文种）');
    } else {
      raw.document_types.forEach((dt, i) => {
        const path = `document_types[${i}]`;
        if (!dt || typeof dt !== 'object' || Array.isArray(dt)) {
          errors.push(`${path} 必须为对象`);
          return;
        }
        if (!str(dt.name)) errors.push(`${path}.name 缺失或为空（文种名）`);
        if (!str(dt.template)) errors.push(`${path}.template 缺失或为空（文种结构模板）`);
      });
    }

    // ── 可选字段 ──
    if (raw.description !== undefined && !str(raw.description)) {
      errors.push('字段 description 必须为非空字符串');
    }

    if (raw.few_shot_examples !== undefined) {
      if (!Array.isArray(raw.few_shot_examples)) {
        errors.push('字段 few_shot_examples 必须为数组');
      } else {
        raw.few_shot_examples.forEach((ex, i) => {
          const path = `few_shot_examples[${i}]`;
          if (!ex || typeof ex !== 'object' || Array.isArray(ex)) {
            errors.push(`${path} 必须为对象`);
            return;
          }
          if (!FEW_SHOT_ROLES.includes(ex.role)) {
            errors.push(`${path}.role 必须为 user 或 assistant`);
          }
          if (!str(ex.content)) errors.push(`${path}.content 缺失或为空`);
        });
      }
    }

    if (raw.terminology !== undefined) {
      if (!Array.isArray(raw.terminology)) {
        errors.push('字段 terminology 必须为数组');
      } else {
        raw.terminology.forEach((t, i) => {
          const path = `terminology[${i}]`;
          if (!t || typeof t !== 'object' || Array.isArray(t)) {
            errors.push(`${path} 必须为对象`);
            return;
          }
          if (!str(t.term)) errors.push(`${path}.term 缺失或为空（术语名）`);
          if (!str(t.meaning)) errors.push(`${path}.meaning 缺失或为空（术语释义）`);
          if (t.keywords !== undefined) {
            if (!Array.isArray(t.keywords)) {
              errors.push(`${path}.keywords 必须为字符串数组（检索关键词）`);
            } else if (!t.keywords.every((k) => typeof k === 'string' && k.trim() !== '')) {
              errors.push(`${path}.keywords 每项必须为非空字符串（检索关键词）`);
            }
          }
        });
      }
    }

    if (raw.format_rules !== undefined && !Array.isArray(raw.format_rules)) {
      errors.push('字段 format_rules 必须为数组（M4 格式检查消费）');
    }

    if (errors.length > 0) {
      return { ok: false, errors: errors.slice(0, MAX_ERRORS) };
    }

    return { ok: true, skill: this.#normalize(raw) };
  }

  /**
   * 归一化为 camelCase 的 Skill 对象（校验通过后调用）
   * @param {object} raw
   * @returns {object}
   */
  #normalize(raw) {
    return {
      name: raw.name.trim(),
      // version 容忍 YAML 数字写法（version: 1.0 会被解析为 number）
      version: String(raw.version).trim(),
      description: (raw.description || '').trim(),
      systemPrompt: raw.system_prompt,
      documentTypes: raw.document_types.map((dt) => ({
        name: dt.name.trim(),
        template: dt.template
      })),
      fewShotExamples: (raw.few_shot_examples || []).map((ex) => ({
        role: ex.role,
        content: ex.content
      })),
      terminology: (raw.terminology || []).map((t) => ({
        term: t.term.trim(),
        meaning: t.meaning.trim(),
        keywords: (t.keywords || []).map((k) => k.trim())
      })),
      formatRules: raw.format_rules || []
    };
  }
}
