/* Skill 定义格式与解析冒烟验证脚本（开发期工具）
 * 用法：`node dev/skill-smoke.mjs`（Node 18+，零 API 消耗）
 * 覆盖 M3.1 交付：YAML 解析 / Schema 校验 / 版本比较与追踪 / 加载器端到端
 * 模块均为纯逻辑模块；SkillVersionStore 依赖的 localStorage 由脚本内 stub 注入；
 * SkillLoader 的 fetch 通过内嵌 HTTP 服务器 + baseUrl 注入验证（模拟 skills/ 静态目录）
 */
import http from 'node:http';
import { parse, SkillYamlError } from '../src/skills/yaml.js';
import { SkillValidator } from '../src/skills/SkillValidator.js';
import { SkillVersionStore, compareVersions } from '../src/skills/SkillVersionStore.js';
import { SkillLoader } from '../src/skills/SkillLoader.js';

// ── localStorage stub（Node 无浏览器存储） ──
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v))
};

const validator = new SkillValidator();
let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name} ${extra}`);
  }
}

// 完整合法的 Skill YAML（含多行块与 {{#...}} 占位符）
const VALID_YAML = `name: 党政公文
version: "1.0.0"
description: 面向党政机关公文写作场景
unknown_future_field: 向前兼容应被忽略
system_prompt: |
  你是党政公文写作专家。
  {{#document_types}}
  {{#few_shot_examples}}
document_types:
  - name: 通知
    template: |
      标题：发文机关+事由+文种
      正文：缘由 → 事项 → 要求
  - name: 报告
    template: |
      标题：发文机关+事由+报告
      正文：基本情况 → 主要做法 → 存在问题 → 下一步打算
few_shot_examples:
  - role: user
    content: 写一份会议通知
  - role: assistant
    content: |
      关于召开……会议的通知
      各单位：……
terminology:
  - term: 两个维护
    meaning: 坚决维护习近平总书记党中央的核心、全党的核心地位，坚决维护党中央权威和集中统一领导
format_rules: []
`;

// 场景 1：合法 YAML 解析 + 校验 + 归一化形状
{
  const raw = parse(VALID_YAML);
  const r = validator.validate(raw);

  check('校验通过: ok=true', r.ok === true, JSON.stringify(r));
  check('归一化: systemPrompt 保留占位符', r.skill.systemPrompt.includes('{{#document_types}}') && r.skill.systemPrompt.includes('{{#few_shot_examples}}'));
  check('归一化: 多行块换行完整', r.skill.documentTypes[0].template.includes('正文：缘由 → 事项 → 要求'));
  check('归一化: documentTypes 映射 camelCase', r.skill.documentTypes.length === 2 && r.skill.documentTypes[1].name === '报告');
  check('归一化: fewShotExamples 保留 role', r.skill.fewShotExamples[0].role === 'user' && r.skill.fewShotExamples[1].role === 'assistant');
  check('归一化: terminology 映射 term/meaning', r.skill.terminology[0].term === '两个维护' && r.skill.terminology[0].meaning.startsWith('坚决维护'));
  check('归一化: description/formatRules 存在', r.skill.description === '面向党政机关公文写作场景' && Array.isArray(r.skill.formatRules));
  check('向前兼容: 未知字段不报错', r.ok === true);
}

// 场景 2：必填字段缺失
{
  const r = validator.validate(parse('version: "1.0.0"\nsystem_prompt: hi\ndocument_types:\n  - name: 通知\n    template: t\n'));
  check('缺 name: 报错且文案含字段名', !r.ok && r.errors.some((e) => e.includes('name')), JSON.stringify(r.errors));
}

// 场景 3：document_types 为空数组
{
  const r = validator.validate(parse('name: x\nversion: "1"\nsystem_prompt: hi\ndocument_types: []\n'));
  check('空 document_types: 报错', !r.ok && r.errors.some((e) => e.includes('document_types')), JSON.stringify(r.errors));
}

// 场景 4：few_shot role 非法 + 缺 content
{
  const r = validator.validate(parse(`name: x
version: "1"
system_prompt: hi
document_types:
  - name: n
    template: t
few_shot_examples:
  - role: system
    content: hi
  - role: user
`));
  check('role 非法: 报错带下标路径', !r.ok && r.errors.some((e) => e.includes('few_shot_examples[0].role')), JSON.stringify(r.errors));
  check('缺 content: 报错带下标路径', !r.ok && r.errors.some((e) => e.includes('few_shot_examples[1].content')), JSON.stringify(r.errors));
}

// 场景 5：terminology 缺 meaning
{
  const r = validator.validate(parse(`name: x
version: "1"
system_prompt: hi
document_types:
  - name: n
    template: t
terminology:
  - term: 四个意识
`));
  check('terminology 缺 meaning: 报错', !r.ok && r.errors.some((e) => e.includes('terminology[0].meaning')), JSON.stringify(r.errors));
}

// 场景 6：YAML 语法错误（缩进错乱）→ SkillYamlError 中文文案
{
  let threw = null;
  try {
    parse('document_types:\n  - name: 通知\n   template: 坏缩进\n');
  } catch (e) { threw = e; }
  check('语法错误: 抛 SkillYamlError', threw instanceof SkillYamlError, `实际: ${threw}`);
  check('语法错误: message 含中文前缀', threw && threw.message.includes('Skill YAML 语法错误'), threw && threw.message);
}

// 场景 7：版本比较矩阵
{
  check('比较: 1.0.0 < 1.0.1', compareVersions('1.0.0', '1.0.1') === -1);
  check('比较: v2.0 = 2.0.0（v 前缀与缺位容忍）', compareVersions('v2.0', '2.0.0') === 0);
  check('比较: 1.0 = 1.0.0', compareVersions('1.0', '1.0.0') === 0);
  check('比较: 2.0.0 > 1.9.9', compareVersions('2.0.0', '1.9.9') === 1);
  check('比较: 不可解析返回 null', compareVersions('abc', '1.0') === null);
  check('比较: 数字入参可用（YAML 数字版本）', compareVersions(2, '1.0.0') === 1);
}

// 场景 8：版本追踪状态序列（首次 → 相同 → 升级 → 回退）
{
  const store = new SkillVersionStore();
  check('追踪: 首次 → new', store.detect('test-skill', '1.0.0') === 'new');
  store.record('test-skill', '1.0.0');
  check('追踪: 相同 → same', store.detect('test-skill', '1.0.0') === 'same');
  check('追踪: 升高 → upgraded', store.detect('test-skill', '1.0.1') === 'upgraded');
  store.record('test-skill', '1.0.1');
  check('追踪: 降低 → downgraded', store.detect('test-skill', '1.0.0') === 'downgraded');
  store.record('test-skill', 'v不合法');
  check('追踪: 不可解析 → invalid', store.detect('test-skill', '1.0.0') === 'invalid');
}

// 场景 9：version 数字写法归一化为字符串
{
  const r = validator.validate(parse('name: x\nversion: 2\nsystem_prompt: hi\ndocument_types:\n  - name: n\n    template: t\n'));
  check('数字 version 归一化为字符串', r.ok && r.skill.version === '2', JSON.stringify(r.skill && r.skill.version));
}

// 场景 10：SkillLoader 端到端（内嵌 HTTP 服务器模拟 skills/ 静态目录：
// good-skill 合法 / bad-skill 校验不过 / missing-skill 404）
{
  const BAD_YAML = 'name: 坏技能\nversion: "1.0.0"\n';   // 缺 system_prompt 与 document_types

  const server = http.createServer((req, res) => {
    if (req.url === '/skills/good-skill.yml') {
      res.writeHead(200, { 'Content-Type': 'text/yaml' });
      res.end(VALID_YAML);
    } else if (req.url === '/skills/bad-skill.yml') {
      res.writeHead(200, { 'Content-Type': 'text/yaml' });
      res.end(BAD_YAML);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;

  const loader = new SkillLoader({ baseUrl, ids: ['good-skill', 'bad-skill', 'missing-skill'] });
  const skills = await loader.preload();
  check('加载器: 合法 Skill 加载成功', skills.length === 1 && skills[0].id === 'good-skill', JSON.stringify(skills.map((s) => s.id)));
  check('加载器: 校验失败/404 跳过且不中断其他', skills.length === 1);
  check('加载器: getSkill 命中', loader.getSkill('good-skill')?.name === '党政公文');
  check('加载器: getSkill 未命中返回 null', loader.getSkill('missing-skill') === null);
  check('加载器: 预加载幂等', (await loader.preload()).length === 1);
  server.close();
}

// 场景 11：加载器版本追踪（同 id 二次加载更高版本 → 版本记录更新）
{
  const server = http.createServer((req, res) => {
    if (req.url === '/skills/good-skill.yml') {
      res.writeHead(200, { 'Content-Type': 'text/yaml' });
      res.end(VALID_YAML.replace('version: "1.0.0"', 'version: "1.0.1"'));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;

  // 场景 10 已把 good-skill 记录为 1.0.0，此处加载 1.0.1 应识别为 upgraded 并更新记录
  const loader = new SkillLoader({ baseUrl, ids: ['good-skill'] });
  await loader.preload();
  const store = new SkillVersionStore();
  check('加载器: 升级后版本已记录', store.getAll()['good-skill'] === '1.0.1', JSON.stringify(store.getAll()));
  server.close();
}

// ── 汇总 ──
console.log(`\n通过 ${passed}/${passed + failed}`);
if (failed > 0) process.exit(1);
