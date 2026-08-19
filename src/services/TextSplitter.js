/* ============================================
   M2.2 长文本分段：递归字符分割器
   按分隔符切分长文本，滑动窗口重叠保证上下文连续；
   纯逻辑模块（无 DOM / 无 fetch），Node 可直接运行。
   ============================================ */

export class TextSplitter {

  /**
   * 递归字符分割：按分隔符切分长文本，滑动窗口重叠保证上下文连续
   * @param {string} text
   * @param {{chunkSize?: number, overlap?: number}} [options] 默认 2000 字/段 + 200 字重叠
   * @returns {string[]}
   */
  static split(text, { chunkSize = 2000, overlap = 200 } = {}) {
    if (text.length <= chunkSize) return [text];

    // 防御：重叠不能超过半段，防止推进距离不足导致死循环
    overlap = Math.min(overlap, Math.floor(chunkSize / 2));

    // 分隔符按优先级排列（段落 > 换行 > 句号 > 分号 > 逗号）
    const separators = ['\n\n', '\n', '。', '；', '，'];
    const segments = [];
    let start = 0;

    for (;;) {
      const windowEnd = Math.min(start + chunkSize, text.length);

      // 窗口已到文末：剩余部分直接收尾
      if (windowEnd === text.length) {
        segments.push(text.slice(start));
        break;
      }

      // 找切点：逐个分隔符向前搜索，仅接受完整落在窗口内的结果，
      // 取位置最大者（段内容尽可能长）
      let cutPos = -1;
      let cutLen = 0;
      for (const sep of separators) {
        const pos = text.lastIndexOf(sep, windowEnd);
        if (pos >= start && pos + sep.length <= windowEnd && pos > cutPos) {
          cutPos = pos;
          cutLen = sep.length;
        }
      }

      let nextStart;
      if (cutPos >= 0) {
        // 有切点：本段切到分隔符后，下一段回退 overlap 字形成滑动窗口
        segments.push(text.slice(start, cutPos + cutLen));
        nextStart = cutPos - overlap + 1;
      } else {
        // 无切点（硬切）：直接按窗口边界切，同样回退 overlap 字
        segments.push(text.slice(start, windowEnd));
        nextStart = windowEnd - overlap;
      }

      // 防死循环守卫：切点紧贴段首导致回退越过 start 时，强制前进
      if (nextStart <= start) {
        nextStart = Math.min(start + Math.max(1, chunkSize - overlap), text.length);
      }
      start = nextStart;
    }

    return segments;
  }
}
