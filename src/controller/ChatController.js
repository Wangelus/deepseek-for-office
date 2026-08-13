/* ============================================
   聊天控制器
   编排层：串联 Store / API Client / PromptBuilder / WordService / Views。
   持有选中文本（selectedText）与发送中（isLoading）状态。

   扩展点：
   - M2.2 长文本分段：新增 handleLongText()（分割 + Map-Reduce + 进度提示）
   - M3 Skill 系统：发送时 system prompt 优先取激活 Skill
   - M6 Agent：新增 handleAgentMode()（走 AgentLoop）
   ============================================ */

import { debounce } from '../utils.js';

/** 未配置 API Key 时的提示文案（与旧版逐字一致） */
const NO_API_KEY_MSG = '请先配置 API Key：点击右上角 ⚙️ 图标进入设置';

export class ChatController {

  /**
   * @param {{
   *   settingsService: import('../services/SettingsService.js').SettingsService,
   *   chatStore: import('../services/ChatStore.js').ChatStore,
   *   apiClient: import('../api/DeepSeekClient.js').DeepSeekClient,
   *   promptBuilder: import('../prompts/PromptBuilder.js').PromptBuilder,
   *   wordService: import('../services/office/WordDocumentService.js').WordDocumentService,
   *   chatView: import('../ui/ChatView.js').ChatView,
   *   settingsView: import('../ui/SettingsView.js').SettingsView,
   *   contextBarView: import('../ui/ContextBarView.js').ContextBarView
   * }} deps
   */
  constructor({ settingsService, chatStore, apiClient, promptBuilder, wordService, chatView, settingsView, contextBarView }) {
    this.settingsService = settingsService;
    this.chatStore = chatStore;
    this.apiClient = apiClient;
    this.promptBuilder = promptBuilder;
    this.wordService = wordService;
    this.chatView = chatView;
    this.settingsView = settingsView;
    this.contextBarView = contextBarView;
  }

  /** 当前文档选中文本 */
  selectedText = '';

  /** 是否正在等待 API 响应 */
  isLoading = false;

  /** 绑定发送/快捷操作/清空/选中监听事件 */
  bindEvents() {
    // 发送消息
    document.getElementById('sendBtn').addEventListener('click', () => this.handleSend());
    document.getElementById('userInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // 快捷操作按钮
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this.handleQuickAction(action);
      });
    });

    // 清空对话
    document.getElementById('clearChatBtn').addEventListener('click', () => this.clearChat());

    // 自动检测文档选中变化
    document.addEventListener('selectionchange', debounce(() => this.checkDocumentSelection(), 500));
  }

  /**
   * 发送聊天消息（输入框）
   */
  async handleSend() {
    if (this.isLoading) return;

    const message = this.chatView.getUserInput();
    if (!message) return;

    const settings = this.settingsService.get();
    if (!settings.apiKey) {
      this.chatView.addError(NO_API_KEY_MSG);
      return;
    }

    // 追加用户消息并清空输入框
    this.#appendMessage('user', message);
    this.chatView.clearUserInput();

    // 有选中文本时注入文档上下文
    const contextPrompt = this.promptBuilder.buildContextPrompt(this.selectedText, message);

    await this.#sendToApi(contextPrompt, settings);
  }

  /**
   * 快捷操作（校对/起草/翻译/总结）
   * @param {string} action
   */
  async handleQuickAction(action) {
    if (this.isLoading) return;

    const settings = this.settingsService.get();
    if (!settings.apiKey) {
      this.chatView.addError(NO_API_KEY_MSG);
      return;
    }

    // 获取文档选中文本作为上下文
    const docText = await this.wordService.getSelectedText();

    const prompt = this.promptBuilder.buildQuickActionPrompt(action, docText);
    const label = this.promptBuilder.getActionLabel(action) + (docText ? ` (已选 ${docText.length} 字)` : '');

    this.#appendMessage('user', label);
    await this.#sendToApi(prompt, settings);
  }

  /** 清空对话历史 */
  clearChat() {
    this.chatStore.clear();
    this.chatView.renderAll([]);
  }

  /**
   * 检测文档选中变化并更新上下文提示条
   * （Word API 不可用——如浏览器调试——时静默）
   */
  async checkDocumentSelection() {
    try {
      await Word.run(async (context) => {
        const selection = context.document.getSelection();
        selection.load('text');
        await context.sync();

        const text = selection.text.trim();
        if (text && text !== this.selectedText) {
          this.selectedText = text;
          this.contextBarView.show(text);
        } else if (!text && this.selectedText) {
          this.selectedText = '';
          this.contextBarView.hide();
        }
      });
    } catch (e) {
      // Word API 不可用（e.g., running outside Word）时静默
    }
  }

  /** 清除文档上下文（提示条 × 按钮） */
  clearContext() {
    this.selectedText = '';
    this.contextBarView.hide();
  }

  /**
   * 调用 DeepSeek API：拼装消息 → 打字指示 → 请求 → 渲染结果/错误
   * @param {string} userMessage 用户消息（可能已含文档上下文）
   * @param {{apiKey: string, customModel: string, model: string, endpoint: string}} settings
   */
  async #sendToApi(userMessage, settings) {
    this.isLoading = true;
    this.chatView.setSending(true);

    // 拼装 API 消息：系统提示 + 最近 20 条历史 + 当前用户消息
    const apiMessages = [
      { role: 'system', content: this.promptBuilder.buildSystemPrompt() },
      ...this.chatStore.getContextMessages(20),
      { role: 'user', content: userMessage }
    ];

    this.chatView.showTyping();

    try {
      const { content } = await this.apiClient.chat(apiMessages, settings);
      this.#appendMessage('assistant', content);
    } catch (e) {
      this.chatView.hideTyping();
      this.chatView.addError(e.message);
    } finally {
      this.isLoading = false;
      this.chatView.setSending(false);
    }
  }

  /**
   * 追加消息（写入 Store 并渲染）
   * @param {string} role 'user' | 'assistant'
   * @param {string} content
   */
  #appendMessage(role, content) {
    const { index, time } = this.chatStore.push(role, content);
    this.chatView.appendMessage(role, content, index, time);
    this.chatView.scrollToBottom();
  }
}
