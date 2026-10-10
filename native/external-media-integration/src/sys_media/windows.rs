//! Windows SMTC 集成。
//!
//! 实现思路完全照搬 SPlayer 的 `sys_media/windows.rs`：
//!   * 建一个**内存中的** `MediaPlayer`（不真的放音频），拿它的
//!     `SystemMediaTransportControls` 作为我们自己的 SMTC 会话。
//!   * 封面走 `InMemoryRandomAccessStream` → `RandomAccessStreamReference::CreateFromStream`，
//!     把**原始字节**交给系统 —— 这是清晰度的关键，绕开了缩略图 URL 的二次压缩。
//!   * WinRT 回调在别的线程触发，所以状态放 `Mutex<Option<SmtcContext>>`，
//!     向 JS 派发事件用 `ThreadsafeFunction`。
//!
//! 注意：WinRT 调用需要 COM 已初始化。napi 的模块初始化线程不一定初始化过 COM，
//! 所以 `initialize()` 里显式 `CoInitializeEx`（MTA）。

use std::sync::{Arc, LazyLock, Mutex};

use anyhow::Result;
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use tokio::{runtime::Runtime, task::JoinHandle};
use tracing::{debug, error, info, instrument, warn};
use windows::{
    Foundation::{EventRegistrationToken, TimeSpan, TypedEventHandler},
    Media::{
        MediaPlaybackAutoRepeatMode, MediaPlaybackStatus, MediaPlaybackType, Playback::MediaPlayer,
        PlaybackPositionChangeRequestedEventArgs, PlaybackRateChangeRequestedEventArgs,
        SystemMediaTransportControls, SystemMediaTransportControlsButton,
        SystemMediaTransportControlsButtonPressedEventArgs,
        SystemMediaTransportControlsTimelineProperties,
    },
    Storage::Streams::{DataWriter, InMemoryRandomAccessStream, RandomAccessStreamReference},
    core::HSTRING,
};

use crate::{
    model::{
        MetadataPayload, PlayModePayload, PlayStatePayload, PlaybackStatus, RepeatMode,
        SystemMediaEvent, SystemMediaEventType, TimelinePayload,
    },
    sys_media::{SystemMediaControls, SystemMediaThreadsafeFunction},
};

/// WinRT 时间单位是 100ns。
const HNS_PER_MILLISECOND: f64 = 10_000.0;

/// 少量异步 WinRT 调用需要 runtime 来 `.await`，所以这里自建一个。
static TOKIO_RUNTIME: LazyLock<Runtime> =
    LazyLock::new(|| Runtime::new().expect("创建 Tokio 运行时失败"));

/// 保存事件 token，`shutdown` 时用它反注册。
///
/// windows crate 0.58 起 token 类型是 `EventRegistrationToken` 结构体，
/// 不再是裸 `i64`。
struct SmtcHandlerTokens {
    button_pressed: EventRegistrationToken,
    shuffle_changed: EventRegistrationToken,
    repeat_changed: EventRegistrationToken,
    seek_requested: EventRegistrationToken,
    playback_rate_changed: EventRegistrationToken,
}

struct SmtcContext {
    /// 持有它，`SystemMediaTransportControls` 才不会被回收。
    player: MediaPlayer,
    tokens: SmtcHandlerTokens,
    callback: Option<Arc<SystemMediaThreadsafeFunction>>,
    /// 上一次封面解码任务，用来取消（快速切歌时避免旧封面后到覆盖新封面）。
    cover_task: Option<JoinHandle<()>>,
    is_enabled: bool,
    /// 最近一次的播放状态。
    ///
    /// 存在的意义：`DisplayUpdater::Update()` 会把卡片属性整体刷新一遍，
    /// 某些 Windows 版本会顺带把播放状态重置成 Paused。所以每次更新元数据
    /// 之后都要用这个值重新断言一次。
    current_status: MediaPlaybackStatus,
}

impl SmtcContext {
    fn smtc(&self) -> Result<SystemMediaTransportControls> {
        Ok(self.player.SystemMediaTransportControls()?)
    }

