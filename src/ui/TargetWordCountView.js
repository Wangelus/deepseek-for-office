/* ============================================
   目标字数浮层视图（扩写/略写用）
   职责：打开浮层（标题随模式切换）→ 输入正整数目标字数
   → 校验通过后回调 onConfirm(mode, count)，由控制器发起请求。
   浮层 DOM 复用 .settings-overlay/.settings-panel 样式（与设置面板一致）。

   扩展点：
   - 目标字数改为滑块：新增滑块元素 + 与输入框双向绑定
   ============================================ */

export class TargetWordCountView {

  /** 确认回调（装配时注入）：(mode: 'expand'|'condense', count: number) => void */
  onConfirm = null;

  /** 当前模式：'expand' 扩写 | 'condense' 略写 */
  #mode = 'expand';

  /**
   * 打开浮层：标题随模式切换，清空输入与错误提示并聚焦
   * @param {'expand'|'condense'} mode
   */
  open(mode) {
    this.#mode = mode;
    document.getElementById('targetTitle').textContent = mode === 'expand' ? '扩写' : '略写';
    document.getElementById('targetCountInput').value = '';
    document.getElementById('targetError').textContent = '';
    document.getElementById('targetOverlay').style.display = 'flex';
    document.getElementById('targetCountInput').focus();
  }

  /** 关闭浮层 */
  close() {
    document.getElementById('targetOverlay').style.display = 'none';
  }

  /** 绑定浮层内事件；确认经回调转发给控制器 */
  bindEvents() {
    // 关闭按钮
    document.getElementById('closeTargetBtn').addEventListener('click', () => this.close());

    // 点击遮罩空白处关闭（点击面板本身不关闭）
    const overlay = document.getElementById('targetOverlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // 确定按钮
    document.getElementById('targetConfirmBtn').addEventListener('click', () => this.#confirm());

    // 输入框回车 = 确定
    document.getElementById('targetCountInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.#confirm();
      }
    });
  }

  /**
   * 校验目标字数（正整数、≤10000）：通过则关闭浮层并回调
   * onConfirm(mode, count)；非法时在错误区提示
   */
  #confirm() {
    const input = document.getElementById('targetCountInput');
    const errorEl = document.getElementById('targetError');
    const count = Number(input.value.trim());

    if (!Number.isInteger(count) || count <= 0) {
      errorEl.textContent = '请输入正整数';
      return;
    }
    if (count > 10000) {
      errorEl.textContent = '目标字数不能超过 10000';
      return;
    }

    this.close();
    if (this.onConfirm) this.onConfirm(this.#mode, count);
  }
}
