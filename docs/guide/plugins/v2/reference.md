---
pageClass: plugin-v2-doc
---

# 完整类型参考

本页汇集 SDK 与 Issuer 的公开类型声明。Guest、分享与 Storage 可从 SDK 导入，无需从桌面源码复制类型。

::: info 查询方式
安装依赖见[开发环境与依赖](./sdk-upgrade)。本页用于集中查阅；具体工程的类型提示以已安装依赖的声明文件为准。
:::

本页适合在写代码时查询参数和返回值。首次开发先从[动手教程](./quick-start)开始；功能能否运行还要看[宿主支持表](./host-services)。

按需要展开下面一个领域即可，不必从头读完，也不要把跨文件声明整体粘进插件入口。

::: warning 新代码的入口
优先使用当前 SDK 暴露的 `ctx` API，并以工程中安装的 `.d.ts` 为最终类型依据。下面标有 `@deprecated`、preview 或兼容字样的声明只用于读取旧成品和理解兼容边界，不是新插件的推荐写法。
:::

## 上下文、账号与原生页面类型

::: details index.d.ts

```ts
/// <reference path="./host-modules.d.cts" />
/** This package defines the v2 wire/authoring contract. It does not grant Host permissions. */
import type { LoDashStatic } from 'lodash';
import type { HostIconName, HostAssetName, LODASH_METHODS } from './catalog.js';
export * from './catalog.js';
export * from './http.js';
export * from './library.js';
export * from './sockets.js';
import type { SocketAPI } from './sockets.js';
import type { GuestAPI, GuestBootstrapAPI } from './guests.js';
import type { PluginStorageAPI } from './storage.js';
import type { createHttpClient, HttpClientOptions } from './http.js';
export * from './music.js';
export * from './lyrics.js';
export * from './quality.js';
export * from './guests.js';
export * from './share.js';
export * from './storage.js';
export * from './accounts.js';
export * from './navigation.js';
export * from './permissions.js';
export * from './services.js';
export * from './modules.js';
import type { PluginModules } from './modules.js';
import type { HostServices, HostUI } from './services.js';
import type { PermissionGrant, PermissionGroupRequest, PermissionGroupResult } from './permissions.js';
import type { ChartMetadata, LyricsDocument, PlaylistMetadata, TrackMetadata } from './music.js';
import type { LibraryAPI, PlaylistImporterImplementation } from './library.js';
/** 宿主在插件自己的隔离环境提供这些 Lodash 方法；不会打入插件发行文件。 */
export type HostLodash = Pick<LoDashStatic, (typeof LODASH_METHODS)[number]>;
export * from './manifest.js';
import type { JsonValue, JsonObject, MaybePromise, Disposable, PluginManifest } from './manifest.js';
export interface ResourceRef {
    pluginId: string;
    providerId: string;
    connectionId?: string;
    kind: string;
    id: string;
    /** Opaque plugin-owned JSON persisted by the Host and returned only to this plugin. */
    data?: JsonObject;
}
export interface AssetHandle {
    readonly kind: 'asset';
    readonly id: string;
}
export interface MediaLease {
    /** @deprecated v0.2 providers return direct playback URLs. */
    readonly kind: 'media';
    readonly id: string;
}
export interface CredentialRef {
    readonly kind: 'credential';
    readonly id: string;
}
export interface UserIntentHandle {
    readonly kind: 'user-intent';
    readonly id: string;
}
export interface OperationContext {
    id: string;
    deadlineAt: number;
    signal: AbortSignal;
    connectionId?: string;
    userIntent?: UserIntentHandle;
}
export interface ContentEntity {
    ref: ResourceRef;
    title: string;
    subtitle?: string;
    artwork?: AssetHandle;
    playable?: boolean;
    durationMs?: number;
    capabilities: string[];
    extensions?: JsonObject;
    /** Standard metadata consumed directly by the Host; never raw platform response objects. */
    metadata?: TrackMetadata;
    playlist?: PlaylistMetadata;
    chart?: ChartMetadata;
}
export interface Page<T> {
    items: T[];
    nextCursor?: string;
    snapshotId?: string;
    totalEstimate?: number;
}
export interface SearchRequest {
    query: string;
    kinds: string[];
    filters: JsonObject;
    cursor?: string;
    /** Requested size; providers may clamp to their upstream API's supported range. */
    limit: number;
}
export interface MusicFault {
    code: 'RATE_LIMITED' | 'AUTH_REQUIRED' | 'ENTITLEMENT_EXPIRED' | 'NOT_FOUND' | 'REGION_UNAVAILABLE' | 'NETWORK_ERROR' | 'PERMISSION_DENIED' | 'UNSUPPORTED' | 'CANCELLED' | 'INTERNAL';
    message: string;
    retryAfterMs?: number;
    retryable?: boolean;
    recovery?: {
        mode: 'default' | 'retry-later' | 'await-user' | 'stop-current';
        maxWaitMs?: number;
        actions?: ({
            kind: 'retry' | 'choose-source' | 'cancel';
            label?: string;
        } | {
            kind: 'plugin-command';
            commandId: string;
            label: string;
        })[];
    };
}
export type ResolveResult = {
    ok: true;
    url: string;
    expiresAt?: number;
    /** Headers the Host must attach while fetching this exact media URL. */
    requestHeaders?: Record<string, string>;
} | {
    ok: false;
    error: MusicFault;
};
export interface TrackProvider {
    search?(request: SearchRequest, operation: OperationContext): Promise<Page<ContentEntity>>;
    resolve?(resource: ResourceRef, quality: string | undefined, operation: OperationContext): Promise<ResolveResult>;
    lyrics?(resource: ResourceRef, operation: OperationContext): Promise<LyricsDocument>;
}
export interface PlaylistProvider {
    search?(request: SearchRequest, operation: OperationContext): Promise<Page<ContentEntity>>;
    categories?(operation: OperationContext): Promise<Page<ContentEntity>>;
    list?(resource: ResourceRef, cursor: string | undefined, operation: OperationContext): Promise<Page<ContentEntity>>;
    get?(resource: ResourceRef, cursor: string | undefined, operation: OperationContext): Promise<import('./library.js').PlaylistTrackPage>;
}
export interface ChartProvider {
    list?(operation: OperationContext): Promise<Page<ContentEntity>>;
    getTracks?(resource: ResourceRef, cursor: string | undefined, operation: OperationContext): Promise<Page<ContentEntity>>;
}
export interface SharingProvider {
    describe?(resource: ResourceRef, policy: JsonObject, operation: OperationContext): Promise<JsonObject>;
}
export interface ProviderImplementation {
    tracks?: TrackProvider;
    playlists?: PlaylistProvider;
    charts?: ChartProvider;
    sharing?: SharingProvider;
    /** @deprecated Use tracks.lyrics. Kept for v2 preview compatibility. */
    lyrics?(resource: ResourceRef, operation: OperationContext): Promise<LyricsDocument>;
    /** @deprecated Use tracks.search. */
    search?(request: SearchRequest, operation: OperationContext): Promise<Page<ContentEntity>>;
    /** @deprecated Use tracks.resolve. */
    resolve?(resource: ResourceRef, quality: string | undefined, operation: OperationContext): Promise<ResolveResult>;
    /** @deprecated Use playlists.categories. */
    categories?(operation: OperationContext): Promise<Page<ContentEntity>>;
    /** @deprecated Use playlists.list/get or charts.getTracks. */
    list?(resource: ResourceRef, cursor: string | undefined, operation: OperationContext): Promise<Page<ContentEntity>>;
    /** @deprecated Use sharing.describe. */
    share?(resource: ResourceRef, policy: JsonObject, operation: OperationContext): Promise<JsonObject>;
}
export interface PluginContext extends HostServices {
    modules: PluginModules;
    readonly plugin: {
        id: string;
        version: string;
        /** The validated installed manifest. Runtime configuration is manifest.config. */
        manifest: Readonly<PluginManifest>;
    };
    /** 当前 Host 的协议版本与共享资源版本。 */
    readonly host: {
        apiVersion: string;
        libraries: {
            lodash: string;
            icons: string;
            assets: string;
            vue?: string;
            react?: string;
            'react-dom'?: string;
        };
        mode: 'development' | 'production';
    };
    /** 本地纯计算工具，不通过 RPC 逐项执行。没有模板执行、mixin 或任意上下文构造能力。 */
    readonly utils: {
        readonly lodash: HostLodash;
    };
    /** 使用宿主已经拥有的图标，无需将 SVG/PNG 打入插件。 */
    readonly icons: {
        list(): readonly HostIconName[];
        url(name: HostIconName): Promise<string>;
    };
    /** Host 静态资源与本插件资源句柄；不是任意文件路径访问接口。 */
    readonly assets: {
        list(): readonly HostAssetName[];
        url(name: HostAssetName | AssetHandle): Promise<string>;
    };
    /** 已验证的配置。凭据字段由 Host 替换为引用，不返回主密钥。 */
    config: {
        get<T = JsonObject>(): Promise<Readonly<T>>;
    };
    /** Uses the application's own local/cloud playlists after Host permission checks. */
    library: LibraryAPI;
    /** Host-provided Socket.IO / WebSocket; no socket library is bundled into the plugin. */
    sockets: SocketAPI;
    playlistImporters: {
        register(id: string, implementation: PlaylistImporterImplementation): Disposable;
    };
    lyricConverters: {
        register(id: string, implementation: import('./lyrics.js').LyricConverter): Disposable;
    };
    providers: {
        register(id: string, implementation: ProviderImplementation): Disposable;
    };
    actions: {
        register<TInput extends JsonValue = JsonValue, TResult extends JsonValue | void = JsonValue | void>(id: string, handler: (input: TInput, operation: OperationContext) => MaybePromise<TResult>): Disposable;
    };
    permissions: {
        getGranted(): Promise<PermissionGrant[]>;
        requestGroup(request: PermissionGroupRequest): Promise<PermissionGroupResult>;
        query(request: {
            key: string;
            scope?: JsonObject;
        }): Promise<{
            status: PermissionStatus;
        }>;
        request(request: {
            key: string;
            scope?: JsonObject;
            intent?: UserIntentHandle;
        }): Promise<{
            status: PermissionStatus;
        }>;
    };
    http: {
        /** Axios-backed Host client with JSON/form helpers and typed results. */
        create(options: HttpClientOptions): ReturnType<typeof createHttpClient>;
        request(request: {
            permissionKey: string;
            url: string;
            method?: string;
            headers?: Record<string, string>;
            body?: string;
            timeoutMs?: number;
            credential?: CredentialRef;
            operation: OperationContext;
        }): Promise<{
            status: number;
            headers: Record<string, string>;
            body: JsonValue;
        }>;
    };
    credentials: {
        get(connectionId: string): Promise<CredentialRef | null>;
    };
    playback: {
        failure(error: MusicFault): ResolveResult;
    };
    ui: HostUI & {
        toast(message: {
            message: string;
            level?: 'info' | 'success' | 'warning' | 'error';
        }): Promise<void>;
        /** Opens the application's existing import dialog. This does not create a plugin Surface. */
        playlistImport: {
            /** Only this plugin's importers are offered. Omit importerId to let the user choose. */
            open(request: {
                importerId?: string;
                initialValue?: string;
                title?: string;
            }): Promise<void>;
        };
        /** Requests an update through the Host UI. A queued result does not mean it was installed. */
        pluginUpdate: {
            request(request: {
                version: string;
                url: string;
                notes?: string;
            }): Promise<{
                accepted: boolean;
                updated: boolean;
                version?: string;
                queued?: boolean;
            }>;
        };
        setState(surfaceId: string, state: JsonObject): Promise<void>;
        notify(message: {
            key: string;
            level: 'info' | 'success' | 'warning' | 'error';
            message: string;
        }): Promise<void>;
        openView(surfaceId: string): Promise<void>;
        closeView(surfaceId: string): Promise<void>;
    };
    storage: PluginStorageAPI;
    guests: GuestAPI & {
        /** Legacy install-draft contract; availability depends on the Host. Prefer import on desktop. */
        prepareInstall(request: {
            adapterId: string;
            artifactHandle: string;
            operation: OperationContext;
        }): Promise<{
            draftId: string;
        }>;
        requestInstall(draftId: string, operation: OperationContext): Promise<{
            guestId: string;
        } | null>;
    };
    log: {
        debug(message: string, data?: JsonValue): void;
        info(message: string, data?: JsonValue): void;
        warn(message: string, data?: JsonValue): void;
        error(message: string, data?: JsonValue): void;
    };
    effects: {
        add(dispose: Disposable): void;
    };
}
export type PermissionStatus = 'undeclared' | 'prompt' | 'granted' | 'denied' | 'expired' | 'restricted' | 'unavailable';
export interface SurfaceContext extends Pick<PluginContext, 'host' | 'utils' | 'icons' | 'assets'> {
    readonly root: HTMLElement;
    readonly mount: {
        kind: 'page' | 'slot';
        slot?: import('./manifest.js').UISlotName;
        mode?: 'append' | 'prepend' | 'wrap' | 'replace';
    };
    invoke(action: string, input: JsonValue): Promise<JsonValue>;
    /** Close this mounted Surface after its current action has returned. */
    close(): Promise<void>;
    subscribe(handler: (state: JsonObject) => void): Disposable;
}
export interface GuestContext extends Pick<PluginContext, 'host' | 'utils'>, GuestBootstrapAPI {
    readonly guestId: string;
    expose(name: string, value: unknown): void;
    invokeHost(method: string, input: JsonValue): Promise<JsonValue>;
}
export type LogicEntry = (ctx: PluginContext) => MaybePromise<void | Disposable>;
export type SurfaceEntry = (ctx: SurfaceContext) => MaybePromise<void | Disposable>;
export type GuestEntry = (ctx: GuestContext) => MaybePromise<void | Disposable>;
export declare function definePlugin(entry: LogicEntry): LogicEntry;
export declare function defineSurface(entry: SurfaceEntry): SurfaceEntry;
export { defineNativeView, assertNativeView } from './native-view.js';
export type { NativeView, NativeViewSection, NativeViewAction } from './native-view.js';
export declare function defineGuestAdapter(entry: GuestEntry): GuestEntry;
export declare function defineManifest(manifest: PluginManifest): PluginManifest;
export declare function definePluginConfig<const T extends JsonObject>(config: T): T;
export declare function failure(error: MusicFault): ResolveResult;
/** 基础声明式界面；由 Host 渲染，不会把插件函数放进主界面组件树。 */
export type UINode = {
    type: 'section' | 'stack' | 'grid' | 'form';
    title?: string;
    submitAction?: string;
    children: UINode[];
} | {
    type: 'text';
    text?: string;
    label?: string;
    bind?: string;
} | {
    type: 'button';
    label: string;
    action: string;
} | {
    type: 'host-content';
} | {
    type: 'text-input' | 'input' | 'number' | 'toggle';
    label: string;
    bind: string;
    placeholder?: string;
} | {
    type: 'host-credential';
    label: string;
    bind: string;
    permissionKey: string;
};
export interface UISchema {
    schemaVersion: '1.0';
    id?: string;
    root: UINode;
}
export declare function defineUISchema(schema: UISchema): UISchema;
```

