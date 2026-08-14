/* ============================================
   Skill YAML 解析薄封装
   职责：统一 YAML 解析入口，把 js-yaml 的英文异常归一为中文文案。
   js-yaml 为 vendored 单文件（src/lib/js-yaml.mjs，见该文件头部注释）。

   扩展点：
   - M3.4 Skill 导入：用户本地 .yml 导入同样走本模块 parse()
   ============================================ */

import jsyaml from '../lib/js-yaml.mjs';

/** YAML 语法错误：message 为用户可见中文文案 */
export class SkillYamlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SkillYamlError';
  }
}

/**
 * 解析 YAML 文本为 JS 对象
 * @param {string} text
 * @returns {object} 空文本解析为空对象 {}
 * @throws {SkillYamlError} 语法错误时抛出（message 含中文文案）
 */
export function parse(text) {
  try {
    return jsyaml.load(text) ?? {};
  } catch (e) {
    // reason 为简短原因（如 "bad indentation of a mapping entry (3:2)"），
    // message 还附带源码片段，太冗长，取 reason
    throw new SkillYamlError(`Skill YAML 语法错误：${e.reason || e.message}`);
  }
}
