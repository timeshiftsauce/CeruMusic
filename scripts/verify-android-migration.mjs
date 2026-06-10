#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

const files = {
  contract: 'packages/shared-contract/src/index.ts',
  nodeRuntime: 'apps/node-runtime/src/index.ts',
  musicSourceRuntime: 'apps/node-runtime/src/musicSourceRuntime.ts',
  pluginHostWorker: 'apps/node-runtime/src/pluginHostWorker.ts',
  navidromeService: 'plugins/navidrome-service.js',
  androidApi: 'apps/android/src/apiClient.ts',
  androidConfig: 'apps/android/src/config.ts',
  androidApp: 'apps/android/src/App.tsx',
  androidGradle: 'apps/android/android/app/build.gradle',
  androidConfigModule: 'apps/android/android/app/src/main/java/cn/shiqianjiang/cerumusic/android/CeruConfigModule.kt',
  playbackWrapper: 'apps/android/src/native/playback.ts',
  downloadWrapper: 'apps/android/src/native/download.ts',
  playbackModule: 'apps/android/android/app/src/main/java/cn/shiqianjiang/cerumusic/android/CeruPlaybackModule.kt',
  downloadModule: 'apps/android/android/app/src/main/java/cn/shiqianjiang/cerumusic/android/CeruDownloadModule.kt',
  playbackService: 'apps/android/android/app/src/main/java/cn/shiqianjiang/cerumusic/android/playback/CeruPlaybackService.kt',
  playbackStateStore: 'apps/android/android/app/src/main/java/cn/shiqianjiang/cerumusic/android/playback/CeruPlaybackStateStore.kt',
  playbackPackage: 'apps/android/android/app/src/main/java/cn/shiqianjiang/cerumusic/android/CeruPlaybackPackage.kt',
};

const read = path => readFileSync(resolve(root, path), 'utf8');
const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, read(path)]));

const failures = [];

const check = (label, ok) => {
  if (!ok) failures.push(label);
};

const has = (key, value) => source[key].includes(value);
const matches = (key, pattern) => pattern.test(source[key]);

const endpoints = [
  '/health',
  '/version',
  '/plugins',
  '/plugins/builtin',
  '/plugins/install/local',
  '/plugins/install/url',
  '/plugins/install/builtin',
  '/plugins/host/load',
  '/plugins/host/unload',
  '/plugins/host/disable',
  '/plugins/host/enable',
  '/plugins/host/call',
  '/plugins/host/events',
  '/music-source/search',
  '/music-source/playable-url',
  '/music-source/lyric',
  '/music-source/artwork',
  '/music-source/playlist',
  '/music-source/playlist/songs',
  '/playback/resolve',
  '/playback/failure',
  '/download/prepare',
  '/download/tasks',
  '/download/tasks/update',
];

for (const endpoint of endpoints) {
  check(`Node Runtime route exists: ${endpoint}`, has('nodeRuntime', endpoint));
  check(`Android API endpoint exists: ${endpoint}`, has('androidApi', endpoint));
}

const contractTypes = [
  'CeruPlaybackMode',
  'CeruPlaybackState',
  'CeruPlaybackResolveInput',
  'CeruPlaybackFailureInput',
  'CeruDownloadPrepareInput',
  'CeruDownloadTask',
  'CeruDownloadTaskUpdateInput',
  'CeruAndroidAudioEffectsState',
  'CeruAndroidEffectsSystemBoundary',
];

for (const typeName of contractTypes) {
  check(`shared-contract exports ${typeName}`, has('contract', typeName));
}

check('Android API exposes playback resolve', has('androidApi', 'resolvePlayback:'));
check('Android API exposes playback failure report', has('androidApi', 'reportPlaybackFailure:'));
check('Android API exposes download prepare', has('androidApi', 'prepareDownload:'));
check('Android API exposes download task list', has('androidApi', 'listDownloadTasks:'));
check('Android API exposes download task update', has('androidApi', 'updateDownloadTask:'));
check('Node Runtime music source search invokes plugin search', has('musicSourceRuntime', "method: 'search'"));
check('Node Runtime music source search returns contract page', has('musicSourceRuntime', 'Promise<CeruSourceSearchPage>'));
check('Node Runtime music source search normalizes items', has('musicSourceRuntime', 'toSearchItem'));
check('Node Runtime playback resolve accepts direct playable URL', has('musicSourceRuntime', 'asOptionalString(songInfo.url)'));
check('Plugin host worker exposes search capability', has('pluginHostWorker', 'search: typeof pluginExports.search === \'function\''));
check('Builtin Navidrome plugin exports search', has('navidromeService', 'search: search'));
check('Builtin Navidrome search uses Subsonic search3', has('navidromeService', 'search3&query='));
check('Builtin Navidrome search reuses playable stream URL', has('navidromeService', 'url: buildStreamUrl(config, song.id)'));