:::

::: details manifest.d.ts

```ts
import type { HostIconName, PermissionName } from './catalog.js';
import type { MenuContribution } from './services.js';
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
export type JsonObject = {
    [key: string]: JsonValue;
};
export type MaybePromise<T> = T | Promise<T>;
export type Disposable = () => MaybePromise<void>;
export type IconRef = {
    kind: 'host';
    name: HostIconName;
} | {
    kind: 'asset';
    resource: string;
};
export interface PermissionDeclaration {
    key: string;
    name: PermissionName;
    scope?: JsonObject;
    reason: string;
    optional?: boolean;
    requiredFor?: string[];
}
export interface ProviderDeclaration {
    id: string;
    name: string;
    protocols: string[];
    /** Ordered from lowest to highest; names have no intrinsic rank. */
    qualities?: string[];
    icon?: IconRef;
    connectionMode?: 'none' | 'single' | 'multiple';
}
export interface SurfaceDeclaration {
    id: string;
    kind: 'schema' | 'web' | 'native';
    /** Native: declared action returning NativeView; Web: module; Schema: JSON resource. */
    entry: string;
    /** Host chrome only. The plugin owns all content inside a web Surface. */
    title?: string;
    presentation?: {
        kind: 'drawer' | 'modal';
        placement?: 'left' | 'right' | 'top' | 'bottom';
        size?: number;
    };
    /** Declared logic actions. Open runs after mounting; close runs once per session. */
    lifecycle?: {
        openAction?: string;
        closeAction?: string;
    };
}
export type HomeSectionKind = 'playlists' | 'charts' | 'custom';
export type UISlotName = 'home.header' | 'home.content.before' | 'home.content.after' | 'search.source-selector.after' | 'playlist.header.actions' | 'playlist.item.actions' | 'player.actions' | 'settings.sections';
export interface HomeSectionContribution {
    id: string;
    title: string;
    kind: HomeSectionKind;
    icon?: IconRef;
    /** Required for custom sections; built-in playlist/chart sections keep the existing Host UI. */
    view?: string;
    providerIds?: string[];
    order?: number;
}
export interface UIExtensionContribution {
    id: string;
    slot: UISlotName;
    mode: 'append' | 'prepend' | 'wrap' | 'replace';
    /** Sandboxed visible Surface. Plugin JavaScript never runs in the application renderer. */
    view: string;
    order?: number;
    when?: {
        loggedIn?: boolean;
        route?: string;
    };
}
export interface StyleContribution {
    id: string;
    resource: string;
    scope: 'surface' | 'slot' | 'application';
    slots?: UISlotName[];
    order?: number;
}
export interface PluginManifest {
    manifestVersion: 2;
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    publisher?: string;
    license?: string;
    homepage?: string;
    /** Static defaults for ctx.config. Build-time @file sugar is expanded into this object. */
    config?: JsonObject;
    engines: {
        hostApi: string;
        logicRuntime: string;
        uiSchema?: string;
        libraries?: Partial<Record<'vue' | 'react' | 'react-dom', string>>;
    };
    modules: {
        logic?: {
            entry: string;
            activation?: string[];
        };
        /** Separate server-side playback resolver. Requires a compatible builder and share Host. */
        share?: {
            entry: string;
            configKeys?: string[];
            guestAdapterId?: string;
            guestGlobals?: string[];
        };
        surfaces?: SurfaceDeclaration[];
    };
    contributes?: {
        lyricConverters?: {
            id: string;
            title: string;
            formats: import('./lyrics.js').LyricInputFormat[];
        }[];
        providers?: ProviderDeclaration[];
        /** Home tabs exist only while at least one enabled plugin contributes them. */
        homeSections?: HomeSectionContribution[];
        /** Native sections inside the Host's existing local/cloud playlist page. */
        playlistSections?: {
            id: string;
            title: string;
            view: string;
            order?: number;
        }[];
        /** Controlled UI composition. The Host owns the target DOM and lifecycle. */
        uiExtensions?: UIExtensionContribution[];
        /** Surface/slot styles are scoped. Application styles require ui.styles.global. */
        styles?: StyleContribution[];
        menus?: MenuContribution[];
        /** Entries for the application's existing playlist import menu/dialog. */
        playlistImporters?: {
            id: string;
            title: string;
            providerId?: string;
            examples?: {
                label: string;
                value: string;
            }[];
            instructions?: string[];
            description?: string;
            placeholder?: string;
        }[];
        commands?: {
            id: string;
            title: string;
            description?: string;
            action: string;
            view?: string;
        }[];
        /** Subaccounts in the Host account menu. action returns AccountSummary; view owns login UI. */
        accountItems?: {
            id: string;
            title: string;
            view: string;
            action: string;
            logoutAction?: string;
        }[];
        sidebarItems?: {
            id: string;
            group: string;
            title: string;
            view: string;
        }[];
        settingsPages?: {
            id: string;
            title: string;
            view: string;
        }[];
        guestAdapters?: {
            id: string;
            title?: string;
            extensions?: string[];
            format: string;
            badge?: {
                label: string;
                backgroundColor: string;
                textColor: string;
            };
            compatibilityProfile: string;
            bootstrap: string;
            runtime: string;
            projectableProtocols: string[];
        }[];
    };
    permissions?: PermissionDeclaration[];
    guestPolicy?: {
        maxDepth: 1;
        allowedCapabilities: string[];
        networkScopeMode: 'per-guest-user-approved';
        allowNativeCode: false;
        allowRemoteCodeExecution: false;
    };
    dataSchemas?: {
        config: number;
        state: number;
    };
}
```

