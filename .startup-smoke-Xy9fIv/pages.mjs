// sfc:G:\code\CeruMusic\src\renderer\src\views\music\find.vue
import { onActivated, onDeactivated } from "vue";
import { defineComponent as _defineComponent } from "vue";
import { ref, shallowRef, computed, onMounted, onUnmounted, watch } from "vue";

// stub:vue-router
var s = globalThis.__startupTest;
var useRouter = () => ({ replace: async (path) => s.events.push(path), push() {
} });

// stub:@renderer/store/LocalUserDetail
var s2 = globalThis.__startupTest;
var LocalUserDetailStore = () => s2.store;

// sfc:G:\code\CeruMusic\src\renderer\src\views\music\find.vue
import { storeToRefs } from "pinia";

// stub:@renderer/components/Find/LeaderBord.vue
var s3 = globalThis.__startupTest;
var LeaderBord_default = {};

// stub:tdesign-icons-vue-next
var s4 = globalThis.__startupTest;
var ChevronDownIcon = {};
var PlayCircleIcon = {};

// stub:@renderer/store/Settings
var s5 = globalThis.__startupTest;
var useSettingsStore = () => ({ settings: { autoUpdate: false }, shouldUseSpringFestivalTheme: () => false });

// stub:@renderer/services/listenTogetherInvite
var s6 = globalThis.__startupTest;
var tryShowListenTogetherInvite = async () => {
};

// stub:@renderer/services/pluginState
var s7 = globalThis.__startupTest;
var contributionsLoaded = s7.ready;
var contributionsRevision = s7.revision;
var homeSections = s7.sections;
var refreshPluginContributions = () => {
  s7.events.push("restore");
  return s7.restore;
};

