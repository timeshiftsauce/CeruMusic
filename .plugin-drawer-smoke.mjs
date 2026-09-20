// src/main/services/plugin/manager/PluginHost.ts
import { readFile } from "fs/promises";
import { join as join3, basename } from "path";
import { dialog } from "electron";
import { randomUUID as randomUUID2 } from "crypto";
import { PluginCore, readPluginArtifact } from "@shiqianjiang/ceru-plugin-core";
import { NodePluginSandbox } from "@shiqianjiang/ceru-plugin-core/node";
import { ElectronPluginSandbox } from "@shiqianjiang/ceru-plugin-core/electron";
import { requestNetwork } from "@shiqianjiang/ceru-plugin-core/network";
import { SocketBroker } from "@shiqianjiang/ceru-plugin-core/sockets";
import { GuestStore } from "@shiqianjiang/ceru-plugin-core/guests";

// src/main/utils/path.ts
import electron from "electron";
function getAppDirPath(name) {
  return electron.app.getPath(name ?? "userData");
}

// src/main/services/plugin/uiBridge.ts
import { ipcMain } from "electron";
import { randomUUID } from "crypto";
var pending = /* @__PURE__ */ new Map();
var mainWindow;
var ready = false;
function cancelWindowRequests(sender, message) {
  for (const [id, entry] of pending) {
    if (entry.sender !== sender) continue;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.reject(new Error(message));
  }
}
function bindPluginUIWindow(window) {
  mainWindow = window;
  ready = false;
  window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (mainWindow !== window || isInPlace || !isMainFrame) return;
    ready = false;
    cancelWindowRequests(window.webContents.id, "\u4E3B\u754C\u9762\u6B63\u5728\u91CD\u65B0\u52A0\u8F7D\uFF0C\u8BF7\u91CD\u8BD5");
  });
  const sender = window.webContents.id;
  window.once("closed", () => {
    cancelWindowRequests(sender, "\u4E3B\u754C\u9762\u5DF2\u5173\u95ED");
    if (mainWindow === window) {
      mainWindow = void 0;
      ready = false;
    }
  });
}
ipcMain.handle("plugin:ui-ready", (event, value) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents)
    return false;
  ready = value === true;
  if (!ready) cancelWindowRequests(event.sender.id, "\u63D2\u4EF6\u754C\u9762\u5DF2\u65AD\u5F00\uFF0C\u8BF7\u91CD\u8BD5");
  return ready;
});
ipcMain.handle("plugin:ui-result", (event, result) => {
  const entry = pending.get(result?.id);
  if (!entry || entry.sender !== event.sender.id) return;
  pending.delete(result.id);
  clearTimeout(entry.timer);
  result.error ? entry.reject(new Error(String(result.error))) : entry.resolve(result.value);
});
function applicationWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : void 0;
}
function callPluginUI(pluginId, method, data) {
  const win = applicationWindow();
  if (!win || !ready) return Promise.reject(new Error("\u8BF7\u7B49\u5F85\u6F9C\u97F3\u4E3B\u754C\u9762\u52A0\u8F7D\u5B8C\u6210\u540E\u91CD\u8BD5"));
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      if (!win.isDestroyed()) win.webContents.send("plugin:ui-cancel", { id, pluginId });
      reject(new Error("\u7528\u6237\u754C\u9762\u8BF7\u6C42\u8D85\u65F6"));
    }, 12e4);
    pending.set(id, { sender: win.webContents.id, pluginId, resolve, reject, timer });
    win.webContents.send("plugin:ui", { id, pluginId, method, data });
  });
}
function pluginChanged(change) {
  applicationWindow()?.webContents.send("plugin:changed", change);
}

// src/main/events/pluginNotice.ts
var mainWindow2 = null;
function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
}
function getNoticeTitle(type) {
  const titleMap = {
    update: "\u63D2\u4EF6\u66F4\u65B0",
    error: "\u63D2\u4EF6\u9519\u8BEF",
    warning: "\u63D2\u4EF6\u8B66\u544A",
    info: "\u63D2\u4EF6\u4FE1\u606F",
    success: "\u64CD\u4F5C\u6210\u529F"
  };
  return titleMap[type] || "\u63D2\u4EF6\u901A\u77E5";
}
function getDefaultMessage(type, data, pluginName) {
  switch (type) {
    case "error":
      return `\u63D2\u4EF6 "${pluginName}" \u53D1\u751F\u9519\u8BEF: ${data?.error || data?.message || "\u672A\u77E5\u9519\u8BEF"}`;
    case "warning":
      return `\u63D2\u4EF6 "${pluginName}" \u8B66\u544A: ${data?.warning || data?.message || "\u9700\u8981\u6CE8\u610F"}`;
    case "success":
      return `\u63D2\u4EF6 "${pluginName}" \u64CD\u4F5C\u6210\u529F: ${data?.message || ""}`;
    case "info":
    default:
      return data?.message || `\u63D2\u4EF6 "${pluginName}" \u4FE1\u606F: ${JSON.stringify(data)}`;
  }
}
function sendPluginNotice(noticeData, pluginName) {
  try {
    if (!mainWindow2) {
      console.warn("[CeruMusic] \u672A\u627E\u5230\u4E3B\u7A97\u53E3\uFF0C\u65E0\u6CD5\u53D1\u9001\u901A\u77E5");
      return;
    }
    const baseNoticeData = {
      type: noticeData.type,
      data: noticeData.data,
      timestamp: noticeData.timestamp || Date.now(),
      pluginName: pluginName || noticeData.pluginName || "Unknown Plugin",
      pluginId: noticeData.pluginId,
      guestId: noticeData.guestId
    };
    if (noticeData.type === "update" && noticeData.data?.url && isValidUrl(noticeData.data.url)) {
      const updateNotice = {
        ...baseNoticeData,
        dialogType: "update",
        title: noticeData.data.title || "\u63D2\u4EF6\u66F4\u65B0",
        message: noticeData.data.content || `\u63D2\u4EF6 "${baseNoticeData.pluginName}" \u6709\u65B0\u7248\u672C\u53EF\u7528`,
        updateUrl: noticeData.data.url,
        pluginType: noticeData.data.pluginInfo?.type,
        currentVersion: noticeData.currentVersion || "\u672A\u77E5",
        // 这个需要从插件实例获取
        newVersion: noticeData.data.version,
        actions: [
          { text: "\u7A0D\u540E\u66F4\u65B0", type: "cancel" },
          { text: "\u7ACB\u5373\u66F4\u65B0", type: "update", primary: true }
        ]
      };
      mainWindow2.webContents.send("plugin-notice", updateNotice);
    } else {
      const infoNotice = {
        ...baseNoticeData,
        dialogType: noticeData.type === "error" ? "error" : noticeData.type === "warn" ? "warning" : noticeData.type === "success" ? "success" : "info",
        title: noticeData.data.title || getNoticeTitle(noticeData.type),
        message: noticeData.data.message || noticeData.data.content || getDefaultMessage(noticeData.type, noticeData.data, baseNoticeData.pluginName),
        ...noticeData.data.url ? {
          updateUrl: noticeData.data.url,
          pluginType: noticeData.data.pluginInfo?.type
        } : {},
        actions: noticeData.data.url ? [
          { text: "\u53D6\u6D88", type: "cancel" },
          { text: "\u5B89\u88C5\u5E76\u4F7F\u7528", type: "confirm", primary: true }
        ] : [{ text: "\u6211\u77E5\u9053\u4E86", type: "confirm", primary: true }]
      };
      mainWindow2.webContents.send("plugin-notice", infoNotice);
    }
  } catch (error) {
    console.error("[CeruMusic] \u53D1\u9001\u63D2\u4EF6\u901A\u77E5\u5931\u8D25:", error.message);
  }
}

// src/main/services/plugin/manager/PluginHost.ts
import {
  PERMISSION_GROUPS,
  permissionGroup,
  assertContentPage
} from "@shiqianjiang/ceru-plugin-sdk";