:::

::: details accounts.d.ts

```ts
/** Public account presentation. Credentials and platform login flows remain in plugin logic. */
export type AccountSummary = {
    signedIn: boolean;
    displayName: string;
    avatarUrl?: string;
    badge?: string;
};
export declare function assertAccountSummary(value: unknown): asserts value is AccountSummary;
```

:::

::: details native-view.d.ts

```ts
import type { ContentEntity, JsonValue, MaybePromise, OperationContext } from './index.js';
export interface NativeViewAction {
    label: string;
    action: string;
    input?: JsonValue;
    primary?: boolean;
}
export interface NativeViewSection {
    id: string;
    title?: string;
    layout: 'grid' | 'list';
    items: ContentEntity[];
    /** Receives { ref }; typically opens a native playlist page. */
    onOpen?: string;
    /** Receives { ref, refs }; typically replaces the native playback queue. */
    onPlay?: string;
    /** Receives the action input merged with { ref }; the Host supplies the item's ref. */
    itemActions?: NativeViewAction[];
}
/** Rendered using Host components. No plugin DOM, iframe, or framework runs in this surface. */
export interface NativeView {
    type: 'page';
    title?: string;
    description?: string;
    actions?: NativeViewAction[];
    sections: NativeViewSection[];
}
/** A typed render callback that can be passed directly to ctx.actions.register. */
export declare function defineNativeView<TInput extends JsonValue = JsonValue>(render: (input: TInput, operation: OperationContext) => MaybePromise<NativeView>): (input: TInput, operation: OperationContext) => Promise<NativeView & JsonValue>;
export declare function assertNativeView(value: unknown, actions?: ReadonlySet<string>): asserts value is NativeView;
```

:::

## 宿主服务完整签名

::: details services.d.ts

