# DeepSeek for Microsoft Word

将 **DeepSeek AI** 直接集成到 Word 文档工作流中的侧边栏加载项 — 校对、起草、翻译、总结，无需离开 Word。

> 💡 **为什么做这个**：官方的 Claude for Microsoft 365 加载项仅支持 Anthropic API，且需要付费订阅。本加载项使用 DeepSeek 的 OpenAI 兼容接口，你可以完全控制 API Key、模型和端点。

## 功能

| 功能 | 说明 |
|------|------|
| 🔍 **校对润色** | 选中文本，自动检查语法、流畅度并给出修改建议 |
| ✍️ **起草内容** | 根据你的指令生成新内容 |
| 🌐 **翻译** | 自动检测中英文并互译，支持其他语言 |
| 📋 **总结要点** | 提取选中文本的关键信息，生成要点列表 |
| 💬 **自由对话** | 带文档上下文感知的聊天模式 |
| 🎨 **自定义 Skill** | 把自己的写作标准 .md 文档交给 AI 提取成写作风格（生成/选择/删除），聊天与快捷操作均套用 |
| ⚡ **流式输出** | SSE 打字机效果逐字显示回复，生成中可一键停止 |
| 📚 **长文处理** | 选中超过 3000 字时总结/校对自动分段并行处理，带进度指示 |
| ⬌ **扩写/略写** | 按目标字数智能调整篇幅，保持风格并展示字数对比 |
| 📄 **插入文档** | 一键将 AI 输出插入到 Word 文档光标位置 |
| ⚙️ **灵活配置** | 在设置中配置 API Key、模型和端点 |

## 安装步骤

### 前置条件

