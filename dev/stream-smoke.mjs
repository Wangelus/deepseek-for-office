/* SSE 流式冒烟验证脚本（开发期工具）
 * 用法：先 `python dev/sse_mock.py`，再开另一个终端 `node dev/stream-smoke.mjs`
 * 覆盖 chatStream 的四个场景：正常流 / 中途停止 / 401 / 断网
 * DeepSeekClient 为纯逻辑模块（无浏览器专属依赖），Node 18+ 可直接运行
 */
import { DeepSeekClient, ApiError } from '../src/api/DeepSeekClient.js';

const BASE = 'http://localhost:3999/v1';
const client = new DeepSeekClient();
const MESSAGES = [{ role: 'user', content: 'hi' }];

// 重置 mock 的故障计数器，保证脚本可重复执行
await fetch(`${BASE}/reset`, { method: 'POST' });

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

// 场景 1：正常流（onDelta 逐段回调 + 内容拼装完整）
{
  const deltas = [];
  const r = await client.chatStream(MESSAGES, {
    apiKey: 'sk-test', model: 'deepseek-chat', customModel: '', endpoint: BASE
  }, { onDelta: (d) => deltas.push(d) });

  check('正常流: aborted=false', r.aborted === false, JSON.stringify(r));
  check('正常流: content 拼装完整', r.content === '你好，这是一段流式响应。', `实际: ${r.content}`);
  check('正常流: onDelta 逐段回调 5 次', deltas.length === 5, `实际: ${deltas.length}`);
}

// 场景 2：中途停止（abort 不抛异常，保留已生成部分）
{
  const ac = new AbortController();
  const p = client.chatStream(MESSAGES, {
    apiKey: 'sk-test', model: 'deepseek-chat', customModel: '', endpoint: BASE
  }, { signal: ac.signal });
  setTimeout(() => ac.abort(), 500);   // 每块 0.3s，此时约收到 1~2 块

  const r = await p;
  check('停止: aborted=true 且不抛异常', r.aborted === true, JSON.stringify(r));
  check('停止: 保留已生成部分内容', r.content.length > 0, `实际: ${r.content}`);
}

// 场景 3：401 错误（抛 ApiError 且为中文特殊文案）
{
  let threw = null;
  try {
    await client.chatStream(MESSAGES, {
      apiKey: 'bad-key', model: 'deepseek-chat', customModel: '', endpoint: `${BASE}/bad`
    });
  } catch (e) { threw = e; }

  check('401: 抛 ApiError 且含"API Key 无效"', threw instanceof ApiError && threw.message.includes('API Key 无效'), `实际: ${threw?.message}`);
}

// 场景 4：断网（抛 ApiError code=network）
{
  let threw = null;
  try {
    await client.chatStream(MESSAGES, {
      apiKey: 'sk-test', model: 'deepseek-chat', customModel: '', endpoint: `${BASE}/die`
    });
  } catch (e) { threw = e; }

  check('断网: 抛 ApiError 且 code=network', threw instanceof ApiError && threw.code === 'network', `实际: ${threw?.name} ${threw?.code} ${threw?.message}`);
}

// 场景 5：断网自动重试成功（第一次调用断连、重试后成功，证明重试生效）
{
  const r = await client.chatStream(MESSAGES, {
    apiKey: 'sk-test', model: 'deepseek-chat', customModel: '', endpoint: `${BASE}/flaky`
  }, { retryBaseDelayMs: 10 });

  check('重试: 重试后成功且 aborted=false', r.aborted === false, JSON.stringify(r));
  check('重试: 内容拼装完整', r.content === '你好，这是一段流式响应。', `实际: ${r.content}`);
}

// 场景 6：401 不重试（该路由第二次调用会返回正常流——若客户端误重试 401，这里就会成功，断言失败即证明没重试）
{
  let threw = null;
  try {
    await client.chatStream(MESSAGES, {
      apiKey: 'bad-key', model: 'deepseek-chat', customModel: '', endpoint: `${BASE}/auth`
    }, { retryBaseDelayMs: 10 });
  } catch (e) { threw = e; }

  check('401: 不重试，抛 ApiError 且 code=401', threw instanceof ApiError && threw.code === 401, `实际: ${threw?.name} ${threw?.code} ${threw?.message}`);
}

// 场景 7：中途断网不重试（已出部分内容绝不重试，抛 network 且保留 partialContent）
{
  let threw = null;
  try {
    await client.chatStream(MESSAGES, {
      apiKey: 'sk-test', model: 'deepseek-chat', customModel: '', endpoint: `${BASE}/halfdie`
    }, { retryBaseDelayMs: 10 });
  } catch (e) { threw = e; }

  check('半途断网: 抛 ApiError 且 code=network', threw instanceof ApiError && threw.code === 'network', `实际: ${threw?.name} ${threw?.code} ${threw?.message}`);
  check('半途断网: 保留已生成内容 partialContent', threw?.partialContent === '第一块', `实际: ${threw?.partialContent}`);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
// 自然退出（不调 process.exit，避免 Windows 上 libuv 退出竞态的断言噪音）
process.exitCode = failed ? 1 : 0;