```ts
import type { Disposable, JsonObject, JsonValue, IconRef } from './manifest.js';
import type { ContentEntity, MusicFault, OperationContext, Page, ResourceRef, AssetHandle } from './index.js';
import type { LibraryPlaylist, PlaylistReference } from './library.js';
import type { LyricsDocument } from './music.js';
import type { PermissionGroup } from './permissions.js';
import type { HostNavigationRequest } from './navigation.js';
/** Supplied by Host actions/events. Never construct trusted intents from plugin JSON. */
export interface ServiceCall {
    operation: OperationContext;
    permissionKey: string;
}
export interface ServiceAvailability {
    service: string;
    version: string;
    available: boolean;
    /** When present, only these methods are connected by the Host. */
    methods?: string[];
    reason?: 'host-not-connected' | 'unsupported' | 'not-logged-in' | 'disabled';
    permissionGroups: PermissionGroup[];
}
export interface AccountProfile {
    id: string;
    displayName: string;
    avatar?: AssetHandle;
    /** Stable plugin-scoped identity; no email, phone, tokens or auth provider subject by default. */
    identityScope: 'plugin';
}
export interface AccountSession {
    loggedIn: boolean;
    profile: AccountProfile | null;
}
export interface PlayerState {
    status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';
    track: ContentEntity | null;
    positionMs: number;
    durationMs: number;
    volume: number;
    muted: boolean;
    repeat: 'off' | 'one' | 'all';
    shuffle: boolean;
}
export interface QueueState {
    items: ContentEntity[];
    currentIndex: number;
    revision: string;
}
export interface DownloadTask {
    id: string;
    track: ContentEntity;
    status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
    receivedBytes: number;
    totalBytes?: number;
    error?: MusicFault;
}
export interface FileHandle {
    kind: 'file';
    id: string;
    name: string;
    size?: number;
    mime?: string;
}
export interface DirectoryHandle {
    kind: 'directory';
    id: string;
    name: string;
}
export interface AudioDevice {
    id: string;
    name: string;
    kind: 'local' | 'dlna';
    available: boolean;
}
export interface ShareDescriptor {
    version: 1;
    track: ResourceRef;
    title: string;
    artists: string[];
    canonicalUrl?: string;
    /** Public resolver identity; never executable plugin code, master keys or auth tokens. */
    resolver?: {
        id: string;
        resourceId: string;
    };
}
export interface RoomState {
    joined: boolean;
    id?: string;
    title?: string;
    role?: 'owner' | 'member';
    members?: number;
}
export interface AppInfo {
    name: string;
    version: string;
    platform: 'win32' | 'darwin' | 'linux';
    locale: string;
    theme: 'light' | 'dark';
    hostApi: string;
}
export interface HostServiceEvents {
    'account.changed': AccountSession;
    'library.changed': {
        target: PlaylistReference;
        reason: 'created' | 'updated' | 'deleted' | 'synced';
    };
    'player.changed': PlayerState;
    'queue.changed': QueueState;
    'lyrics.changed': LyricsDocument | null;
    'downloads.changed': DownloadTask;
    'settings.changed': {
        keys: string[];
    };
    'theme.changed': {
        theme: 'light' | 'dark';
    };
    'rooms.changed': RoomState;
    'devices.changed': AudioDevice[];
    'permissions.changed': {
        keys: string[];
    };
}
/** Contract first: availability must be checked before using services not connected by this Host. */
export interface HostServices {
    capabilities: {
        list(): Promise<ServiceAvailability[]>;
        get(service: string): Promise<ServiceAvailability>;
    };
    account: {
        getSession(call: ServiceCall): Promise<AccountSession>;
        getProfile(call: ServiceCall): Promise<AccountProfile | null>;
        /** Opens the application's own account page. Plugins do not implement login or receive its token. */
        openLogin(operation: OperationContext): Promise<void>;
    };
    app: {
        getInfo(): Promise<AppInfo>;
        openSettings(section?: string): Promise<void>;
        openExternal(url: string, call: ServiceCall): Promise<void>;
    };
    player: {
        getState(call: ServiceCall): Promise<PlayerState>;
        play(track: ResourceRef | undefined, call: ServiceCall): Promise<void>;
        pause(call: ServiceCall): Promise<void>;
        next(call: ServiceCall): Promise<void>;
        previous(call: ServiceCall): Promise<void>;
        seek(positionMs: number, call: ServiceCall): Promise<void>;
        setVolume(volume: number, call: ServiceCall): Promise<void>;
        setMode(mode: {
            repeat?: PlayerState['repeat'];
            shuffle?: boolean;
            muted?: boolean;
        }, call: ServiceCall): Promise<void>;
    };
    queue: {
        get(call: ServiceCall): Promise<QueueState>;
        append(items: ContentEntity[], call: ServiceCall): Promise<QueueState>;
        replace(items: ContentEntity[], call: ServiceCall): Promise<QueueState>;
        remove(refs: ResourceRef[], call: ServiceCall): Promise<QueueState>;
        reorder(refs: ResourceRef[], revision: string, call: ServiceCall): Promise<QueueState>;
    };
    favorites: {
        contains(refs: ResourceRef[], call: ServiceCall): Promise<boolean[]>;
        add(refs: ResourceRef[], call: ServiceCall): Promise<void>;
        remove(refs: ResourceRef[], call: ServiceCall): Promise<void>;
    };
    history: {
        list(cursor: string | undefined, call: ServiceCall): Promise<Page<ContentEntity>>;
    };
    downloads: {
        list(call: ServiceCall): Promise<DownloadTask[]>;
        create(request: {
            tracks: ResourceRef[];
            quality?: string;
            directory?: DirectoryHandle;
        }, call: ServiceCall): Promise<DownloadTask[]>;
        pause(ids: string[], call: ServiceCall): Promise<void>;
        resume(ids: string[], call: ServiceCall): Promise<void>;
        cancel(ids: string[], call: ServiceCall): Promise<void>;
        retry(ids: string[], call: ServiceCall): Promise<void>;
        reveal(id: string, call: ServiceCall): Promise<void>;
    };
    files: {
        pick(request: {
            title?: string;
            extensions?: string[];
            multiple?: boolean;
        }, operation: OperationContext): Promise<FileHandle[]>;
        pickDirectory(operation: OperationContext): Promise<DirectoryHandle | null>;
        readText(file: FileHandle, call: ServiceCall): Promise<string>;
        readBase64(file: FileHandle, call: ServiceCall): Promise<string>;
        saveText(request: {
            suggestedName: string;
            text: string;
        }, operation: OperationContext): Promise<FileHandle | null>;
        writeText(file: FileHandle, text: string, call: ServiceCall): Promise<void>;
    };
    clipboard: {
        readText(call: ServiceCall): Promise<string>;
        writeText(text: string, call: ServiceCall): Promise<void>;
    };
    localMusic: {
        list(cursor: string | undefined, call: ServiceCall): Promise<Page<ContentEntity>>;
        scan(directories: DirectoryHandle[], call: ServiceCall): Promise<{
            taskId: string;
        }>;
        getTags(track: ResourceRef, call: ServiceCall): Promise<JsonObject>;
        writeTags(track: ResourceRef, tags: {
            title?: string;
            artists?: string[];
            album?: string;
            lyrics?: LyricsDocument;
        }, call: ServiceCall): Promise<void>;
    };
    settings: {
        /** Only explicit public setting names. Secret/unsafe settings are not part of this API. */
        get(keys: string[], call: ServiceCall): Promise<JsonObject>;
        update(values: JsonObject, call: ServiceCall): Promise<void>;
    };
    window: {
        control(action: 'show' | 'minimize' | 'maximize' | 'restore' | 'mini-player', call: ServiceCall): Promise<void>;
    };
    hotkeys: {
        register(request: {
            id: string;
            accelerator: string;
            commandId: string;
        }, call: ServiceCall): Promise<Disposable>;
    };
    sharing: {
        create(request: ShareDescriptor, call: ServiceCall): Promise<{
            id: string;
            url: string;
            expiresAt?: number;
        }>;
        revoke(id: string, call: ServiceCall): Promise<void>;
        resolve(url: string, operation: OperationContext): Promise<ShareDescriptor>;
    };
    rooms: {
        getState(call: ServiceCall): Promise<RoomState>;
        join(inviteCode: string, call: ServiceCall): Promise<RoomState>;
        leave(call: ServiceCall): Promise<void>;
        requestTrack(track: ResourceRef, call: ServiceCall): Promise<void>;
    };
    devices: {
        list(call: ServiceCall): Promise<AudioDevice[]>;
        select(id: string, call: ServiceCall): Promise<void>;
    };
    ai: {
        generate(request: {
            prompt: string;
            maxOutputChars?: number;
        }, call: ServiceCall): Promise<{
            text: string;
        }>;
    };
    tasks: {
        schedule(request: {
            id: string;
            commandId: string;
            intervalMs: number;
        }, call: ServiceCall): Promise<{
            id: string;
        }>;
        cancel(id: string, call: ServiceCall): Promise<void>;
    };
    events: {
        on<K extends keyof HostServiceEvents>(event: K, listener: (value: HostServiceEvents[K]) => void, call?: ServiceCall): Disposable;
    };
}
export interface HostUI {
    dialogs: {
        confirm(request: {
            title: string;
            message: string;
            confirmText?: string;
        }): Promise<boolean>;
        prompt(request: {
            title: string;
            label: string;
            value?: string;
            secret?: boolean;
        }): Promise<string | null>;
        pickPlaylist(request?: {
            location?: 'local' | 'cloud';
            writable?: boolean;
        }): Promise<LibraryPlaylist | null>;
    };
    navigation: {
        open(request: HostNavigationRequest): Promise<void>;
    };
    notifications: {
        show(request: {
            title: string;
            body: string;
        }, call: ServiceCall): Promise<void>;
    };
    progress: {
        create(request: {
            title: string;
            cancellable?: boolean;
        }): Promise<{
            id: string;
        }>;
        update(id: string, request: {
            value?: number;
            message?: string;
        }): Promise<void>;
        close(id: string): Promise<void>;
    };
}
export interface MenuContribution {
    id: string;
    slot: 'playlist.import' | 'playlist.actions' | 'track.actions' | 'player.actions' | 'search.tools';
    title: string;
    description?: string;
    commandId: string;
    icon?: IconRef;
    when?: {
        kinds?: ('track' | 'playlist')[];
        loggedIn?: boolean;
    };
}
/** Explicit allowlist for future Core routing; never forward arbitrary IPC channel names. */
export declare const HOST_SERVICE_METHODS: {
    readonly capabilities: readonly ["list", "get"];
    readonly account: readonly ["getSession", "getProfile", "openLogin"];
    readonly app: readonly ["getInfo", "openSettings", "openExternal"];
    readonly player: readonly ["getState", "play", "pause", "next", "previous", "seek", "setVolume", "setMode"];
    readonly queue: readonly ["get", "append", "replace", "remove", "reorder"];
    readonly favorites: readonly ["contains", "add", "remove"];
    readonly history: readonly ["list"];
    readonly downloads: readonly ["list", "create", "pause", "resume", "cancel", "retry", "reveal"];
    readonly files: readonly ["pick", "pickDirectory", "readText", "readBase64", "saveText", "writeText"];
    readonly clipboard: readonly ["readText", "writeText"];
    readonly localMusic: readonly ["list", "scan", "getTags", "writeTags"];
    readonly settings: readonly ["get", "update"];
    readonly window: readonly ["control"];
    readonly hotkeys: readonly ["register"];
    readonly sharing: readonly ["create", "revoke", "resolve"];
    readonly rooms: readonly ["getState", "join", "leave", "requestTrack"];
    readonly devices: readonly ["list", "select"];
    readonly ai: readonly ["generate"];
    readonly tasks: readonly ["schedule", "cancel"];
};
export type SerializedHostValue = JsonValue | AssetHandle;
```

