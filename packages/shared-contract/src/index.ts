export type CeruMusicSource = 'local' | 'wy' | 'tx' | 'kg' | 'kw' | 'mg' | 'bd' | 'git' | 'plugin';

export type CeruTrack = {
  id: string;
  source: CeruMusicSource;
  pluginId?: string;
  title: string;
  artist: string;
  album?: string;
  albumId?: string;
  durationMs?: number;
  durationText?: string;
  artworkUrl?: string;
  playableUrl?: string;
  quality?: string;
  qualities?: CeruCloudSongQuality[];
  songInfo?: unknown;
};

export type CeruPlaybackMode = 'sequence' | 'single' | 'shuffle';

export type CeruPlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export type CeruPlaybackState = {
  track: CeruTrack | null;
  queue: CeruTrack[];
  queueIndex: number;
  status: CeruPlaybackStatus;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  mode: CeruPlaybackMode;
  audioEffects?: CeruAndroidAudioEffectsState;
  errorMessage?: string;
};

export type CeruPlaybackCommand =
  | {type: 'load'; track: CeruTrack}
  | {type: 'loadQueue'; tracks: CeruTrack[]; startIndex: number}
  | {type: 'play'}
  | {type: 'pause'}
  | {type: 'seek'; positionMs: number}
  | {type: 'next'}
  | {type: 'previous'}
  | CeruAndroidPlaybackModeCommand
  | CeruAndroidAudioEffectsCommand;

export const emptyPlaybackState: CeruPlaybackState = {
  track: null,
  queue: [],
  queueIndex: -1,
  status: 'idle',
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  mode: 'sequence',
};

export type CeruApiResult<T> =
  | {success: true; data: T}
  | {success: false; error: string; code?: string};

export type CeruAuthSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

export type CeruUserProfile = {
  id: string;
  username?: string;
  nickname?: string;
  avatarUrl?: string;
  email?: string;
  intro?: string;
  gender?: string;
  birthday?: string;
  region?: string;
};

export type CeruCloudSongQuality = {
  type: string;
  size?: string;
};

export type CeruCloudSong = {
  id: string;
  source: CeruMusicSource;
  title: string;
  artist: string;
  album?: string;
  albumId?: string;
  durationText?: string;
  artworkUrl?: string;
  qualities?: CeruCloudSongQuality[];
  position?: number;
};

export type CeruCloudPlaylist = {
  id: string;
  localId?: string;
  title: string;
  description?: string;
  coverUrl?: string;
  updatedAt?: string;
  total?: number;
};

export type CeruFavoriteEntityType = 'song' | 'playlist' | 'album' | 'artist' | 'rank';

export type CeruPlaylistFavorite = {
  id: string;
  playlistId: string;
  sourcePlaylistId?: string;
  source?: CeruMusicSource;
  title: string;
  description?: string;
  coverUrl?: string;
  ownerName?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  revision?: number;
};

export type CeruPlaylistFavoriteMutationInput = {
  playlistId: string;
  sourcePlaylistId?: string;
  source?: CeruMusicSource;
  title: string;
  description?: string;
  coverUrl?: string;
  ownerName?: string;
};

export type CeruFavoriteMutationResult = {
  id?: string;
  playlistId?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  revision?: number;
};

export type CeruFavoriteSyncPage<T> = {
  items: T[];
  revision?: number;
  updatedAt?: string;
};

export type CeruFavoriteMutationInput = {
  entityType: CeruFavoriteEntityType;
  entityId: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  source?: CeruMusicSource;
  metadata?: Record<string, unknown>;
};

export type CeruCloudPlaylistDetail = CeruCloudPlaylist & {
  songs: CeruCloudSong[];
};

export type CeruCloudPlaylistSongsPage = {
  songs: CeruCloudSong[];
  total: number;
};

export type CeruCreateCloudPlaylistInput = {
  localId: string;
  title: string;
  description?: string;
  coverUrl?: string;
  songs: CeruCloudSong[];
};

export type CeruUpdateCloudPlaylistInput = {
  playlistId: string;
  localId?: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  songs?: CeruCloudSong[];
};

export type CeruCloudPlaylistMutationResult = {
  id?: string;
  updatedAt?: string;
};

export type CeruDeleteCloudPlaylistInput = {
  playlistId: string;
};