// src/main/services/plugin/pluginConfig.ts
import * as fs from "fs";
import * as path from "path";
var CONFIG_DIR = "plugins/config";
var PERMISSION_DIR = "plugins/permissions";
function getConfigDir() {
  return path.join(getAppDirPath(), CONFIG_DIR);
}
function getConfigFilePath(pluginId) {
  return path.join(getConfigDir(), `${pluginId}.json`);
}
function ensureConfigDir() {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function getPermissionFilePath(pluginId) {
  return path.join(getAppDirPath(), PERMISSION_DIR, `${pluginId}.json`);
}
function ensurePermissionDir() {
  const dir = path.join(getAppDirPath(), PERMISSION_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function getPluginPermissions(pluginId) {
  const filePath = getPermissionFilePath(pluginId);
  if (!fs.existsSync(filePath)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}
function savePluginPermissions(pluginId, permissions) {
  ensurePermissionDir();
  const filePath = getPermissionFilePath(pluginId);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify([...new Set(permissions)], null, 2));
  fs.renameSync(tempPath, filePath);
}
function getPluginConfig(pluginId) {
  const filePath = getConfigFilePath(pluginId);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}
function savePluginConfig(pluginId, config) {
  ensureConfigDir();
  const filePath = getConfigFilePath(pluginId);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2));
  fs.renameSync(tempPath, filePath);
}

// src/main/services/plugin/shareResolver.ts
function exportShareResolver(artifact, config, guest) {
  const manifest = artifact.header.manifest;
  const declaration = manifest.modules.share;
  if (!declaration) throw new Error("\u6B64\u63D2\u4EF6\u672A\u63D0\u4F9B\u670D\u52A1\u5668\u5206\u4EAB\u89E3\u6790\u6A21\u5757\uFF0C\u8BF7\u66F4\u65B0\u63D2\u4EF6\u540E\u91CD\u8BD5");
  const factory = artifact.modules[declaration.entry];
  if (!factory || factory.includes("__ceruRequire"))
    throw new Error("\u5206\u4EAB\u89E3\u6790\u6A21\u5757\u4F9D\u8D56\u684C\u9762\u73AF\u5883\uFF0C\u65E0\u6CD5\u5728\u670D\u52A1\u5668\u8FD0\u884C");
  const values = Object.fromEntries((declaration.configKeys ?? []).map((key) => [key, config[key]]));
  const sources = Object.fromEntries(
    (guest ? guest.info.providers.map((p) => ({ id: p.id, name: p.name, qualities: p.qualities })) : manifest.contributes?.providers ?? []).map((p) => [p.id, { name: p.name, qualitys: p.qualities ?? [] }])
  );
  const info = {
    name: guest?.info.name || manifest.name,
    version: guest?.info.version || manifest.version,
    author: guest?.info.author || manifest.author || ""
  };
  const names = declaration.guestGlobals ?? [];
  if (names.some(
    (name) => !/^[a-zA-Z_$][\w$]*$/.test(name) || ["globalThis", "arguments", "eval"].includes(name)
  ))
    throw new Error("\u5B50\u63D2\u4EF6\u5206\u4EAB\u5168\u5C40\u53D8\u91CF\u58F0\u660E\u65E0\u6548");
  if (declaration.guestAdapterId && (!guest || guest.info.adapterId !== declaration.guestAdapterId))
    throw new Error("\u8BF7\u5148\u9009\u62E9\u6B64\u517C\u5BB9\u73AF\u5883\u4E2D\u7684\u5B50\u97F3\u6E90");
  const guestInfo = guest ? {
    name: guest.info.name,
    version: guest.info.version,
    author: guest.info.author,
    rawScript: guest.script
  } : void 0;
  const runner = guest ? `function(bindings) {
    const scope = Object.assign(Object.create(globalThis), bindings);
    return (function(globalThis${names.map((name) => "," + name).join("")}) {
${guest.script}
    }).call(scope,scope${names.map((name) => ",bindings[" + JSON.stringify(name) + "]").join("")});
  }` : "undefined";
  return `/* CeruMusic server share resolver. Only musicUrl is exported as an executable capability. */
const pluginInfo = ${JSON.stringify(info)};
const sources = ${JSON.stringify(sources)};
const config = ${JSON.stringify(values)};
const createResolver = ${factory};
let resolver;
async function musicUrl(source, musicInfo, quality) {
  if (!Object.prototype.hasOwnProperty.call(sources,source)) throw new Error('\u6B64\u5206\u4EAB\u97F3\u6E90\u4E0D\u652F\u6301\u6240\u9009\u5E73\u53F0');
  if (!sources[source].qualitys.includes(quality)) throw new Error('\u6B64\u5206\u4EAB\u97F3\u6E90\u4E0D\u652F\u6301\u6240\u9009\u97F3\u8D28');
  if (!resolver) resolver = Promise.resolve(createResolver({
    plugin: pluginInfo, sources, config,
    request: (url,options) => cerumusic.request(url,options),
    utils: cerumusic.utils, guest: ${JSON.stringify(guestInfo) || "undefined"}, runGuest: ${runner}
  })).catch(error => { resolver = undefined; throw error });
  const result = await (await resolver).musicUrl(source,musicInfo,quality);
  if (typeof result !== 'string' || !['http:','https:'].includes(new URL(result).protocol)) throw new Error('\u97F3\u6E90\u6CA1\u6709\u8FD4\u56DE\u6709\u6548\u64AD\u653E\u5730\u5740');
  return result;
}
module.exports = { pluginInfo, sources, musicUrl };
`;
}

// src/common/pluginDrawer.ts
var object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var safeKey = (value) => typeof value === "string" && /^[a-zA-Z][\w.-]{0,127}$/.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
function readDrawerSchema(value, actions) {
  const invalid = () => {
    throw new Error("\u63D2\u4EF6\u62BD\u5C49\u914D\u7F6E\u65E0\u6548");
  };
  if (!object(value) || JSON.stringify(value).length > 64 * 1024) return invalid();
  if (value.schemaVersion !== "1.0" || value.presentation?.kind !== "drawer") return invalid();
  const { presentation, root } = value;
  if (presentation.placement !== void 0 && !["left", "right", "top", "bottom"].includes(presentation.placement))
    return invalid();
  if (presentation.size !== void 0 && (!Number.isFinite(presentation.size) || presentation.size < 280 || presentation.size > 1200))
    return invalid();
  if (presentation.openOnFirstUse !== void 0 && typeof presentation.openOnFirstUse !== "boolean")
    return invalid();
  if (!object(root) || root.type !== "form" || typeof root.title !== "string" || root.title.length > 100 || !actions.includes(root.submitAction))
    return invalid();
  if (!Array.isArray(root.children) || root.children.length > 64) return invalid();
  if (root.submitInput !== void 0 && !object(root.submitInput)) return invalid();
  const bindings = /* @__PURE__ */ new Set();
  for (const node of root.children) {
    if (!object(node)) return invalid();
    for (const key of ["label", "placeholder", "description"]) {
      if (node[key] !== void 0 && (typeof node[key] !== "string" || node[key].length > 2e3))
        return invalid();
    }
    if (node.type === "button") {
      if (!actions.includes(node.action) || typeof node.label !== "string") return invalid();
      if (node.input !== void 0 && !object(node.input)) return invalid();
      if (node.requires !== void 0 && !safeKey(node.requires)) return invalid();
      continue;
    }
    if (!["text-input", "password", "number", "toggle", "select", "text"].includes(node.type) || !safeKey(node.bind))
      return invalid();
    if (bindings.has(node.bind)) return invalid();
    bindings.add(node.bind);
    if (node.required !== void 0 && typeof node.required !== "boolean") return invalid();
    if (node.type === "select" && (!Array.isArray(node.options) || !node.options.length || node.options.length > 100 || node.options.some(
      (option) => !object(option) || typeof option.label !== "string" || typeof option.value !== "string"
    )))
      return invalid();
  }
  return value;
}
function drawerAction(schema, index, values) {
  if (!object(values) || JSON.stringify(values).length > 64 * 1024)
    throw new Error("\u63D2\u4EF6\u8868\u5355\u5185\u5BB9\u65E0\u6548");
  const root = schema.root;
  const button = index === -1 ? void 0 : root.children[index];
  if (index !== -1 && button?.type !== "button") throw new Error("\u63D2\u4EF6\u672A\u58F0\u660E\u6B64\u62BD\u5C49\u64CD\u4F5C");
  const input = {};
  for (const field of root.children) {
    if (field.type === "button" || field.type === "text") continue;
    const value = values[field.bind];
    if (index === -1 && field.required && (value === void 0 || value === null || String(value).trim() === ""))
      throw new Error("\u8BF7\u586B\u5199" + (field.label || field.bind));
    if (value === void 0) continue;
    if (field.type === "toggle" ? typeof value !== "boolean" : field.type === "number" ? !Number.isFinite(value) : typeof value !== "string" || value.length > 8192)
      throw new Error("\u5B57\u6BB5\u683C\u5F0F\u65E0\u6548: " + (field.label || field.bind));
    if (field.type === "select" && !field.options?.some((option) => option.value === value))
      throw new Error("\u8BF7\u9009\u62E9\u6709\u6548\u7684" + (field.label || field.bind));
    input[field.bind] = value;
  }
  return {
    action: button?.type === "button" ? button.action : root.submitAction,
    input: { ...input, ...button?.type === "button" ? button.input : root.submitInput }
  };
}
function drawerState(schema, state) {
  const copy = { ...state };
  for (const field of schema.root.children) {
    if (field.type === "password") delete copy[field.bind];
  }
  return copy;
}

// src/main/services/plugin/storage.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2, renameSync as renameSync2, unlinkSync as unlinkSync2 } from "node:fs";
import { join as join2 } from "node:path";
var isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var isId = (id) => typeof id === "string" && /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id);
var own = (value, key) => Object.hasOwn(value, key);
function storagePath(id) {
  if (!isId(id)) throw new Error("\u65E0\u6548\u7684\u63D2\u4EF6 ID");
  return join2(getAppDirPath(), "plugins", "storage", id + ".json");
}
var disk = {
  read(id) {
    const path2 = storagePath(id);
    if (!existsSync2(path2))
      return { version: 1, values: getPluginConfig(id + ".storage"), readers: {} };
    const value = JSON.parse(readFileSync2(path2, "utf8"));
    if (value?.version !== 1 || !isObject(value.values) || !isObject(value.readers))
      throw new Error("\u63D2\u4EF6\u5B58\u50A8\u6587\u4EF6\u635F\u574F");
    return value;
  },
  write(id, value) {
    const path2 = storagePath(id);
    mkdirSync2(join2(getAppDirPath(), "plugins", "storage"), { recursive: true });
    writeFileSync2(path2 + ".tmp", JSON.stringify(value));
    renameSync2(path2 + ".tmp", path2);
    const legacy = join2(getAppDirPath(), "plugins", "config", id + ".storage.json");
    if (existsSync2(legacy)) unlinkSync2(legacy);
  }
};
function deletePluginStorage(instanceId) {
  const file = storagePath(instanceId);
  if (existsSync2(file)) unlinkSync2(file);
  if (existsSync2(file + ".tmp")) unlinkSync2(file + ".tmp");
}
var PluginStorage = class {
  constructor(instanceId, manifestId, resolveOwner, adapter = disk) {
    this.instanceId = instanceId;
    this.manifestId = manifestId;
    this.resolveOwner = resolveOwner;
    this.adapter = adapter;
  }
  invoke(method, selector, value) {
    const request = typeof selector === "string" ? { key: selector } : selector;
    if (!isObject(request) || Object.keys(request).some((key2) => !["key", "pluginId", "readableBy"].includes(key2)))
      throw new Error("\u65E0\u6548\u7684\u63D2\u4EF6\u5B58\u50A8\u8BF7\u6C42");
    const key = request.key;
    if (typeof key !== "string" || !key || key.length > 256 || ["__proto__", "constructor", "prototype"].includes(key))
      throw new Error("\u65E0\u6548\u7684\u5B58\u50A8\u952E");
    if (request.pluginId !== void 0 && !isId(request.pluginId)) throw new Error("\u65E0\u6548\u7684\u63D2\u4EF6 ID");
    const ownerId = request.pluginId ?? this.manifestId;
    const local = ownerId === this.manifestId;
    if (!local && method !== "get") throw new Error("\u4E0D\u80FD\u4FEE\u6539\u5176\u4ED6\u63D2\u4EF6\u7684\u6570\u636E\u6216\u8BFB\u53D6\u6743\u9650");
    if (method !== "set" && own(request, "readableBy"))
      throw new Error("\u53EA\u6709\u6570\u636E\u6240\u5C5E\u63D2\u4EF6\u53EF\u4EE5\u8BBE\u7F6E\u8BFB\u53D6\u6743\u9650");
    const target = local ? this.instanceId : this.resolveOwner(ownerId);
    if (!target) throw new Error("\u76EE\u6807\u63D2\u4EF6\u672A\u5B89\u88C5");
    const stored = this.adapter.read(target);
    if (!local) {
      const readers = own(stored.readers, key) ? stored.readers[key] : void 0;
      if (readers !== "*" && !(Array.isArray(readers) && readers.includes(this.manifestId)))
        throw new Error("\u76EE\u6807\u63D2\u4EF6\u672A\u6388\u6743\u8BFB\u53D6\u6B64\u6570\u636E");
    }
    if (method === "get")
      return own(stored.values, key) ? JSON.parse(JSON.stringify(stored.values[key])) : null;
    const next = {
      version: 1,
      values: { ...stored.values },
      readers: { ...stored.readers }
    };
    if (method === "delete") {
      delete next.values[key];
      delete next.readers[key];
    } else {
      if (value === void 0) throw new Error("\u5B58\u50A8\u503C\u5FC5\u987B\u662F JSON\uFF0C\u7A7A\u503C\u8BF7\u4F7F\u7528 null");
      next.values[key] = value;
      if (own(request, "readableBy")) {
        const readers = request.readableBy;
        if (readers !== "*" && (!Array.isArray(readers) || readers.length > 128 || !readers.every(isId)))
          throw new Error("\u8BFB\u53D6\u6743\u9650\u5FC5\u987B\u662F * \u6216\u63D2\u4EF6 ID \u6570\u7EC4");
        next.readers[key] = readers === "*" ? "*" : [...new Set(readers)];
      }
    }
    const encoded = JSON.stringify(next);
    if (Buffer.byteLength(encoded, "utf8") > 10 * 1024 * 1024)
      throw new Error("\u63D2\u4EF6\u5B58\u50A8\u8D85\u8FC7 10 MiB");
    this.adapter.write(target, JSON.parse(encoded));
    return null;
  }
};

