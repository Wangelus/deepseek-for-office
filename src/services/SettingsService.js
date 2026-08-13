/* ============================================
   设置存取服务
   localStorage 键名与旧版完全一致（ds_api_key / ds_model / ds_custom_model / ds_endpoint）。
   Phase 2（M7 多模型）在此扩展 MODEL_PRESETS 预设。
   ============================================ */

export const DEFAULT_ENDPOINT = 'https://api.deepseek.com/v1';

const KEY_API_KEY = 'ds_api_key';
const KEY_MODEL = 'ds_model';
const KEY_CUSTOM_MODEL = 'ds_custom_model';
const KEY_ENDPOINT = 'ds_endpoint';

export class SettingsService {

  /**
   * 读取设置（每次实时读 localStorage，不缓存——改设置须立即生效）
   * @returns {{apiKey: string, model: string, customModel: string, endpoint: string}}
   */
  get() {
    return {
      apiKey: localStorage.getItem(KEY_API_KEY) || '',
      model: localStorage.getItem(KEY_MODEL) || 'deepseek-chat',
      customModel: localStorage.getItem(KEY_CUSTOM_MODEL) || '',
      endpoint: localStorage.getItem(KEY_ENDPOINT) || DEFAULT_ENDPOINT
    };
  }

  /**
   * 保存设置
   * @param {{apiKey?: string, model?: string, customModel?: string, endpoint?: string}} settings
   */
  save(settings) {
    localStorage.setItem(KEY_API_KEY, settings.apiKey || '');
    localStorage.setItem(KEY_MODEL, settings.model || 'deepseek-chat');
    localStorage.setItem(KEY_CUSTOM_MODEL, settings.customModel || '');
    localStorage.setItem(KEY_ENDPOINT, settings.endpoint || DEFAULT_ENDPOINT);
  }

  /**
   * 解析实际使用的模型名：自定义模型优先，否则用预设选择
   * @param {{customModel: string, model: string}} settings
   * @returns {string}
   */
  resolveModel(settings) {
    return settings.customModel || settings.model;
  }
}