export type CeruAddCloudPlaylistSongsInput = {
  playlistId: string;
  songs: CeruCloudSong[];
};

export type CeruRemoveCloudPlaylistSongsInput = {
  playlistId: string;
  songIds: string[];
};

export type CeruCreatePlaylistShareInput = {
  cloudPlaylistId: string;
  allowWebPlayback: boolean;
  ttlDays?: number;
  pluginMd5?: string;
  quality?: string;
};

export type CeruPlaylistShare = {
  id: string;
  url: string;
  template?: string;
  playExpiresAt?: number | null;
};

export type CeruSourceSearchScope = 'song' | 'playlist' | 'album' | 'artist';

export type CeruMusicPluginRequestBase = {
  pluginId?: string;
  source?: CeruMusicSource;
  timeoutMs?: number;
};

export type CeruSourceSearchInput = CeruMusicPluginRequestBase & {
  keyword: string;
  page?: number;
  limit?: number;
  scope?: CeruSourceSearchScope;
};

export type CeruSourceSearchItem = {
  id: string;
  source: CeruMusicSource;
  pluginId?: string;
  title: string;
  artist?: string;
  album?: string;
  albumId?: string;
  durationMs?: number;
  durationText?: string;
  artworkUrl?: string;
  qualities?: CeruCloudSongQuality[];
  songInfo?: unknown;
};

export type CeruSourceSearchPage = {
  items: CeruSourceSearchItem[];
  total?: number;
  page: number;
  limit: number;
  pluginId?: string;
  source?: CeruMusicSource;
};

export type CeruResolvePlayableUrlInput = CeruMusicPluginRequestBase & {
  track: CeruTrack;
  quality?: string;
  isCache?: boolean;
};

export type CeruPlayableUrl = {
  url: string;
  quality?: string;
  expiresAt?: number;
  source: CeruMusicSource;
  pluginId?: string;
  raw?: unknown;
};

export type CeruPlayableUrlFailureReason = 'network' | 'decode' | 'timeout' | 'http-status' | 'not-playable' | 'unknown';

export type CeruPlayableUrlFailureInput = CeruMusicPluginRequestBase & {
  track: CeruTrack;
  failedUrl?: string;
  quality?: string;
  reason: CeruPlayableUrlFailureReason;
  statusCode?: number;
};

export type CeruPlaybackResolveInput = CeruMusicPluginRequestBase & {
  track: CeruTrack;
  preferredQuality?: string;
  qualityFallbacks?: string[];
  allowCachedUrl?: boolean;
};

export type CeruPlaybackResolvedCandidate = {
  quality?: string;
  source: CeruMusicSource;
  pluginId?: string;
  status: 'selected' | 'skipped-failed-url' | 'resolve-failed' | 'empty-url';
  url?: string;
  cacheHit?: boolean;
  error?: string;
};

export type CeruPlaybackResolveResult = {
  track: CeruTrack;
  playableUrl: CeruPlayableUrl;
  selectedQuality?: string;
  fallbackUsed: boolean;
  cacheHit: boolean;
  candidates: CeruPlaybackResolvedCandidate[];
};

export type CeruPlaybackFailureInput = CeruMusicPluginRequestBase & {
  track: CeruTrack;
  failedUrl?: string;
  quality?: string;
  reason: CeruPlayableUrlFailureReason;
  statusCode?: number;
};

export type CeruPlaybackFailureResult = {
  trackId: string;
  failedUrl?: string;
  quality?: string;
  source?: CeruMusicSource;
  pluginId?: string;
  blockedUntil: number;
};

export type CeruPlaybackWorkflowBoundary = {
  resolve: CeruPlaybackResolveInput | null;
  failure: CeruPlaybackFailureInput | null;
  urlCache: 'node-runtime-memory-cache';
  qualityFallback: 'same-plugin-quality-fallback';
};

export type CeruDownloadTaskStatus = 'queued' | 'preparing' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';

export type CeruDownloadDestination = 'android-app-files' | 'android-app-cache';

export type CeruDownloadPrepareInput = CeruPlaybackResolveInput & {
  fileName?: string;
  destination?: CeruDownloadDestination;
  overwrite?: boolean;
};

