/* ============================================
   Skill 加载器
   职责：fetch 内置 Skill YAML → 解析 → 校验 → 版本检测 → 内存缓存。
   内置 Skill 随服务器静态文件分发（skills/{id}.yml，根目录）。

   扩展点：
   - 3.3 内置 Skill 库：skills/ 目录创建 YAML 后零改动生效
   - M3.4 自定义 Skill：新增 loadCustom()（localStorage 存取 + 本地导入）
   - M5.1 选择器：getSkills() 直接喂给下拉菜单
   ============================================ */

import { parse } from './yaml.js';
import { SkillValidator } from './SkillValidator.js';
import { SkillVersionStore } from './SkillVersionStore.js';

/** 内置 Skill 文件 id 清单（对应 skills/{id}.yml） */
export const BUILTIN_SKILL_IDS = ['official-document', 'bidding', 'academic', 'business'];

export class SkillLoader {

  /** 已加载的内置 Skill 缓存（归一化对象，含 id） */
  #skills = [];

  /** preload 是否已执行（幂等：重复调用直接返回缓存） */
  #loaded = false;

  /** fetch 基础路径（生产为 ''，走相对路径；测试可注入本地服务器地址） */
  #baseUrl = '';

  /** 内置 Skill id 清单（测试可注入自定义清单） */
  #ids = BUILTIN_SKILL_IDS;

  /**
   * @param {{baseUrl?: string, ids?: string[]}} [options] 生产无需传参；测试注入 baseUrl 与自定义 id 清单
   */
  constructor({ baseUrl = '', ids = BUILTIN_SKILL_IDS } = {}) {
    this.validator = new SkillValidator();
    this.versionStore = new SkillVersionStore();
    this.#baseUrl = baseUrl;
    this.#ids = ids;
  }

  /**
   * 预加载全部内置 Skill（幂等：重复调用直接返回缓存）。
   * 单个 Skill 失败不影响其他：404 静默跳过，其余打 console.warn。
   * @returns {Promise<Array<object>>} 归一化后的 Skill 数组
   */
  async preload() {
    if (this.#loaded) return this.#skills;
    this.#loaded = true;

    for (const id of this.#ids) {
      const skill = await this.#loadOne(id);
      if (skill) this.#skills.push(skill);
    }
    console.log(`[DeepSeek] 已加载 ${this.#skills.length}/${this.#ids.length} 个内置 Skill`);
    return this.#skills;
  }

  /** 已加载的全部 Skill（preload 前为空数组） */
  getSkills() {
    return this.#skills;
  }

  /**
   * 按 id 取单个 Skill；不存在返回 null
   * @param {string} id
   * @returns {object|null}
   */
  getSkill(id) {
    return this.#skills.find((s) => s.id === id) || null;
  }

  /**
   * 加载单个 Skill 文件：fetch → parse → validate → 版本检测
   * @param {string} id
   * @returns {Promise<object|null>} 失败返回 null（不抛出，不中断其他 Skill）
   */
  async #loadOne(id) {
    let raw;
    try {
      const response = await fetch(`${this.#baseUrl}skills/${id}.yml`, { cache: 'no-cache' });
      if (response.status === 404) return null;   // 文件尚未随版本发布，静默跳过
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      raw = parse(await response.text());
    } catch (e) {
      console.warn(`[DeepSeek] Skill 加载失败: ${id} — ${e.message}`);
      return null;
    }

    const result = this.validator.validate(raw);
    if (!result.ok) {
      console.warn(`[DeepSeek] Skill 校验失败: ${id}\n${result.errors.map((err) => '  · ' + err).join('\n')}`);
      return null;
    }

    const skill = { id, ...result.skill };
    this.#trackVersion(skill);
    return skill;
  }

  /** 版本检测：upgraded/downgraded 打日志（用户可见提示随 M5.1 选择器落地） */
  #trackVersion(skill) {
    const status = this.versionStore.detect(skill.id, skill.version);
    if (status === 'upgraded') {
      const from = this.versionStore.getAll()[skill.id];
      console.log(`[DeepSeek] Skill 已升级: ${skill.name} ${from} → ${skill.version}`);
    } else if (status === 'downgraded') {
      console.log(`[DeepSeek] Skill 版本回退: ${skill.name} → ${skill.version}`);
    }
    this.versionStore.record(skill.id, skill.version);
  }
}
