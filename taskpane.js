/* ============================================
   DeepSeek for Office — Taskpane Logic
   Office.js + DeepSeek API + Chat UI
   ============================================ */

// ----- Constants -----
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';
const SYSTEM_PROMPT = `You are a professional writing assistant integrated into Microsoft Word. You help users with:
- Proofreading and polishing text for grammar, clarity, style, and flow
- Drafting new content based on user instructions
- Translating text between Chinese and English (and other languages)
- Summarizing document content concisely

Guidelines:
- Respond in the same language as the user's query
- When proofreading, show corrections clearly with explanations
- When given document text to work with, reference it directly
- Use Markdown formatting for readability (but keep it clean)
- Be concise and helpful — don't over-explain unless asked`;

// ----- State -----
let chatMessages = [];
let selectedText = '';
let isLoading = false;

// ----- Initialization -----
let _officeReady = false;
let _domReady = false;

function tryInitialize() {
  if (_officeReady && _domReady) {
    loadSettings();
    setupEventListeners();
    restoreChatHistory();
    console.log('[DeepSeek] Add-in initialized successfully');
  }
}

Office.initialize = function (reason) {
  console.log('[DeepSeek] Office.initialize called, reason:', reason);
  _officeReady = true;
  tryInitialize();
};

// Handle both cases: DOM already loaded, or still loading
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  _domReady = true;
  // DOM is already ready, but Office.initialize might not have fired yet
  // We'll try to init if Office is also ready
  setTimeout(() => tryInitialize(), 100);
} else {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[DeepSeek] DOMContentLoaded fired');
    _domReady = true;
    tryInitialize();
  });
}

// Fallback: if Office.js never loads (CDN blocked), init UI anyway after 3 seconds
setTimeout(() => {
  if (!_officeReady) {
    console.warn('[DeepSeek] Office.js timed out — initializing UI-only mode');
    _officeReady = true;
    tryInitialize();
  }
}, 3000);

// ----- Settings -----
function getSettings() {
  return {
    apiKey: localStorage.getItem('ds_api_key') || '',
    model: localStorage.getItem('ds_model') || 'deepseek-chat',
    customModel: localStorage.getItem('ds_custom_model') || '',
    endpoint: localStorage.getItem('ds_endpoint') || DEEPSEEK_BASE
  };
}

function saveSettings(settings) {
  localStorage.setItem('ds_api_key', settings.apiKey || '');
  localStorage.setItem('ds_model', settings.model || 'deepseek-chat');
  localStorage.setItem('ds_custom_model', settings.customModel || '');
  localStorage.setItem('ds_endpoint', settings.endpoint || DEEPSEEK_BASE);
}

function loadSettings() {
  const s = getSettings();
  document.getElementById('apiKeyInput').value = s.apiKey;
  document.getElementById('modelSelect').value = s.model;
  document.getElementById('customModelInput').value = s.customModel;
  document.getElementById('endpointInput').value = s.endpoint;
}

// ----- Chat History Persistence -----
function saveChatHistory() {
  try {
    localStorage.setItem('ds_chat_history', JSON.stringify(chatMessages.slice(-50))); // keep last 50
  } catch (e) { /* storage full, ignore */ }
}

function restoreChatHistory() {
  try {
    const saved = localStorage.getItem('ds_chat_history');
    if (saved) {
      chatMessages = JSON.parse(saved);
      renderAllMessages();
    }
  } catch (e) {
    chatMessages = [];
  }
}

// ----- Event Listeners -----
function setupEventListeners() {
  // Send message
  document.getElementById('sendBtn').addEventListener('click', handleSend);
  document.getElementById('userInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Quick action buttons
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      handleQuickAction(action);
    });
  });

  // Clear chat
  document.getElementById('clearChatBtn').addEventListener('click', () => {
    chatMessages = [];
    saveChatHistory();
    renderAllMessages();
  });

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
  document.getElementById('settingsOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });
  document.getElementById('saveSettingsBtn').addEventListener('click', handleSaveSettings);
  document.getElementById('testConnBtn').addEventListener('click', handleTestConnection);
  document.getElementById('toggleApiKeyBtn').addEventListener('click', toggleApiKeyVisibility);

  // Context bar
  document.getElementById('clearContextBtn').addEventListener('click', clearContext);

  // Auto-check for selection changes
  document.addEventListener('selectionchange', debounce(checkDocumentSelection, 500));
}

// ----- Settings UI -----
function openSettings() {
  loadSettings();
  document.getElementById('settingsOverlay').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settingsOverlay').style.display = 'none';
  document.getElementById('testResult').textContent = '';
}