:::

::: details navigation.d.ts

```ts
import type { ResourceRef } from './index.js';
import type { PluginManifest } from './manifest.js';
export type HostNavigationRequest = {
    query?: string;
    ref?: ResourceRef;
} & ({
    page: 'playlist';
    sectionId?: string;
} | {
    page: 'search' | 'charts' | 'downloads' | 'account' | 'settings';
    sectionId?: never;
});
/** Validate using the calling plugin's manifest, never a caller-supplied owner ID. */
export declare function assertNavigationRequest(value: unknown, manifest?: PluginManifest): asserts value is HostNavigationRequest;
```

:::

::: details library.d.ts

```ts
import type { ContentEntity, OperationContext, Page } from './index.js';
export type PlaylistLocation = 'local' | 'cloud';
export interface PlaylistReference {
    /** Host ID; never a path or backend database credential. */
    id: string;
    location: PlaylistLocation;
}
export interface LibraryPlaylist {
    ref: PlaylistReference;
    name: string;
    description?: string;
    trackCount?: number;
    writable: boolean;
}
export interface PlaylistImportRequest {
    /** Omit to let the Host show its existing playlist picker/create dialog. */
    target?: PlaylistReference;
    suggestedName?: string;
    items: ContentEntity[];
    /** Reuse this key when retrying the same batch, so the Host can avoid duplicates. */
    requestId: string;
    permissionKey: string;
    operation: OperationContext;
}
export interface PlaylistImportResult {
    cancelled: boolean;
    target?: PlaylistReference;
    added: number;
    skipped: number;
}
export interface PlaylistImporterImplementation {
    /** Resolve a pasted link/ID and return one page. Host owns paging and the import UI. */
    getTracks(request: {
        value: string;
        cursor?: string;
        limit: number;
    }, operation: OperationContext): Promise<PlaylistTrackPage>;
}
export interface PlaylistTrackPage extends Page<ContentEntity> {
    name?: string;
    playlist?: import('./music.js').PlaylistMetadata;
}
/** Existing application library services. No plugin-owned playlist database. */
export interface LibraryAPI {
    playlists: {
        list(request: {
            location?: PlaylistLocation;
            cursor?: string;
            permissionKey: string;
            operation: OperationContext;
        }): Promise<Page<LibraryPlaylist>>;
        getTracks(request: {
            target: PlaylistReference;
            cursor?: string;
            permissionKey: string;
            operation: OperationContext;
        }): Promise<Page<ContentEntity>>;
        /** Host handles destination selection, auth, deduplication, persistence and cloud sync. */
        import(request: PlaylistImportRequest): Promise<PlaylistImportResult>;
    };
}
```

:::

## 存储类型

::: details storage.d.ts

```ts
import type { JsonValue } from './manifest.js';
export type PluginStorageReadKey = string | {
    key: string;
    pluginId?: string;
};
export type PluginStorageWriteKey = string | {
    key: string;
    pluginId?: string;
    /** Omitted preserves the existing policy; new keys are private. Empty array revokes sharing. */
    readableBy?: '*' | string[];
};
/** JSON storage. Structured keys and shared reads require a supporting desktop Host. */
export interface PluginStorageAPI {
    /** Missing local keys return null. Unauthorized shared reads reject. */
    get<T extends JsonValue = JsonValue>(key: PluginStorageReadKey): Promise<T | null>;
    set(key: PluginStorageWriteKey, value: JsonValue): Promise<void>;
    delete(key: PluginStorageReadKey): Promise<void>;
}
```

:::

## 网络与权限类型

::: details http.d.ts

```ts
import type { CredentialRef, OperationContext, PluginContext } from './index.js';
export type QueryValue = string | number | boolean | null | undefined;
export interface HttpResponse<T> {
    status: number;
    headers: Record<string, string>;
    data: T;
}
export interface HttpRequestOptions {
    operation: OperationContext;
    permissionKey?: string;
    query?: Record<string, QueryValue | QueryValue[]>;
    headers?: Record<string, string>;
    method?: string;
    json?: unknown;
    form?: Record<string, QueryValue>;
    body?: string;
    credential?: CredentialRef;
    timeoutMs?: number;
    /** Default: true. Set false to inspect non-2xx platform responses yourself. */
    throwHttpErrors?: boolean;
}
export interface HttpClientOptions {
    baseURL?: string;
    headers?: Record<string, string>;
    permissionKey?: string | ((url: URL) => string);
    /** Prompt only when a permission is in the prompt state. Never bypass a denial. */
    requestPermission?: boolean;
}
export declare class HttpError<T = unknown> extends Error {
    readonly response: HttpResponse<T>;
    readonly origin: string;
    readonly name = "HttpError";
    constructor(response: HttpResponse<T>, origin: string);
    get status(): number;
}
export declare function networkPermissionKey(origin: string): string;
/** Typed convenience layer over the Host broker. Does not use fetch or grant permissions. */
export declare function createHttpClient(ctx: {
    http: Pick<PluginContext['http'], 'request'>;
    permissions: Pick<PluginContext['permissions'], 'query' | 'request'>;
}, options: HttpClientOptions): {
    request: <T = unknown>(address: string, input: HttpRequestOptions) => Promise<HttpResponse<T>>;
    authorize: (key: string, _origin: string, operation: OperationContext) => Promise<void>;
    get<T = unknown>(address: string, input: Omit<HttpRequestOptions, "method">): Promise<T>;
    post<T = unknown>(address: string, input: Omit<HttpRequestOptions, "method">): Promise<T>;
};
```

:::

::: details sockets.d.ts

```ts
import type { Disposable, JsonValue } from './manifest.js';
import type { OperationContext } from './index.js';
export interface SocketConnectOptions {
    /** Defaults to network.socket. */
    permissionKey?: string;
    operation: OperationContext;
    /** wss:// for native WebSocket; https:// for Socket.IO. */
    url: string;
    kind: 'websocket' | 'socket.io';
    path?: string;
    auth?: Record<string, JsonValue>;
    /** Socket.IO reconnects at most five times. Native WebSocket does not auto-reconnect. */
    reconnection?: boolean;
}
export interface HostSocket {
    readonly id: string;
    /** Incoming Socket.IO payloads are arrays of event arguments. WebSocket messages are text. */
    on<T extends JsonValue = JsonValue>(event: string, handler: (data: T) => void): Disposable;
    emit(event: string, data: JsonValue): Promise<void>;
    send(data: JsonValue): Promise<void>;
    disconnect(): Promise<void>;
}
export interface SocketAPI {
    connect(options: SocketConnectOptions): Promise<HostSocket>;
}
```

:::

::: details permissions.d.ts

