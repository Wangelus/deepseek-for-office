/* ============================================
   DeepSeek API 客户端
   OpenAI 兼容 /v1/chat/completions 接口。
   所有错误统一归一为 ApiError（message 即用户可见中文文案），
   调用方只需 catch 后直接展示 e.message。

   扩展点：
   - M2.4 SSE 流式：新增 chatStream()（options.signal 已预留 AbortController）
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

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '(无响应内容)';

      // 记录 token 用量
      if (data.usage) {
        console.log('Tokens:', data.usage);
      }

      return { content, usage: data.usage };

    } catch (e) {
      if (e instanceof ApiError) throw e;

      if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
        throw new ApiError('网络连接失败。请检查网络连接，或确认 API Endpoint 是否正确。', 'network');
      }
      throw new ApiError(`请求失败: ${e.message}`, 'unknown');
    }
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
