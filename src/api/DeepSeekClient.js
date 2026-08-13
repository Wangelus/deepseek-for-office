/* ============================================
   DeepSeek API 客户端
   OpenAI 兼容 /v1/chat/completions 接口。
   所有错误统一归一为 ApiError（message 即用户可见中文文案），
   调用方只需 catch 后直接展示 e.message。

   扩展点：
   - M2.4 SSE 流式：chatStream() 已实现（打字机 + AbortController 停止）；
     chat() 非流式保留作 M6 Agent 兜底
   - M6 Agent：options.tools / options.toolChoice 透传 Function Calling 参数
   - M7 多模型：endpoint 本就从 settings 注入，切换预设零改动；
     文心一言等非兼容端点另建适配器（如 src/api/ErnieAdapter.js）
   ============================================ */

/** API 错误：message 为用户可见中文文案，code 为 HTTP 状态码或 'network'/'unknown' */
export class ApiError extends Error {
  constructor(message, code = 'unknown') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export class DeepSeekClient {

  /**
   * 发送聊天请求
   * @param {Array<{role: string, content: string}>} messages
   * @param {{apiKey: string, customModel: string, model: string, endpoint: string}} settings
   * @param {{temperature?: number, maxTokens?: number, signal?: AbortSignal}} [options] 预留参数
   * @returns {Promise<{content: string, usage?: object}>}
   * @throws {ApiError}
   */
  async chat(messages, settings, options = {}) {
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
          messages: messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4096,
          stream: false
        }),
        signal: options.signal
      });

      if (!response.ok) {
        await this.#throwForHttpError(response);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '(无响应内容)';

      // 记录 token 用量
      if (data.usage) {
        console.log('Tokens:', data.usage);
      }

      return { content, usage: data.usage };

    } catch (e) {
      throw this.#normalizeError(e);
    }
  }

  /**
   * SSE 流式聊天：增量内容通过 onDelta 逐段回调（打字机效果）；
   * 被 signal 中止时**不抛异常**，返回 aborted: true 与已累积内容。
   * @param {Array<{role: string, content: string}>} messages
   * @param {{apiKey: string, customModel: string, model: string, endpoint: string}} settings
   * @param {{temperature?: number, maxTokens?: number, signal?: AbortSignal, onDelta?: (delta: string) => void}} [options]
   * @returns {Promise<{content: string, usage?: object, aborted: boolean}>}
   * @throws {ApiError} 非 2xx / 网络中断 / 环境不支持流式
   */
  async chatStream(messages, settings, options = {}) {
    const model = settings.customModel || settings.model;
    let fullText = '';
    let usage = null;

    try {
      const response = await fetch(`${settings.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4096,
          stream: true              // ← 与 chat() 唯一的请求体差异
        }),
        signal: options.signal
      });

      // 非 2xx 时 body 是错误 JSON 而非 SSE，必须在读流之前处理
      if (!response.ok) {
        await this.#throwForHttpError(response);
      }
      if (!response.body) {
        throw new ApiError('当前环境不支持流式响应，请更新 Word 后重试。', 'unknown');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamEnded = false;

      // 单行 SSE 解析：忽略非 data: 行；单行 JSON 解析失败跳过（keep-alive 注释行等）
      const handleLine = (line) => {
        if (streamEnded) return;
        if (!line.startsWith('data:')) return;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { streamEnded = true; return; }
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            if (options.onDelta) options.onDelta(delta);
          }
          if (json.usage) usage = json.usage;   // 仅开启 stream_options 时会出现，防御性收集
        } catch (err) { /* 忽略单行解析失败，不中断流 */ }
      };

      while (!streamEnded) {
        const { done, value } = await reader.read();
        if (done) break;
        // stream: true 保证跨 chunk 的 UTF-8 多字节字符（中文）不损坏
        buffer += decoder.decode(value, { stream: true });
        // 末行可能被 TCP 分包截断，pop 出来留到下一 chunk 拼接
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach(handleLine);
      }

      if (streamEnded) {
        // [DONE] 已收到：主动释放连接（cancel 对已关闭流幂等）
        try { await reader.cancel(); } catch (err) { /* 忽略 */ }
      } else {
        // 流 EOF：flush 解码器尾部可能残留的 UTF-8 半字符，再处理残余行
        buffer += decoder.decode();
        if (buffer.trim()) handleLine(buffer);
      }

      if (usage) console.log('Tokens:', usage);
      return { content: fullText, usage, aborted: false };

    } catch (e) {
      // abort 可能发生在 fetch 阶段或 reader.read() 阶段，同一 catch 覆盖。
      // 只用 name 判断（message 文案各环境不一致）
      if (e.name === 'AbortError') {
        return { content: fullText, usage, aborted: true };
      }
      throw this.#normalizeError(e);
    }
  }

  /**
   * 非 2xx 响应归一为 ApiError（401/402/429 特殊中文文案，其余带服务端 message）
   * @param {Response} response
   */
  async #throwForHttpError(response) {
    const err = await response.json().catch(() => ({}));
    const errMsg = err.error?.message || `HTTP ${response.status}: ${response.statusText}`;

    if (response.status === 401) {
      throw new ApiError('API Key 无效或未授权。请在设置中检查你的 DeepSeek API Key。', 401);
    } else if (response.status === 429) {
      throw new ApiError('请求过于频繁，请稍后再试。', 429);
    } else if (response.status === 402) {
      throw new ApiError('API 余额不足，请前往 platform.deepseek.com 充值。', 402);
    }
    throw new ApiError(`API 错误: ${errMsg}`, response.status);
  }

  /**
   * 非 ApiError 异常归一为 ApiError（AbortError 原样放行，由 chatStream 自行识别）
   * @param {Error} e
   * @returns {Error}
   */
  #normalizeError(e) {
    if (e instanceof ApiError || e.name === 'AbortError') return e;

    // WebView2(Chromium) 报 "Failed to fetch"/"NetworkError"，Node(undici) 报 "fetch failed"
    const msg = e.message.toLowerCase();
    if (msg.includes('failed to fetch') || msg.includes('fetch failed') || msg.includes('networkerror')) {
      return new ApiError('网络连接失败。请检查网络连接，或确认 API Endpoint 是否正确。', 'network');
    }
    return new ApiError(`请求失败: ${e.message}`, 'unknown');
  }

  /**
   * 测试连接：发送一条极短请求验证 Key 与 Endpoint 有效性
   * @param {{apiKey: string, customModel: string, model: string, endpoint: string}} settings
   * @returns {Promise<{ok: true}>}
   * @throws {ApiError} message 已带 '✗ 错误: …' / '✗ 网络错误: …' 前缀，可直接展示
   */
  async test(settings) {
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
          messages: [{ role: 'user', content: 'Hello, this is a connection test. Reply with just "OK".' }],
          max_tokens: 10,
          temperature: 0
        })
      });

      if (response.ok) {
        return { ok: true };
      }

      const err = await response.json().catch(() => ({}));
      throw new ApiError(`✗ 错误: ${err.error?.message || response.statusText || response.status}`, response.status);

    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(`✗ 网络错误: ${e.message}`, 'network');
    }
  }
}
