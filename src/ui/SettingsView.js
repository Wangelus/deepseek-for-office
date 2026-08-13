/* ============================================
   设置面板视图
   面板开合、表单回填/收集、测试连接反馈。
   成功文案（'✓ 连接成功！'）归本视图；失败文案由 apiClient.test 抛出的 ApiError 携带。

   扩展点：
   - M5.3 设置面板增强：模型预设选择器、隐私模式开关、Skill 管理子面板
   - M7 多模型：预设下拉替换/扩展 modelSelect
   ============================================ */

export class SettingsView {

  /**
   * @param {{settingsService: import('../services/SettingsService.js').SettingsService, apiClient: import('../api/DeepSeekClient.js').DeepSeekClient}} deps
   */
  constructor({ settingsService, apiClient }) {
    this.settingsService = settingsService;
    this.apiClient = apiClient;
  }

  /** 打开面板：先回填当前设置 */
  open() {
    this.fillForm();
    document.getElementById('settingsOverlay').style.display = 'flex';
  }

  /** 关闭面板并清空测试结果 */
  close() {
    document.getElementById('settingsOverlay').style.display = 'none';
    document.getElementById('testResult').textContent = '';
  }

  /** 用 localStorage 中的设置回填表单 */
  fillForm() {
    const s = this.settingsService.get();
    document.getElementById('apiKeyInput').value = s.apiKey;
    document.getElementById('modelSelect').value = s.model;
    document.getElementById('customModelInput').value = s.customModel;
    document.getElementById('endpointInput').value = s.endpoint;
  }

  /**
   * 从表单收集设置（trim + 去掉 endpoint 尾部斜杠）
   */
  collectFromForm() {
    return {
      apiKey: document.getElementById('apiKeyInput').value.trim(),
      model: document.getElementById('modelSelect').value,
      customModel: document.getElementById('customModelInput').value.trim(),
      endpoint: document.getElementById('endpointInput').value.trim().replace(/\/+$/, '')
    };
  }

  /** 保存并关闭面板 */
  save() {
    this.settingsService.save(this.collectFromForm());
    this.close();
  }

  /** 切换 API Key 明文/密文显示 */
  toggleApiKeyVisibility() {
    const input = document.getElementById('apiKeyInput');
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  /**
   * 测试连接：空 Key 本地拦截；结果状态写入 #testResult
   * （.test-result + loading/success/error 类名与旧版一致）
   */
  async testConnection() {
    const resultEl = document.getElementById('testResult');
    const settings = this.collectFromForm();

    if (!settings.apiKey) {
      resultEl.textContent = '请先输入 API Key';
      resultEl.className = 'test-result error';
      return;
    }

    resultEl.textContent = '测试中...';
    resultEl.className = 'test-result loading';

    try {
      await this.apiClient.test(settings);
      resultEl.textContent = '✓ 连接成功！';
      resultEl.className = 'test-result success';
    } catch (e) {
      resultEl.textContent = e.message;
      resultEl.className = 'test-result error';
    }
  }

  /** 绑定面板相关事件 */
  bindEvents() {
    document.getElementById('settingsBtn').addEventListener('click', () => this.open());
    document.getElementById('closeSettingsBtn').addEventListener('click', () => this.close());
    document.getElementById('settingsOverlay').addEventListener('click', (e) => {
      // 仅点击遮罩层本身（而非面板）时关闭
      if (e.target === e.currentTarget) this.close();
    });
    document.getElementById('saveSettingsBtn').addEventListener('click', () => this.save());
    document.getElementById('testConnBtn').addEventListener('click', () => this.testConnection());
    document.getElementById('toggleApiKeyBtn').addEventListener('click', () => this.toggleApiKeyVisibility());
  }
}
