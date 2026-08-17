/* ============================================
   自定义 Skill 生成面板视图
   职责：三种入口（粘贴 / .md/.txt 文件导入 / Word 选中文本）→ 生成
   → 状态反馈（生成中/校验错误/成功）→ 已生成 Skill 列表管理（删除）。
   面板 DOM 复用 .settings-overlay/.settings-panel 样式（与设置面板一致）。

   扩展点：
   - .yml 直接导入（原 M3.4 规划）：文件入口扩展 accept 与解析
   - Skill 编辑：列表项加"编辑"按钮，回填编辑
   ============================================ */

export class SkillGeneratorView {

  /** ＋ 按钮打开面板回调（装配时注入 → controller.handleOpenSkillPanel） */
  onOpen = null;

  /** 生成回调（装配时注入 → controller.handleGenerateSkill） */
  onGenerate = null;

  /** 删除回调（装配时注入 → controller.handleDeleteSkill） */
  onDelete = null;

  /** 从 Word 选中文本导入回调（装配时注入 → controller.handleImportSkillFromWord） */
  onImportFromWord = null;

  /** 是否生成中（按钮禁用 + 文案切换） */
  #isGenerating = false;

  /** 打开面板（调用方已刷新列表） */
  open() {
    document.getElementById('skillPanelOverlay').style.display = 'flex';
  }

  /** 关闭面板并清空状态提示 */
  close() {
    document.getElementById('skillPanelOverlay').style.display = 'none';
    this.setStatus('');
  }

  /** 读取粘贴区内容（去首尾空白） */
  getMarkdown() {
    return document.getElementById('skillMdInput').value.trim();
  }

  /** 回填粘贴区 */
  setMarkdown(text) {
    document.getElementById('skillMdInput').value = text;
  }

  /**
   * 状态提示（生成中/校验错误/成功）
   * @param {string} text 空串清除
   * @param {'loading'|'success'|'error'|''} [type]
   */
  setStatus(text, type = '') {
    const el = document.getElementById('skillGenStatus');
    el.textContent = text;
    el.className = `test-result skill-gen-status ${type}`.trim();
  }

  /** 生成中开关：按钮禁用 + 文案切换 */
  setGenerating(isGenerating) {
    this.#isGenerating = isGenerating;
    const btn = document.getElementById('generateSkillBtn');
    btn.disabled = isGenerating;
    btn.textContent = isGenerating ? '生成中...' : '✨ 生成 Skill';
  }

  /**
   * 渲染自定义 Skill 列表（含删除按钮）
   * @param {Array<object>} skills
   */
  renderSkillList(skills) {
    const list = document.getElementById('customSkillList');
    list.innerHTML = '';
    if (skills.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'skill-list-empty';
      empty.textContent = '还没有自定义 Skill。粘贴标准文档后点击"生成 Skill"。';
      list.appendChild(empty);
      return;
    }

    skills.forEach((skill) => {
      const item = document.createElement('div');
      item.className = 'custom-skill-item';

      const info = document.createElement('div');
      info.className = 'custom-skill-info';

      const name = document.createElement('div');
      name.className = 'custom-skill-name';
      name.textContent = `${skill.name} · ${skill.documentTypes.map((dt) => dt.name).join('/') || '通用'}`;
      info.appendChild(name);

      if (skill.description) {
        const desc = document.createElement('div');
        desc.className = 'custom-skill-desc';
        desc.textContent = skill.description;
        info.appendChild(desc);
      }

      const delBtn = document.createElement('button');
      delBtn.className = 'custom-skill-del';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', () => { if (this.onDelete) this.onDelete(skill.id); });

      item.appendChild(info);
      item.appendChild(delBtn);
      list.appendChild(item);
    });
  }

  /** 绑定面板相关事件；动作通过回调转发给控制器 */
  bindEvents() {
    document.getElementById('newSkillBtn').addEventListener('click', () => { if (this.onOpen) this.onOpen(); });
    document.getElementById('closeSkillPanelBtn').addEventListener('click', () => this.close());
    document.getElementById('skillPanelOverlay').addEventListener('click', (e) => {
      // 仅点击遮罩层本身（而非面板）时关闭
      if (e.target === e.currentTarget) this.close();
    });
    document.getElementById('generateSkillBtn').addEventListener('click', () => {
      if (this.#isGenerating) return;
      if (this.onGenerate) this.onGenerate();
    });
    document.getElementById('skillFileBtn').addEventListener('click', () => {
      document.getElementById('skillFileInput').click();
    });
    document.getElementById('skillFileInput').addEventListener('change', (e) => this.#readFile(e.target));
    document.getElementById('skillFromWordBtn').addEventListener('click', () => {
      if (this.onImportFromWord) this.onImportFromWord();
    });
  }

  /**
   * 读取用户选择的本地文件（.md/.txt）回填粘贴区
   * @param {HTMLInputElement} input
   */
  async #readFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      this.setMarkdown(text);
      this.setStatus(`已导入「${file.name}」（${text.length} 字），可编辑后生成`, 'success');
    } catch (e) {
      this.setStatus('文件读取失败，请重试', 'error');
    } finally {
      input.value = '';   // 允许重复选择同一文件
    }
  }
}
