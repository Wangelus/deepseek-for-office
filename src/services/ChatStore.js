/* ============================================
   聊天历史存储
   消息数组的唯一持有者；持久化到 localStorage（键名 ds_chat_history 不变），
   仅保留最近 50 条防止存储溢出。
   ============================================ */

const HISTORY_KEY = 'ds_chat_history';
const HISTORY_LIMIT = 50;

export class ChatStore {

  /** @type {Array<{role: string, content: string, time: number}>} */
  #messages = [];

  /**
   * 全部消息（渲染用）
   */
  getAll() {
    return this.#messages;
  }

  /**
   * 追加一条消息并持久化
   * @param {string} role 'user' | 'assistant'
   * @param {string} content
   * @returns {{index: number, time: number}} 用于按 index 渲染 DOM id 与时间戳
   */
  push(role, content) {
    const message = { role, content, time: Date.now() };
    this.#messages.push(message);
    this.#persist();
    return { index: this.#messages.length - 1, time: message.time };
  }

  /**
   * 导出给 API 的最近 N 条上下文（仅保留 role/content，丢弃 time）
   */
  getContextMessages(max = 20) {
    return this.#messages.slice(-max).map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  /**
   * 清空并持久化
   */
  clear() {
    this.#messages = [];
    this.#persist();
  }

  /**
   * 从 localStorage 恢复历史；无记录或解析失败时回退为空数组
   * @returns {Array<{role: string, content: string, time: number}>}
   */
  restore() {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        this.#messages = JSON.parse(saved);
      }
    } catch (e) {
      // 数据损坏时丢弃，从空历史开始
      this.#messages = [];
    }
    return this.#messages;
  }

  /** 持久化（仅保留最近 HISTORY_LIMIT 条） */
  #persist() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.#messages.slice(-HISTORY_LIMIT)));
    } catch (e) {
      // 存储已满等异常时静默忽略
    }
  }
}
