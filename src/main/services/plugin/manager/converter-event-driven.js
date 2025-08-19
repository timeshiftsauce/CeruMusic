/* eslint-disable */
const fs = require('fs');

function convertEventDrivenPlugin(originalCode) {
    console.log('检测到事件驱动插件，使用事件包装器转换...');

    // 提取插件信息
    const nameMatch = originalCode.match(/@name\s+(.+)/);
    const versionMatch = originalCode.match(/@version\s+(.+)/);
    const descMatch = originalCode.match(/@description\s+(.+)/);

    const pluginName = nameMatch ? nameMatch[1].trim() : "未知插件";
    const pluginVersion = versionMatch ? versionMatch[1].trim() : "1.0.0";
    const pluginDesc = descMatch ? descMatch[1].trim() : "从事件驱动插件转换而来";

    return `/**
 * 由 CeruMusic 插件转换器转换 - @author sqj
 * @name ${pluginName}
 * @version ${pluginVersion}
 * @description ${pluginDesc}
 */

const pluginInfo = {
  name: "${pluginName}",
  version: "${pluginVersion}",
  author: "Unknown",
  description: "${pluginDesc}"
};

// 原始插件代码
const originalPluginCode = ${JSON.stringify(originalCode)};

// 插件状态
let isInitialized = false;
let pluginSources = {};
let requestHandler = null;

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
        pluginSources = data.sources;
        console.log('[${pluginName + ' by Ceru插件' || 'ceru插件'}] 音源注册完成:', Object.keys(pluginSources));
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
    currentScriptInfo: {
      rawScript: originalPluginCode,
      version: '1.0.0' // 添加版本信息
    },
    env: 'nodejs' // 添加环境信息
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

// 从插件源码中提取音源信息作为备用
const sources = {};

// 尝试从代码中提取音源信息
const sourceMatches = originalPluginCode.match(/sources\\[['"]([^'"]+)['"]\\]\\s*=\\s*apiInfo\\.info/g);
if (sourceMatches) {
  sourceMatches.forEach(match => {
    const sourceId = match.match(/['"]([^'"]+)['"]/)[1];
    sources[sourceId] = {
      name: sourceId.toUpperCase() + '音乐',
      type: 'music',
      qualitys: ['128k', '320k']
    };
  });
} else {
  // 默认音源配置
  sources.kw = { name: "酷我音乐", type: "music", qualitys: ["128k", "320k"] };
  sources.kg = { name: "酷狗音乐", type: "music", qualitys: ["128k"] };
  sources.tx = { name: "QQ音乐", type: "music", qualitys: ["128k"] };
  sources.wy = { name: "网易云音乐", type: "music", qualitys: ["128k", "320k"] };
  sources.mg = { name: "咪咕音乐", type: "music", qualitys: ["128k"] };
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

// 主函数
function main() {
  const inputFile = process.argv[2]
  const outputFile = process.argv[3] || 'event-driven-plugin.js'

  if (!inputFile) {
    console.error('使用方法: node converter-event-driven.js <输入文件> [输出文件]')
    process.exit(1)
  }

    try {
        const inputCode = fs.readFileSync(inputFile, 'utf8');
        const result = convertEventDrivenPlugin(inputCode);
        fs.writeFileSync(outputFile, result);

        console.log('\\n🎉 事件驱动插件转换成功!');
        console.log(`   新插件已保存至: ${outputFile}`);
    } catch (error) {
        console.error('❌ 转换失败:', error.message);
        process.exit(1);
    }
}

export { convertEventDrivenPlugin }
