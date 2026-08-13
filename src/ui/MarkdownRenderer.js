/* ============================================
   Markdown 渲染器（静态类）
   Phase 2（M2.5）计划用 markdown-it 替换 render() 内部实现，
   届时仅需修改本文件，调用方零改动。
   ============================================ */

export class MarkdownRenderer {

  /**
   * 简易 Markdown → HTML 转换
   * @param {string} text
   * @returns {string}
   */
  static render(text) {
    // 先转义 HTML，再做 Markdown 规则替换
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // 代码块（必须最先处理）
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // 行内代码
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // 加粗
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // 斜体
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // 标题
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      // 无序列表
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      // 有序列表
      .replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>')
      // 引用块
      .replace(/^&gt;\s(.+)$/gm, '<blockquote>$1</blockquote>')
      // 分隔线
      .replace(/^---$/gm, '<hr>')
      // 换行
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // 若未被块级元素包裹，补一个 <p>
    if (!html.startsWith('<pre>') && !html.startsWith('<h') && !html.startsWith('<ul>') && !html.startsWith('<blockquote>')) {
      html = '<p>' + html + '</p>';
    }

    return html;
  }

  /**
   * 插入文档前的 Markdown 清理：去掉代码块/行内代码/加粗/斜体/标题记号
   * @param {string} text
   * @returns {string}
   */
  static stripForInsertion(text) {
    return text
      .replace(/```[\s\S]*?```/g, '')    // 去掉代码块
      .replace(/`([^`]+)`/g, '$1')        // 去掉行内代码反引号
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // 去掉加粗记号
      .replace(/\*([^*]+)\*/g, '$1')      // 去掉斜体记号
      .replace(/#{1,6}\s/g, '')           // 去掉标题记号
      .trim();
  }
}
