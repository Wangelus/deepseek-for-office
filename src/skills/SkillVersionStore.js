/* ============================================
   Skill 版本追踪
   职责：记录各 Skill 的已见版本（localStorage），比较语义化版本，
   检测升级/降级供 UI 提示用。

   扩展点：
   - M5.1 Skill 选择器：detect() 返回 upgraded 时展示"已更新"提示
   ============================================ */

const KEY_VERSIONS = 'ds_skill_versions';

export class SkillVersionStore {

  /**
   * 已知版本表（每次实时读 localStorage，不缓存——改文件须立即生效）
   * @returns {Record<string, string>}
   */
  getAll() {
    try {
      const saved = localStorage.getItem(KEY_VERSIONS);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      // 数据损坏时丢弃，视为全未知
      return {};
    }
  }

  /**
   * 记录某 Skill 的当前版本
   * @param {string} id
   * @param {string} version
   */
  record(id, version) {
    const all = this.getAll();
    all[id] = version;
    try {
      localStorage.setItem(KEY_VERSIONS, JSON.stringify(all));
    } catch (e) {
      // 存储已满等异常时静默忽略
    }
  }

  /**
   * 检测版本变化
   * @param {string} id
   * @param {string} version 当前文件声明的版本
   * @returns {'new'|'same'|'upgraded'|'downgraded'|'invalid'} invalid = 新旧版本号无法解析比较
   */
  detect(id, version) {
    const known = this.getAll();
    if (!(id in known)) return 'new';
    const cmp = compareVersions(version, known[id]);
    if (cmp === null) return 'invalid';
    if (cmp > 0) return 'upgraded';
    if (cmp < 0) return 'downgraded';
    return 'same';
  }
}

/**
 * 语义化版本比较（容忍 v 前缀与缺位：1.0 视为 1.0.0）
 * @param {string|number} a
 * @param {string|number} b
 * @returns {number} a>b 为 1，a<b 为 -1，相等为 0；任一无法解析时返回 null
 */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * 解析版本号为数字段数组；不可解析返回 null
 * @param {string|number} version
 * @returns {number[]|null}
 */
function parseVersion(version) {
  const s = String(version).trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+)*$/.test(s)) return null;
  return s.split('.').map(Number);
}
