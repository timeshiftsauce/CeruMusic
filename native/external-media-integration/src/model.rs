//! JS <-> Rust 之间的数据契约。
//!
//! 结构大致照搬 SPlayer 的 `native/external-media-integration/src/model.rs`，
//! 仅做两处适配：
//!   1. 去掉 Discord RPC 相关的 payload（CeruMusic 暂不需要）。
//!   2. 封面统一走 `cover_data`（原始字节），避免 Windows 再去下载 URL。
//!
//! 命名注意：napi-rs 的 `#[napi(object)]` 会把 Rust 的 snake_case 字段名原样
//! 暴露给 JS（不自动转 camelCase），所以 JS 侧必须用同样的 snake_case 键名。

use napi_derive::napi;

/// 系统媒体控件回传给 JS 的事件类型。
///
/// 注意：这是**跨线程**传给 JS 的值（经 `ThreadsafeFunction`），所以不能用
/// `#[napi(string_enum)]` —— 它在 threadsafe 路径下拿不到可用的
/// `ToNapiValue`，会让 JS 回调收到 `null`。这里实现 `as_str()` 手动转成字符串。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SystemMediaEventType {
    Play,
    Pause,
    Stop,
    NextSong,
    PreviousSong,
    ToggleShuffle,
    ToggleRepeat,
    SetRate,
    SetVolume,
    /// 绝对位置跳转，`position_ms` 为毫秒。
    Seek,
}

impl SystemMediaEventType {
    /// 转成 JS 侧可直接 switch 的字符串字面量。
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Play => "Play",
            Self::Pause => "Pause",
            Self::Stop => "Stop",
            Self::NextSong => "NextSong",
            Self::PreviousSong => "PreviousSong",
            Self::ToggleShuffle => "ToggleShuffle",
            Self::ToggleRepeat => "ToggleRepeat",
            Self::SetRate => "SetRate",
            Self::SetVolume => "SetVolume",
            Self::Seek => "Seek",
        }
    }
}

/// 系统媒体控件产生的事件。
///
/// 字段全部是基础类型 —— 跨线程传递时 napi 只需构造一个普通对象，
/// 不涉及任何自定义类型的 `ToNapiValue`。
#[napi(object)]
#[derive(Clone, Debug)]
pub struct SystemMediaEvent {
    /// 事件类型字符串（取值见 `SystemMediaEventType::as_str`）。
    #[napi(js_name = "type")]
    pub event_type: String,
    /// 仅 `Seek` 有效：目标位置（毫秒）。
    pub position_ms: Option<f64>,
    /// 仅 `SetRate` 有效。
    pub rate: Option<f64>,
    /// 仅 `SetVolume` 有效。
    pub volume: Option<f64>,
}

impl SystemMediaEvent {
    pub fn new(event_type: SystemMediaEventType) -> Self {
        Self {
            event_type: event_type.as_str().to_string(),
            position_ms: None,
            rate: None,
            volume: None,
        }
    }

    pub fn seek(position_ms: f64) -> Self {
        Self {
            position_ms: Some(position_ms),
            ..Self::new(SystemMediaEventType::Seek)
        }
    }

    pub fn set_rate(rate: f64) -> Self {
        Self {
            rate: Some(rate),
            ..Self::new(SystemMediaEventType::SetRate)
        }
    }

    /// 序列化成 JSON 字符串。
    ///
    /// 跨线程传给 JS 的**唯一可靠形式**是字符串：`#[napi(object)]` 结构体
    /// 经 `ThreadsafeFunction` 传递时，napi 在目标线程构造对象的步骤会失败，
    /// 表现为 JS 回调收到 `null`。字符串没有这个问题。
    pub fn to_json(&self) -> String {
        // 手写序列化，避免为一个字段引入 serde 依赖树。
        let mut out = String::with_capacity(96);
        out.push_str("{\"type\":\"");
        out.push_str(&self.event_type);
        out.push('"');

        if let Some(position_ms) = self.position_ms {
            out.push_str(",\"positionMs\":");
            out.push_str(&position_ms.to_string());
        }
        if let Some(rate) = self.rate {
            out.push_str(",\"rate\":");
            out.push_str(&rate.to_string());
        }
        if let Some(volume) = self.volume {
            out.push_str(",\"volume\":");
            out.push_str(&volume.to_string());
        }

        out.push('}');
        out
    }
}

