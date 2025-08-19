/* eslint-disable */
const vm = require('vm');
const fetch = require('node-fetch');

/**
 * CeruMusic 插件引擎
 * 负责加载和执行单个插件，并提供一个简洁的API。
 */
class CeruMusicPluginHost {
  /**
   * @param {string | null} pluginCode 插件的 JavaScript 代码字符串（可选）
   * @param {any} logger
   */
  constructor(pluginCode = null, logger=console) {
    this.pluginCode = pluginCode;
    this.plugin = null; // 存储插件导出的对象
    if (pluginCode) {
      this._initialize(logger);
    }
  }

  /**
   * 从文件加载插件
   * @param {string} pluginPath 插件文件路径
   * @param {any} logger
   */
  async loadPlugin(pluginPath, logger=console) {
    const fs = require('fs');
    this.pluginCode = fs.readFileSync(pluginPath, 'utf-8');
    this._initialize(logger);
    return this.plugin;
  }

  /**
   * 初始化沙箱环境，加载并验证插件
   * @private
   */
  _initialize(console) {
    // 提供给插件的API
    const cerumusicApi = {
      env: 'nodejs',
      version: '1.0.0',
      utils: {
        buffer: {
          from: (data, encoding) => Buffer.from(data, encoding),
          bufToString: (buffer, encoding) => buffer.toString(encoding),
        },
      },
      request: (url, options, callback) => {
        // 支持 Promise 和 callback 两种调用方式
        if (typeof options === 'function') {
          callback = options;
          options = { method: 'GET' };
        }

        const makeRequest = async () => {
          try {
            console.log(`[CeruMusic] 发起请求: ${url}`);

            // 添加超时设置
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

            const requestOptions = {
              method: 'GET',
              ...options,
              signal: controller.signal
            };

            const response = await fetch(url, requestOptions);
            clearTimeout(timeoutId);

            console.log(`[CeruMusic] 请求响应状态: ${response.status}`);

            // 尝试解析JSON，如果失败则返回文本
            let body;
            const contentType = response.headers.get('content-type');

            try {
              if (contentType && contentType.includes('application/json')) {
                body = await response.json();
              } else {
                const text = await response.text();
                console.log(`[CeruMusic] 响应不是JSON格式，内容: ${text.substring(0, 200)}...`);
                // 对于非JSON响应，创建一个错误状态的body
                body = {
                  code: response.status,
                  msg: `Expected JSON response but got: ${contentType || 'unknown content type'}`,
                  data: text
                };
              }
            } catch (parseError) {
              console.error(`[CeruMusic] 解析响应失败: ${parseError.message}`);
              // 解析失败时创建错误body
              body = {
                code: response.status,
                msg: `Failed to parse response: ${parseError.message}`
              };
            }

            console.log(`[CeruMusic] 请求响应内容:`, body);

            const result = {
              body,
              statusCode: response.status,
              headers: response.headers.raw(),
            };

            if (callback) {
              callback(null, result);
            }
            return result;

          } catch (error) {
            console.error(`[CeruMusic] Request failed: ${error.message}`);

            if (callback) {
              // 网络错误时，调用 callback(error, null)
              callback(error, null);
            } else {
              throw error;
            }
          }
        };

        if (callback) {
          makeRequest().catch(() => {}); // 错误已在makeRequest中处理
        } else {
          return makeRequest();
        }
      },
    };

    const sandbox = {
      module: { exports: {} },
      cerumusic: cerumusicApi,
      console: console,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      Buffer: Buffer,
      JSON: JSON,
      require: () => ({}),
      global: {},
      process: { env: {} }
    };

    try {
      // 在沙箱中执行插件代码
      vm.runInNewContext(this.pluginCode, sandbox);
      this.plugin = sandbox.module.exports;
      console.log(`[CeruMusic] Plugin "${this.plugin.pluginInfo.name}" loaded successfully.`);
    } catch (e) {
      console.error('[CeruMusic] Error executing plugin code:', e);
      throw new Error('Failed to initialize plugin.');
    }

    // 验证插件结构
    if (!this.plugin.pluginInfo || !this.plugin.sources || !this.plugin.musicUrl) {
      throw new Error('Invalid plugin structure. Required fields: pluginInfo, sources, musicUrl.');
    }
  }

  /**
   * 获取插件信息
   */
  getPluginInfo() {
    return this.plugin.pluginInfo;
  }

  /**
   * 获取支持的音源和音质信息
   */
  getSupportedSources() {
    return this.plugin.sources;
  }