    fn remove_handlers(&self) -> Result<()> {
        let smtc = self.smtc()?;
        smtc.RemoveButtonPressed(self.tokens.button_pressed)?;
        smtc.RemoveShuffleEnabledChangeRequested(self.tokens.shuffle_changed)?;
        smtc.RemoveAutoRepeatModeChangeRequested(self.tokens.repeat_changed)?;
        smtc.RemovePlaybackPositionChangeRequested(self.tokens.seek_requested)?;
        smtc.RemovePlaybackRateChangeRequested(self.tokens.playback_rate_changed)?;
        Ok(())
    }
}

impl Drop for SmtcContext {
    fn drop(&mut self) {
        if let Some(handle) = self.cover_task.take() {
            handle.abort();
        }

        if let Err(e) = self.remove_handlers() {
            warn!("销毁 SmtcContext 时移除处理器失败: {e:?}");
        }

        if let Ok(smtc) = self.smtc() {
            let _ = smtc.SetIsEnabled(false);
        }
    }
}

static SMTC_CONTEXT: LazyLock<Mutex<Option<SmtcContext>>> = LazyLock::new(|| Mutex::new(None));

/// 把事件派发给 JS（非阻塞）。
#[instrument]
pub fn dispatch_event(event: SystemMediaEvent) {
    debug!(type_ = ?event.event_type, "分发 SMTC 事件");

    let maybe_callback: Option<Arc<SystemMediaThreadsafeFunction>> =
        SMTC_CONTEXT.lock().map_or_else(
            |_| {
                error!("SMTC 事件回调锁中毒");
                None
            },
            |guard| guard.as_ref().and_then(|ctx| ctx.callback.clone()),
        );

    if let Some(tsfn) = maybe_callback {
        // Fatal 策略：JS 回调只收一个参数（值为 JSON 字符串），
        // 不会像 CalleeHandled 那样在最前面多塞一个 error 参数。
        let status = tsfn.call(event.to_json(), ThreadsafeFunctionCallMode::NonBlocking);
        if status != napi::Status::Ok {
            error!("调用 JS 回调失败, status: {status:?}");
        } else {
            debug!("事件已投递到 JS 线程池");
        }
    } else {
        warn!("无法分发 SMTC 事件，因为没有注册回调函数");
    }
}

fn with_smtc_ctx<F>(action_name: &str, f: F) -> Result<()>
where
    F: FnOnce(&mut SmtcContext) -> Result<()>,
{
    let mut guard = SMTC_CONTEXT
        .lock()
        .map_err(|e| anyhow::anyhow!("获取 SMTC 锁失败 ({action_name}): {e}"))?;

    guard.as_mut().map_or_else(
        || {
            warn!("尝试执行 {action_name}，但 SMTCContext 未初始化");
            Ok(())
        },
        f,
    )
}

/// 把封面字节包成 WinRT 可消费的内存流引用。
///
/// 这是「高清封面」的落点：系统拿到的是完整原始字节，不做任何 URL 下载与缩放。
async fn get_cover_stream_ref(cover_data: Option<Vec<u8>>) -> Option<RandomAccessStreamReference> {
    let bytes = cover_data?;

    let stream_result: windows::core::Result<RandomAccessStreamReference> = (async {
        let stream = InMemoryRandomAccessStream::new()?;
        let writer = DataWriter::CreateDataWriter(&stream)?;
        writer.WriteBytes(&bytes)?;
        // windows crate 0.58：StoreAsync 返回的 DataWriterStoreOperation
        // 不是 Future，要用 .get() 同步等待完成。
        writer.StoreAsync()?.get()?;
        writer.DetachStream()?;
        stream.Seek(0)?;
        RandomAccessStreamReference::CreateFromStream(&stream)
    })
    .await;

    match stream_result {
        Ok(stream_ref) => Some(stream_ref),
        Err(e) => {
            error!("创建封面内存流失败: {e:?}");
            None
        }
    }
}

#[derive(Debug)]
pub struct WindowsImpl;

impl WindowsImpl {
    pub const fn new() -> Self {
        Self
    }
}