// src/main/services/plugin/manager/PluginHost.ts
var canonical = (value) => value && typeof value === "object" ? Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]" : "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}" : JSON.stringify(value);
var fingerprint = (p) => p.key + ":" + p.name + ":" + canonical(p.scope ?? {});
var PluginHost = class {
  constructor(pluginCode = null, logger = console) {
    this.pluginCode = pluginCode;
    this.logger = logger;
  }
  pluginId;
  resolveStorageOwner = () => void 0;
  onThrottle = null;
  onDisabled = null;
  core;
  sandbox;
  surfaces = /* @__PURE__ */ new Map();
  drawerSessions = /* @__PURE__ */ new Map();
  surfaceStates = /* @__PURE__ */ new Map();
  initialView;
  artifact;
  records = /* @__PURE__ */ new Set();
  requests = /* @__PURE__ */ new Map();
  prompts = /* @__PURE__ */ new Map();
  promptedGroups = /* @__PURE__ */ new Set();
  permissionNotices = /* @__PURE__ */ new Map();
  importResults = /* @__PURE__ */ new Map();
  providerMethods = /* @__PURE__ */ new Map();
  actionIds = /* @__PURE__ */ new Set();
  disposed = false;
  storage;
  effectiveConfig = {};
  guestStore;
  promptQueue = Promise.resolve();
  sockets = new SocketBroker();
  socketTimer;
  async loadPlugin(path2, logger = console) {
    this.logger = logger;
    this.pluginCode = await readFile(path2, "utf8");
    await this.ensureReady();
    return this;
  }
  async ensureReady() {
    if (this.core) return;
    if (!this.pluginCode) throw new Error("Missing plugin artifact");
    this.artifact = readPluginArtifact(this.pluginCode).artifact;
    if (this.artifact.header.manifest.contributes?.guestAdapters?.length) {
      this.guestStore = new GuestStore({
        root: join3(getAppDirPath(), "plugins", "guests", this.pluginId),
        artifact: this.artifact,
        approve: (info) => callPluginUI(this.pluginId, "ui.dialogs.confirm", {
          title: "\u5B89\u88C5\u5B50\u63D2\u4EF6",
          message: `${info.name} ${info.version}${info.author ? " \xB7 " + info.author : ""}
\u5C06\u5B89\u88C5\u5230${this.getPluginInfo().name}\uFF0C\u9996\u6B21\u7F51\u7EDC\u8BF7\u6C42\u4F1A\u5355\u72EC\u7533\u8BF7\u6388\u6743\u3002`,
          confirmText: "\u5B89\u88C5"
        }),
        authorize: (guest, permission) => callPluginUI(this.pluginId, "ui.permissions.request", {
          pluginName: guest.name + "\uFF08\u5B50\u63D2\u4EF6\uFF09",
          title: permission === "network" ? "\u8BBF\u95EE\u516C\u7F51\u670D\u52A1" : "\u8BBF\u95EE\u5C40\u57DF\u7F51\u4E0E\u672C\u673A\u670D\u52A1",
          description: "\u6B64\u6388\u6743\u4EC5\u5C5E\u4E8E\u8BE5\u5B50\u63D2\u4EF6\uFF0C\u4E0D\u4E0E\u517C\u5BB9\u73AF\u5883\u6216\u5176\u4ED6\u97F3\u6E90\u5171\u4EAB\u3002"
        }),
        request: requestNetwork,
        changed: () => {
          pluginChanged();
          for (const surface of this.surfaces.values())
            void surface.send("state", { guestsChanged: true }).catch(() => {
            });
        },
        event: (guest, type, data) => {
          if (type === "log")
            this.logger.info(`[guest:${guest.id}] ${guest.name}`, this.redactGuestLog(data.values));
          if (type === "notify" && data.level === "warning") {
            void callPluginUI(this.pluginId, "ui.toast", {
              message: `${guest.name}\uFF1A${data.message}`,
              level: "warning"
            }).catch(() => {
            });
          } else if (type === "notify")
            sendPluginNotice({
              type: data.updateUrl ? "update" : "info",
              pluginId: this.pluginId,
              guestId: guest.id,
              pluginName: guest.name,
              currentVersion: guest.version,
              data: { url: data.updateUrl, content: String(data.message) }
            });
        }
      });
      await this.guestStore.initialize();
    }
    if (this.artifact.header.manifest.modules?.surfaces?.length)
      void ElectronPluginSandbox.prewarm?.();
    this.records = new Set(getPluginPermissions(this.pluginId || this.artifact.header.manifest.id));
    const previousNames = {
      network: "network.request",
      "network.private": "network.private",
      "fallback.hold": "playback.fallback.hold",
      "library.read": "library.read",
      "library.write": "library.write"
    };
    let migrated = false;
    for (const permission of this.artifact.header.manifest.permissions ?? []) {
      if (this.records.has(permission.key) && previousNames[permission.key] === permission.name && !Object.keys(permission.scope ?? {}).length) {
        this.records.delete(permission.key);
        this.records.add(fingerprint(permission));
        migrated = true;
      }
    }
    if (migrated)
      savePluginPermissions(this.pluginId || this.artifact.header.manifest.id, [...this.records]);
    this.storage = new PluginStorage(
      this.pluginId || this.artifact.header.manifest.id,
      this.artifact.header.manifest.id,
      (id) => this.resolveStorageOwner(id)
    );
    this.core = await PluginCore.load(this.pluginCode, {
      host: {
        activate: async (artifact, context) => {
          this.effectiveConfig = await context.config.get();
          const registrations = /* @__PURE__ */ new Map();
          this.sandbox = new NodePluginSandbox(
            (method, data) => this.rpc(method, data),
            (type, data) => {
              if (type === "register") {
                const key = data.kind + ":" + data.id;
                registrations.get(key)?.();
                if (data.kind === "provider") {
                  this.providerMethods.set(data.id, new Set(data.methods ?? []));
                  const implementation = {};
                  for (const path2 of data.methods ?? []) {
                    if (!/^(tracks|playlists|charts|sharing)\.[a-zA-Z]+$/.test(path2)) continue;
                    const [group, name] = path2.split(".");
                    implementation[group] ??= {};
                    implementation[group][name] = (...args) => {
                      const operation = args.pop();
                      return this.sandbox.invoke(
                        "provider",
                        data.id,
                        path2,
                        args,
                        operation.signal,
                        operation.id
                      );
                    };
                  }
                  registrations.set(key, context.providers.register(data.id, implementation));
                } else if (data.kind === "action") {
                  this.actionIds.add(data.id);
                  registrations.set(
                    key,
                    context.actions.register(
                      data.id,
                      (input, operation) => this.sandbox.invoke(
                        "action",
                        data.id,
                        "",
                        [input],
                        operation.signal,
                        operation.id
                      )
                    )
                  );
                } else if (data.kind === "playlist-importer")
                  registrations.set(
                    key,
                    context.playlistImporters.register(data.id, {
                      getTracks: (input, operation) => this.sandbox.invoke(
                        "playlist-importer",
                        data.id,
                        "getTracks",
                        [input],
                        operation.signal,
                        operation.id
                      )
                    })
                  );
                else if (data.kind === "lyric-converter")
                  registrations.set(
                    key,
                    context.lyricConverters.register(data.id, {
                      parse: (input, operation) => this.sandbox.invoke(
                        "lyric-converter",
                        data.id,
                        "parse",
                        [input],
                        operation.signal
                      ),
                      export: (input, operation) => this.sandbox.invoke(
                        "lyric-converter",
                        data.id,
                        "export",
                        [input],
                        operation.signal
                      )
                    })
                  );
              } else if (type === "unregister") {
                registrations.get(data.kind + ":" + data.id)?.();
                registrations.delete(data.kind + ":" + data.id);
                if (data.kind === "provider") this.providerMethods.delete(data.id);
                if (data.kind === "action") this.actionIds.delete(data.id);
              } else this.event(type, data);
            }
          );
          await this.sandbox.start(artifact);
          this.socketTimer = setInterval(() => {
            for (const event of this.sockets.drain()) void this.sandbox?.send("socket-event", event);
          }, 100);
          return () => this.sandbox?.dispose();
        }
      }
    });
    for (const guest of this.guestStore?.list() ?? []) {
      if (guest.selected)
        void this.guestStore.select(guest.id).catch(
          (error) => this.logger.warn(
            "\u5B50\u63D2\u4EF6\u542F\u52A8\u5931\u8D25:",
            error instanceof Error ? error.message : String(error)
          )
        );
    }
  }
  getPluginInfo() {
    const m = this.artifact.header.manifest;
    return {
      id: m.id,
      name: m.name,
      version: m.version,
      author: m.author || m.publisher || "",
      description: m.description
    };
  }
  getPluginCode() {
    return this.pluginCode;
  }
  async getShareResolverCode() {
    if (!this.artifact || this.disposed) throw new Error("\u8BF7\u5148\u4F7F\u7528\u97F3\u6E90\u63D2\u4EF6");
    const share = this.artifact.header.manifest.modules.share;
    if (!share) throw new Error("\u6B64\u63D2\u4EF6\u672A\u63D0\u4F9B\u670D\u52A1\u5668\u5206\u4EAB\u89E3\u6790\u6A21\u5757");
    const guest = share.guestAdapterId ? await this.guestStore?.exportSelected(share.guestAdapterId) : void 0;
    return exportShareResolver(
      this.artifact,
      { ...this.effectiveConfig, ...getPluginConfig(this.pluginId) },
      guest
    );
  }
  getManifest() {
    const { config: _config, ...manifest } = this.artifact.header.manifest;
    const selected = this.guestStore?.list().find((item) => item.selected);
    if (selected && manifest.contributes?.providers) {
      const copy = structuredClone(manifest);
      for (const provider of copy.contributes.providers)
        provider.qualities = selected.providers.find((item) => item.id === provider.id)?.qualities ?? [];
      return copy;
    }
    return manifest;
  }
  getSupportedSources() {
    return Object.fromEntries(
      (this.getManifest().contributes?.providers ?? []).map((p) => [
        p.id,
        {
          name: p.name,
          qualitys: p.qualities ?? [],
          qualities: p.qualities ?? [],
          icon: p.icon,
          protocols: p.protocols
        }
      ])
    );
  }
  getProviderIconUrls() {
    const icons = {};
    for (const provider of this.artifact?.header.manifest.contributes?.providers ?? []) {
      if (provider.icon?.kind !== "asset") continue;
      const resource = this.artifact?.resources[provider.icon.resource];
      if (!resource || resource.type !== "text" && resource.type !== "base64") continue;
      const mime = "mime" in resource ? resource.mime : void 0;
      if (!mime || !["image/svg+xml", "image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime))
        continue;
      if (typeof resource.value !== "string" || resource.value.length > 128 * 1024) continue;
      icons[provider.id] = `data:${mime};base64,${resource.type === "base64" ? resource.value : Buffer.from(resource.value, "utf8").toString("base64")}`;
    }
    return icons;
  }
  getPluginType() {
    return "music-source";
  }
  getConfigSchema() {
    return [];
  }
  isV2() {
    return true;
  }
  isDisabled() {
    return this.disposed;
  }
  supportsV2Provider(id, method) {
    if (this.disposed || !this.core?.snapshot().providers.includes(id)) return false;
    return !method || this.providerMethods.get(id)?.has(method) === true;
  }
  supportsAction(id) {
    return !this.disposed && this.actionIds.has(id);
  }
  getProviderMethods() {
    return Object.fromEntries(
      [...this.providerMethods].map(([providerId, methods]) => [providerId, [...methods]])
    );
  }
  getActionIds() {
    return [...this.actionIds];
  }
  operation() {
    return {
      id: randomUUID2(),
      deadlineAt: Date.now() + 12e4,
      signal: new AbortController().signal
    };
  }
  async traced(label, run) {
    if (!this.core) throw new Error("\u63D2\u4EF6\u5C1A\u672A\u6FC0\u6D3B");
    const operation = this.operation();
    const start = Date.now();
    this.logger.info(`[request:${operation.id}] ${label} \u5F00\u59CB`);
    try {
      const result = await run(operation);
      const status = result?.ok === false ? "\u5931\u8D25\uFF1A" + result.error?.message : "\u5B8C\u6210";
      const level = result?.ok !== false ? "info" : ["RATE_LIMITED", "AUTH_REQUIRED", "ENTITLEMENT_EXPIRED", "CANCELLED"].includes(
        result.error?.code
      ) ? "warn" : "error";
      this.logger[level](`[request:${operation.id}] ${label} ${status}`, {
        elapsedMs: Date.now() - start,
        ...result?.ok === false ? {
          code: result.error?.code,
          retryAfterMs: result.error?.retryAfterMs,
          recovery: result.error?.recovery?.mode
        } : {},
        ...Array.isArray(result?.items) ? { items: result.items.length, nextCursor: result.nextCursor ?? null } : {}
      });
      return result;
    } catch (error) {
      this.logger.error(`[request:${operation.id}] ${label} \u5931\u8D25`, {
        elapsedMs: Date.now() - start,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  async invokeV2Provider(id, method, args = []) {
    return this.traced(
      `${id}.${method}`,
      (operation) => this.core.invokeProvider(id, method, args, operation)
    );
  }
  async invokeV2Action(id, input = {}) {
    return this.traced(id, (operation) => this.core.invokeAction(id, input, operation));
  }
  async invokeV2Importer(id, input) {
    return this.traced(
      id,
      (operation) => this.core.importPlaylist(id, input.value, input.cursor, input.limit ?? 100, operation)
    );
  }
  resource(source, song) {
    const original = song.pluginResource;
    if (original?.pluginId === this.getPluginInfo().id) return original;
    return {
      pluginId: this.getPluginInfo().id,
      providerId: source,
      kind: "track",
      id: String(original?.id ?? song.hash ?? song.songmid ?? song.id),
      data: { song }
    };
  }
  async getMusicUrl(source, song, quality) {
    const result = await this.invokeV2Provider(source, "tracks.resolve", [
      this.resource(source, song),
      quality
    ]);
    if (!result.ok) {
      if (["await-user", "stop-current", "retry-later"].includes(result.error.recovery?.mode))
        this.onThrottle?.(this.pluginId, result.error.message, result.error.retryAfterMs);
      throw new Error(result.error.message);
    }
    return result.url;
  }
  async getPic(source, song) {
    return this.invokeV2Action("artwork.get", { source, song });
  }
  async getLyric(source, song) {
    const document = await this.invokeV2Provider(source, "tracks.lyrics", [
      this.resource(source, song)
    ]);
    return (await this.convertLyrics("export", { document, format: "lrc" })).text;
  }
  async convertLyrics(method, request, converterId, timeoutMs) {
    const converter = this.getManifest().contributes?.lyricConverters?.find(
      (item) => (!converterId || item.id === converterId) && (method === "export" || item.formats.includes(request.format) || item.formats.includes("auto"))
    );
    if (!converter || !this.core) throw new Error("\u63D2\u4EF6\u672A\u63D0\u4F9B\u6B64\u6B4C\u8BCD\u683C\u5F0F\u8F6C\u6362\u80FD\u529B");
    const operation = this.operation();
    if (timeoutMs) {
      operation.deadlineAt = Date.now() + timeoutMs;
      operation.signal = AbortSignal.timeout(timeoutMs);
    }
    return this.core.convertLyrics(converter.id, method, request, operation);
  }
  async getServiceLyric(_config, song) {
    return { lyric: await this.getLyric(song.source, song) };
  }
  async testConnection(_config) {
    await this.invokeV2Action("source.status");
    return { success: true, message: "\u8FDE\u63A5\u6210\u529F" };
  }
  async getPlaylists(_config) {
    throw new Error("\u8BF7\u4F7F\u7528\u63D2\u4EF6\u63D0\u4F9B\u7684\u6B4C\u5355 Provider");
  }
  async getPlaylistSongs(_config, _id) {
    throw new Error("\u8BF7\u4F7F\u7528\u63D2\u4EF6\u63D0\u4F9B\u7684\u6B4C\u5355\u5BFC\u5165\u5165\u53E3");
  }
  declarations() {
    return this.artifact?.header.manifest.permissions ?? [];
  }
  status(key) {
    const p = this.declarations().find((item) => item.key === key);
    return !p ? "undeclared" : this.records.has(fingerprint(p)) ? "granted" : this.records.has("deny:" + fingerprint(p)) ? "denied" : "prompt";
  }
  getGrantedPermissions() {
    return this.declarations().filter((p) => this.status(p.key) === "granted").map((p) => p.key);
  }
  setGrantedPermissions(keys) {
    if (!Array.isArray(keys) || keys.some((key) => !this.declarations().some((p) => p.key === key)))
      throw new Error("\u65E0\u6548\u7684\u6743\u9650\u9879");
    this.records = new Set(
      this.declarations().flatMap((p) => keys.includes(p.key) ? [fingerprint(p)] : [])
    );
    this.promptedGroups.clear();
    this.sockets.closeAll();
    savePluginPermissions(this.pluginId, [...this.records]);
    for (const controllers of this.requests.values())
      for (const controller of controllers) controller.abort();
    void this.sandbox?.send("host-event", { event: "permissions.changed", value: { keys } }).catch(() => {
    });
  }
  async requestPermission(key) {
    if (!["prompt", "denied"].includes(this.status(key))) return { status: this.status(key) };
    const p = this.declarations().find((item) => item.key === key);
    const group = permissionGroup(p.name);
    const groupId = group ?? key;
    let prompt = this.prompts.get(groupId);
    if (!prompt && this.promptedGroups.has(groupId)) {
      this.notifyPermissionDenied(p.name);
      return { status: this.status(key) };
    }
    if (!prompt) {
      prompt = this.promptQueue.then(async () => {
        if (this.disposed) return;
        const declarations = this.declarations().filter(
          (item) => (group ? permissionGroup(item.name) === group : item.key === key) && ["prompt", "denied"].includes(this.status(item.key))
        );
        if (!declarations.length) return;
        this.promptedGroups.add(groupId);
        let allowed;
        try {
          allowed = !!await callPluginUI(this.pluginId, "ui.permissions.request", {
            pluginName: this.getPluginInfo().name,
            title: group ? PERMISSION_GROUPS[group].title : "\u4F7F\u7528\u63D2\u4EF6\u529F\u80FD",
            description: declarations.map((item) => item.reason).join("\uFF1B")
          });
        } catch (error) {
          this.promptedGroups.delete(groupId);
          throw error;
        }
        if (this.disposed) return;
        for (const item of declarations) {
          this.records.delete("deny:" + fingerprint(item));
          this.records.add((allowed ? "" : "deny:") + fingerprint(item));
        }
        savePluginPermissions(this.pluginId, [...this.records]);
        await this.sandbox?.send("host-event", {
          event: "permissions.changed",
          value: { keys: declarations.map((item) => item.key) }
        });
      }).finally(() => this.prompts.delete(groupId));
      this.promptQueue = prompt.catch(() => void 0);
      this.prompts.set(groupId, prompt);
    }
    await prompt;
    if (this.status(key) !== "granted") this.notifyPermissionDenied(p.name);
    return { status: this.status(key) };
  }
  notifyPermissionDenied(name) {
    const group = permissionGroup(name);
    const id = group ?? name;
    const now = Date.now();
    if (now - (this.permissionNotices.get(id) ?? 0) < 5e3 || this.disposed) return;
    this.permissionNotices.set(id, now);
    const label = group ? PERMISSION_GROUPS[group].title : this.permissionLabel(name);
    void callPluginUI(this.pluginId, "ui.toast", {
      level: "warning",
      message: `${this.getPluginInfo().name}\u672A\u83B7\u5F97\u201C${label}\u201D\u6743\u9650\uFF0C\u8BF7\u5230\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 \u6743\u9650\u4E2D\u5141\u8BB8\u540E\u91CD\u8BD5`
    }).catch(() => {
    });
  }
  async authorize(key, name) {
    if (!this.declarations().some((p) => p.key === key && p.name === name))
      throw new Error("\u63D2\u4EF6\u672A\u58F0\u660E\u6743\u9650: " + name);
    if ((await this.requestPermission(key)).status !== "granted") {
      this.notifyPermissionDenied(name);
      throw new Error("\u6B64\u529F\u80FD\u5C1A\u672A\u83B7\u5F97\u6388\u6743\uFF0C\u53EF\u5728\u63D2\u4EF6\u7684\u201C\u6743\u9650\u201D\u4E2D\u5141\u8BB8\u540E\u91CD\u8BD5");
    }
  }
  permissionLabel(name) {
    return {
      "network.request": "\u7F51\u7EDC\u8BBF\u95EE",
      "network.private": "\u5C40\u57DF\u7F51\u8BBF\u95EE",
      "network.socket": "\u7F51\u7EDC\u8FDE\u63A5",
      "library.read": "\u6B4C\u5355\u8BFB\u53D6",
      "library.write": "\u6B4C\u5355\u4FEE\u6539",
      "account.profile": "\u8D26\u53F7\u8D44\u6599",
      "guests.manage": "\u5B50\u63D2\u4EF6\u7BA1\u7406",
      "guests.run": "\u5B50\u63D2\u4EF6\u8FD0\u884C"
    }[name] || "\u76F8\u5173\u529F\u80FD";
  }
  async rpc(method, data = {}) {
    if (this.disposed) throw new Error("Plugin stopped");
    if (method.startsWith("guests.")) {
      if (!this.guestStore) throw new Error("\u6B64\u63D2\u4EF6\u4E0D\u662F\u517C\u5BB9\u73AF\u5883");
      if (method === "guests.list") return this.guestStore.list();
      const permission = method === "guests.invoke" ? "guests.run" : "guests.manage";
      const declaration = this.declarations().find((item) => item.name === permission);
      if (!declaration) throw new Error("\u517C\u5BB9\u73AF\u5883\u672A\u58F0\u660E\u5B50\u63D2\u4EF6\u6743\u9650");
      await this.authorize(declaration.key, permission);
      if (method === "guests.import") return this.importGuest(data.adapterId);
      if (method === "guests.select") {
        await this.guestStore.select(data.guestId);
        return null;
      }
      if (method === "guests.remove") {
        await this.guestStore.remove(data.guestId);
        return null;
      }
      if (method === "guests.invoke")
        return this.guestStore.invoke(data.guestId, data.method, data.input);
      throw new Error("\u672A\u77E5\u5B50\u63D2\u4EF6\u64CD\u4F5C");
    }
    if (method === "permissions.query") return { status: this.status(data.key) };
    if (method === "permissions.request") return this.requestPermission(data.key);
    if (method === "permissions.getGranted")
      return this.declarations().filter((p) => this.status(p.key) === "granted").map((p) => ({
        ...p,
        scope: p.scope ?? {},
        status: "granted",
        group: permissionGroup(p.name)
      }));
    if (method === "permissions.requestGroup") {
      const entries = this.declarations().filter(
        (p) => permissionGroup(p.name) === data.group && (!data.keys || data.keys.includes(p.key))
      );
      for (const p of entries) await this.requestPermission(p.key);
      return {
        group: data.group,
        status: entries.length && entries.every((p) => this.status(p.key) === "granted") ? "granted" : "denied",
        grants: await this.rpc("permissions.getGranted")
      };
    }
    if (method === "config.get")
      return { ...this.effectiveConfig, ...getPluginConfig(this.pluginId) };
    if (method === "sockets.connect") {
      await this.authorize(data.permissionKey, "network.socket");
      const result = await this.sockets.connect(
        data,
        this.declarations().some(
          (p) => p.name === "network.private" && this.status(p.key) === "granted"
        ),
        []
      );
      if (this.status(data.permissionKey) !== "granted" || this.disposed) {
        this.sockets.disconnect(result.id);
        throw new Error("\u7F51\u7EDC\u6388\u6743\u5DF2\u64A4\u9500");
      }
      return result;
    }
    if (method === "sockets.send") {
      this.sockets.send(data.id, data.event, data.data);
      return null;
    }
    if (method === "sockets.disconnect") {
      this.sockets.disconnect(data.id);
      return null;
    }
    if (method === "http.request") {
      await this.authorize(data.permissionKey, "network.request");
      const controller = new AbortController();
      const id = String(data.operation?.id ?? randomUUID2());
      const controllers = this.requests.get(id) ?? /* @__PURE__ */ new Set();
      controllers.add(controller);
      this.requests.set(id, controllers);
      const url = new URL(data.url);
      const label = url.origin + url.pathname;
      const start = Date.now();
      this.logger.debug(`[request:${id}] HTTP ${data.method || "GET"} ${label} \u5F00\u59CB`);
      try {
        const response = await requestNetwork(
          data,
          () => this.declarations().some(
            (p) => p.name === "network.private" && this.status(p.key) === "granted"
          ),
          controller.signal
        );
        const level = response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "debug";
        this.logger[level](`[request:${id}] HTTP ${label} \u8FD4\u56DE`, {
          status: response.status,
          elapsedMs: Date.now() - start,
          code: response.body?.code ?? null
        });
        return response;
      } catch (error) {
        this.logger.error(`[request:${id}] HTTP ${label} \u5931\u8D25`, {
          elapsedMs: Date.now() - start,
          message: error instanceof Error ? error.message : String(error)
        });
        throw error;
      } finally {
        controllers.delete(controller);
        if (!controllers.size) this.requests.delete(id);
      }
    }
    if (method === "operations.cancel") {
      for (const controller of this.requests.get(data.id) ?? []) controller.abort();
      return null;
    }
    if (method === "storage.get" || method === "storage.set" || method === "storage.delete")
      return this.storage.invoke(method.slice(8), data.key, data.value);
    if (method.startsWith("library.playlists.")) {
      await this.authorize(
        data.permissionKey,
        method.endsWith(".import") ? "library.write" : "library.read"
      );
      if (method.endsWith(".import")) {
        assertContentPage({ items: data.items });
        if (data.items.some((item) => item.ref.kind !== "track"))
          throw new Error("\u6B4C\u5355\u53EA\u63A5\u6536\u6807\u51C6\u6B4C\u66F2");
      }
      if (!method.endsWith(".import")) return callPluginUI(this.pluginId, method, data);
      if (typeof data.requestId !== "string" || !data.requestId || data.requestId.length > 256)
        throw new Error("\u5BFC\u5165\u8BF7\u6C42\u7F3A\u5C11\u6709\u6548 requestId");
      const key = data.requestId + ":" + canonical(data.target ?? null);
      let result = this.importResults.get(key);
      if (!result) {
        result = callPluginUI(this.pluginId, method, data).catch((error) => {
          this.importResults.delete(key);
          throw error;
        });
        this.importResults.set(key, result);
        if (this.importResults.size > 200)
          this.importResults.delete(this.importResults.keys().next().value);
      }
      return result;
    }
    if (method.startsWith("services.capabilities.")) {
      const entries = ["account", "library"].map((service) => ({
        service,
        version: "1.0.0",
        available: true,
        permissionGroups: [service === "account" ? "account" : "libraryRead"]
      }));
      if (method.endsWith(".list")) return entries;
      return entries.find((e) => e.service === data.args?.[0]) ?? {
        service: data.args?.[0],
        version: "1.0.0",
        available: false,
        reason: "unsupported",
        permissionGroups: []
      };
    }
    if (method === "services.account.getSession" || method === "services.account.getProfile") {
      await this.authorize(data.args?.[0]?.permissionKey, "account.profile");
      return callPluginUI(this.pluginId, method, data);
    }
    if (method === "ui.playlistImport.open") {
      const importers = this.getManifest().contributes?.playlistImporters ?? [];
      if (!importers.length || data.importerId !== void 0 && !importers.some((item) => item.id === data.importerId))
        throw new Error("\u63D2\u4EF6\u672A\u58F0\u660E\u6B64\u6B4C\u5355\u5BFC\u5165\u80FD\u529B");
      if (data.title !== void 0 && (typeof data.title !== "string" || data.title.length > 100) || data.initialValue !== void 0 && (typeof data.initialValue !== "string" || data.initialValue.length > 8192))
        throw new Error("\u6B4C\u5355\u5BFC\u5165\u5F39\u7A97\u53C2\u6570\u65E0\u6548");
      return callPluginUI(this.pluginId, method, {
        importerId: data.importerId,
        title: data.title,
        initialValue: data.initialValue
      });
    }
    if (method === "ui.pluginUpdate.request") {
      const url = new URL(String(data.url || ""));
      if (url.protocol !== "https:") throw new Error("\u63D2\u4EF6\u66F4\u65B0\u5730\u5740\u5FC5\u987B\u4F7F\u7528 HTTPS");
      const info = this.getPluginInfo();
      sendPluginNotice({
        type: "update",
        pluginId: this.pluginId,
        pluginName: info.name,
        currentVersion: info.version,
        data: {
          url: url.href,
          version: String(data.version || ""),
          content: String(data.notes || "")
        }
      });
      return { accepted: false, updated: false, queued: true };
    }
    if ([
      "ui.dialogs.confirm",
      "ui.dialogs.prompt",
      "ui.dialogs.pickPlaylist",
      "ui.navigation.open",
      "ui.progress.create",
      "ui.progress.update",
      "ui.progress.close",
      "services.account.openLogin",
      "services.app.openSettings"
    ].includes(method))
      return callPluginUI(this.pluginId, method, data);
    throw new Error("\u5F53\u524D\u6F9C\u97F3 Host \u5C1A\u672A\u63A5\u5165\u80FD\u529B: " + method);
  }
  event(type, data) {
    if (type === "closed" && !this.disposed) {
      this.onDisabled?.(this.pluginId, "\u63D2\u4EF6\u8FD0\u884C\u73AF\u5883\u5DF2\u505C\u6B62");
      void this.destroy();
      return;
    }
    if (type === "log") {
      const level = ["debug", "info", "warn", "error", "log"].includes(data.level) ? data.level : "log";
      const secrets = Object.entries(this.artifact?.header.manifest.config ?? {}).filter(
        ([key, value]) => /key|token|password|secret/i.test(key) && typeof value === "string" && value.length > 3
      ).map(([, value]) => String(value));
      const values = JSON.stringify(
        (data?.values ?? []).slice(0, 8),
        (key, value) => /key|token|password|authorization|credential/i.test(key) ? "[redacted]" : typeof value === "string" ? secrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value).replace(/https?:\/\/[^\s]+\?[^\s]+/g, "[url query redacted]") : value
      );
      this.logger[level]("[plugin]", JSON.parse(values));
      return;
    }
    if (type === "notify") {
      void callPluginUI(this.pluginId, "ui.toast", data).catch(() => {
      });
      return;
    }
    if (type === "state") {
      const surface = this.artifact?.header.manifest.modules.surfaces?.find(
        (surface2) => surface2.id === data.surfaceId
      );
      if (surface?.kind === "schema") {
        if (!data.state || typeof data.state !== "object" || Array.isArray(data.state) || JSON.stringify(data.state).length > 256 * 1024) return;
        this.surfaceStates.set(data.surfaceId, data.state);
        const drawer = this.drawerSessions.get(data.surfaceId);
        if (drawer)
          void callPluginUI(this.pluginId, "ui.drawer.state", {
            sessionId: drawer.sessionId,
            state: drawerState(drawer.schema, data.state)
          }).catch(() => {
          });
      }
      void this.surfaces.get(data.surfaceId)?.send("state", data.state).catch(() => {
      });
      return;
    }
    if (type === "open-view")
      void this.openSurface(data.surfaceId).catch((error) => this.logger.error(error.message));
  }
  async openSurface(id) {
    if (this.disposed) throw new Error("\u63D2\u4EF6\u5DF2\u505C\u6B62");
    const surface = this.artifact?.header.manifest.modules.surfaces?.find((item) => item.id === id);
    if (!surface) throw new Error("\u63D2\u4EF6\u672A\u58F0\u660E\u6B64\u9875\u9762");
    if (surface.kind === "schema") {
      const schema = this.drawerSchema(id);
      const sessionId = randomUUID2();
      this.drawerSessions.set(id, { sessionId, schema });
      try {
        await callPluginUI(this.pluginId, "ui.drawer.open", {
          sessionId,
          surfaceId: id,
          schema,
          state: drawerState(schema, this.surfaceStates.get(id) ?? {})
        });
      } catch (error) {
        if (this.drawerSessions.get(id)?.sessionId === sessionId) this.drawerSessions.delete(id);
        throw error;
      }
      return;
    }
    if (this.surfaces.has(id)) {
      this.surfaces.get(id).show();
      return;
    }
    const view = new ElectronPluginSandbox(
      (method, data) => {
        if (method !== "surface.invoke") throw new Error("Surface may only invoke declared actions");
        return this.invokeV2Action(data.action, data.input);
      },
      (type, data) => {
        if (type === "closed") this.surfaces.delete(id);
        else this.event(type, data);
      }
    );
    this.surfaces.set(id, view);
    try {
      await view.start(this.artifact, id);
    } catch (error) {
      this.surfaces.delete(id);
      throw error;
    }
  }
  drawerSchema(id) {
    const manifest = this.artifact.header.manifest;
    const surface = manifest.modules.surfaces?.find(
      (item) => item.id === id && item.kind === "schema"
    );
    const resource = surface && this.artifact.resources[surface.entry];
    if (!resource || resource.type !== "json") throw new Error("\u63D2\u4EF6\u62BD\u5C49\u9875\u9762\u4E0D\u5B58\u5728");
    return readDrawerSchema(
      resource.value,
      (manifest.contributes?.commands ?? []).map((item) => item.action)
    );
  }
  async invokeDrawer(surfaceId, sessionId, index, values) {
    const session = this.drawerSessions.get(surfaceId);
    if (this.disposed || !session || session.sessionId !== sessionId)
      throw new Error("\u63D2\u4EF6\u62BD\u5C49\u5DF2\u5173\u95ED");
    const { action, input } = drawerAction(session.schema, index, values);
    await this.invokeV2Action(action, input);
    if (this.disposed || this.drawerSessions.get(surfaceId)?.sessionId !== sessionId)
      throw new Error("\u63D2\u4EF6\u62BD\u5C49\u5DF2\u5173\u95ED");
    return drawerState(session.schema, this.surfaceStates.get(surfaceId) ?? {});
  }
  closeDrawer(surfaceId, sessionId) {
    if (this.drawerSessions.get(surfaceId)?.sessionId === sessionId)
      this.drawerSessions.delete(surfaceId);
  }
  /** Only explicit use/enable calls this; automatic restoration never opens onboarding UI. */
  async openInitialView() {
    if (this.initialView) return this.initialView;
    this.initialView = (async () => {
      const preferenceKey = this.pluginId + ".ui";
      const preferences = getPluginConfig(preferenceKey);
      for (const surface of this.getManifest().modules.surfaces ?? []) {
        if (surface.kind !== "schema") continue;
        const resource = this.artifact.resources[surface.entry];
        if (resource?.type !== "json" || !resource.value?.presentation?.openOnFirstUse)
          continue;
        if (preferences.openedSurfaces?.includes(surface.id)) continue;
        await this.openSurface(surface.id);
        preferences.openedSurfaces = [...preferences.openedSurfaces ?? [], surface.id];
        savePluginConfig(preferenceKey, preferences);
        break;
      }
    })().finally(() => {
      this.initialView = void 0;
    });
    return this.initialView;
  }
  async destroy() {
    this.disposed = true;
    this.guestStore?.dispose();
    clearInterval(this.socketTimer);
    this.sockets.closeAll();
    for (const controllers of this.requests.values())
      for (const controller of controllers) controller.abort();
    for (const surface of this.surfaces.values()) surface.dispose();
    this.surfaces.clear();
    if (this.drawerSessions.size)
      void callPluginUI(this.pluginId, "ui.drawer.close", {}).catch(() => {
      });
    this.drawerSessions.clear();
    this.surfaceStates.clear();
    this.sandbox?.dispose();
    await this.core?.dispose();
    this.core = void 0;
  }
  redactGuestLog(value) {
    return JSON.stringify(value ?? null, (key, item) => {
      if (/key|token|password|authorization|cookie|secret/i.test(key)) return "[redacted]";
      return typeof item === "string" ? item.replace(/(https?:\/\/[^\s?]+)\?[^\s]+/g, "$1?[redacted]").slice(0, 4e3) : item;
    }).slice(0, 16e3);
  }
  listGuests() {
    return this.guestStore?.list() ?? [];
  }
  getGuestPermissions(guestId) {
    if (!this.guestStore) throw new Error("\u517C\u5BB9\u73AF\u5883\u672A\u52A0\u8F7D");
    return this.guestStore.permissions(guestId);
  }
  async setGuestPermissions(guestId, keys) {
    if (!this.guestStore) throw new Error("\u517C\u5BB9\u73AF\u5883\u672A\u52A0\u8F7D");
    await this.guestStore.setPermissions(guestId, keys);
  }
  async selectGuest(guestId) {
    if (!this.guestStore) throw new Error("\u517C\u5BB9\u73AF\u5883\u672A\u52A0\u8F7D");
    await this.guestStore.select(guestId);
  }
  async updateGuest(guestId, url) {
    if (!this.guestStore) throw new Error("\u517C\u5BB9\u73AF\u5883\u672A\u8FD0\u884C");
    const response = await requestNetwork(
      { url, timeoutMs: 3e4 },
      () => this.guestStore.permissions(guestId).includes("network.private")
    );
    if (response.status !== 200 || typeof response.body !== "string")
      throw new Error("\u4E0B\u8F7D\u7ED3\u679C\u4E0D\u662F\u6709\u6548 JS \u811A\u672C");
    return this.guestStore.replace(guestId, response.body);
  }
  async removeGuest(guestId) {
    if (!this.guestStore) throw new Error("\u517C\u5BB9\u73AF\u5883\u672A\u52A0\u8F7D");
    await this.guestStore.remove(guestId);
  }
  async importGuest(adapterId, url) {
    if (!this.guestStore || !this.artifact?.header.manifest.contributes?.guestAdapters?.some(
      (item) => item.id === adapterId
    ))
      throw new Error("\u8BF7\u5148\u5B89\u88C5\u5BF9\u5E94\u7684\u517C\u5BB9\u73AF\u5883\u63D2\u4EF6");
    let script, name;
    if (url) {
      const address = new URL(url);
      if (!["http:", "https:"].includes(address.protocol))
        throw new Error("\u53EA\u652F\u6301 HTTP/HTTPS \u4E0B\u8F7D\u5730\u5740");
      const response = await requestNetwork({ url, timeoutMs: 3e4 }, () => true);
      if (response.status !== 200 || typeof response.body !== "string")
        throw new Error("\u4E0B\u8F7D\u7ED3\u679C\u4E0D\u662F\u6709\u6548 JS \u811A\u672C");
      script = response.body;
      name = basename(address.pathname);
    } else {
      const choice = await dialog.showOpenDialog({
        title: "\u5BFC\u5165\u5B50\u63D2\u4EF6",
        filters: [{ name: "JavaScript \u63D2\u4EF6", extensions: ["js"] }],
        properties: ["openFile"]
      });
      if (choice.canceled || !choice.filePaths.length) return null;
      const file = choice.filePaths[0];
      script = await readFile(file, "utf8");
      name = basename(file);
    }
    return this.guestStore.install(adapterId, script, name);
  }
  async importGuestScript(adapterId, script, name) {
    if (!this.guestStore) throw new Error("\u8BF7\u5148\u4F7F\u7528\u517C\u5BB9\u73AF\u5883");
    return this.guestStore.install(adapterId, script, name);
  }
};
export {
  PluginHost,
  PluginStorage,
  bindPluginUIWindow,
  deletePluginStorage,
  drawerAction,
  readDrawerSchema,
  savePluginConfig
};
