/* ============================================
   应用装配与启动编排
   职责：依赖注入装配（create）+ Office/DOM 就绪协调（start）。
   依赖方向严格单向：controller → views/services，视图不反向依赖控制器。
   ============================================ */

import { SettingsService } from './services/SettingsService.js';
import { ChatStore } from './services/ChatStore.js';
import { DeepSeekClient } from './api/DeepSeekClient.js';
import { PromptBuilder } from './prompts/PromptBuilder.js';
import { LongTextProcessor } from './services/LongTextProcessor.js';
import { SkillLoader } from './skills/SkillLoader.js';
import { SkillEngine } from './skills/SkillEngine.js';
import { SkillGenerator } from './skills/SkillGenerator.js';
import { CustomSkillStore } from './skills/CustomSkillStore.js';
import { ActiveSkillStore } from './skills/ActiveSkillStore.js';
import { WordDocumentService } from './services/office/WordDocumentService.js';
import { MarkdownRenderer } from './ui/MarkdownRenderer.js';
import { ChatView } from './ui/ChatView.js';
import { SettingsView } from './ui/SettingsView.js';
import { ContextBarView } from './ui/ContextBarView.js';
import { SkillSelectorView } from './ui/SkillSelectorView.js';
import { SkillGeneratorView } from './ui/SkillGeneratorView.js';
import { TargetWordCountView } from './ui/TargetWordCountView.js';
import { ChatController } from './controller/ChatController.js';

export class App {

  /** DOM 是否就绪 */
  #domReady = false;

  /** Office.js 是否就绪（宿主握手完成） */
  #officeReady = false;

  /** 是否已完成初始化（防重入，旧版靠时序巧合保证只初始化一次，此处显式化） */
  #initialized = false;

  /**
   * @param {{
   *   controller: ChatController,
   *   chatView: ChatView,
   *   settingsView: SettingsView,
   *   contextBarView: ContextBarView,
   *   chatStore: ChatStore,
   *   skillLoader: SkillLoader,
   *   skillSelectorView: SkillSelectorView,
   *   skillGeneratorView: SkillGeneratorView,
   *   targetWordCountView: TargetWordCountView
   * }} deps
   */
  constructor({ controller, chatView, settingsView, contextBarView, chatStore, skillLoader, skillSelectorView, skillGeneratorView, targetWordCountView }) {
    this.controller = controller;
    this.chatView = chatView;
    this.settingsView = settingsView;
    this.contextBarView = contextBarView;
    this.chatStore = chatStore;
    this.skillLoader = skillLoader;
    this.skillSelectorView = skillSelectorView;
    this.skillGeneratorView = skillGeneratorView;
    this.targetWordCountView = targetWordCountView;
  }

  /**
   * 工厂：手工构造全部依赖并装配
   * （无依赖注入容器——类数量少，显式构造最直观）
   */
  static create() {
    const settingsService = new SettingsService();
    const chatStore = new ChatStore();
    const apiClient = new DeepSeekClient();
    const promptBuilder = new PromptBuilder();
    const skillLoader = new SkillLoader();
    const skillEngine = new SkillEngine();
    const customSkillStore = new CustomSkillStore();
    const activeSkillStore = new ActiveSkillStore();
    const skillGenerator = new SkillGenerator({ apiClient });
    const longTextProcessor = new LongTextProcessor({ apiClient, promptBuilder });
    const wordService = new WordDocumentService(MarkdownRenderer);

    const chatView = new ChatView({ markdownRenderer: MarkdownRenderer, wordService });
    const settingsView = new SettingsView({ settingsService, apiClient });
    const contextBarView = new ContextBarView();
    const skillSelectorView = new SkillSelectorView();
    const skillGeneratorView = new SkillGeneratorView();
    const targetWordCountView = new TargetWordCountView();

    const controller = new ChatController({
      settingsService, chatStore, apiClient, promptBuilder, longTextProcessor, wordService,
      chatView, settingsView, contextBarView,
      skillLoader, skillEngine, skillGenerator, customSkillStore, activeSkillStore,
      skillSelectorView, skillGeneratorView, targetWordCountView
    });

    // 视图 → 控制器的反向依赖统一用回调注入，视图层不 import 控制器
    chatView.onSend = () => controller.handleSend();
    chatView.onQuickAction = (action) => controller.handleQuickAction(action);
    chatView.onClearChat = () => controller.clearChat();
    chatView.onStop = () => controller.handleStop();
    chatView.onExpandRequest = (mode) => controller.requestTarget(mode);
    targetWordCountView.onConfirm = (mode, count) => {
      if (mode === 'expand') controller.handleExpand(count);
      else controller.handleCondense(count);
    };
    contextBarView.onClear = () => controller.clearContext();
    skillSelectorView.onSkillChange = (skillId) => controller.handleSkillChange(skillId);
    skillSelectorView.onDocTypeChange = (docType) => controller.handleDocTypeChange(docType);
    skillGeneratorView.onOpen = () => controller.handleOpenSkillPanel();
    skillGeneratorView.onGenerate = () => controller.handleGenerateSkill();
    skillGeneratorView.onDelete = (skillId) => controller.handleDeleteSkill(skillId);
    skillGeneratorView.onImportFromWord = () => controller.handleImportSkillFromWord();

    return new App({ controller, chatView, settingsView, contextBarView, chatStore, skillLoader, skillSelectorView, skillGeneratorView, targetWordCountView });
  }

