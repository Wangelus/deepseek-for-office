/* ============================================
   激活 Skill 状态
   职责：记录当前激活的 Skill id 与文种选择（localStorage）。
   键：ds_active_skill（id，空串 = 通用模式）/ ds_active_doc_type（文种名）。
   ============================================ */

const KEY_ACTIVE_SKILL = 'ds_active_skill';
const KEY_ACTIVE_DOC_TYPE = 'ds_active_doc_type';

export class ActiveSkillStore {

  /**
   * 读取激活状态
   * @returns {{skillId: string, docType: string}}
   */
  get() {
    return {
      skillId: localStorage.getItem(KEY_ACTIVE_SKILL) || '',
      docType: localStorage.getItem(KEY_ACTIVE_DOC_TYPE) || ''
    };
  }

  /**
   * 保存激活状态
   * @param {{skillId: string, docType?: string}} state
   */
  save({ skillId, docType = '' }) {
    localStorage.setItem(KEY_ACTIVE_SKILL, skillId || '');
    localStorage.setItem(KEY_ACTIVE_DOC_TYPE, docType || '');
  }

  /** 复位为通用模式 */
  clear() {
    localStorage.setItem(KEY_ACTIVE_SKILL, '');
    localStorage.setItem(KEY_ACTIVE_DOC_TYPE, '');
  }
}
