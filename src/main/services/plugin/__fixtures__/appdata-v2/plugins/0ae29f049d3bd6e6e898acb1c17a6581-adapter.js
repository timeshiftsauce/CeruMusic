exports.manifest = {
  manifestVersion: 2,
  id: "local.js",
  name: "js",
  version: "0.1.0",
  description: "A Ceru Music v2 guest-adapter plugin",
  engines: {
    hostApi: "^2.0.0",
    logicRuntime: "ceru-js@1",
    uiSchema: "^1.0.0"
  },
  modules: {
    logic: {
      entry: "logic.main",
      activation: [
        "onCommand:hello"
      ]
    },
    surfaces: [
      {
        id: "settings",
        kind: "schema",
        entry: "schema.settings"
      }
    ]
  },
  contributes: {
    commands: [
      {
        id: "hello",
        title: "Hello",
        action: "hello"
      }
    ],
    settingsPages: [
      {
        id: "settings",
        title: "插件设置",
        view: "settings"
      }
    ],
    guestAdapters: [
      {
        id: "example-script",
        format: "example-script",
        compatibilityProfile: "basic@1",
        bootstrap: "guest.bootstrap",
        runtime: "ceru-js@1",
        projectableProtocols: [
          "music.resolve@1"
        ]
      }
    ]
  },
  permissions: [
    {
      key: "guest-manage",
      name: "guests.manage",
      scope: {
        parent: "self"
      },
      reason: "管理用户批准的子插件",
      optional: true
    },
    {
      key: "guest-run",
      name: "guests.run",
      scope: {
        parent: "self"
      },
      reason: "运行已批准的子插件",
      optional: true
    }
  ],
  dataSchemas: {
    config: 1,
    state: 1
  },
  guestPolicy: {
    maxDepth: 1,
    allowedCapabilities: [
      "network.request"
    ],
    networkScopeMode: "per-guest-user-approved",
    allowNativeCode: false,
    allowRemoteCodeExecution: false
  }
};
exports.package = {
  formatVersion: 2,
  syntax: "js",
  signature: null
};
// Invisible plugin logic
const LogicMain = /* @ceru-self-contained */ async function LogicMain(ctx) {
"use strict";
const __ceru_entry = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.js
  var index_exports = {};
  __export(index_exports, {
    default: () => index_default
  });

  // ../../packages/sdk/dist/index.js
  function definePlugin(entry) {
    return entry;
  }

  // src/index.js
  var index_default = definePlugin(async (ctx) => {
    ctx.actions.register("hello", async () => {
      await ctx.ui.notify({ key: "hello", level: "info", message: "Hello Ceru v2!" });
    });
    await ctx.ui.setState("settings", { status: "需要配置" });
  });
  return __toCommonJS(index_exports);
})();

if (typeof __ceru_entry.default !== "function") throw new Error("Entry must default-export a function");
return __ceru_entry.default(ctx);
};

// Additional plugin module: guest.bootstrap
const GuestBootstrapModule = /* @ceru-self-contained */ async function GuestBootstrapModule(ctx) {
"use strict";
const __ceru_entry = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/guest.js
  var guest_exports = {};
  __export(guest_exports, {
    default: () => guest_default
  });

  // ../../packages/sdk/dist/index.js
  function defineGuestAdapter(entry) {
    return entry;
  }

  // src/guest.js
  var guest_default = defineGuestAdapter((ctx) => {
    ctx.expose("compatibilityVersion", "basic@1");
  });
  return __toCommonJS(guest_exports);
})();

if (typeof __ceru_entry.default !== "function") throw new Error("Entry must default-export a function");
return __ceru_entry.default(ctx);
};

const modules = {
"guest.bootstrap": GuestBootstrapModule
};

// Embedded static resources
const resources = {"schema.settings":{"type":"json","value":{"schemaVersion":"1.0","id":"settings","root":{"type":"section","title":"插件设置","children":[{"type":"text","text":"请在 src/index.js 中实现你的服务逻辑。"}]}}}};

// Public plugin exports

exports.activate = LogicMain;

exports.modules = modules;

exports.resources = resources;
