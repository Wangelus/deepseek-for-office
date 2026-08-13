/* ============================================
   聊天控制器
   编排层：串联 Store / API Client / PromptBuilder / WordService / Views。
   持有选中文本（selectedText）与发送中（isLoading）状态。

   扩展点：
   - M2.2 长文本分段：新增 handleLongText()（分割 + Map-Reduce + 进度提示）
   - M2.4 SSE 流式：已实现（#sendToApi 走 chatStream，handleStop 中止）
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

  /** 当前流式请求的 AbortController（null = 无进行中的生成） */
  #abortController = null;

  /** 生成中被清空对话时置位：收到的流内容直接丢弃（不入 store、不渲染） */
  #discardStream = false;

  /**
   * 监听文档级事件：自动检测 Word 选中变化
   * （按钮类事件绑定在各视图的 bindEvents 中，通过回调转发到本控制器）
   */
  bindSelectionTracking() {
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

  /** 清空对话历史（生成中清空 = 中止并丢弃未完成内容，防止孤立回复气泡） */
  clearChat() {
    if (this.#abortController) {
      this.#abortController.abort();
      this.#discardStream = true;
    }
    this.chatStore.clear();
    this.chatView.renderAll([]);
  }

  /**
   * 停止当前生成。
   * abort() 幂等（连点无副作用）；#abortController 的清理唯一所有权在
   * #sendToApi 的 finally，此处不置 null。
   */
  handleStop() {
    if (this.#abortController) this.#abortController.abort();
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
   * 调用 DeepSeek API（SSE 流式）：拼装消息 → 打字指示 → 逐字追加 → 收尾。
   * 六种出口：
   *   ① 生成中被清空对话 → 丢弃（不入 store 不渲染）
   *   ② 用户停止且已有内容 → 保留 + "已停止生成"标记
   *   ③ 用户停止且零内容 → 静默（不产生气泡）
   *   ④ 正常完成 → 一次性 Markdown 渲染
   *   ⑤ 网络中断且有内容 → 保留部分内容 + 错误横幅
   *   ⑥ 网络中断且无内容 → 错误横幅
   * @param {string} userMessage 用户消息（可能已含文档上下文）
   * @param {{apiKey: string, customModel: string, model: string, endpoint: string}} settings
   */
  async #sendToApi(userMessage, settings) {
    this.isLoading = true;
    this.#abortController = new AbortController();
    this.chatView.setGenerating(true);

    // 拼装 API 消息：系统提示 + 最近 20 条历史 + 当前用户消息
    const apiMessages = [
      { role: 'system', content: this.promptBuilder.buildSystemPrompt() },
      ...this.chatStore.getContextMessages(20),
      { role: 'user', content: userMessage }
    ];

    this.chatView.showTyping();
    let fullText = '';   // 本地累积；流式期间不碰 ChatStore（防 localStorage 刷爆）

    try {
      const result = await this.apiClient.chatStream(apiMessages, settings, {
        signal: this.#abortController.signal,
        onDelta: (delta) => {
          fullText += delta;
          this.chatView.appendStreamDelta(delta);
        }
      });

      if (this.#discardStream) {                       // 出口①
        this.chatView.hideTyping();
        return;
      }
      if (result.aborted) {                            // 出口②③
        if (fullText) this.#finalizeStream(fullText, { stopped: true });
        else this.chatView.hideTyping();
      } else {                                         // 出口④
        this.#finalizeStream(fullText || '(无响应内容)');
      }
    } catch (e) {                                      // 出口⑤⑥
      if (fullText) {
        this.#finalizeStream(fullText);
        this.chatView.addError(e.message);
      } else {
        this.chatView.hideTyping();
        this.chatView.addError(e.message);
      }
    } finally {
      this.isLoading = false;
      this.#abortController = null;
      this.#discardStream = false;
      this.chatView.setGenerating(false);
    }
  }

  /**
   * 流式收尾：仅在此刻写一次 Store（拿 index/time），再渲染最终气泡
   * @param {string} content 完整回复文本
   * @param {{stopped?: boolean}} [options]
   */
  #finalizeStream(content, { stopped = false } = {}) {
    const { index, time } = this.chatStore.push('assistant', content);
    this.chatView.finalizeStreamMessage(content, index, time, { stopped });
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