export type CeruDownloadTask = {
  id: string;
  track: CeruTrack;
  pluginId?: string;
  source: CeruMusicSource;
  quality?: string;
  url: string;
  fileName: string;
  destination: CeruDownloadDestination;
  status: CeruDownloadTaskStatus;
  progress: number;
  downloadedSize: number;
  totalSize: number;
  speed: number;
  remainingTime?: number | null;
  error?: string | null;
  filePath?: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};

export type CeruDownloadPrepareResult = {
  task: CeruDownloadTask;
  playback: CeruPlaybackResolveResult;
};

export type CeruDownloadTaskList = {
  tasks: CeruDownloadTask[];
};

export type CeruDownloadTaskUpdateInput = {
  taskId: string;
  status: CeruDownloadTaskStatus;
  progress?: number;
  downloadedSize?: number;
  totalSize?: number;
  speed?: number;
  remainingTime?: number | null;
  error?: string | null;
  filePath?: string | null;
};

export type CeruDownloadTaskCommandInput = {
  taskId: string;
};

export type CeruDownloadWorkflowBoundary = {
  prepare: CeruDownloadPrepareInput | null;
  tasks: CeruDownloadTask[];
  persistence: 'node-runtime-json';
  executor: 'android-native-module';
};

export type CeruAndroidEqualizerBand = {
  frequencyHz: number;
  gainDb: number;
};

export type CeruAndroidSurroundMode = 'off' | 'small' | 'medium' | 'large';

export type CeruAndroidLoudnessTarget = 'gentle' | 'standard' | 'strong';

export type CeruAndroidAudioEffectsState = {
  enabled: boolean;
  equalizer: {
    enabled: boolean;
    preset: string;
    bands: CeruAndroidEqualizerBand[];
  };
  bassBoost: {
    enabled: boolean;
    gain: number;
  };
  surround: {
    enabled: boolean;
    mode: CeruAndroidSurroundMode;
  };
  balance: {
    enabled: boolean;
    value: number;
  };
  loudness: {
    enabled: boolean;
    target: CeruAndroidLoudnessTarget;
  };
};

export type CeruAndroidAudioEffectsCommand = {
  type: 'set-audio-effects';
  effects: CeruAndroidAudioEffectsState;
};

export type CeruAndroidPlaybackModeCommand = {
  type: 'set-playback-mode';
  mode: CeruPlaybackMode;
};

export type CeruAndroidEffectsSystemBoundary = {
  playbackMode: CeruPlaybackMode;
  audioEffects: CeruAndroidAudioEffectsState;
  executor: 'android-media3-audio-session';
  systemControls: 'media-session-service';
  externalVerification: 'requires-device-or-emulator';
};

export const defaultAndroidAudioEffectsState: CeruAndroidAudioEffectsState = {
  enabled: false,
  equalizer: {
    enabled: false,
    preset: 'Flat(原声)',
    bands: [
      {frequencyHz: 31, gainDb: 0},
      {frequencyHz: 62, gainDb: 0},
      {frequencyHz: 125, gainDb: 0},
      {frequencyHz: 250, gainDb: 0},
      {frequencyHz: 500, gainDb: 0},
      {frequencyHz: 1000, gainDb: 0},
      {frequencyHz: 2000, gainDb: 0},
      {frequencyHz: 4000, gainDb: 0},
      {frequencyHz: 8000, gainDb: 0},
      {frequencyHz: 16000, gainDb: 0},
    ],
  },
  bassBoost: {
    enabled: false,
    gain: 0,
  },
  surround: {
    enabled: false,
    mode: 'off',
  },
  balance: {
    enabled: true,
    value: 0,
  },
  loudness: {
    enabled: false,
    target: 'standard',
  },
};

export const emptyAndroidEffectsSystemBoundary: CeruAndroidEffectsSystemBoundary = {
  playbackMode: 'sequence',
  audioEffects: defaultAndroidAudioEffectsState,
  executor: 'android-media3-audio-session',
  systemControls: 'media-session-service',
  externalVerification: 'requires-device-or-emulator',
};

export type CeruLyricFormat = 'lrc' | 'yrc' | 'qrc' | 'ttml' | 'plain';

export type CeruLyricInput = CeruMusicPluginRequestBase & {
  track: CeruTrack;
};