impl SystemMediaControls for WindowsImpl {
    #[instrument]
    #[allow(clippy::too_many_lines)]
    fn initialize(&self) -> Result<()> {
        info!("正在初始化 SMTC...");

        // WinRT 需要 COM。napi 初始化线程未必初始化过，这里显式做 MTA。
        // 已初始化过会返回 RPC_E_CHANGED_MODE / S_FALSE，忽略即可。
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }
        }

        let player = MediaPlayer::new()?;
        let smtc = player.SystemMediaTransportControls()?;

        smtc.SetIsEnabled(false)?;
        smtc.SetIsPlayEnabled(true)?;
        smtc.SetIsPauseEnabled(true)?;
        smtc.SetIsStopEnabled(true)?;
        smtc.SetIsNextEnabled(true)?;
        smtc.SetIsPreviousEnabled(true)?;
        debug!("已启用各个 SMTC 控制能力");

        // 按钮（播放/暂停/停止/上下一首）
        let handler = TypedEventHandler::new(
            move |_sender: &Option<SystemMediaTransportControls>,
                  args: &Option<SystemMediaTransportControlsButtonPressedEventArgs>|
                  -> windows::core::Result<()> {
                if let Some(args) = args.as_ref() {
                    let button = args.Button()?;
                    debug!(?button, "SMTC 按钮被按下");
                    let event = match button {
                        SystemMediaTransportControlsButton::Play => {
                            Some(SystemMediaEvent::new(SystemMediaEventType::Play))
                        }
                        SystemMediaTransportControlsButton::Pause => {
                            Some(SystemMediaEvent::new(SystemMediaEventType::Pause))
                        }
                        SystemMediaTransportControlsButton::Stop => {
                            Some(SystemMediaEvent::new(SystemMediaEventType::Stop))
                        }
                        SystemMediaTransportControlsButton::Next => {
                            Some(SystemMediaEvent::new(SystemMediaEventType::NextSong))
                        }
                        SystemMediaTransportControlsButton::Previous => {
                            Some(SystemMediaEvent::new(SystemMediaEventType::PreviousSong))
                        }
                        _ => None,
                    };
                    if let Some(e) = event {
                        dispatch_event(e);
                    }
                }
                Ok(())
            },
        );
        let button_pressed = smtc.ButtonPressed(&handler)?;

        // 随机播放
        let shuffle_handler = TypedEventHandler::new(move |_, _| {
            debug!("SMTC 请求切换随机播放模式");
            dispatch_event(SystemMediaEvent::new(SystemMediaEventType::ToggleShuffle));
            Ok(())
        });
        let shuffle_changed = smtc.ShuffleEnabledChangeRequested(&shuffle_handler)?;

        // 循环模式
        let repeat_handler = TypedEventHandler::new(move |_, _| {
            debug!("SMTC 请求切换重复播放模式");
            dispatch_event(SystemMediaEvent::new(SystemMediaEventType::ToggleRepeat));
            Ok(())
        });
        let repeat_changed = smtc.AutoRepeatModeChangeRequested(&repeat_handler)?;

        // 进度跳转
        let seek_handler = TypedEventHandler::new(
            move |_: &Option<SystemMediaTransportControls>,
                  args: &Option<PlaybackPositionChangeRequestedEventArgs>|
                  -> windows::core::Result<()> {
                if let Some(args) = args.as_ref() {
                    let position = args.RequestedPlaybackPosition()?;
                    let position_ms = (position.Duration as f64) / HNS_PER_MILLISECOND;
                    debug!(position_ms, "SMTC 请求跳转播放位置");
                    dispatch_event(SystemMediaEvent::seek(position_ms));
                }
                Ok(())
            },
        );
        let seek_requested = smtc.PlaybackPositionChangeRequested(&seek_handler)?;

        // 播放速率
        let playback_rate_handler = TypedEventHandler::new(
            move |_: &Option<SystemMediaTransportControls>,
                  args: &Option<PlaybackRateChangeRequestedEventArgs>|
                  -> windows::core::Result<()> {
                if let Some(args) = args.as_ref() {
                    let rate = args.RequestedPlaybackRate()?;
                    debug!(rate, "SMTC 请求更改播放速率");
                    dispatch_event(SystemMediaEvent::set_rate(rate));
                }
                Ok(())
            },
        );
        let playback_rate_changed = smtc.PlaybackRateChangeRequested(&playback_rate_handler)?;

        debug!("SMTC 事件处理器已全部附加");

        let context = SmtcContext {
            player,
            tokens: SmtcHandlerTokens {
                button_pressed,
                shuffle_changed,
                repeat_changed,
                seek_requested,
                playback_rate_changed,
            },
            callback: None,
            cover_task: None,
            is_enabled: false,
            current_status: MediaPlaybackStatus::Paused,
        };
        if let Ok(mut guard) = SMTC_CONTEXT.lock() {
            *guard = Some(context);
        }

        debug!("SMTC 已初始化");
        Ok(())
    }

    fn enable(&self) -> Result<()> {
        with_smtc_ctx("启用 SMTC", |ctx| {
            ctx.is_enabled = true;
            Ok(ctx.smtc()?.SetIsEnabled(true)?)
        })
    }

    fn disable(&self) -> Result<()> {
        with_smtc_ctx("禁用 SMTC", |ctx| {
            ctx.is_enabled = false;
            Ok(ctx.smtc()?.SetIsEnabled(false)?)
        })
    }

    fn shutdown(&self) -> Result<()> {
        if let Ok(mut guard) = SMTC_CONTEXT.lock() {
            *guard = None;
        }

        debug!("SMTC 已关闭");
        Ok(())
    }

    fn register_event_handler(&self, callback: SystemMediaThreadsafeFunction) -> Result<()> {
        match SMTC_CONTEXT.lock() {
            Ok(mut guard) => {
                if let Some(ctx) = guard.as_mut() {
                    ctx.callback = Some(Arc::new(callback));
                    debug!("SMTC 事件回调已成功注册");
                } else {
                    warn!("尝试注册回调，但 SMTC 未初始化");
                }
            }
            Err(e) => error!("注册回调时锁中毒: {e:?}"),
        }
        Ok(())
    }

    fn update_metadata(&self, payload: MetadataPayload) {
        let Ok(mut guard) = SMTC_CONTEXT.lock() else {
            error!("SmtcContext 锁中毒");
            return;
        };

        let Some(ctx) = guard.as_mut() else {
            return;
        };

        if !ctx.is_enabled {
            return;
        }

        // 取消上一个封面任务，避免旧封面后到把新封面盖掉。
        if let Some(old_handle) = ctx.cover_task.take() {
            old_handle.abort();
        }

        debug!(
            title = %payload.song_name,
            artist = %payload.author_name,
            album = %payload.album_name,
            ncm_id = ?payload.ncm_id,
            "正在更新 SMTC 歌曲元数据"
        );

        let song_name = payload.song_name.clone();
        let author_name = payload.author_name.clone();
        let album_name = payload.album_name.clone();
        let ncm_id = payload.ncm_id;
        let cover_data = payload.cover_data;

        let new_handle = TOKIO_RUNTIME.spawn(async move {
            let thumbnail_stream_ref = get_cover_stream_ref(cover_data).await;

            let result = with_smtc_ctx("更新元数据", |inner_ctx| {
                if !inner_ctx.is_enabled {
                    return Ok(());
                }

                let smtc = inner_ctx.smtc()?;
                let updater = smtc.DisplayUpdater()?;
                updater.SetType(MediaPlaybackType::Music)?;

                let props = updater.MusicProperties()?;
                props.SetTitle(&HSTRING::from(&song_name))?;
                props.SetArtist(&HSTRING::from(&author_name))?;
                props.SetAlbumTitle(&HSTRING::from(&album_name))?;

                let genres_collection = props.Genres()?;
                genres_collection.Clear()?;

                // 注意：let-chains（`if let X = a && b`）只在 Rust 2024 edition 可用，
                // 本 crate 是 2021 edition，故用嵌套 if。
                if let Some(id) = ncm_id {
                    if id > 0 {
                        genres_collection.Append(&HSTRING::from(format!("NCM-{id}")))?;
                    }
                }

                if let Some(stream_ref) = thumbnail_stream_ref.as_ref() {
                    updater.SetThumbnail(stream_ref)?;
                } else {
                    updater.SetThumbnail(None)?;
                    debug!("SMTC 封面已清空");
                }

                updater.Update()?;

                // `updater.Update()` 会整体刷新卡片属性，部分 Windows 版本会
                // 顺带把播放状态重置成 Paused —— 表现为「歌在放，卡片显示暂停」。
                // 这里用最近一次已知状态重新断言一次。
                smtc.SetPlaybackStatus(inner_ctx.current_status)?;

                Ok(())
            });

            if let Err(e) = result {
                error!("更新SMTC元数据失败: {e:?}");
            }
        });

        ctx.cover_task = Some(new_handle);
    }

    fn update_playback_status(&self, payload: PlayStatePayload) {
        let win_status = match payload.status {
            PlaybackStatus::Playing => MediaPlaybackStatus::Playing,
            PlaybackStatus::Paused => MediaPlaybackStatus::Paused,
        };
        debug!(new_status = ?payload.status, "正在更新 SMTC 播放状态");

        // 先记下来 —— 元数据更新后要用它重新断言。
        if let Ok(mut guard) = SMTC_CONTEXT.lock() {
            if let Some(ctx) = guard.as_mut() {
                ctx.current_status = win_status;
            }
        }

        TOKIO_RUNTIME.spawn(async move {
            let result = with_smtc_ctx("更新播放状态", |ctx| {
                if !ctx.is_enabled {
                    return Ok(());
                }
                let smtc = ctx.smtc()?;
                smtc.SetPlaybackStatus(win_status)?;
                debug!("更新 SMTC 播放状态成功");
                Ok(())
            });
            if let Err(e) = result {
                error!("更新播放状态失败: {e:?}");
            }
        });
    }

    fn update_playback_rate(&self, rate: f64) {
        debug!(rate, "正在更新 SMTC 播放速率");

        TOKIO_RUNTIME.spawn(async move {
            let result = with_smtc_ctx("更新播放速率", |ctx| {
                if !ctx.is_enabled {
                    return Ok(());
                }
                let smtc = ctx.smtc()?;
                smtc.SetPlaybackRate(rate)?;
                debug!("更新 SMTC 播放速率成功: {}", rate);
                Ok(())
            });
            if let Err(e) = result {
                error!("更新播放速率失败: {e:?}");
            }
        });
    }

    fn update_volume(&self, _volume: f64) {
        // WinRT SMTC 没有音量接口，未实现。
    }

    fn update_timeline(&self, payload: TimelinePayload) {
        TOKIO_RUNTIME.spawn(async move {
            let result = (|| -> Result<()> {
                let props = SystemMediaTransportControlsTimelineProperties::new()?;
                props.SetStartTime(TimeSpan { Duration: 0 })?;
                props.SetPosition(TimeSpan {
                    Duration: (payload.current_time * HNS_PER_MILLISECOND) as i64,
                })?;
                props.SetEndTime(TimeSpan {
                    Duration: (payload.total_time * HNS_PER_MILLISECOND) as i64,
                })?;

                with_smtc_ctx("更新时间线", |ctx| {
                    if ctx.is_enabled {
                        ctx.smtc()?.UpdateTimelineProperties(&props)?;
                    }
                    Ok(())
                })
            })();

            if let Err(e) = result {
                error!("更新时间线失败: {e:?}");
            }
        });
    }

    fn update_play_mode(&self, payload: PlayModePayload) {
        let PlayModePayload {
            repeat_mode,
            is_shuffling,
        } = payload;

        debug!(is_shuffling, ?repeat_mode, "正在更新 SMTC 播放模式");

        TOKIO_RUNTIME.spawn(async move {
            let result = with_smtc_ctx("更新播放模式", |ctx| {
                if !ctx.is_enabled {
                    return Ok(());
                }
                let smtc = ctx.smtc()?;
                smtc.SetShuffleEnabled(is_shuffling)?;

                let repeat_mode_win = match repeat_mode {
                    RepeatMode::Track => MediaPlaybackAutoRepeatMode::Track,
                    RepeatMode::List => MediaPlaybackAutoRepeatMode::List,
                    RepeatMode::None => MediaPlaybackAutoRepeatMode::None,
                };
                smtc.SetAutoRepeatMode(repeat_mode_win)?;
                debug!("更新 SMTC 播放模式成功");
                Ok(())
            });
            if let Err(e) = result {
                error!("更新播放模式失败: {e:?}");
            }
        });
    }
}