check('Android config reads native CeruConfig module', has('androidConfig', 'NativeModules.CeruConfig'));
check('Android config exports androidApiBaseUrl', has('androidConfig', 'export const androidApiBaseUrl'));
check('Android Gradle reads API baseUrl env', has('androidGradle', 'CERU_ANDROID_API_BASE_URL'));
check('Android Gradle defaults debug API baseUrl to emulator host', has('androidGradle', 'http://10.0.2.2:37623'));
check('Android Gradle enables BuildConfig', has('androidGradle', 'buildConfig = true'));
check('Android config module exports API baseUrl constant', has('androidConfigModule', 'BuildConfig.CERU_ANDROID_API_BASE_URL'));
check('Native package registers config module', has('playbackPackage', 'CeruConfigModule'));

check('Playback wrapper exposes setMode', has('playbackWrapper', 'setMode(mode: CeruPlaybackMode)'));
check('Playback wrapper exposes setAudioEffects', has('playbackWrapper', 'setAudioEffects(effects: CeruAndroidAudioEffectsState)'));
check('Playback wrapper exposes getAudioEffects', has('playbackWrapper', 'getAudioEffects()'));

check('Playback module exposes setMode', has('playbackModule', 'fun setMode(mode: String, promise: Promise)'));
check('Playback module exposes setAudioEffects', has('playbackModule', 'fun setAudioEffects(effects: ReadableMap, promise: Promise)'));
check('Playback module emits audioEffects in state', has('playbackModule', 'putMap("audioEffects", audioEffects.toWritableMap())'));

check('Playback service handles SET_MODE action', has('playbackService', 'ACTION_SET_MODE'));
check('Playback service handles SET_AUDIO_EFFECTS action', has('playbackService', 'ACTION_SET_AUDIO_EFFECTS'));
check('Playback service consumes single mode', has('playbackService', '"single" -> if (fromEnded)'));
check('Playback service consumes shuffle mode', has('playbackService', '"shuffle" -> randomQueueIndex(current)'));
check('Playback service binds audio session', has('playbackService', 'onAudioSessionIdChanged'));
check('Playback service applies Equalizer', has('playbackService', 'Equalizer(0, sessionId)'));
check('Playback service applies BassBoost', has('playbackService', 'BassBoost(0, sessionId)'));
check('Playback service applies Virtualizer', has('playbackService', 'Virtualizer(0, sessionId)'));
check('Playback service applies LoudnessEnhancer', has('playbackService', 'LoudnessEnhancer(sessionId)'));

check('Playback state persists mode', has('playbackStateStore', '.putString("mode", state.mode)'));
check('Playback state persists audioEffects', has('playbackStateStore', '.putString("audioEffects", encodeAudioEffects(state.audioEffects))'));
check('Playback state decodes audioEffects', has('playbackStateStore', 'decodeAudioEffects'));

check('Download wrapper exposes start', has('downloadWrapper', 'async start(task: CeruDownloadTask)'));
check('Download wrapper exposes pause', has('downloadWrapper', 'async pause(taskId: string)'));
check('Download wrapper exposes resume', has('downloadWrapper', 'async resume(task: CeruDownloadTask)'));
check('Download wrapper exposes cancel', has('downloadWrapper', 'async cancel(taskId: string)'));
check('Download module exposes start', has('downloadModule', 'fun start(task: ReadableMap, promise: Promise)'));
check('Download module emits task events', has('downloadModule', 'CeruDownloadTaskChanged'));
check('Native package registers download module', has('playbackPackage', 'CeruDownloadModule'));

check('Android UI calls resolvePlayback before native play', has('androidApp', 'androidBusinessBoundary.resolvePlayback'));
check('Android UI reports playback failure', has('androidApp', 'androidBusinessBoundary.reportPlaybackFailure'));
check('Android UI deduplicates playback failure reports', has('androidApp', 'reportedPlaybackFailureKeyRef'));
check('Android UI surfaces native playback errors', has('androidApp', '播放失败，已上报当前 URL'));
check('Android UI calls prepareDownload', has('androidApp', 'androidBusinessBoundary.prepareDownload'));
check('Android UI starts native download', has('androidApp', 'ceruDownload.start(task)'));
check('Android UI exposes playback mode controls', has('androidApp', '播放模式'));
check('Android UI exposes audio effect controls', has('androidApp', '原生音效'));
check('Android UI calls setMode', has('androidApp', 'ceruPlayback.setMode(mode)'));
check('Android UI calls setAudioEffects', has('androidApp', 'ceruPlayback.setAudioEffects(nextEffects)'));

check('System controls remain MediaSessionService-backed', has('playbackService', 'class CeruPlaybackService : MediaSessionService()'));
check('Playback package registers playback module', has('playbackPackage', 'CeruPlaybackModule'));
check('Playback package registers download module', has('playbackPackage', 'CeruDownloadModule'));

check('No TODO marker in Android migration surface', !matches('androidApp', /TODO\(|TODO:/));

if (failures.length > 0) {
  console.error('Android migration static verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Android migration static verification passed.');
console.log(`Checked ${Object.keys(files).length} files and ${endpoints.length} endpoint mappings.`);