  /**
   * 调用插件的 getMusicUrl 方法
   * @param {string} source 音源标识
   * @param {object} musicInfo 音乐信息
   * @param {string} quality 音质
   */
  async getMusicUrl(source, musicInfo, quality) {
    try {
      if (typeof this.plugin.musicUrl !== 'function') {
        throw new Error(`Action "musicUrl" is not implemented in plugin.`);
      }

      console.log(`[CeruMusic] 开始调用插件的 musicUrl 方法...`);

      // 将 cerumusic API 绑定到函数调用的 this 上下文
      const result = await this.plugin.musicUrl.call(
        { cerumusic: this._getCerumusicApi() },
        source,
        musicInfo,
        quality
      );

      console.log(`[CeruMusic] 插件 musicUrl 方法调用成功`);
      return result;

    } catch (error) {
      console.error(`[CeruMusic] getMusicUrl 方法执行失败:`, error.message);
      console.error(`[CeruMusic] 错误堆栈:`, error.stack);

      // 重新抛出错误，确保外部可以捕获
      throw new Error(`Plugin getMusicUrl failed: ${error.message}`);
    }
  }

  /**
   * 获取 cerumusic API 对象
   * @private
   */
  _getCerumusicApi() {
    return {
      env: 'nodejs',
      version: '1.0.0',
      utils: {
        buffer: {
          from: (data, encoding) => Buffer.from(data, encoding),
          bufToString: (buffer, encoding) => buffer.toString(encoding),
        },
      },
      request: (url, options, callback) => {
        // 支持 Promise 和 callback 两种调用方式
        if (typeof options === 'function') {
          callback = options;
          options = { method: 'GET' };
        }

        const makeRequest = async () => {
          try {
            console.log(`[CeruMusic] 发起请求: ${url}`);

            // 添加超时设置
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

            const requestOptions = {
              method: 'GET',
              ...options,
              signal: controller.signal
            };

            const response = await fetch(url, requestOptions);
            clearTimeout(timeoutId);

            console.log(`[CeruMusic] 请求响应状态: ${response.status}`);

            // 尝试解析JSON，如果失败则返回文本
            let body;
            const contentType = response.headers.get('content-type');

            try {
              if (contentType && contentType.includes('application/json')) {
                body = await response.json();
              } else {
                const text = await response.text();
                console.log(`[CeruMusic] 响应不是JSON格式，内容: ${text.substring(0, 200)}...`);
                // 对于非JSON响应，创建一个错误状态的body
                body = {
                  code: response.status,
                  msg: `Expected JSON response but got: ${contentType || 'unknown content type'}`,
                  data: text
                };
              }
            } catch (parseError) {
              console.error(`[CeruMusic] 解析响应失败: ${parseError.message}`);
              // 解析失败时创建错误body
              body = {
                code: response.status,
                msg: `Failed to parse response: ${parseError.message}`
              };
            }

            console.log(`[CeruMusic] 请求响应内容:`, body);

            const result = {
              body,
              statusCode: response.status,
              headers: response.headers.raw(),
            };

            if (callback) {
              callback(null, result);
            }
            return result;

          } catch (error) {
            console.error(`[CeruMusic] Request failed: ${error.message}`);

            if (callback) {
              // 网络错误时，调用 callback(error, null)
              callback(error, null);
            } else {
              throw error;
            }
          }
        };

        if (callback) {
          makeRequest().catch(() => {}); // 错误已在makeRequest中处理
        } else {
          return makeRequest();
        }
      },
    };
  }

  /**
   * 调用插件的 getPic 方法
   * @param {string} source 音源标识
   * @param {object} musicInfo 音乐信息
   */
  async getPic(source, musicInfo) {
    try {
      if (typeof this.plugin.getPic !== 'function') {
        throw new Error(`Action "getPic" is not implemented in plugin.`);
      }

      console.log(`[CeruMusic] 开始调用插件的 getPic 方法...`);

      const result = await this.plugin.getPic.call(
        { cerumusic: this._getCerumusicApi() },
        source,
        musicInfo
      );

      console.log(`[CeruMusic] 插件 getPic 方法调用成功`);
      return result;

    } catch (error) {
      console.error(`[CeruMusic] getPic 方法执行失败:`, error.message);
      throw new Error(`Plugin getPic failed: ${error.message}`);
    }
  }

  /**
   * 调用插件的 getLyric 方法
   * @param {string} source 音源标识
   * @param {object} musicInfo 音乐信息
   */
  async getLyric(source, musicInfo) {
    try {
      if (typeof this.plugin.getLyric !== 'function') {
        throw new Error(`Action "getLyric" is not implemented in plugin.`);
      }

      console.log(`[CeruMusic] 开始调用插件的 getLyric 方法...`);

      const result = await this.plugin.getLyric.call(
        { cerumusic: this._getCerumusicApi() },
        source,
        musicInfo
      );

      console.log(`[CeruMusic] 插件 getLyric 方法调用成功`);
      return result;

    } catch (error) {
      console.error(`[CeruMusic] getLyric 方法执行失败:`, error.message);
      throw new Error(`Plugin getLyric failed: ${error.message}`);
    }
  }
}

module.exports = CeruMusicPluginHost;