function handleSaveSettings() {
  const settings = {
    apiKey: document.getElementById('apiKeyInput').value.trim(),
    model: document.getElementById('modelSelect').value,
    customModel: document.getElementById('customModelInput').value.trim(),
    endpoint: document.getElementById('endpointInput').value.trim().replace(/\/+$/, '')
  };
  saveSettings(settings);
  closeSettings();
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('apiKeyInput');
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleTestConnection() {
  const resultEl = document.getElementById('testResult');
  const settings = {
    apiKey: document.getElementById('apiKeyInput').value.trim(),
    model: document.getElementById('modelSelect').value,
    customModel: document.getElementById('customModelInput').value.trim(),
    endpoint: document.getElementById('endpointInput').value.trim().replace(/\/+$/, '')
  };

  if (!settings.apiKey) {
    resultEl.textContent = '请先输入 API Key';
    resultEl.className = 'test-result error';
    return;
  }

  resultEl.textContent = '测试中...';
  resultEl.className = 'test-result loading';

  try {
    const model = settings.customModel || settings.model;
    const response = await fetch(`${settings.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hello, this is a connection test. Reply with just "OK".' }],
        max_tokens: 10,
        temperature: 0
      })
    });

    if (response.ok) {
      resultEl.textContent = '✓ 连接成功！';
      resultEl.className = 'test-result success';
    } else {
      const err = await response.json().catch(() => ({}));
      resultEl.textContent = `✗ 错误: ${err.error?.message || response.statusText || response.status}`;
      resultEl.className = 'test-result error';
    }
  } catch (e) {
    resultEl.textContent = `✗ 网络错误: ${e.message}`;
    resultEl.className = 'test-result error';
  }
}

// ----- Chat Logic -----
function handleSend() {
  if (isLoading) return;

  const input = document.getElementById('userInput');
  const message = input.value.trim();
  if (!message) return;

  const settings = getSettings();
  if (!settings.apiKey) {
    addErrorMessage('请先配置 API Key：点击右上角 ⚙️ 图标进入设置');
    return;
  }

  // Add user message
  addMessage('user', message);
  input.value = '';
  input.style.height = 'auto';

  // Add document context if selected
  let contextPrompt = message;
  if (selectedText) {
    contextPrompt = `[Document context — selected text from Word document:]
"""
${selectedText}
"""

[User instruction:]
${message}`;
  }

  // Call API
  callDeepSeekAPI(contextPrompt, settings);
}

async function handleQuickAction(action) {
  if (isLoading) return;

  const settings = getSettings();
  if (!settings.apiKey) {
    addErrorMessage('请先配置 API Key：点击右上角 ⚙️ 图标进入设置');
    return;
  }

  // Get document text context
  let docText = '';
  try {
    await Word.run(async (context) => {
      const selection = context.document.getSelection();
      selection.load('text');
      await context.sync();
      docText = selection.text.trim();
    });
  } catch (e) {
    // Word API not available
  }

  const prompts = {
    proofread: `Please proofread and polish the following text.
Fix grammar, improve clarity and flow, and suggest better word choices where appropriate.
Show the corrected version and explain your changes briefly.

Text to proofread:
${docText || '(Please select text in the document first, then click 校对 again)'}`,

    draft: `The user wants to draft new content.
Help them write based on their needs. If no specific topic was provided,
ask them what they'd like to write about.

User context: ${docText || '(No document text selected)'}
Instruction: Draft content based on what the user needs.`,

    translate: `Translate the following text.
If it's in Chinese, translate to English. If it's in English, translate to Chinese.
If it's in another language, translate to Chinese.

Text to translate:
${docText || '(Please select text in the document first, then click 翻译 again)'}`,

    summarize: `Summarize the following text concisely.
Provide key points in bullet format and a one-sentence overall summary.

Text to summarize:
${docText || '(Please select text in the document first, then click 总结 again)'}`
  };

  const prompt = prompts[action] || prompts.draft;
  addMessage('user', getActionLabel(action) + (docText ? ` (已选 ${docText.length} 字)` : ''));
  callDeepSeekAPI(prompt, settings);
}

function getActionLabel(action) {
  const labels = {
    proofread: '🔍 校对润色',
    draft: '✍️ 起草内容',
    translate: '🌐 翻译',
    summarize: '📋 总结要点'
  };
  return labels[action] || action;
}

// ----- DeepSeek API -----
async function callDeepSeekAPI(userMessage, settings) {
  isLoading = true;
  updateSendButton();

  // Build messages array
  const apiMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...chatMessages.slice(-20).map(m => ({        // last 20 messages for context
      role: m.role,
      content: m.content
    })),
    { role: 'user', content: userMessage }
  ];

  // Show typing indicator
  showTypingIndicator();

  const model = settings.customModel || settings.model;

  try {
    const response = await fetch(`${settings.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: false
      })
    });

    hideTypingIndicator();

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.error?.message || `HTTP ${response.status}: ${response.statusText}`;

      if (response.status === 401) {
        addErrorMessage('API Key 无效或未授权。请在设置中检查你的 DeepSeek API Key。');
      } else if (response.status === 429) {
        addErrorMessage('请求过于频繁，请稍后再试。');
      } else if (response.status === 402) {
        addErrorMessage('API 余额不足，请前往 platform.deepseek.com 充值。');
      } else {
        addErrorMessage(`API 错误: ${errMsg}`);
      }
      return;
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || '(无响应内容)';

    addMessage('assistant', assistantMessage);

    // Track token usage
    if (data.usage) {
      console.log('Tokens:', data.usage);
    }

  } catch (e) {
    hideTypingIndicator();
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      addErrorMessage('网络连接失败。请检查网络连接，或确认 API Endpoint 是否正确。');
    } else {
      addErrorMessage(`请求失败: ${e.message}`);
    }
  } finally {
    isLoading = false;
    updateSendButton();
  }
}

