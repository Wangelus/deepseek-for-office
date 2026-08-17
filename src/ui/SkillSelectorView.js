/* ============================================
   Skill 选择器视图（M5.1 最小版）
   职责：Skill 下拉（通用/自定义/内置分组）+ 文种二级选择。
   只操作 DOM，不持有业务状态；选择变化通过回调转发给控制器。

   扩展点：
   - Skill 快速切换快捷键（可选）
   - 当前 Skill 状态图标指示（下拉本身即指示，后续可加徽标）
   ============================================ */

export class SkillSelectorView {

  /** Skill 切换回调（装配时注入 → controller.handleSkillChange） */
  onSkillChange = null;

  /** 文种切换回调（装配时注入 → controller.handleDocTypeChange） */
  onDocTypeChange = null;

  /**
   * 重建下拉选项并回填当前激活态
   * @param {{custom: Array<object>, builtin: Array<object>}} skills 自定义/内置分组
   * @param {{skillId: string, docType: string}} active 当前激活状态
   */
  refresh({ custom, builtin }, active) {
    const select = document.getElementById('skillSelect');
    select.innerHTML = '';
    select.appendChild(new Option('通用写作助手（默认）', ''));

    if (custom.length > 0) {
      select.appendChild(this.#buildGroup('自定义 Skill', custom));
    }
    if (builtin.length > 0) {
      select.appendChild(this.#buildGroup('内置 Skill', builtin));
    }
    select.value = active.skillId || '';

    // 文种二级选择：激活 Skill 有多个文种时显示
    const docTypeSelect = document.getElementById('docTypeSelect');
    const skill = [...custom, ...builtin].find((s) => s.id === active.skillId);
    if (skill && skill.documentTypes.length > 1) {
      docTypeSelect.innerHTML = '';
      skill.documentTypes.forEach((dt) => docTypeSelect.appendChild(new Option(dt.name, dt.name)));
      // 激活文种失效（如切换 Skill 后）回退第一个
      docTypeSelect.value = active.docType || skill.documentTypes[0].name;
      docTypeSelect.style.display = '';
    } else {
      docTypeSelect.style.display = 'none';
    }
  }

  /** 绑定本视图拥有的 DOM 元素事件；动作通过回调转发给控制器 */
  bindEvents() {
    document.getElementById('skillSelect').addEventListener('change', (e) => {
      if (this.onSkillChange) this.onSkillChange(e.target.value);
    });
    document.getElementById('docTypeSelect').addEventListener('change', (e) => {
      if (this.onDocTypeChange) this.onDocTypeChange(e.target.value);
    });
  }

  /**
   * 构建 optgroup 分组
   * @param {string} label 分组名
   * @param {Array<object>} skills
   * @returns {HTMLOptGroupElement}
   */
  #buildGroup(label, skills) {
    const group = document.createElement('optgroup');
    group.label = label;
    skills.forEach((s) => group.appendChild(new Option(s.name, s.id)));
    return group;
  }
}