export type CeruLyricPayload = {
  trackId: string;
  source: CeruMusicSource;
  pluginId?: string;
  format: CeruLyricFormat;
  lyric: string;
  translation?: string;
  raw?: unknown;
};

export type CeruArtworkInput = CeruMusicPluginRequestBase & {
  track: Pick<CeruTrack, 'id' | 'source' | 'pluginId' | 'title' | 'artist' | 'album' | 'albumId' | 'artworkUrl' | 'songInfo'>;
};

export type CeruArtworkCacheInput = CeruArtworkInput;

export type CeruArtworkCacheResult = {
  cacheKey: string;
  artworkUrl: string | null;
  source?: CeruMusicSource;
  pluginId?: string;
  raw?: unknown;
};

export type CeruSourcePlaylistListInput = CeruMusicPluginRequestBase & {
  page?: number;
  limit?: number;
  category?: string;
  tag?: string;
};

export type CeruSourcePlaylistSummary = {
  id: string;
  source?: CeruMusicSource;
  pluginId?: string;
  title: string;
  description?: string;
  coverUrl?: string;
  creator?: string;
  total?: number;
  raw?: unknown;
};

export type CeruSourcePlaylistPage = {
  items: CeruSourcePlaylistSummary[];
  page: number;
  limit: number;
  total?: number;
  pluginId?: string;
  source?: CeruMusicSource;
};

export type CeruSourcePlaylistSongsInput = CeruMusicPluginRequestBase & {
  playlistId: string;
  page?: number;
  limit?: number;
  rawPlaylist?: unknown;
};

export type CeruSourcePlaylistSongsPage = {
  playlist: CeruSourcePlaylistSummary;
  songs: CeruTrack[];
  page: number;
  limit: number;
  total?: number;
};

export type CeruAndroidSourceBoundary = {
  access: 'backend-aggregation' | 'pending-backend';
  desktopPluginRuntime: 'not-reused-on-android';
  search: CeruSourceSearchInput | null;
  playableUrl: CeruPlayableUrl | null;
  lyric: CeruLyricPayload | null;
  artworkCache: CeruArtworkCacheResult | null;
};

export const emptyAndroidSourceBoundary: CeruAndroidSourceBoundary = {
  access: 'pending-backend',
  desktopPluginRuntime: 'not-reused-on-android',
  search: null,
  playableUrl: null,
  lyric: null,
  artworkCache: null,
};

export type CeruAndroidLocalAudioScanBoundary = {
  access: 'media-library-permission-required' | 'not-started';
  supportedSources: Array<'media-store-audio'>;
  resultEntrypoint: 'local-track-list';
};

export type CeruAndroidLocalCacheBoundary = {
  audio: 'app-cache-dir';
  artwork: 'app-cache-dir';
  lyric: 'app-files-dir';
};

export type CeruAndroidDownloadQueueBoundary = {
  persistence: 'pending-local-store';
  worker: 'pending-background-worker';
  notification: 'pending-system-integration';
};

export type CeruAndroidFilePermissionBoundary = {
  readMediaAudio: 'runtime-permission-android-13-plus';
  readExternalStorage: 'legacy-runtime-permission-android-12-minus';
  writeExternalStorage: 'legacy-scoped-to-android-9-minus';
};

export type CeruAndroidLocalCapabilitiesBoundary = {
  localAudioScan: CeruAndroidLocalAudioScanBoundary;
  cache: CeruAndroidLocalCacheBoundary;
  downloadQueue: CeruAndroidDownloadQueueBoundary;
  permissions: CeruAndroidFilePermissionBoundary;
};

export const emptyAndroidLocalCapabilitiesBoundary: CeruAndroidLocalCapabilitiesBoundary = {
  localAudioScan: {
    access: 'not-started',
    supportedSources: ['media-store-audio'],
    resultEntrypoint: 'local-track-list',
  },
  cache: {
    audio: 'app-cache-dir',
    artwork: 'app-cache-dir',
    lyric: 'app-files-dir',
  },
  downloadQueue: {
    persistence: 'pending-local-store',
    worker: 'pending-background-worker',
    notification: 'pending-system-integration',
  },
  permissions: {
    readMediaAudio: 'runtime-permission-android-13-plus',
    readExternalStorage: 'legacy-runtime-permission-android-12-minus',
    writeExternalStorage: 'legacy-scoped-to-android-9-minus',
  },
};