// sfc:G:\code\CeruMusic\src\renderer\src\views\music\find.vue
var Page = /* @__PURE__ */ _defineComponent({
  setup(__props, { expose: __expose }) {
    __expose();
    const settingsStore = useSettingsStore();
    const playlistSection = computed(() => homeSections.value.find((section) => section.kind === "playlists"));
    const chartSection = computed(() => homeSections.value.find((section) => section.kind === "charts"));
    const router = useRouter();
    const LocalUserDetail = LocalUserDetailStore();
    const { userSource } = storeToRefs(LocalUserDetail);
    const recommendPlaylists = shallowRef([]);
    const loading = ref(true);
    const error = ref("");
    const tags = ref([]);
    const hotTag = ref([]);
    const activeCategoryName = ref("\u70ED\u95E8");
    const activeTagId = ref("");
    const activeGroupName = ref("");
    const page = ref(1);
    const limit = ref(30);
    const total = ref(0);
    const loadingMore = ref(false);
    const noMore = ref(false);
    const categoryCache = /* @__PURE__ */ new Map();
    const showMore = ref(false);
    let watchSource = null;
    let catalogGeneration = 0;
    let listRequest = 0;
    const cacheKey = computed(() => `${userSource.value.source || "wy"}::${activeTagId.value || "hot"}`);
    const activeGroup = computed(
      () => tags.value.find((g) => g.name === activeGroupName.value) || tags.value[0]
    );
    const mapItem = (item) => ({
      id: item.id,
      title: item.name,
      description: item.desc || "\u7CBE\u9009\u6B4C\u5355",
      cover: item.img,
      playCount: item.play_count,
      author: item.author,
      total: item.total,
      time: item.time,
      source: item.source
    });
    const fetchTags = async () => {
      if (!contributionsLoaded.value || !playlistSection.value || !userSource.value.source) return;
      const generation = catalogGeneration;
      try {
        const res = await window.api.music.requestSdk("getPlaylistTags", {
          source: userSource.value.source
        });
        if (generation !== catalogGeneration) return;
        if (res?.error) throw new Error(res.error);
        tags.value = res?.tags || [];
        hotTag.value = res?.hotTag || [];
        if (!activeGroupName.value) activeGroupName.value = tags.value[0]?.name || "";
      } catch (e) {
        console.error("\u83B7\u53D6\u6B4C\u5355\u6807\u7B7E\u5931\u8D25:", e);
      }
    };
    const fetchCategoryPlaylists = async (reset = false) => {
      if (!contributionsLoaded.value || !playlistSection.value || !userSource.value.source) {
        loading.value = false;
        return;
      }
      if (loadingMore.value && !reset) return;
      const request = ++listRequest;
      const key = cacheKey.value;
      if (reset) {
        page.value = 1;
        noMore.value = false;
        error.value = "";
        const cached = categoryCache.get(key);
        if (cached) {
          recommendPlaylists.value = cached.list;
          page.value = cached.page;
          total.value = cached.total;
          noMore.value = cached.noMore;
          loading.value = false;
          loadingMore.value = false;
          return;
        }
        loading.value = true;
        recommendPlaylists.value = [];
      }
      loadingMore.value = true;
      try {
        const res = await window.api.music.requestSdk("getCategoryPlaylists", {
          source: userSource.value.source,
          sortId: "hot",
          tagId: activeTagId.value,
          page: page.value,
          limit: limit.value
        });
        if (request !== listRequest) return;
        if (res?.error) throw new Error(res.error);
        const rawList = Array.isArray(res?.list) ? res.list : [];
        const mapped = rawList.map(mapItem);
        total.value = res?.total || 0;
        recommendPlaylists.value = reset ? mapped : [...recommendPlaylists.value, ...mapped];
        const loadedCount = recommendPlaylists.value.length;
        noMore.value = loadedCount >= total.value || mapped.length === 0;
        if (!noMore.value) page.value += 1;
        categoryCache.set(key, {
          list: recommendPlaylists.value.slice(),
          page: page.value,
          total: total.value,
          noMore: noMore.value
        });
        error.value = "";
      } catch (e) {
        if (request !== listRequest) return;
        console.error("\u83B7\u53D6\u5206\u7C7B\u6B4C\u5355\u5931\u8D25:", e);
        if (!recommendPlaylists.value.length) error.value = "\u83B7\u53D6\u5206\u7C7B\u6B4C\u5355\u5931\u8D25,\u8BF7\u7A0D\u540E\u91CD\u8BD5";
      } finally {
        if (request === listRequest) {
          loading.value = false;
          loadingMore.value = false;
        }
      }
    };
    const onSelectTag = (tagId, name) => {
      if (activeTagId.value === tagId) return;
      activeTagId.value = tagId;
      activeCategoryName.value = name;
      showMore.value = false;
      fetchCategoryPlaylists(true);
    };
    let scrollFrame = 0;
    const onScroll = (e) => {
      if (scrollFrame) return;
      const el = e.target;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
          if (!noMore.value && !loadingMore.value) fetchCategoryPlaylists(false);
        }
      });
    };
    const playPlaylist = (playlist) => {
      router.push({
        name: "list",
        params: { id: playlist.id },
        query: {
          title: playlist.title,
          source: playlist.source,
          author: playlist.author,
          cover: playlist.cover,
          total: playlist.total
        }
      });
    };
    const onDocClick = (e) => {
      const target = e.target;
      if (!target.closest(".category-bar") && showMore.value) showMore.value = false;
    };
    onMounted(() => {
      watchSource = watch(
        [() => userSource.value.source, playlistSection, contributionsLoaded, contributionsRevision],
        () => {
          catalogGeneration++;
          listRequest++;
          categoryCache.clear();
          loadingMore.value = false;
          recommendPlaylists.value = [];
          tags.value = [];
          hotTag.value = [];
          activeGroupName.value = "";
          activeTagId.value = "";
          activeCategoryName.value = "\u70ED\u95E8";
          if (!contributionsLoaded.value || !playlistSection.value) {
            loading.value = !contributionsLoaded.value;
            return;
          }
          void fetchTags();
          void fetchCategoryPlaylists(true);
        },
        { immediate: true }
      );
      document.addEventListener("click", onDocClick);
    });
    onUnmounted(() => {
      catalogGeneration++;
      listRequest++;
      if (watchSource) {
        watchSource();
        watchSource = null;
      }
      if (scrollFrame) {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = 0;
      }
      document.removeEventListener("click", onDocClick);
    });
    const backTop = ref(false);
    const scrollTop = ref(0);
    const songlistScrollRef = ref();
    onActivated(() => {
      backTop.value = true;
      if (songlistScrollRef.value) songlistScrollRef.value.scrollTop = scrollTop.value;
      void tryShowListenTogetherInvite("clipboard");
    });
    onDeactivated(() => {
      backTop.value = false;
      if (songlistScrollRef.value) scrollTop.value = songlistScrollRef.value.scrollTop;
    });
    const __returned__ = { settingsStore, playlistSection, chartSection, router, LocalUserDetail, userSource, recommendPlaylists, loading, error, tags, hotTag, activeCategoryName, activeTagId, activeGroupName, page, limit, total, loadingMore, noMore, categoryCache, showMore, get watchSource() {
      return watchSource;
    }, set watchSource(v) {
      watchSource = v;
    }, get catalogGeneration() {
      return catalogGeneration;
    }, set catalogGeneration(v) {
      catalogGeneration = v;
    }, get listRequest() {
      return listRequest;
    }, set listRequest(v) {
      listRequest = v;
    }, cacheKey, activeGroup, mapItem, fetchTags, fetchCategoryPlaylists, onSelectTag, get scrollFrame() {
      return scrollFrame;
    }, set scrollFrame(v) {
      scrollFrame = v;
    }, onScroll, playPlaylist, onDocClick, backTop, scrollTop, songlistScrollRef, LeaderBord: LeaderBord_default, get ChevronDownIcon() {
      return ChevronDownIcon;
    }, get PlayCircleIcon() {
      return PlayCircleIcon;
    }, get homeSections() {
      return homeSections;
    } };
    Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
    return __returned__;
  }
});
Page.render = () => null;
var find_default = Page;

