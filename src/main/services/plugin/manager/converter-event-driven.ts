export default function convertEventDrivenPlugin(originalCode: string): string {
  // 提取插件信息
  const nameMatch = originalCode.match(/@name\s+(.+)/)
  const versionMatch = originalCode.match(/@version\s+(.+)/)
  const authorMatch = originalCode.match(/@author\s+(.+)/)
  const descMatch = originalCode.match(/@description\s+(.+)/)
  const homepageMatch = originalCode.match(/@homepage\s+(.+)/)
  const author = authorMatch ? authorMatch[1].trim() : 'Unknown'
  const pluginName = nameMatch ? nameMatch[1].trim() : '未知插件'
  const pluginVersion = versionMatch ? versionMatch[1].trim() : '1.0.0'
  const pluginDesc = descMatch ? descMatch[1].trim() : '从事件驱动插件转换而来'
  const pluginHomepage = homepageMatch ? homepageMatch[1].trim() : ''

  return `/**
 * 由 CeruMusic 插件转换器转换 - @author sqj
 * @name ${pluginName}
 * @author ${author}
 * @version ${pluginVersion}
 * @description ${pluginDesc}
 */

const pluginInfo = {
  name: "${pluginName}",
  version: "${pluginVersion}",
  author: "${author}",
  description: "${pluginDesc}"
};

// 原始插件代码
const originalPluginCode = ${JSON.stringify(originalCode)};

// 音源信息将通过插件的 send 调用动态获取
let sources = {};

function getSourceName(sourceId) {
  const nameMap = {
    'kw': '酷我音乐',
    'kg': '酷狗音乐',
    'tx': 'QQ音乐',
    'wy': '网易云音乐',
    'mg': '咪咕音乐'
  };
  return nameMap[sourceId] || sourceId.toUpperCase() + '音乐';
}

// 提取默认音源配置作为备用
function extractDefaultSources() {
  // 尝试从 MUSIC_QUALITY 常量中提取音源信息
  const qualityMatch = originalPluginCode.match(/const\\s+MUSIC_QUALITY\\s*=\\s*JSON\\.parse\\(([^)]+)\\)/);
  if (qualityMatch) {
    try {
      // 处理字符串，移除外层引号并正确解析
      let qualityStr = qualityMatch[1].trim();
      if (qualityStr.startsWith("'") && qualityStr.endsWith("'")) {
        qualityStr = qualityStr.slice(1, -1);
      } else if (qualityStr.startsWith('"') && qualityStr.endsWith('"')) {
        qualityStr = qualityStr.slice(1, -1);
      }

      console.log('提取到的 MUSIC_QUALITY 字符串:', qualityStr);
      const qualityData = JSON.parse(qualityStr);
      console.log('解析后的 MUSIC_QUALITY 数据:', qualityData);

      const extractedSources = {};
      Object.keys(qualityData).forEach(sourceId => {
        extractedSources[sourceId] = {
          name: getSourceName(sourceId),
          type: 'music',
          qualitys: qualityData[sourceId] || ['128k', '320k']
        };
      });

      return extractedSources;
    } catch (e) {
      console.log('解析 MUSIC_QUALITY 失败:', e.message);
    }
  }

  // 默认音源配置
  return {
    kw: { name: "酷我音乐", type: "music", qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'] },
    kg: { name: "酷狗音乐", type: "music", qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'] },
    tx: { name: "QQ音乐", type: "music", qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'] },
    wy: { name: "网易云音乐", type: "music", qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'] },
    mg: { name: "咪咕音乐", type: "music", qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'] }
  };
}



// 初始化默认音源
sources = extractDefaultSources();

// 插件状态
let isInitialized = false;
let pluginSources = {};
let requestHandler = null;
let updateAlertSent = false; // 防止重复发送更新提示

// 处理更新提示事件
function handleUpdateAlert(data, cerumusicApi) {
  // 每次运行脚本只能调用一次
  if (updateAlertSent) {
    console.warn(\`[${pluginName}] updateAlert 事件每次运行脚本只能调用一次，忽略重复调用\`);
    return;
  }

  if (!data || !data.log) {
    console.error(\`[${pluginName}] updateAlert 事件缺少必需的 log 参数\`);
    return;
  }

  // 验证和处理参数
  let log = String(data.log);
  let updateUrl = data.updateUrl ? String(data.updateUrl) : undefined;

  // 限制 log 长度为 1024 字符
  if (log.length > 1024) {
    log = log.substring(0, 1024);
    console.warn(\`[${pluginName}] 更新日志超过 1024 字符，已截断\`);
  }

  // 验证 updateUrl 格式
  if (updateUrl) {
    if (updateUrl.length > 1024) {
      updateUrl = updateUrl.substring(0, 1024);
      console.warn(\`[${pluginName}] 更新地址超过 1024 字符，已截断\`);
    }

    if (!updateUrl.startsWith('http://') && !updateUrl.startsWith('https://')) {
      console.error(\`[${pluginName}] updateUrl 必须是 HTTP 协议的 URL 地址\`);
      updateUrl = undefined;
    }
  }

  // 标记已发送
  updateAlertSent = true;

  // 通过 CeruMusic 的通知系统发送更新提示
  try {
    // 使用传入的 cerumusic API 对象发送通知
    if (cerumusicApi && cerumusicApi.NoticeCenter) {
      cerumusicApi.NoticeCenter('update', {
        title: \`${pluginName} 有新版本可用\`,
        content: log,
        url: updateUrl,
        pluginInfo: {
          name: '${pluginName}',
          type: 'lx',
          forcedUpdate: false
        }
      });

      console.log(\`[${pluginName}] 更新提示已发送\`, { log: log.substring(0, 100) + '...', updateUrl });
    } else {
      console.error(\`[${pluginName}] CeruMusic API 不可用，无法发送更新提示\`);
    }
  } catch (error) {
    console.error(\`[${pluginName}] 发送更新提示失败:\`, error.message);
  }
}
initializePlugin()
function initializePlugin() {
  if (isInitialized) return;

  const { request, utils } = cerumusic;

  // 创建完整的 lx 模拟环境
  const mockLx = {
    EVENT_NAMES: {
      request: 'request',
      inited: 'inited',
      updateAlert: 'updateAlert'
    },
    on: (event, handler) => {
      console.log(\`[${pluginName + ' by Ceru插件' || 'ceru插件'}] 注册事件监听器: \${event}\`);
      if (event === 'request') {
        requestHandler = handler;
      }
    },
    send: (event, data) => {
      console.log(\`[${pluginName + ' by Ceru插件' || 'ceru插件'}] 发送事件: \${event}\`, data);
      if (event === 'inited' && data.sources) {
        // 动态更新音源信息，保持原始的音质配置
        pluginSources = data.sources;

        // 将插件发送的音源信息转换为正确格式并同步到导出的 sources
        Object.keys(pluginSources).forEach(sourceId => {
          const sourceInfo = pluginSources[sourceId];

          // 保留原始音质配置，如果存在的话
          const originalQualitys = sources[sourceId] && sources[sourceId].qualitys;

          sources[sourceId] = {
            name: getSourceName(sourceId),
            type: sourceInfo.type || 'music',
            // 优先使用插件发送的音质配置，其次使用原始解析的配置，最后使用默认配置
            qualitys: sourceInfo.qualitys || originalQualitys || ['128k', '320k']
          };
        });
      } else if (event === 'updateAlert' && data) {
        // 处理更新提示事件，传入 cerumusic API
        handleUpdateAlert(data, cerumusic);
      }
    },
    request: request,
    utils: {
      buffer: utils.buffer,
      crypto: {
        aesEncrypt: (data, mode, key, iv) => {
          // 简化的 AES 加密实现
          try {
            return utils.crypto ? utils.crypto.aesEncrypt(data, mode, key, iv) : data;
          } catch (e) {
            return data;
          }
        },
        md5: (str) => {
          try {
            return utils.crypto ? utils.crypto.md5(str) : str;
          } catch (e) {
            return str;
          }
        },
        randomBytes: (size) => {
          try {
            return utils.crypto ? utils.crypto.randomBytes(size) : Buffer.alloc(size);
          } catch (e) {
            return Buffer.alloc(size);
          }
        },
        rsaEncrypt: (data, key) => {
          try {
            return utils.crypto ? utils.crypto.rsaEncrypt(data, key) : data;
          } catch (e) {
            return data;
          }
        }
      }
    },
    version: '1.0.0',
    // API 版本号，API 变更时此版本号将会更改
    apiVersion: '1.0.0',
    currentScriptInfo: {
      rawScript: originalPluginCode,
      name: '${pluginName}',
      version: '${pluginVersion}',
      author: '${author}',
      description: '${pluginDesc}',
      homepage: '${pluginHomepage}'
    },
    // 自定义源运行环境，移动端将固定为 mobile
    env: 'nodejs'
  };

  // 创建全局环境
  const globalThis = {
    lx: mockLx
  };

  // 创建沙箱环境
  const sandbox = {
    globalThis: globalThis,
    lx: mockLx,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Buffer: Buffer,
    JSON: JSON,
    require: () => ({}),
    module: { exports: {} },
    exports: {},
    process: { env: { NODE_ENV: 'production' } }
  };

  try {
    // 使用 Function 构造器执行插件代码
    const pluginFunction = new Function(
      'globalThis', 'lx', 'console', 'setTimeout', 'clearTimeout',
      'setInterval', 'clearInterval', 'Buffer', 'JSON', 'require',
      'module', 'exports', 'process',
      originalPluginCode
    );

    pluginFunction(
      globalThis, mockLx, console, setTimeout, clearTimeout,
      setInterval, clearInterval, Buffer, JSON, () => ({}),
      { exports: {} }, {}, { env: { NODE_ENV: 'production' } }
    );

    isInitialized = true;
    console.log(\`[CeruMusic] 事件驱动插件初始化成功\`);
  } catch (error) {
    console.log(\`[CeruMusic] 插件初始化完成: \${error.message}\`);
    isInitialized = true;
  }
}



async function musicUrl(source, musicInfo, quality) {
  // 确保插件已初始化
  initializePlugin();

  // 等待一小段时间让插件完全初始化
  await new Promise(resolve => setTimeout(resolve, 100));

  if (!requestHandler) {
    const errorMessage = '插件请求处理器未初始化';
    console.error(\`[\${pluginInfo.name}] Error: \${errorMessage}\`);
    throw new Error(errorMessage);
  }

  console.log(\`[\${pluginInfo.name}] 使用事件驱动方式获取 \${source} 音源链接\`);

  try {
    // 调用插件的请求处理器
    const result = await requestHandler({
      source: source,
      action: 'musicUrl',
      info: {
        musicInfo: musicInfo,
        type: quality
      }
    });

    // 检查结果是否有效
    if (!result) {
      const errorMessage = \`获取 \${source} 音源链接失败: 返回结果为空\`;
      console.error(\`[\${pluginInfo.name}] Error: \${errorMessage}\`);
      throw new Error(errorMessage);
    }

    // 如果结果是对象且包含错误信息
    if (typeof result === 'object' && result.error) {
      const errorMessage = result.error || \`获取 \${source} 音源链接失败\`;
      console.error(\`[\${pluginInfo.name}] Error: \${errorMessage}\`);
      throw new Error(errorMessage);
    }

    // 如果结果是对象且包含状态码
    if (typeof result === 'object' && result.code && result.code !== 200) {
      const errorMessage = result.msg || \`接口错误 (Code: \${result.code})\`;
      console.error(\`[\${pluginInfo.name}] Error: \${errorMessage}\`);
      throw new Error(errorMessage);
    }

    console.log(\`[\${pluginInfo.name}] Got URL: \${typeof result === 'string' ? result : result.url || result}\`);
    return result;
  } catch (error) {
    // 确保错误信息格式与 example-plugin.js 一致
    const errorMessage = error.message || \`获取 \${source} 音源链接时发生未知错误\`;
    console.error(\`[\${pluginInfo.name}] Error: \${errorMessage}\`);
    throw new Error(errorMessage);
  }
}

module.exports = {
  pluginInfo,
  sources,
  musicUrl
};`
}