export type CeruAndroidSystemIntegrationBoundary = {
  playbackNotification: 'media-session-service';
  lockscreenControls: 'media-session-metadata';
  mediaKeys: 'media-session-controller';
  backgroundPlayback: 'foreground-service-media-playback';
  appResume: 'session-activity-pending-intent';
  externalVerification: 'requires-device-or-emulator';
};

export const emptyAndroidSystemIntegrationBoundary: CeruAndroidSystemIntegrationBoundary = {
  playbackNotification: 'media-session-service',
  lockscreenControls: 'media-session-metadata',
  mediaKeys: 'media-session-controller',
  backgroundPlayback: 'foreground-service-media-playback',
  appResume: 'session-activity-pending-intent',
  externalVerification: 'requires-device-or-emulator',
};

export type CeruNodeRuntimeDirectoryMap = {
  root: string;
  plugins: string;
  builtinPlugins: string;
  config: string;
  logs: string;
  cache: string;
  temp: string;
  downloadMetadata: string;
};

export type CeruNodeRuntimeHealth = {
  status: 'ok' | 'degraded';
  version: string;
  node: string;
  startedAt: string;
  uptimeMs: number;
  directories: CeruNodeRuntimeDirectoryMap;
};

export type CeruNodeRuntimeVersion = {
  name: '@ceru/node-runtime';
  version: string;
  apiVersion: string;
  node: string;
};

export type CeruNodeRuntimeEndpointMap = {
  health: string;
  version: string;
  plugins: string;
  pluginInstallLocal: string;
  pluginInstallUrl: string;
  pluginInstallBuiltin: string;
  pluginBuiltin: string;
  pluginLogs: string;
  pluginConfig: string;
  pluginHost: string;
  pluginHostLoad: string;
  pluginHostUnload: string;
  pluginHostDisable: string;
  pluginHostEnable: string;
  pluginHostCall: string;
  pluginHostEvents: string;
  sourceSearch: string;
  sourceSuggest: string;
  sourcePlayableUrl: string;
  sourcePlayableUrlFailure: string;
  sourceLyric: string;
  sourceArtwork: string;
  sourcePlaylist: string;
  sourcePlaylistSongs: string;
  sourceRanking: string;
  sourceComment: string;
  downloadPrepare: string;
  downloadTasks: string;
  downloadTaskUpdate: string;
  playbackResolve: string;
  playbackFailure: string;
};

export const ceruNodeRuntimeEndpoints: CeruNodeRuntimeEndpointMap = {
  health: '/health',
  version: '/version',
  plugins: '/plugins',
  pluginInstallLocal: '/plugins/install/local',
  pluginInstallUrl: '/plugins/install/url',
  pluginInstallBuiltin: '/plugins/install/builtin',
  pluginBuiltin: '/plugins/builtin',
  pluginLogs: '/plugins/logs',
  pluginConfig: '/plugins/config',
  pluginHost: '/plugins/host',
  pluginHostLoad: '/plugins/host/load',
  pluginHostUnload: '/plugins/host/unload',
  pluginHostDisable: '/plugins/host/disable',
  pluginHostEnable: '/plugins/host/enable',
  pluginHostCall: '/plugins/host/call',
  pluginHostEvents: '/plugins/host/events',
  sourceSearch: '/music-source/search',
  sourceSuggest: '/music-source/suggest',
  sourcePlayableUrl: '/music-source/playable-url',
  sourcePlayableUrlFailure: '/music-source/playable-url/failure',
  sourceLyric: '/music-source/lyric',
  sourceArtwork: '/music-source/artwork',
  sourcePlaylist: '/music-source/playlist',
  sourcePlaylistSongs: '/music-source/playlist/songs',
  sourceRanking: '/music-source/ranking',
  sourceComment: '/music-source/comment',
  downloadPrepare: '/download/prepare',
  downloadTasks: '/download/tasks',
  downloadTaskUpdate: '/download/tasks/update',
  playbackResolve: '/playback/resolve',
  playbackFailure: '/playback/failure',
};

export type CeruPluginType = 'music-source' | 'service' | 'lyrics' | 'artwork' | 'unknown';

export type CeruPluginInstallSource = 'local-upload' | 'remote-url' | 'builtin';