// sfc:G:\code\CeruMusic\src\renderer\src\components\Find\LeaderBord.vue
import { defineComponent as _defineComponent2 } from "vue";
import { ref as ref2, onBeforeUnmount, computed as computed2, watch as watch2 } from "vue";

// sfc:G:\code\Card\LeaderBordCard.vue
var LeaderBordCard_default = {};

// sfc:G:\code\CeruMusic\src\renderer\src\components\Find\LeaderBord.vue
var Page2 = /* @__PURE__ */ _defineComponent2({
  setup(__props, { expose: __expose }) {
    __expose();
    const boards = ref2([]);
    const loading = ref2(true);
    const router = useRouter();
    const localUserStore = LocalUserDetailStore();
    const currentSource = computed2(() => localUserStore.userSource.source);
    let requestSequence = 0;
    const fetchBoards = async () => {
      const request = ++requestSequence;
      loading.value = true;
      try {
        const source = currentSource.value;
        if (!contributionsLoaded.value || !source) {
          boards.value = [];
          return;
        }
        const res = await window.api.music.requestSdk("getLeaderboards", { source });
        if (request !== requestSequence) return;
        if (res?.error) throw new Error(res.error);
        boards.value = Array.isArray(res) ? res : [];
      } catch (error) {
        if (request !== requestSequence) return;
        console.error("Failed to fetch leaderboards:", error);
        boards.value = [];
      } finally {
        if (request === requestSequence) loading.value = false;
      }
    };
    const handleCardClick = (board) => {
      console.log("Card clicked:", board);
      router.push({
        name: "list",
        params: { id: board.board_id || board.id },
        query: {
          title: board.name,
          cover: board.pic || "",
          source: board.source || currentSource.value,
          isLeaderboard: "true"
        }
      });
    };
    watch2(
      [currentSource, contributionsLoaded, contributionsRevision],
      () => {
        boards.value = [];
        void fetchBoards();
      },
      { immediate: true }
    );
    onBeforeUnmount(() => {
      requestSequence++;
    });
    const __returned__ = { boards, loading, router, localUserStore, currentSource, get requestSequence() {
      return requestSequence;
    }, set requestSequence(v) {
      requestSequence = v;
    }, fetchBoards, handleCardClick, LeaderBordCard: LeaderBordCard_default };
    Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
    return __returned__;
  }
});
Page2.render = () => null;
var LeaderBord_default2 = Page2;

