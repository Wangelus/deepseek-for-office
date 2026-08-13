/* ============================================
   通用工具函数
   ============================================ */

/**
 * 防抖：连续触发时重置计时器，仅最后一次调用延迟 delay 毫秒后执行
 */
export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