```ts
import type { JsonObject } from './manifest.js';
import type { PermissionName } from './catalog.js';
import type { PermissionStatus, UserIntentHandle } from './index.js';
/** Permission groups are user-facing decisions, not one prompt per method. */
export declare const PERMISSION_GROUPS: {
    readonly network: {
        readonly title: "访问公网服务";
        readonly permissions: readonly ["network.request", "network.socket"];
    };
    readonly localNetwork: {
        readonly title: "访问局域网与本机服务";
        readonly permissions: readonly ["network.private", "network.discovery"];
    };
    readonly account: {
        readonly title: "读取登录状态与基本账号资料";
        readonly permissions: readonly ["account.profile"];
    };
    readonly libraryRead: {
        readonly title: "读取歌单与收藏";
        readonly permissions: readonly ["library.read"];
    };
    readonly libraryManage: {
        readonly title: "创建和修改歌单与收藏";
        readonly permissions: readonly ["library.write"];
    };
    readonly libraryDelete: {
        readonly title: "删除歌单与歌曲记录";
        readonly permissions: readonly ["library.delete"];
    };
    readonly playbackRead: {
        readonly title: "读取播放状态和队列";
        readonly permissions: readonly ["player.read"];
    };
    readonly playbackControl: {
        readonly title: "控制播放和播放队列";
        readonly permissions: readonly ["player.control", "playback.fallback.hold"];
    };
    readonly downloads: {
        readonly title: "管理下载任务";
        readonly permissions: readonly ["downloads.create", "downloads.manage"];
    };
    readonly files: {
        readonly title: "使用用户选定的文件";
        readonly permissions: readonly ["files.read", "files.write"];
    };
    readonly localMusic: {
        readonly title: "索引本地音乐和编辑标签";
        readonly permissions: readonly ["localMusic.read", "localMusic.write"];
    };
    readonly clipboardRead: {
        readonly title: "读取剪贴板";
        readonly permissions: readonly ["clipboard.read"];
    };
    readonly clipboardWrite: {
        readonly title: "写入剪贴板";
        readonly permissions: readonly ["clipboard.write"];
    };
    readonly notifications: {
        readonly title: "发送系统通知";
        readonly permissions: readonly ["notifications.system"];
    };
    readonly external: {
        readonly title: "在系统浏览器打开链接";
        readonly permissions: readonly ["external.open"];
    };
    readonly settingsRead: {
        readonly title: "读取软件偏好";
        readonly permissions: readonly ["settings.read"];
    };
    readonly settingsWrite: {
        readonly title: "修改软件偏好";
        readonly permissions: readonly ["settings.write"];
    };
    readonly window: {
        readonly title: "控制软件窗口";
        readonly permissions: readonly ["window.control"];
    };
    readonly hotkeys: {
        readonly title: "注册全局快捷键";
        readonly permissions: readonly ["hotkeys.register"];
    };
    readonly sharing: {
        readonly title: "发布和撤销分享";
        readonly permissions: readonly ["sharing.publish", "sharing.revoke"];
    };
    readonly roomsRead: {
        readonly title: "读取一起听房间状态";
        readonly permissions: readonly ["rooms.read"];
    };
    readonly roomsControl: {
        readonly title: "加入房间和控制一起听";
        readonly permissions: readonly ["rooms.control"];
    };
    readonly ai: {
        readonly title: "使用软件 AI 服务";
        readonly permissions: readonly ["ai.use"];
    };
    readonly devices: {
        readonly title: "控制音频设备与投放";
        readonly permissions: readonly ["devices.control"];
    };
    readonly uiAppearance: {
        readonly title: "修改软件全局外观";
        readonly permissions: readonly ["ui.styles.global"];
    };
    readonly background: {
        readonly title: "后台任务";
        readonly permissions: readonly ["background.run"];
    };
    readonly credentials: {
        readonly title: "使用本插件已保存的连接凭据";
        readonly permissions: readonly ["credentials.use"];
    };
    readonly credentialExport: {
        readonly title: "读取本插件连接凭据明文";
        readonly permissions: readonly ["credentials.read"];
    };
    readonly guestPlugins: {
        readonly title: "安装和运行兼容子插件";
        readonly permissions: readonly ["guests.manage", "guests.run"];
    };
    readonly services: {
        readonly title: "调用其他插件提供的服务";
        readonly permissions: readonly ["services.consume"];
    };
};
export type PermissionGroup = keyof typeof PERMISSION_GROUPS;
export declare function permissionGroup(name: PermissionName): PermissionGroup | undefined;
export interface PermissionGrant {
    key: string;
    name: PermissionName;
    group?: PermissionGroup;
    scope: JsonObject;
    status: PermissionStatus;
    expiresAt?: number;
}
export interface PermissionGroupRequest {
    group: PermissionGroup;
    /** Omit to request all statically scoped declarations in this group. */
    keys?: string[];
    /** Dynamic scopes keyed by declared permission key. */
    scopes?: Record<string, JsonObject>;
    intent?: UserIntentHandle;
}
export interface PermissionGroupResult {
    group: PermissionGroup;
    status: PermissionStatus;
    grants: PermissionGrant[];
}
```

:::

## 歌词与音质类型

::: details music.d.ts

```ts
import type { ContentEntity, ResourceRef, ResolveResult } from './index.js';
/** Milliseconds throughout. Platform-specific formats/decryption stay inside the plugin. */
export interface LyricWord {
    romanization?: string;
    startTimeMs: number;
    endTimeMs: number;
    text: string;
}
export interface LyricLine {
    isBackground?: boolean;
    isDuet?: boolean;
    startTimeMs: number;
    endTimeMs?: number;
    text: string;
    translation?: string;
    romanization?: string;
    words?: LyricWord[];
}
export interface CrLyric {
    format: 'crlyric';
    version: 1;
    track: ResourceRef;
    offsetMs: number;
    lines: LyricLine[];
    /** Untimed lyrics only. Empty lines + no plainText means no available lyrics. */
    plainText?: string;
}
/** @deprecated Use CrLyric. */
export type LyricsDocument = CrLyric;
export interface TrackMetadata {
    artists: string[];
    album?: {
        id?: string;
        title: string;
    };
    qualities?: string[];
    artworkUrl?: string;
    durationMs?: number;
}
export interface MusicTrack extends ContentEntity {
    ref: ResourceRef & {
        kind: 'track';
    };
    metadata: TrackMetadata;
}
export interface PlaylistMetadata {
    trackCount?: number;
    description?: string;
    author?: string;
    artworkUrl?: string;
}
export interface ChartMetadata {
    updateFrequency?: string;
    artworkUrl?: string;
}
export interface MusicPlaylist extends ContentEntity {
    ref: ResourceRef & {
        kind: 'playlist';
    };
    playlist?: PlaylistMetadata;
}
export interface MusicChart extends ContentEntity {
    ref: ResourceRef & {
        kind: 'chart';
    };
    chart?: ChartMetadata;
}
export declare function assertResourceRef(value: unknown): asserts value is ResourceRef;
export declare function assertContentPage(value: unknown): void;
export declare function assertResolveResult(value: unknown): asserts value is ResolveResult;
export declare function assertLyricsDocument(value: unknown): asserts value is LyricsDocument;
```

:::

::: details lyrics.d.ts

```ts
import type { CrLyric } from './music.js';
import type { ResourceRef, OperationContext } from './index.js';
export type LyricInputFormat = 'auto' | 'lrc' | 'enhanced-lrc' | 'yrc' | 'qrc' | 'krc' | 'ttml' | 'plain';
export type LyricExportFormat = 'lrc' | 'enhanced-lrc' | 'yrc';
export interface LyricParseRequest {
    track: ResourceRef;
    format: LyricInputFormat;
    text: string;
    translation?: string;
    romanization?: string;
}
export interface LyricExportRequest {
    document: CrLyric;
    format: LyricExportFormat;
}
export interface LyricExportResult {
    format: LyricExportFormat;
    text: string;
    mime: 'text/plain';
    extension: 'lrc' | 'yrc';
}
/** Parsing/decryption/serialization belongs to plugins, not the player or download manager. */
export interface LyricConverter {
    parse(request: LyricParseRequest, operation: OperationContext): Promise<CrLyric>;
    export(request: LyricExportRequest, operation: OperationContext): Promise<LyricExportResult>;
}
```

:::

::: details quality.d.ts

```ts
/** Manifest order is authoritative: first is lowest, last is highest. */
export declare function compareQualities(order: readonly string[], a: string, b: string): -1 | 0 | 1 | undefined;
export declare function selectQuality(order: readonly string[], available?: readonly string[], requested?: string): string | undefined;
```

:::

## Guest 与分享类型

::: details guests.d.ts

