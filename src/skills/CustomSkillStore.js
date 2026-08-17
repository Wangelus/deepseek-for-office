/* ============================================
   自定义 Skill 存储
   职责：用户生成的 Skill 持久化到 localStorage（键 ds_custom_skills），
   与内置 Skill（SkillLoader 的 skills/ 目录）并列。
   存储形态：归一化 Skill 对象数组（含 id）。

   扩展点：
   - .yml 直接导入（原 M3.4 规划）：add() 复用
   - Skill 编辑：新增 update(id, skill)
   ============================================ */

const KEY_CUSTOM_SKILLS = 'ds_custom_skills';

export class CustomSkillStore {

  /**
   * 全部自定义 Skill（每次实时读 localStorage，不缓存）
   * @returns {Array<object>}
   */
  getAll() {
    try {
      const saved = localStorage.getItem(KEY_CUSTOM_SKILLS);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      // 数据损坏时丢弃，视为无自定义 Skill
      return [];
    }
  }

  /**
   * 新增；同 id 覆盖（幂等）
   * @param {object} skill
   * @returns {object}
   */
  add(skill) {
    const all = this.getAll().filter((s) => s.id !== skill.id);
    all.push(skill);
    this.#persist(all);
    return skill;
  }

  /**
   * 按 id 删除
   * @param {string} id
   * @returns {boolean} 是否删到
   */
  remove(id) {
    const all = this.getAll();
    const next = all.filter((s) => s.id !== id);
    this.#persist(next);
    return next.length < all.length;
  }

  /**
   * 按 id 取单个；不存在返回 null
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    return this.getAll().find((s) => s.id === id) || null;
  }

  /** 持久化 */
  #persist(list) {
    try {
      localStorage.setItem(KEY_CUSTOM_SKILLS, JSON.stringify(list));
    } catch (e) {
      // 存储已满等异常时静默忽略
    }
  }
}