- **Microsoft Word**（Office 2016 以上，含 Office 2024 家庭版）
- **DeepSeek API Key**（在 [platform.deepseek.com](https://platform.deepseek.com) 获取）
- **Node.js**（用于安装开发证书，仅首次需要）

### 第一步：安装开发证书

打开终端（PowerShell），运行：

```powershell
npx office-addin-dev-certs install --days 365
```

然后将 CA 根证书安装到本机受信任根（需要管理员权限）：

```powershell
certutil -addstore Root "$env:USERPROFILE\.office-addin-dev-certs\ca.crt"
```

### 第二步：启动本地 HTTPS 服务器

打开终端，进入项目目录并启动服务器：

```powershell
cd "D:\桌面文件夹\桌面\learen\知识库文档\简历补充以及支撑文件\项目文件\deepseek-for-office"
python -m http.server 3000 --bind localhost
```

> 如果嫌命令行麻烦，也可以双击运行项目中的 `start-server.bat`（待添加）。

### 第三步：注册受信任目录

在终端中运行以下 Python 脚本（一次性操作）：

```powershell
python -c "
import winreg, uuid
base = r'Software\Microsoft\Office\16.0\WEF\TrustedCatalogs'
guid = '{' + str(uuid.uuid4()).upper() + '}'
key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, f'{base}\\{guid}')
winreg.SetValueEx(key, 'Id', 0, winreg.REG_SZ, guid)
winreg.SetValueEx(key, 'Url', 0, winreg.REG_SZ, 'https://localhost:3000')
winreg.SetValueEx(key, 'Flags', 0, winreg.REG_DWORD, 1)
winreg.CloseKey(key)
print('受信任目录已注册:', guid)
"
```

### 第四步：加载加载项

1. **关闭所有 Office 应用**
2. 删除缓存（可选但推荐）：删除 `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\` 下的所有文件
3. **打开 Word** → **插入** → **我的加载项** → **共享文件夹**
4. 点击 **DeepSeek AI Assistant**

### 首次使用

1. 点击侧边栏右上角的 **⚙️ 齿轮图标** 打开设置
2. 输入你的 **DeepSeek API Key**
3. 选择模型（`deepseek-chat` 通用，`deepseek-coder` 编程）
4. 点击 **测试连接** 验证 → 点击 **保存设置**

## 使用方法

### 快捷操作

侧边栏顶部的四个按钮：

- **校对**：在文档中选中文字，点击此按钮进行语法和流畅度检查
- **起草**：描述你想写什么，AI 会帮你生成内容
- **翻译**：选中文字后点击，自动检测语言并翻译
- **总结**：选中文字后点击，生成要点摘要

### 聊天模式

在底部输入框中直接输入问题或指令，按 **Enter** 或点击 **发送**。

AI 回复以**打字机效果**逐字显示，生成中发送按钮会变为红色方块，点击可**停止生成**——已生成的内容会保留在气泡中并标记"已停止生成"，仍可正常插入或复制。

### 自定义 Skill

快捷操作栏下方的 **Skill 选择器** 可以切换写作风格。点击右侧 **＋** 打开自定义 Skill 面板：

1. 把你的写作格式标准/文字规范写成 Markdown 文档，**粘贴**进面板，或点 **导入 .md/.txt 文件**、**从 Word 选中文本导入**
2. 点击 **✨ 生成 Skill**，AI 会把标准文档提取为结构化写作技能包（生成一次消耗一次 API 请求，结果自动校验）
3. 生成成功后自动激活——选择器中选中它（有多个文种时可用二级下拉切换），此后的聊天与快捷操作都会套用该标准
4. 面板内可**删除**已生成的自定义 Skill

### 长文处理

选中文字**超过 3000 字**后点击"总结"或"校对"，自动切换为分段处理：文档按段落边界切成 2000 字/段（相邻段重叠 200 字保持上下文连续），4 路并行请求，气泡内实时显示"正在处理第 N/M 段..."进度，可随时点击停止。总结结果为层级结构（一句话结论 → 三段核心要点 → 逐段摘要）；校对结果自动去除分段重叠后还原为完整文本。

### 扩写 / 略写

选中文字后点击快捷操作栏的"扩写"或"略写"，在弹出的浮层中输入目标字数，AI 会参考原文前 200 字的风格将内容调整到目标篇幅，结果消息下方显示"原文 N 字 → 处理后 M 字"对比。

### 文档上下文

当你在 Word 文档中选中文字时，加载项会自动检测并在底部显示"已选择 XX 字"。下一条消息会自动将选中文字作为上下文发送给 AI。

### AI 输出操作

每条 AI 回复下方有两个按钮：

- **插入到文档**：将文本插入到文档光标位置
- **复制**：复制到剪贴板

## 配置项

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| API Key | *（必填）* | 在 platform.deepseek.com 获取 |
| 模型 | `deepseek-chat` | `deepseek-chat`（通用）或 `deepseek-coder`（编程） |
| 自定义模型 | *（可选）* | 使用自定义部署时覆盖模型名称 |
| API Endpoint | `https://api.deepseek.com/v1` | API 基础 URL，使用代理或兼容服务时可修改 |

## 项目结构

```
deepseek-for-office/
├── manifest.xml          # Office 加载项声明文件
├── commands.html         # Ribbon 命令处理
├── taskpane.html         # 侧边栏主界面
├── taskpane.css          # 侧边栏样式
├── taskpane.js           # 入口（装配并启动应用，逻辑见 src/）
├── server.py             # 本地 HTTPS 服务器（含 .js MIME 修正）
├── src/                  # 面向对象模块（ES module，零构建）
│   ├── App.js            # 依赖注入装配 + Office/DOM 就绪协调
│   ├── utils.js          # 通用工具（debounce）
│   ├── api/
│   │   └── DeepSeekClient.js      # API 通信 + 错误归一化（ApiError）
│   ├── services/
│   │   ├── SettingsService.js     # 设置存取（localStorage）
│   │   ├── ChatStore.js           # 聊天历史持久化
│   │   ├── TextSplitter.js        # 长文本递归字符分割（2000 字/段 + 200 字重叠）
│   │   ├── LongTextProcessor.js   # Map-Reduce 管线（4 路并发 + 层级摘要 + 进度）
│   │   └── office/
│   │       └── WordDocumentService.js  # Office.js 文档交互
│   ├── prompts/
│   │   └── PromptBuilder.js       # 快捷操作提示词 + 上下文拼装
│   ├── skills/                    # M3 文风 Skill 系统
│   │   ├── SkillLoader.js         # 内置 Skill 加载（fetch → 解析 → 校验 → 版本检测）
│   │   ├── SkillEngine.js         # Prompt 编译（占位符替换 + few-shot + 术语检索 + 缓存）
│   │   ├── SkillGenerator.js      # MD 标准文档 → AI 提取结构化 Skill YAML
│   │   ├── SkillValidator.js      # Skill YAML Schema 校验 + camelCase 归一化
│   │   ├── SkillVersionStore.js   # 语义化版本比较与升级检测
│   │   ├── CustomSkillStore.js    # 自定义 Skill 持久化（localStorage）
│   │   ├── ActiveSkillStore.js    # 激活 Skill/文种状态
│   │   └── yaml.js                # YAML 解析薄封装（中文错误文案）
│   ├── lib/
│   │   └── js-yaml.mjs            # vendored js-yaml 4.1.0（项目唯一外部依赖）
│   ├── controller/
│   │   └── ChatController.js      # 编排层（发送/快捷操作/选中状态）
│   └── ui/
│       ├── ChatView.js            # 聊天区渲染
│       ├── SettingsView.js        # 设置面板
│       ├── ContextBarView.js      # 选中文本提示条
│       ├── SkillSelectorView.js   # Skill/文种下拉选择器
│       ├── SkillGeneratorView.js  # 自定义 Skill 生成面板
│       ├── TargetWordCountView.js # 扩写/略写目标字数浮层
│       └── MarkdownRenderer.js    # Markdown 渲染/清理
├── dev/                  # 开发期验证工具（mock SSE 服务 + 冒烟脚本）
│   ├── sse_mock.py       # 本地模拟流式/非流式接口（不消耗 API 费用）
│   ├── stream-smoke.mjs  # chatStream 七场景断言（Node 18+ 运行）
│   ├── longtext-smoke.mjs # 分割器 + Map-Reduce 管线六组断言（Node 18+ 运行）
│   └── skill-smoke.mjs   # Skill 解析/校验/版本/加载器断言（Node 18+ 运行）
├── assets/
│   ├── icon-16.png       # Ribbon 图标（小）
│   ├── icon-32.png       # Ribbon 图标（中）
│   └── icon-80.png       # Ribbon 图标（大）
├── .certs/               # SSL 证书文件（仅开发用）
└── README.md
```

## 技术说明

- **API 协议**：使用 DeepSeek 的 OpenAI 兼容接口（`/v1/chat/completions`），回复走 SSE 流式输出（`fetch` + `ReadableStream`，支持 `AbortController` 停止生成）；网络异常自动重试 2 次（流式仅首字节前重试，避免内容重复）
- **文风 Skill**：以 YAML 定义写作风格技能包（system_prompt + 文种模板 + few-shot 示例 + 术语库），由 vendored js-yaml 解析（项目唯一外部依赖，浏览器与 Node 共用）；用户的标准 .md 文档可由 AI 提取为自定义 Skill（生成一次消耗一次 API 请求，结果过 Schema 校验）
- **API Key 存储**：保存在加载项的 `localStorage` 中（浏览器 WebView 隔离），仅发送到你配置的 API 端点
- **Office 集成**：通过 Office.js（Word JavaScript API）实现文档交互
- **运行环境**：完全在 Office 内置的 Edge WebView2 中运行，无需外部服务器（开发时仅需本地 HTTPS 服务器托管静态文件）

## 常见问题

| 问题 | 解决方法 |
|------|----------|
| 共享文件夹中没有加载项 | 确认已运行注册脚本，且 HTTPS 服务器正在运行 |
| "API Key 无效" | 在设置中点击"测试连接"检查 Key 是否正确 |
| "余额不足" | 前往 platform.deepseek.com 充值 |
| "网络连接失败" | 检查网络；如使用代理，确保 `api.deepseek.com` 可达 |
| 无法插入到文档 | 确认文档未处于只读/保护模式 |
| 证书错误 | 重新运行 `certutil -addstore Root` 命令安装 CA 证书 |
| 加载项按钮无法点击 | 完全关闭 Word，清除 `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\` 缓存后重试 |

## 许可证

MIT — 可自由修改和适配。