```ts
import type { Disposable, JsonValue } from './manifest.js';
import type { OperationContext } from './index.js';
export interface GuestProvider {
    id: string;
    name: string;
    /** Lowest to highest, as declared by the imported script. */
    qualities: string[];
    protocols: string[];
}
export interface GuestInfo {
    id: string;
    adapterId: string;
    name: string;
    version: string;
    author?: string;
    state: 'ready' | 'stopped' | 'error';
    selected: boolean;
    providers: GuestProvider[];
    error?: string;
}
/** Requires a Host with Guest management support; the SDK does not install Guest runtimes. */
export interface GuestAPI {
    list(): Promise<GuestInfo[]>;
    /** The Host owns file selection and approval. Cancellation returns null. */
    import(adapterId: string): Promise<GuestInfo | null>;
    select(guestId: string | null): Promise<void>;
    remove(guestId: string): Promise<void>;
    invoke(guestId: string, method: string, input: JsonValue, operation: OperationContext): Promise<JsonValue>;
}
export interface GuestBootstrapAPI {
    readonly scriptInfo: Readonly<{
        name: string;
        version: string;
        author?: string;
        description?: string;
        homepage?: string;
        rawScript: string;
    }>;
    ready(metadata: {
        providers: GuestProvider[];
    }): void;
    handle(handler: (method: string, input: JsonValue, operation: OperationContext) => Promise<JsonValue>): Disposable;
    invokeHost(method: string, input: JsonValue): Promise<JsonValue>;
}
```

:::

::: details share.d.ts

```ts
import type { JsonObject, MaybePromise } from './manifest.js';
export interface ShareMusicInfo {
    songmid?: string | number;
    hash?: string;
    id?: string | number;
    [key: string]: unknown;
}
/** Context supplied by the separate share-resolver Host, not the desktop PluginContext. */
export interface ShareResolverContext<Config = JsonObject> {
    config: Readonly<Config>;
    plugin: {
        name: string;
        version: string;
        author?: string;
    };
    sources: Record<string, {
        name: string;
        qualitys: string[];
    }>;
    request<T = unknown>(url: string, options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        timeout?: number;
    }): Promise<{
        body: T;
        statusCode: number;
        headers: Record<string, string>;
    }>;
    /** Only available when the manifest declares a selected Guest adapter. */
    guest?: {
        name: string;
        version: string;
        author?: string;
        rawScript: string;
    };
    runGuest?(bindings: Record<string, unknown>): void;
    utils: {
        buffer: {
            from(data: unknown, encoding?: 'base64' | 'hex' | 'utf8'): Uint8Array;
            bufToString(data: Uint8Array, encoding?: 'base64' | 'hex' | 'utf8'): string;
        };
        crypto: {
            md5(value: string): string;
            randomBytes(size: number): Uint8Array;
            aesEncrypt(data: unknown, mode: string, key: unknown, iv?: unknown): Uint8Array;
            rsaEncrypt(data: string, key: string): string;
        };
    };
}
export interface ShareResolver {
    musicUrl(source: string, musicInfo: ShareMusicInfo, quality: string): Promise<string>;
}
export type ShareResolverEntry<Config = JsonObject> = (context: ShareResolverContext<Config>) => MaybePromise<ShareResolver>;
```

:::

## 资源目录

::: details catalog.d.ts

```ts
/** Stable names for Host-provided resources. Platform names identify icons, not mandatory providers. */
export declare const HOST_ICON_NAMES: readonly ["platform.tx", "platform.kg", "platform.kw", "platform.wy", "platform.mg", "platform.local", "platform.all", "search", "music-note", "library", "cloud", "server", "import", "chart", "settings", "play", "pause", "download", "share", "account", "heart", "refresh", "close", "add", "info"];
export type HostIconName = (typeof HOST_ICON_NAMES)[number];
export declare const HOST_ASSET_NAMES: readonly ["app.logo", "placeholder.cover", "placeholder.avatar"];
export type HostAssetName = (typeof HOST_ASSET_NAMES)[number];
export declare const PERMISSION_NAMES: readonly ["account.profile", "downloads.manage", "localMusic.read", "localMusic.write", "settings.read", "settings.write", "window.control", "hotkeys.register", "rooms.read", "rooms.control", "ai.use", "devices.control", "ui.styles.global", "network.request", "network.socket", "network.private", "network.discovery", "credentials.use", "credentials.read", "library.read", "library.write", "library.delete", "player.read", "player.control", "playback.fallback.hold", "files.read", "files.write", "downloads.create", "clipboard.read", "clipboard.write", "notifications.system", "external.open", "background.run", "services.consume", "sharing.publish", "sharing.revoke", "guests.manage", "guests.run"];
export type PermissionName = (typeof PERMISSION_NAMES)[number];
/** Runtime modules available to hand-written plugins without bundling. */
export declare const HOST_MODULE_NAMES: readonly ["ceru", "@ceru/http", "@ceru/ui", "@ceru/socket", "@ceru/library", "@ceru/account", "@ceru/player", "@ceru/tools", "@ceru/crypto", "@ceru/compression", "@ceru/encoding", "@ceru/legacy-http", "lodash"];
export type HostModuleName = (typeof HOST_MODULE_NAMES)[number];
export declare const LODASH_METHODS: readonly ["chunk", "compact", "concat", "difference", "drop", "dropRight", "flatten", "flattenDeep", "head", "last", "intersection", "uniq", "uniqBy", "union", "zip", "take", "takeRight", "groupBy", "keyBy", "countBy", "orderBy", "sortBy", "partition", "shuffle", "sample", "map", "filter", "find", "some", "every", "reduce", "includes", "get", "has", "pick", "omit", "mapKeys", "mapValues", "cloneDeep", "isEqual", "isEmpty", "isNil", "isString", "isNumber", "isArray", "isPlainObject", "camelCase", "kebabCase", "snakeCase", "startCase", "capitalize", "escape", "unescape", "trim", "truncate", "debounce", "throttle", "once", "memoize", "clamp", "range", "sum", "sumBy", "round"];
/** 引用宿主图标；例如 hostIcon('platform.tx')，不内嵌图片。 */
export declare function hostIcon(name: HostIconName): {
    kind: 'host';
    name: HostIconName;
};
```

:::

## 工具与模块类型

::: details modules.d.ts

```ts
import type { PluginContext, HostLodash } from './index.js';
export interface BuiltinModules {
    ceru: PluginContext;
    '@ceru/http': PluginContext['http'];
    '@ceru/ui': PluginContext['ui'];
    '@ceru/socket': PluginContext['sockets'];
    '@ceru/library': PluginContext['library'];
    '@ceru/account': PluginContext['account'];
    '@ceru/player': PluginContext['player'];
    '@ceru/tools': PluginContext['utils'];
    lodash: HostLodash;
    '@ceru/crypto': typeof import('./compat/crypto.js');
    '@ceru/compression': typeof import('./compat/zlib.js');
    '@ceru/encoding': typeof import('./compat/encoding.js');
    '@ceru/legacy-http': typeof import('./legacy-http.js');
}
export interface PluginModules {
    require<K extends keyof BuiltinModules>(name: K): BuiltinModules[K];
}
```

:::

::: details host-library.d.ts

```ts
import type { LibraryAPI, LibraryPlaylist, PlaylistImportRequest, PlaylistLocation, PlaylistReference } from './library.js';
import type { ContentEntity, OperationContext, Page } from './index.js';
/** Bind these functions to existing app services. No database, account or UI is created here. */
export interface HostLibraryServices {
    authorize(permissionKey: string, capability: 'library.read' | 'library.write', operation: OperationContext, target?: PlaylistReference): Promise<void>;
    chooseTarget(suggestedName: string | undefined, operation: OperationContext): Promise<PlaylistReference | null>;
    list(location: PlaylistLocation | undefined, cursor: string | undefined, operation: OperationContext): Promise<Page<LibraryPlaylist>>;
    getTracks(target: PlaylistReference, cursor: string | undefined, operation: OperationContext): Promise<Page<ContentEntity>>;
    /** Existing local/cloud service must deduplicate requestId per plugin/user/target. */
    append(input: PlaylistImportRequest & {
        target: PlaylistReference;
    }): Promise<{
        added: number;
        skipped: number;
    }>;
    /** Notify the existing store/event bus only after persistence succeeds. */
    changed(target: PlaylistReference): void;
}
/** Core-side validation/delegation. Pass only a Host-authenticated OperationContext. */
export declare function createHostLibraryBridge(services: HostLibraryServices): LibraryAPI;
```