  /**
   * 启动：协调 Office 与 DOM 就绪后初始化
   */
  start() {
    // module 脚本为 deferred：执行时 DOM 必已解析完成，直接置位
    this.#domReady = true;
    // 对应旧版 readyState 分支的 100ms 探测：若 Office 也已就绪则立即初始化
    setTimeout(() => this.#tryInitialize(), 100);

    // 旧版在顶层 Office.initialize = fn 在 module 下存在竞态：
    // module 执行晚于宿主握手时，赋值的是永远不会被调用的新函数。
    // 改用 onReady（Promise，宿主已就绪时立即 resolve）。
    if (typeof Office !== 'undefined') {
      if (typeof Office.onReady === 'function') {
        Office.onReady()
          .then((info) => {
            console.log('[DeepSeek] Office.onReady, host:', info && info.host);
            this.#officeReady = true;
            this.#tryInitialize();
          })
          .catch(() => {});
      } else {
        // 极老版本 office.js 无 onReady，退化为 initialize 赋值
        Office.initialize = () => {
          this.#officeReady = true;
          this.#tryInitialize();
        };
      }
    }

    // 兜底：office.js 被拦（CDN 不可达）或宿主握手超时，3 秒后进 UI-only 模式。
    // 旧版顶层 Office.initialize 赋值在 Office 未定义时抛 ReferenceError，
    // 此兜底实际从未生效——本次修复（唯一有意的行为修正）。
    setTimeout(() => {
      if (!this.#officeReady) {
        console.warn('[DeepSeek] Office.js timed out — initializing UI-only mode');
        this.#officeReady = true;
        this.#tryInitialize();
      }
    }, 3000);
  }

  /** 两个就绪条件齐备且未初始化过时，执行初始化 */
  #tryInitialize() {
    if (this.#initialized) return;
    if (this.#officeReady && this.#domReady) {
      this.#initialized = true;
      this.#initialize();
    }
  }

  /** 初始化：回填设置 → 绑定事件 → 恢复聊天历史 */
  #initialize() {
    this.settingsView.fillForm();      // 原 loadSettings()
    this.chatView.bindEvents();        // 发送/快捷操作/清空/输入框增高
    this.settingsView.bindEvents();    // 设置面板事件
    this.contextBarView.bindEvents();  // 上下文条清除按钮
    this.skillSelectorView.bindEvents();    // Skill/文种下拉
    this.skillGeneratorView.bindEvents();   // 生成面板事件
    this.targetWordCountView.bindEvents();  // 目标字数浮层事件
    this.controller.bindSelectionTracking(); // 文档选中变化监听

    // 恢复聊天历史（有记录才渲染；无记录时保留 HTML 中的静态欢迎页）
    const restored = this.chatStore.restore();
    if (restored.length > 0) {
      this.chatView.renderAll(restored);
    }

    // 预加载内置 Skill（选择器随加载完成刷新；自定义 Skill 不依赖加载）
    this.controller.refreshSkillSelector();
    this.skillLoader.preload().then(() => this.controller.refreshSkillSelector());

    console.log('[DeepSeek] Add-in initialized successfully');
  }
}
