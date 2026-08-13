/* ============================================
   聊天区视图
   消息气泡渲染、打字指示器、错误横幅、欢迎页、输入框操作。
   只操作 DOM，不持有业务状态；所有 CSS 类名与旧版一致（taskpane.css 零改动）。

   扩展点：
   - M2.4 SSE 流式：新增 appendStreamDelta()（逐字增量渲染）
   - M5 UI 增强：长消息折叠、代码块复制按钮
   ============================================ */

export class ChatView {

  /** 发送按钮回调（装配时注入 → controller.handleSend） */
  onSend = null;

  /** 快捷操作回调（装配时注入 → controller.handleQuickAction） */
  onQuickAction = null;

  /** 清空对话回调（装配时注入 → controller.clearChat） */
  onClearChat = null;

  /**
   * @param {{markdownRenderer: typeof import('./MarkdownRenderer.js').MarkdownRenderer, wordService: import('../services/office/WordDocumentService.js').WordDocumentService}} deps
   */
  constructor({ markdownRenderer, wordService }) {
    this.markdownRenderer = markdownRenderer;
    this.wordService = wordService;
  }

  /**
   * 全量渲染消息列表；无消息时渲染欢迎页
   * @param {Array<{role: string, content: string, time: number}>} messages
   */
  renderAll(messages) {
    const chatArea = document.getElementById('chatArea');
    chatArea.innerHTML = '';
    if (messages.length === 0) {
      chatArea.innerHTML = this.getWelcomeHTML();
    } else {
      messages.forEach((msg, i) => this.appendMessage(msg.role, msg.content, i, msg.time));
      this.scrollToBottom();
    }
  }

  /**
   * 渲染单条消息气泡
   * @param {string} role 'user' | 'assistant'
   * @param {string} content
   * @param {number} index 消息序号（用作 DOM id）
   * @param {number} time 时间戳
   */
  appendMessage(role, content, index, time) {
    const chatArea = document.getElementById('chatArea');

    // 首条真实消息出现时移除欢迎页
    const welcomeEl = chatArea.querySelector('.welcome-message');
    if (welcomeEl) welcomeEl.remove();

    // 移除打字指示器（若存在）
    const typingEl = chatArea.querySelector('.typing-indicator');
    if (typingEl) typingEl.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.id = `msg-${index}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (role === 'assistant') {
      contentDiv.innerHTML = this.markdownRenderer.render(content);

      // 操作按钮区：插入到文档 / 复制
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';

      const insertBtn = document.createElement('button');
      insertBtn.className = 'msg-action-btn';
      insertBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
      插入到文档
    `;
      insertBtn.addEventListener('click', () => this.#insertToDocument(content));
      actionsDiv.appendChild(insertBtn);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'msg-action-btn';
      copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      复制
    `;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content).then(() => {
          copyBtn.textContent = '✓ 已复制';
          setTimeout(() => {
            copyBtn.innerHTML = copyBtn.innerHTML.replace('✓ 已复制', `
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            复制
          `);
          }, 2000);
        });
      });
      actionsDiv.appendChild(copyBtn);

      msgDiv.appendChild(contentDiv);
      msgDiv.appendChild(actionsDiv);
    } else {
      contentDiv.textContent = content;
      msgDiv.appendChild(contentDiv);
    }

    // 时间戳
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    const date = new Date(time || Date.now());
    timeDiv.textContent = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    msgDiv.appendChild(timeDiv);

    chatArea.appendChild(msgDiv);
  }

  /** 显示打字指示器（先移除欢迎页） */
  showTyping() {
    const chatArea = document.getElementById('chatArea');
    const welcomeEl = chatArea.querySelector('.welcome-message');
    if (welcomeEl) welcomeEl.remove();

    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    chatArea.appendChild(indicator);
    this.scrollToBottom();
  }

  /** 移除打字指示器 */
  hideTyping() {
    const indicator = document.querySelector('.typing-indicator');
    if (indicator) indicator.remove();
  }

  /**
   * 追加错误横幅：⚠️ 前缀、点击关闭、8 秒自动移除
   */
  addError(text) {
    const chatArea = document.getElementById('chatArea');
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = `⚠️ ${text}`;
    banner.addEventListener('click', () => banner.remove());
    chatArea.appendChild(banner);
    this.scrollToBottom();
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
  }

  /** 发送中禁用发送按钮 */
  setSending(isLoading) {
    const btn = document.getElementById('sendBtn');
    btn.disabled = isLoading;
  }

  /** 滚动到底部 */
  scrollToBottom() {
    const chatArea = document.getElementById('chatArea');
    requestAnimationFrame(() => {
      chatArea.scrollTop = chatArea.scrollHeight;
    });
  }

  /** 读取输入框内容（去首尾空白） */
  getUserInput() {
    return document.getElementById('userInput').value.trim();
  }

  /** 清空输入框并复位高度 */
  clearUserInput() {
    const input = document.getElementById('userInput');
    input.value = '';
    input.style.height = 'auto';
  }

  /** 绑定本视图拥有的 DOM 元素事件；动作通过回调转发给控制器 */
  bindEvents() {
    // 发送消息（按钮 + 输入框回车）
    document.getElementById('sendBtn').addEventListener('click', () => { if (this.onSend) this.onSend(); });
    document.getElementById('userInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.onSend) this.onSend();
      }
    });

    // 快捷操作按钮
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.onQuickAction) this.onQuickAction(btn.dataset.action);
      });
    });

    // 清空对话
    document.getElementById('clearChatBtn').addEventListener('click', () => { if (this.onClearChat) this.onClearChat(); });

    // 输入框自动增高（上限 120px）
    const textarea = document.getElementById('userInput');
    if (textarea) {
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      });
    }
  }

  /** 欢迎页 HTML（类名与 CSS 一一对应） */
  getWelcomeHTML() {
    return `
    <div class="welcome-message">
      <div class="welcome-icon">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#4D6BFE" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <h2>DeepSeek AI 写作助手</h2>
      <p>选中文档文字后使用快捷操作，或直接输入你的需求</p>
      <div class="welcome-tips">
        <span>💡 试试：用中文写一段 200 字的产品介绍</span>
        <span>💡 试试：选中文字后点击"校对"检查语法</span>
        <span>💡 试试：选中英文后点击"翻译"译为中文</span>
      </div>
    </div>`;
  }

  /**
   * 插入文本到文档；失败时以错误横幅提示
   * @param {string} text
   */
  async #insertToDocument(text) {
    try {
      await this.wordService.insertText(text);
    } catch (e) {
      this.addError(e.message);
    }
  }
}