/// 播放状态。
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum PlaybackStatus {
    Playing,
    Paused,
}

/// 封面字节 + 音源标识。
///
/// `cover_data` 直接给原始图片字节（PNG/JPEG 皆可），Windows 侧会包成
/// `RandomAccessStreamReference` —— 这正是「高清封面」能生效的原因：
/// 不再让系统去拉一个被压缩过的缩略图 URL。
#[derive(Clone)]
pub struct MetadataPayload {
    pub song_name: String,
    pub author_name: String,
    pub album_name: String,
    pub cover_data: Option<Vec<u8>>,
    pub ncm_id: Option<i64>,
    pub duration: Option<f64>,
}

impl std::fmt::Debug for MetadataPayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MetadataPayload")
            .field("song_name", &self.song_name)
            .field("author_name", &self.author_name)
            .field("album_name", &self.album_name)
            .field(
                "cover_data",
                &self.cover_data.as_ref().map(|d| format!("{} bytes", d.len())),
            )
            .field("ncm_id", &self.ncm_id)
            .field("duration", &self.duration)
            .finish()
    }
}

/// JS 侧传入的元数据参数。
///
/// `cover_data` 用 `Buffer` 接收 —— napi-rs 会自动把 JS 的 `Buffer`/`Uint8Array`
/// 映射过来。
///
/// **关于 `Option<Option<T>>`**：napi-rs 的 `Option<T>` 只把 `undefined` 视为
/// None，遇到 JS 的 `null` 会直接报
/// `Failed to convert napi value Null into rust type`。外层 Option 吃掉 `null`，
/// 内层表示真实的可选值，因此 `null` / `undefined` / 缺失 三种写法都能容忍。
#[napi(object)]
pub struct MetadataParam {
    pub song_name: String,
    pub author_name: String,
    pub album_name: String,
    pub cover_data: Option<Option<napi::bindgen_prelude::Buffer>>,
    pub ncm_id: Option<Option<i64>>,
    pub duration: Option<Option<f64>>,
}

impl From<MetadataParam> for MetadataPayload {
    fn from(value: MetadataParam) -> Self {
        Self {
            song_name: value.song_name,
            author_name: value.author_name,
            album_name: value.album_name,
            cover_data: value.cover_data.flatten().map(|b| b.to_vec()),
            ncm_id: value.ncm_id.flatten(),
            duration: value.duration.flatten(),
        }
    }
}

/// 播放状态更新参数。
#[napi(object)]
pub struct PlayStateParam {
    pub status: PlaybackStatus,
}

#[derive(Clone, Debug)]
pub struct PlayStatePayload {
    pub status: PlaybackStatus,
}

impl From<PlayStateParam> for PlayStatePayload {
    fn from(value: PlayStateParam) -> Self {
        Self {
            status: value.status,
        }
    }
}

/// 进度条更新参数，单位毫秒。
#[napi(object)]
#[derive(Clone, Copy, Debug)]
pub struct TimelineParam {
    pub current_time: f64,
    pub total_time: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct TimelinePayload {
    pub current_time: f64,
    pub total_time: f64,
}

impl From<TimelineParam> for TimelinePayload {
    fn from(value: TimelineParam) -> Self {
        Self {
            current_time: value.current_time,
            total_time: value.total_time,
        }
    }
}

/// 循环模式。
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum RepeatMode {
    /// 单曲循环
    Track,
    /// 列表循环
    List,
    /// 不循环
    None,
}

/// 播放模式更新参数。
#[napi(object)]
pub struct PlayModeParam {
    pub repeat_mode: RepeatMode,
    pub is_shuffling: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct PlayModePayload {
    pub repeat_mode: RepeatMode,
    pub is_shuffling: bool,
}
impl From<PlayModeParam> for PlayModePayload {
    fn from(value: PlayModeParam) -> Self {
        Self {
            repeat_mode: value.repeat_mode,
            is_shuffling: value.is_shuffling,
        }
    }
}
