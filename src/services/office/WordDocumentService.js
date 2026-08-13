/* ============================================
   Word 文档交互服务（Office.js 封装）
   Word.run 调用的唯一出口。

   扩展点：
   - M4 格式检查：新增 scanFormat(rules)（遍历段落 + 批量 load + 规则比对）
   - M6 Agent：新增 setFont / replaceText / insertParagraph 等工具执行方法
   - UI-only 模式下所有方法静默失败（浏览器调试无 Word 环境）
   ============================================ */

export class WordDocumentService {

  /**
   * @param {typeof import('../ui/MarkdownRenderer.js').MarkdownRenderer} markdownRenderer 用于插入前的 Markdown 清理
   */
  constructor(markdownRenderer) {
    this.markdownRenderer = markdownRenderer;
  }

  /**
   * 获取当前选中文本（去首尾空白）；任何异常静默返回空串
   * @returns {Promise<string>}
   */
  async getSelectedText() {
    try {
      let text = '';
      await Word.run(async (context) => {
        const selection = context.document.getSelection();
        selection.load('text');
        await context.sync();
        text = selection.text.trim();
      });
      return text;
    } catch (e) {
      // Word API 不可用（如浏览器调试 / UI-only 模式）时静默
      return '';
    }
  }

  /**
   * 将文本（清理 Markdown 记号后）插入到当前光标位置，替换选中内容
   * @param {string} text
   * @throws {Error} 文档受保护或 Word API 不可用时抛出中文提示
   */
  async insertText(text) {
    try {
      await Word.run(async (context) => {
        // 清理 Markdown 残留后插入
        const cleanText = this.markdownRenderer.stripForInsertion(text);

        const selection = context.document.getSelection();
        selection.insertText(cleanText, 'Replace');
        await context.sync();
      });
    } catch (e) {
      throw new Error('无法写入文档。请确认 Word 文档已打开且未处于保护模式。');
    }
  }
}
