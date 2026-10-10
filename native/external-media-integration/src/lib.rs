#![deny(missing_docs)]

//! CeruMusic 原生外部媒体集成模块。
//!
//! 把播放信息同步到系统媒体控件（Windows SMTC / Linux MPRIS / macOS
//! NowPlayingInfoCenter），并把系统按键事件回传 Electron。
//!
//! 实现参照 SPlayer 的 `native/external-media-integration`：
//!   * Windows 用 WinRT `Windows.Media.Playback` + `SystemMediaTransportControls`，
//!     封面以**内存字节流**交给系统（`RandomAccessStreamReference`），
//!     因此拿到的是原图分辨率，不会被缩略图 URL 压缩。
//!   * Linux 用 `mpris-server`，macOS 用 `objc2` 调 `MPNowPlayingInfoCenter`。
//!
//! # JS 侧用法
//!
//! ```js
//! const emi = require('external-media-integration.node')
//! emi.initialize(logDir)
//! emi.registerEventHandler((event) => { /* event.type === 'NextSong' ... */ })
//! emi.enableSystemMedia()
//! emi.updateMetadata({ songName, authorName, albumName, coverData, ... })
//! ```

use napi::Result;
use napi_derive::napi;
mod logger;
mod model;
mod sys_media;

use model::{
    MetadataParam, MetadataPayload, PlayModeParam, PlayModePayload, PlayStateParam,
    PlayStatePayload, SystemMediaEvent, TimelineParam, TimelinePayload,
};

/// 初始化插件。
///
/// ### 参数
///
/// * `log_dir` —— 日志文件目录。
///
/// ### 备注
///
/// 其它 API 调用失败时只打日志、静默失败，不会抛错打断播放。
#[napi]
pub fn initialize(log_dir: String) -> Result<()> {
    logger::init(&log_dir).map_err(|e| napi::Error::from_reason(e.to_string()))?;

    sys_media::get_platform_controls()
        .initialize()
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(())
}

/// 关闭插件，清理资源。
#[napi]
pub fn shutdown() {
    let _ = sys_media::get_platform_controls().shutdown();
}

/// 启用媒体控件。
#[napi]
pub fn enable_system_media() -> Result<()> {
    sys_media::get_platform_controls()
        .enable()
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 禁用媒体控件。
#[napi]
pub fn disable_system_media() -> Result<()> {
    sys_media::get_platform_controls()
        .disable()
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 注册媒体控件事件回调（上一首 / 下一首 / 播放 / 暂停 / 跳转 / 速率 …）。
///
/// ### 参数
///
/// `callback: (event: SystemMediaEvent) => void`
///
/// ### 备注
///
/// 这里直接收 `ThreadsafeFunction` 而不是自己 `create` —— napi-rs 会在参数
/// 绑定阶段就建立**持久引用**（napi_ref），保证回调在整个进程生命周期内
/// 不会被 GC 回收。自己用 `JsFunction::create_threadsafe_function` 拿到的
/// 只是一个临时引用，函数返回后 JS 函数就可能被回收，表现为
/// 「Rust 侧 `.call()` 返回 Ok，但 JS 回调永不执行」。
#[napi(ts_args_type = "callback: (arg: SystemMediaEvent) => void")]
#[allow(clippy::needless_pass_by_value)]
pub fn register_event_handler(callback: sys_media::SystemMediaThreadsafeFunction) -> Result<()> {
    sys_media::get_platform_controls()
        .register_event_handler(callback)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(())
}

/// 更新歌曲元数据。
///
/// `cover_data` 传原始图片字节（PNG/JPEG）即可，不要传 URL ——
/// 传字节正是高清封面能生效的前提。
#[napi(ts_args_type = "payload: MetadataParam")]
pub fn update_metadata(payload: MetadataParam) {
    sys_media::get_platform_controls().update_metadata(MetadataPayload::from(payload));
}

/// 【排障用】直接触发一次事件派发，绕开 WinRT 按钮。
///
/// 用来区分「回调链路坏了」还是「系统按钮没路由过来」：
/// 调用它会走与真实按键**完全相同**的 dispatch 路径。
#[napi]
pub fn debug_dispatch_event(event_type: String) {
    let ty = match event_type.as_str() {
        "Play" => model::SystemMediaEventType::Play,
        "Pause" => model::SystemMediaEventType::Pause,
        "Stop" => model::SystemMediaEventType::Stop,
        "NextSong" => model::SystemMediaEventType::NextSong,
        "PreviousSong" => model::SystemMediaEventType::PreviousSong,
        _ => model::SystemMediaEventType::Play,
    };
    sys_media::debug_dispatch(SystemMediaEvent::new(ty));
}

/// 更新播放状态（播放 / 暂停）。
#[napi(ts_args_type = "payload: PlayStateParam")]
pub fn update_playback_status(payload: PlayStateParam) {
    sys_media::get_platform_controls().update_playback_status(PlayStatePayload::from(payload));
}

/// 更新播放速率。
#[napi]
pub fn update_playback_rate(rate: f64) {
    sys_media::get_platform_controls().update_playback_rate(rate);
}

/// 更新音量。
#[napi]
pub fn update_volume(volume: f64) {
    sys_media::get_platform_controls().update_volume(volume);
}

/// 更新进度条，`current_time` / `total_time` 单位均为**毫秒**。
#[napi(ts_args_type = "payload: TimelineParam")]
pub fn update_timeline(payload: TimelineParam) {
    sys_media::get_platform_controls().update_timeline(TimelinePayload::from(payload));
}

/// 更新播放模式（循环 / 随机）。
#[napi(ts_args_type = "payload: PlayModeParam")]
pub fn update_play_mode(payload: PlayModeParam) {
    sys_media::get_platform_controls().update_play_mode(PlayModePayload::from(payload));
}
