/* ============================================
   上下文提示条视图
   显示"已选择 N 字"，提供清除按钮。
   清除动作通过 onClear 回调注入（视图不反向依赖 controller）。
   ============================================ */

export class ContextBarView {

  /** 清除按钮回调（装配时注入 → controller.clearContext） */
  onClear = null;

  /**
   * 显示选中状态
   * @param {string} text 选中的文本（仅用其长度）
   */
  show(text) {
    const bar = document.getElementById('contextBar');
    document.getElementById('contextText').textContent = `已选择 ${text.length} 字`;
    bar.style.display = 'flex';
  }

  /** 隐藏提示条（selectedText 状态归 controller 管理） */
  hide() {
    document.getElementById('contextBar').style.display = 'none';
  }

  /** 绑定清除按钮事件 */
  bindEvents() {
    document.getElementById('clearContextBtn').addEventListener('click', () => {
      if (this.onClear) this.onClear();
    });
  }
}