:::

::: details host-modules.d.cts

```ts
declare module 'ceru' {
  const core: import('./index.js').PluginContext
  export = core
}
declare module '@ceru/http' {
  const http: import('./index.js').PluginContext['http']
  export = http
}
declare module '@ceru/ui' {
  const ui: import('./index.js').PluginContext['ui']
  export = ui
}
declare module '@ceru/socket' {
  const sockets: import('./index.js').PluginContext['sockets']
  export = sockets
}
declare module '@ceru/library' {
  const library: import('./index.js').PluginContext['library']
  export = library
}
declare module '@ceru/account' {
  const account: import('./index.js').PluginContext['account']
  export = account
}
declare module '@ceru/player' {
  const player: import('./index.js').PluginContext['player']
  export = player
}
declare module '@ceru/tools' {
  const tools: import('./index.js').PluginContext['utils']
  export = tools
}
declare module '@ceru/crypto' {
  const crypto: typeof import('./compat/crypto.js')
  export = crypto
}
declare module '@ceru/compression' {
  const compression: typeof import('./compat/zlib.js')
  export = compression
}
declare module '@ceru/encoding' {
  const encoding: typeof import('./compat/encoding.js')
  export = encoding
}
declare module '@ceru/legacy-http' {
  export const createLegacyHttpBridge: typeof import('./legacy-http.js').createLegacyHttpBridge
}
```

:::

::: details legacy-http.d.ts

```ts
import type { OperationContext, PluginContext } from './index.js';
export interface LegacyOptions {
    method?: string;
    headers?: Record<string, unknown>;
    form?: Record<string, unknown>;
    body?: unknown;
    [key: string]: unknown;
}
export declare function createLegacyHttpBridge(host: PluginContext): {
    httpFetch: (address: string, options?: LegacyOptions) => {
        promise: Promise<{
            body: any;
            statusCode: number;
            headers: {
                location?: string | undefined;
            };
            raw: import("./manifest.js").JsonValue;
            url: string;
        }>;
        cancelHttp(): void;
    };
    withOperation: <T>(operation: OperationContext, work: () => Promise<T>) => Promise<T>;
    ensurePermission: (key: string, _origin: string, operation: OperationContext) => Promise<void>;
    permissionKey: () => string;
};
```

:::

::: details compat/crypto.d.ts

```ts
export function createHash(name: any): {
    update(value: any): /*elided*/ any;
    /** @returns {string | Buffer} */
    digest(encoding: any): string | Buffer;
};
/** @returns {Buffer} */
export function publicEncrypt(options: any, value: any): Buffer;
export function createCipheriv(mode: any, key: any, iv: any): {
    /** @returns {Buffer} */
    update(value: any): Buffer;
    /** @returns {Buffer} */
    final(): Buffer;
};
export function createDecipheriv(mode: any, key: any, iv: any): {
    /** @returns {Buffer} */
    update(value: any): Buffer;
    /** @returns {Buffer} */
    final(): Buffer;
};
export function randomBytes(size: any): Buffer;
export function randomUUID(): `${string}-${string}-${string}-${string}-${string}`;
export namespace constants {
    let RSA_NO_PADDING: number;
}
declare namespace _default {
    export { createHash };
    export { createCipheriv };
    export { createDecipheriv };
    export { publicEncrypt };
    export { randomBytes };
    export { randomUUID };
    export { constants };
}
export default _default;
import { Buffer } from 'buffer';
```

:::

::: details compat/encoding.d.ts

```ts
declare namespace _default {
    function decode(bytes: any, encoding: any): string;
}
export default _default;
```

:::

::: details compat/zlib.d.ts

```ts
export function inflate(input: any, callback: any): void;
export function unzipSync(input: any): Buffer;
declare namespace _default {
    export { unzipSync };
    export { inflate };
}
export default _default;
import { Buffer } from 'buffer';
```

:::

::: details compat/format.d.ts

```ts
export function decodeName(value: any): string;
export function formatPlayTime(seconds: any): string;
export function sizeFormate(size: any): string;
export function formatPlayCount(value: any): string;
export function dateFormat(value: any): string;
export function dateFormat2(value: any): string;
export function formatNumberToChineseSimple(value: any): string;
export function formatMinutesFlexible(seconds: any): string;
```

:::

## 发行库类型

用于作者后端和构建工具，不是插件沙箱服务。

::: details @shiqianjiang/ceru-plugin-issuer

```ts
import { type Writable } from 'node:stream';
import type { JsonObject, JsonValue, PluginManifest } from '@shiqianjiang/ceru-plugin-sdk/manifest';
export declare const FORMAT_VERSION = 2;
export declare const LIMITS: {
    file: number;
    header: number;
    delivery: number;
    resources: number;
    nodes: number;
};
export type Resource = {
    type: 'json';
    value: JsonValue;
} | {
    type: 'text';
    value: string;
    mime?: string;
} | {
    type: 'base64';
    value: string;
    mime: string;
};
export interface Proof {
    mode: 'single@1' | 'template@1' | 'delivery@1';
    algorithm: 'ed25519';
    keyId: string;
    publicKey: string;
    value: string;
}
export interface TemplateDeclaration {
    codeDigest: string;
    personalizationSchema: JsonObject;
    issuerKeys: string[];
}
export interface Delivery {
    payload: JsonObject;
    signature: Proof;
}
export interface ArtifactHeader {
    formatVersion: 2;
    syntax: 'js';
    manifest: PluginManifest;
    signature: Proof | null;
    template?: TemplateDeclaration;
    delivery?: Delivery;
}
export interface Artifact {
    header: ArtifactHeader;
    body: string;
    modules: Record<string, string>;
    resources: Record<string, Resource>;
    codeDigest: string;
    templateDigest?: string;
    signatureStatus: 'unsigned' | 'verified-untrusted' | 'verified-trusted';
    sourceFormat: 'exports-v2' | 'ceru-plugin-define-v2';
    migrationWarnings: string[];
}
export interface ValidationOptions {
    trustedPublicKeys?: string[];
    now?: Date;
    requireUnexpiredActivation?: boolean;
}
export declare function canonical(value: unknown): string;
export declare function parseJsonStrict(text: string): any;
export declare const MANIFEST_SCHEMA: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
};
export declare function validateManifest(value: unknown): asserts value is PluginManifest;
export declare function digest(input: string | Uint8Array): string;
export declare function generateSigningKeys(): {
    publicKey: string;
    privateKey: string;
};
export declare function encodeHeader(header: ArtifactHeader): Buffer;
export declare function encodeArtifact(header: ArtifactHeader, body: string): Buffer;
/** Resolves signed delivery configuration over the defaults embedded at build time. */
export declare function resolveArtifactConfig(header: ArtifactHeader): JsonObject;
/** Returns customer-facing metadata without changing plugin identity or permissions. */
export declare function resolveArtifactDisplay(header: ArtifactHeader): {
    name: string;
    description?: string;
    author?: string;
};
export declare const DEFAULT_PERSONALIZATION_SCHEMA: JsonObject;
/** Creates the default delivery policy from a plugin's build-time config shape. */
export declare function createPersonalizationSchema(config?: JsonObject): JsonObject;
export declare function readArtifact(input: Uint8Array | string, options?: ValidationOptions): Artifact;
export declare function signArtifact(input: Uint8Array, privateKey: string): Buffer;
export declare function createTemplate(input: Uint8Array, options: {
    privateKey: string;
    issuerPublicKeys: string[];
    personalizationSchema?: JsonObject;
}): Buffer;
/** Prepare once per core/key; issue() copies a file, writeTo() streams the shared core without rehashing it. */
export declare class PreparedIssuer {
    #private;
    readonly templateDigest: string;
    constructor(input: Uint8Array, options: {
        issuerPrivateKey: string;
        trustedPublicKeys?: string[];
    });
    issue(personalization: JsonObject, options?: {
        deliveryId?: string;
        now?: Date;
    }): Buffer;
    writeTo(destination: Writable, personalization: JsonObject, options?: {
        deliveryId?: string;
        now?: Date;
    }): Promise<void>;
}
```

:::

类型与源码：[官方工具链仓库](https://github.com/CeruMusic/CeruMusic-Plugin-Cli)。声明保留原包 MIT 许可，见 [LICENSE](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/main/LICENSE)。