// ----- Message Rendering -----
function addMessage(role, content) {
  chatMessages.push({ role, content, time: Date.now() });
  saveChatHistory();
  renderMessage(role, content, chatMessages.length - 1);
  scrollToBottom();
}

function renderAllMessages() {
  const chatArea = document.getElementById('chatArea');
  chatArea.innerHTML = '';
  if (chatMessages.length === 0) {
    chatArea.innerHTML = getWelcomeHTML();
  } else {
    chatMessages.forEach((msg, i) => renderMessage(msg.role, msg.content, i));
    scrollToBottom();
  }
}

function renderMessage(role, content, index) {
  const chatArea = document.getElementById('chatArea');

  // Remove welcome message on first real message
  const welcomeEl = chatArea.querySelector('.welcome-message');
  if (welcomeEl) welcomeEl.remove();

  // Remove typing indicator if present
  const typingEl = chatArea.querySelector('.typing-indicator');
  if (typingEl) typingEl.remove();

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  msgDiv.id = `msg-${index}`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  if (role === 'assistant') {
    contentDiv.innerHTML = renderMarkdown(content);

    // Add "Insert to document" button
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
    insertBtn.addEventListener('click', () => insertTextToDocument(content));
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

  // Time
  const timeDiv = document.createElement('div');
  timeDiv.className = 'message-time';
  const time = new Date(chatMessages[index]?.time || Date.now());
  timeDiv.textContent = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
  msgDiv.appendChild(timeDiv);

  chatArea.appendChild(msgDiv);
}

function showTypingIndicator() {
  const chatArea = document.getElementById('chatArea');
  const welcomeEl = chatArea.querySelector('.welcome-message');
  if (welcomeEl) welcomeEl.remove();

  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatArea.appendChild(indicator);
  scrollToBottom();
}

function hideTypingIndicator() {
  const indicator = document.querySelector('.typing-indicator');
  if (indicator) indicator.remove();
}

function addErrorMessage(text) {
  const chatArea = document.getElementById('chatArea');
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.textContent = `⚠️ ${text}`;
  banner.addEventListener('click', () => banner.remove());
  chatArea.appendChild(banner);
  scrollToBottom();
  // Auto-dismiss after 8 seconds
  setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
}

function getWelcomeHTML() {
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

// ----- Document Interaction (Office.js) -----
async function checkDocumentSelection() {
  try {
    await Word.run(async (context) => {
      const selection = context.document.getSelection();
      selection.load('text');
      await context.sync();

      const text = selection.text.trim();
      if (text && text !== selectedText) {
        selectedText = text;
        showContextBar(text);
      } else if (!text && selectedText) {
        selectedText = '';
        hideContextBar();
      }
    });
  } catch (e) {
    // Word API not available (e.g., running outside Word)
  }
}

function showContextBar(text) {
  const bar = document.getElementById('contextBar');
  const display = text.length > 80 ? text.substring(0, 80) + '...' : text;
  document.getElementById('contextText').textContent = `已选择 ${text.length} 字`;
  bar.style.display = 'flex';
}

function hideContextBar() {
  document.getElementById('contextBar').style.display = 'none';
  selectedText = '';
}

function clearContext() {
  selectedText = '';
  hideContextBar();
}

async function insertTextToDocument(text) {
  try {
    await Word.run(async (context) => {
      // Clean up markdown artifacts for insertion
      let cleanText = text
        .replace(/```[\s\S]*?```/g, '')    // remove code blocks
        .replace(/`([^`]+)`/g, '$1')        // remove inline code backticks
        .replace(/\*\*([^*]+)\*\*/g, '$1')  // remove bold markers
        .replace(/\*([^*]+)\*/g, '$1')      // remove italic markers
        .replace(/#{1,6}\s/g, '')           // remove heading markers
        .trim();

      const selection = context.document.getSelection();
      selection.insertText(cleanText, 'Replace');
      await context.sync();
    });
  } catch (e) {
    addErrorMessage('无法写入文档。请确认 Word 文档已打开且未处于保护模式。');
  }
}

// ----- Utility Functions -----
function renderMarkdown(text) {
  // Simple markdown → HTML conversion
  let html = text
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks (must be first)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    // Ordered lists
    .replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>')
    // Blockquotes
    .replace(/^&gt;\s(.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap in paragraph if not already wrapped in a block element
  if (!html.startsWith('<pre>') && !html.startsWith('<h') && !html.startsWith('<ul>') && !html.startsWith('<blockquote>')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

function scrollToBottom() {
  const chatArea = document.getElementById('chatArea');
  requestAnimationFrame(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

function updateSendButton() {
  const btn = document.getElementById('sendBtn');
  btn.disabled = isLoading;
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Auto-resize textarea
document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('userInput');
  if (textarea) {
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });
  }
});
