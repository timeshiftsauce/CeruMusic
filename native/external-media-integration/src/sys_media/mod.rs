//! 跨平台媒体控件抽象。
//!
//! 照搬 SPlayer 的 `sys_media/mod.rs` 设计：一个 trait + 每平台一个实现，
//! 各平台实现以 `Box<dyn SystemMediaControls>` 存进 `OnceLock` 单例。

use std::sync::OnceLock;

use anyhow::Result;
use napi::threadsafe_function::ThreadsafeFunction;

use crate::model::{
    MetadataPayload, PlayModePayload, PlayStatePayload, SystemMediaEvent, TimelinePayload,
};

/// 回传事件给 JS 的线程安全函数类型。
///
/// **两个关键点**：
///   1. 传 `String`（JSON）而不是结构体 —— napi 在目标线程把
///      `#[napi(object)]` 结构体转成 JS 对象时会失败。
///   2. 用 [`ErrorStrategy::Fatal`] 而不是默认的 `CalleeHandled` ——
///      后者会给 JS 回调**额外塞一个 error 参数在最前面**（无错误时是
///      `null`），于是 JS 侧读到的第一个参数永远是 `null`，事件在第二个
///      参数里，极易误判为「回调没触发」。
pub type SystemMediaThreadsafeFunction =
    ThreadsafeFunction<String, napi::threadsafe_function::ErrorStrategy::Fatal>;

static CONTROLS: OnceLock<Box<dyn SystemMediaControls>> = OnceLock::new();

/// 跨平台的媒体控制接口。
///
/// 所有方法都要求 `&self`，由内部可变性（`Mutex`/`RwLock`）保证线程安全：
/// napi 会在 libuv 线程池里调用这些方法，而 WinRT 事件回调在别的线程上跑。
pub trait SystemMediaControls: Send + Sync {
    /// 初始化系统集成（建立 COM / D-Bus 连接等）。
    fn initialize(&self) -> Result<()>;

    /// 启用：让系统开始接收按键事件。
    fn enable(&self) -> Result<()>;

    /// 禁用：不再处理系统按键，但保持连接。
    fn disable(&self) -> Result<()>;

    /// 清理资源并关闭。
    fn shutdown(&self) -> Result<()>;

    /// 注册事件回调（系统按键 → JS）。收到的是事件的 JSON 字符串。
    fn register_event_handler(&self, callback: SystemMediaThreadsafeFunction) -> Result<()>;

    /// 更新歌曲元数据（标题、歌手、专辑、封面字节）。
    fn update_metadata(&self, payload: MetadataPayload);

    /// 更新播放状态（播放/暂停）。
    fn update_playback_status(&self, payload: PlayStatePayload);

    /// 更新播放速率。
    fn update_playback_rate(&self, rate: f64);

    /// 更新音量。
    fn update_volume(&self, volume: f64);

    /// 更新进度条，`current`/`total` 单位均为毫秒。
    fn update_timeline(&self, payload: TimelinePayload);

    /// 更新播放模式（循环 / 随机）。
    fn update_play_mode(&self, payload: PlayModePayload);
}

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

#[cfg(target_os = "macos")]
pub mod macos;

/// 取得当前平台的媒体控件单例。
///
/// 首次调用时懒初始化对应平台的实现。
pub fn get_platform_controls() -> &'static dyn SystemMediaControls {
    CONTROLS
        .get_or_init(|| {
            #[cfg(target_os = "windows")]
            {
                Box::new(windows::WindowsImpl::new())
            }

            #[cfg(target_os = "linux")]
            {
                Box::new(linux::LinuxImpl::new())
            }

            #[cfg(target_os = "macos")]
            {
                Box::new(macos::MacosImpl::new())
            }

            #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
            {
                Box::new(NoOpControls)
            }
        })
        .as_ref()
}

/// 【排障用】直接派发一个事件到已注册的回调，不经过平台层。
///
/// 用于区分「回调链路坏了」和「系统按钮没路由过来」。
pub fn debug_dispatch(event: SystemMediaEvent) {
    #[cfg(target_os = "windows")]
    windows::dispatch_event(event);

    #[cfg(not(target_os = "windows"))]
    let _ = event;
}

/// 其它平台（FreeBSD 等）的占位实现，保证 crate 能编过。
#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
struct NoOpControls;

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
impl SystemMediaControls for NoOpControls {
    fn initialize(&self) -> Result<()> {
        Ok(())
    }
    fn enable(&self) -> Result<()> {
        Ok(())
    }
    fn disable(&self) -> Result<()> {
        Ok(())
    }
    fn shutdown(&self) -> Result<()> {
        Ok(())
    }
    fn register_event_handler(&self, _: SystemMediaThreadsafeFunction) -> Result<()> {
        Ok(())
    }
    fn update_metadata(&self, _: MetadataPayload) {}
    fn update_playback_status(&self, _: PlayStatePayload) {}
    fn update_playback_rate(&self, _: f64) {}
    fn update_volume(&self, _: f64) {}
    fn update_timeline(&self, _: TimelinePayload) {}
    fn update_play_mode(&self, _: PlayModePayload) {}
}