export type CeruPluginRuntimeStatus = 'not-loaded' | 'initializing' | 'ready' | 'sleeping' | 'throttled' | 'disabled' | 'crashed' | 'error';

export type CeruPluginConfigSchemaField = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'password' | 'select';
  required?: boolean;
  defaultValue?: string | number | boolean;
  options?: Array<{label: string; value: string}>;
  description?: string;
};

export type CeruPluginInfo = {
  id: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  type: CeruPluginType;
  supportedSources: CeruMusicSource[];
  disabled: boolean;
  status: CeruPluginRuntimeStatus;
  installSource: CeruPluginInstallSource;
  configSchema?: CeruPluginConfigSchemaField[];
  installedAt?: string;
  updatedAt?: string;
};

export type CeruPluginLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type CeruPluginLogLine = {
  id: string;
  pluginId: string;
  level: CeruPluginLogLevel;
  message: string;
  createdAt: string;
  scope?: string;
};

export type CeruPluginInstallLocalInput = {
  fileName: string;
  code: string;
  overwrite?: boolean;
};

export type CeruPluginInstallUrlInput = {
  url: string;
  overwrite?: boolean;
};

export type CeruPluginInstallBuiltinInput = {
  fileName: string;
  overwrite?: boolean;
};

export type CeruBuiltinPluginInfo = {
  fileName: string;
  filePath: string;
  checksum: string;
  plugin: CeruPluginInfo;
};

export type CeruPluginConfig = Record<string, unknown>;

export type CeruPluginMutationResult = {
  plugin: CeruPluginInfo;
  logs?: CeruPluginLogLine[];
};

export type CeruPluginHostStatus = CeruPluginRuntimeStatus;

export type CeruPluginHostMethod =
  | 'search'
  | 'musicUrl'
  | 'getPic'
  | 'getLyric'
  | 'testConnection'
  | 'getPlaylists'
  | 'getPlaylistSongs';

export type CeruPluginHostCallInput = {
  pluginId: string;
  method: CeruPluginHostMethod;
  args?: unknown[];
  timeoutMs?: number;
};

export type CeruPluginHostCallResult = {
  pluginId: string;
  method: CeruPluginHostMethod;
  data: unknown;
  elapsedMs: number;
  status: CeruPluginHostStatus;
};

export type CeruPluginHostEventType = 'ready' | 'unloaded' | 'log' | 'notice' | 'throttle' | 'disabled' | 'crashed' | 'config';

export type CeruPluginHostEvent = {
  id: string;
  pluginId: string;
  type: CeruPluginHostEventType;
  level: CeruPluginLogLevel;
  message: string;
  createdAt: string;
  payload?: unknown;
};

export type CeruPluginHostMeta = {
  pluginId: string;
  status: CeruPluginHostStatus;
  disabled: boolean;
  disabledReason?: string;
  throttledReason?: string;
  throttledUntil?: string;
  crashCount: number;
  hasMethods: Partial<Record<CeruPluginHostMethod | 'onConfigUpdate', boolean>>;
  pluginInfo: CeruPluginInfo;
};

export type CeruPluginHostLoadInput = {
  pluginId: string;
};

export type CeruPluginHostDisableInput = {
  pluginId: string;
  reason?: string;
};

export type CeruPluginHostEnableInput = {
  pluginId: string;
};

export type CeruSourceQualityPreference = {
  source: CeruMusicSource;
  quality: string;
};

export type CeruSourceSuggestInput = {
  keyword: string;
  sources?: CeruMusicSource[];
  limit?: number;
};

export type CeruSourceSuggestResult = {
  items: string[];
};

export type CeruAudioEffectPreset = {
  eq?: number[];
  bassBoost?: number;
  virtualizer?: number;
  loudness?: number;
  crossfadeMs?: number;
  gapless?: boolean;
  replayGain?: boolean;
};

export type CeruBusinessBoundary = {
  userProfile: CeruUserProfile | null;
  cloudPlaylists: CeruCloudPlaylist[];
  selectedPlaylist: CeruCloudPlaylistDetail | null;
};

export const emptyBusinessBoundary: CeruBusinessBoundary = {
  userProfile: null,
  cloudPlaylists: [],
  selectedPlaylist: null,
};