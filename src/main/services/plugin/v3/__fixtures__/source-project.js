exports.manifest = {
  manifestVersion: 3,
  id: "local.source-project",
  name: "source-project",
  version: "0.1.0",
  description: "A Ceru Music v3 source plugin",
  dataSchemas: {
    config: 1,
    state: 1
  },
  engines: {
    hostApi: "^3.0.0",
    logicRuntime: "ceru-js@1"
  },
  entry: {
    logic: {
      activation: [
        "onCommand:hello",
        "onProvider:catalog"
      ],
      module: "logic.main"
    }
  },
  provides: {
    providers: [
      {
        id: "catalog",
        name: "source-project",
        protocols: [
          "music.search@1",
          "music.resolve@1",
          "music.lyrics@1"
        ],
        icon: {
          kind: "host",
          name: "music-note"
        },
        connectionMode: "none"
      }
    ],
    actions: [
      {
        id: "hello",
        title: "Hello"
      }
    ]
  },
  uses: {
    permissions: []
  },
  ui: {
    homeSections: [
      {
        id: "catalog-playlists",
        title: "歌单",
        kind: "playlists",
        icon: {
          kind: "host",
          name: "library"
        },
        providerIds: [
          "catalog"
        ]
      }
    ]
  },
  config: {
    apiOrigin: "https://music.example.com",
    displayName: "Ceru Demo",
    previewUrl: "",
    sources: {
      demo: {
        name: "Demo Source",
        qualities: [
          "320k",
          "flac"
        ]
      }
    }
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

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    default: () => index_default
  });

  // ../../../packages/sdk/dist/index.js
  function definePlugin(entry) {
    return entry;
  }

  // src/index.ts
  var tracks = [
    { id: "morning", title: "Morning Light", artist: "Ceru Demo" },
    { id: "rain", title: "Rainy Afternoon", artist: "Ceru Demo" },
    { id: "night", title: "Night Walk", artist: "Ceru Demo" }
  ];
  var index_default = definePlugin(async (ctx) => {
    const config = await ctx.config.get();
    ctx.actions.register("hello", async () => {
      const appCapability = await ctx.capabilities.get("app");
      const appInfo = appCapability.available && appCapability.methods?.includes("getInfo") ? await ctx.app.getInfo() : null;
      await ctx.ui.notify({
        key: "welcome",
        level: "info",
        message: `${config.displayName} 已就绪${appInfo ? `，宿主版本 ${appInfo.version}` : ""}。试试搜索 Morning、Rain 或 Night。`
      });
    });
    ctx.providers.register("catalog", {
      tracks: {
        async search(request) {
          const query = ctx.utils.lodash.trim(request.query).toLowerCase();
          const matches = tracks.filter(
            (track) => (track.title + " " + track.artist).toLowerCase().includes(query)
          );
          return {
            items: matches.slice(0, Math.max(1, Math.min(request.limit, 100))).map((track) => ({
              ref: {
                pluginId: ctx.plugin.id,
                providerId: "catalog",
                kind: "track",
                id: track.id
              },
              title: track.title,
              subtitle: track.artist,
              playable: !!config.previewUrl,
              metadata: { artists: [track.artist] },
              capabilities: config.previewUrl ? ["play"] : []
            }))
          };
        },
        async resolve(ref) {
          if (config.previewUrl && tracks.some((track) => track.id === ref.id))
            return { ok: true, url: config.previewUrl };
          return ctx.playback.failure({ code: "UNSUPPORTED", message: "请在 previewUrl 配置自己的 HTTP(S) 试听文件。" });
        },
        async lyrics(ref) {
          const track = tracks.find((item) => item.id === ref.id);
          return { format: "crlyric", version: 1, track: ref, offsetMs: 0, lines: track ? [{ startTimeMs: 0, text: track.title }] : [] };
        }
      }
    });
  });
  return __toCommonJS(index_exports);
})();

if (typeof __ceru_entry.default !== "function") throw new Error("Entry must default-export a function");
return __ceru_entry.default(ctx);
};

// Embedded static resources
const resources = {};

// Public plugin exports

exports.activate = LogicMain;

exports.resources = resources;