// sfc:G:\code\CeruMusic\src\renderer\src\views\welcome\index.vue
import { defineComponent as _defineComponent3 } from "vue";
import { ref as ref3, onMounted as onMounted2, computed as computed3 } from "vue";

// stub:@renderer/utils/audio/globaPlayList
var s8 = globalThis.__startupTest;
var initPlayback = () => {
  s8.events.push("playback");
  return s8.playback;
};

// stub:@renderer/composables/useAutoUpdate
var s9 = globalThis.__startupTest;
var useAutoUpdate = () => ({ checkForUpdates() {
} });

// sfc:G:\code\CeruMusic\src\renderer\src\views\welcome\index.vue
import { storeToRefs as storeToRefs2 } from "pinia";
var Page3 = /* @__PURE__ */ _defineComponent3({
  setup(__props, { expose: __expose }) {
    __expose();
    const settingsStore = useSettingsStore();
    const { settings } = storeToRefs2(settingsStore);
    const { checkForUpdates } = useAutoUpdate();
    const router = useRouter();
    const version = ref3("1.0.0");
    const loadingText = ref3("\u6B63\u5728\u521D\u59CB\u5316\u6838\u5FC3\u670D\u52A1...");
    const loadingPercent = ref3(0);
    const startupError = ref3(false);
    const progressWidth = computed3(() => `${loadingPercent.value}%`);
    const showNewYear = computed3(
      () => settingsStore.shouldUseSpringFestivalTheme() && !settings.value.springFestivalDisabled
    );
    const features = showNewYear.value ? ["\u5C81\u5C81\u957F\u5B89", "\u529F\u4E0D\u5510\u6350", "\u9A6C\u5E74\u5409\u7965", "\u9A6C\u8D8A\u65B0\u7A0B"] : ["Hi-Res Audio", "Minimalist", "Plugins", "Offline"];
    async function prepareStartup() {
      startupError.value = false;
      try {
        const appVersion = await window.electron.ipcRenderer.invoke("get-app-version");
        if (appVersion) version.value = appVersion;
      } catch (error) {
        console.warn("Failed to get app version:", error);
      }
      loadingText.value = "\u8BFB\u53D6\u63D2\u4EF6\u5217\u8868...";
      loadingPercent.value = 15;
      try {
        await window.electron.ipcRenderer.invoke("service-plugin-initialize-system");
        loadingText.value = "\u6062\u590D\u5DF2\u542F\u7528\u63D2\u4EF6\u548C\u9996\u9875...";
        loadingPercent.value = 35;
        await refreshPluginContributions();
      } catch (e) {
        console.error("Plugin init failed", e);
        loadingText.value = "\u63D2\u4EF6\u6062\u590D\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D";
        startupError.value = true;
        return;
      }
      loadingPercent.value = 80;
      loadingText.value = "\u6062\u590D\u4E0A\u6B21\u6B4C\u66F2\u548C\u64AD\u653E\u8FDB\u5EA6...";
      try {
        await initPlayback();
      } catch (error) {
        console.warn("\u6062\u590D\u64AD\u653E\u72B6\u6001\u5931\u8D25:", error);
      }
      loadingPercent.value = 100;
      loadingText.value = "\u51C6\u5907\u5C31\u7EEA";
      await router.replace(homeSections.value.length ? "/home/find" : "/home/local");
      if (settings.value.autoUpdate) void checkForUpdates();
    }
    onMounted2(prepareStartup);
    const __returned__ = { settingsStore, settings, checkForUpdates, router, version, loadingText, loadingPercent, startupError, progressWidth, showNewYear, features, prepareStartup };
    Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
    return __returned__;
  }
});
Page3.render = () => null;
var welcome_default = Page3;
export {
  LeaderBord_default2 as Boards,
  find_default as Find,
  welcome_default as Welcome
};
