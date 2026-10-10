//! Linux MPRIS 集成。
//!
//! 照搬 SPlayer 的 `sys_media/linux.rs` 思路：`mpris-server` 在**独立线程**
//! 跑一个 D-Bus 事件循环，主线程通过 `mpsc` 把指令发过去 —— 避免 D-Bus IO
//! 阻塞 napi 的 JS 线程。

use std::{
    sync::{Arc, RwLock},
    thread,
};

use anyhow::Result;
use mpris_server::{
    LoopStatus as MprisLoopStatus, Metadata, PlaybackStatus as MprisPlaybackStatus, Player, Time,
};
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use tokio::{
    runtime::Runtime,
    sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel},
};
use tracing::{debug, error};

use crate::{
    model::{
        MetadataPayload, PlayModePayload, PlayStatePayload, PlaybackStatus, RepeatMode,
        SystemMediaEvent, SystemMediaEventType, TimelinePayload,
    },
    sys_media::{SystemMediaControls, SystemMediaThreadsafeFunction},
};

/// 主线程 → 后台 D-Bus 线程的指令。
enum MprisCommand {
    UpdateMetadata(Box<MetadataPayload>),
    UpdatePlaybackStatus(PlaybackStatus),
    UpdatePlaybackRate(f64),
    UpdateTimeline { current: f64, total: f64 },
    UpdatePlayMode {
        repeat: RepeatMode,
        shuffle: bool,
    },
    Enable,
    Disable,
    Shutdown,
    RegisterCallback(SystemMediaThreadsafeFunction),
}

pub struct LinuxImpl {
    tx: UnboundedSender<MprisCommand>,
}

impl LinuxImpl {
    pub fn new() -> Self {
        let (tx, rx) = unbounded_channel();
        thread::Builder::new()
            .name("mpris-worker".into())
            .spawn(move || {
                if let Err(e) = run_mpris_worker(rx) {
                    error!("MPRIS worker 退出: {e:?}");
                }
            })
            .expect("启动 MPRIS worker 线程失败");

        Self { tx }
    }

    fn send(&self, cmd: MprisCommand) {
        if let Err(e) = self.tx.send(cmd) {
            debug!("发送 MPRIS 指令失败（worker 可能已退出）: {e}");
        }
    }
}

/// 后台线程：跑 tokio runtime + D-Bus 服务。
fn run_mpris_worker(mut rx: UnboundedReceiver<MprisCommand>) -> Result<()> {
    let runtime = Runtime::new()?;
    runtime.block_on(async move {
        let callback: Arc<RwLock<Option<SystemMediaThreadsafeFunction>>> =
            Arc::new(RwLock::new(None));

        let player = Player::builder("CeruMusic")
            .identity("CeruMusic")
            .can_play(true)
            .can_pause(true)
            .can_go_next(true)
            .can_go_previous(true)
            .can_seek(true)
            .build()
            .await?;

        // MPRIS 事件 → JS
        {
            let cb = callback.clone();
            player.connect_next(|_| {
                dispatch(&cb, SystemMediaEvent::new(SystemMediaEventType::NextSong));
            });
            let cb = callback.clone();
            player.connect_previous(|_| {
                dispatch(&cb, SystemMediaEvent::new(SystemMediaEventType::PreviousSong));
            });
            let cb = callback.clone();
            player.connect_play_pause(|_| {
                dispatch(&cb, SystemMediaEvent::new(SystemMediaEventType::Play));
            });
            let cb = callback.clone();
            player.connect_stop(|_| {
                dispatch(&cb, SystemMediaEvent::new(SystemMediaEventType::Stop));
            });
        }

        while let Some(cmd) = rx.recv().await {
            match cmd {
                MprisCommand::RegisterCallback(cb) => {
                    if let Ok(mut guard) = callback.write() {
                        *guard = Some(cb);
                    }
                }
                MprisCommand::UpdateMetadata(payload) => {
                    let mut builder = Metadata::builder()
                        .title(payload.song_name.clone())
                        .artist([payload.author_name.clone()])
                        .album(payload.album_name.clone());
                    // 时长属于 Metadata（mpris-server 0.10 的 Player 无 set_length）
                    if let Some(dur) = payload.duration {
                        builder = builder.length(Time::from_millis(dur as i64));
                    }
                    let metadata = builder.build();
                    player.set_metadata(metadata).await.ok();
                }
                MprisCommand::UpdatePlaybackStatus(status) => {
                    let s = match status {
                        PlaybackStatus::Playing => MprisPlaybackStatus::Playing,
                        PlaybackStatus::Paused => MprisPlaybackStatus::Paused,
                    };
                    player.set_playback_status(s).await.ok();
                }
                MprisCommand::UpdateTimeline { current, .. } => {
                    // mpris-server 0.10：位置用同步的 set_position()（不是 async，
                    // 也不能 await）。总时长（length）属于 Metadata，已在
                    // UpdateMetadata 时通过 builder.length() 写入，此处不再重复设置
                    //（Metadata 未实现 Clone，无法在此增量修改）。
                    player.set_position(Time::from_millis(current as i64));
                }
                MprisCommand::UpdatePlaybackRate(rate) => {
                    player.set_rate(rate).await.ok();
                }
                MprisCommand::UpdatePlayMode { repeat, shuffle } => {
                    let loop_status = match repeat {
                        RepeatMode::Track => MprisLoopStatus::Track,
                        RepeatMode::List => MprisLoopStatus::Playlist,
                        RepeatMode::None => MprisLoopStatus::None,
                    };
                    player.set_loop_status(loop_status).await.ok();
                    player.set_shuffle(shuffle).await.ok();
                }
                MprisCommand::Enable | MprisCommand::Disable => {
                    // mpris-server 没有显式的 enable/disable 开关，
                    // 依靠 player drop 与否控制可见性；这里留空。
                }
                MprisCommand::Shutdown => break,
            }
        }

        // player drop 即摘掉 D-Bus 上的媒体卡片（mpris-server 无显式 disable）。
        Ok(())
    })
}

fn dispatch(cb: &Arc<RwLock<Option<SystemMediaThreadsafeFunction>>>, event: SystemMediaEvent) {
    let guard = match cb.read() {
        Ok(g) => g,
        Err(_) => {
            error!("MPRIS 回调锁中毒");
            return;
        }
    };
    if let Some(tsfn) = guard.as_ref() {
        let status = tsfn.call(event.to_json(), ThreadsafeFunctionCallMode::NonBlocking);
        if status != napi::Status::Ok {
            error!("调用 JS 回调失败, status: {status:?}");
        }
    }
}

impl SystemMediaControls for LinuxImpl {
    fn initialize(&self) -> Result<()> {
        // worker 线程在 new() 里已经起好了。
        Ok(())
    }

    fn enable(&self) -> Result<()> {
        self.send(MprisCommand::Enable);
        Ok(())
    }

    fn disable(&self) -> Result<()> {
        self.send(MprisCommand::Disable);
        Ok(())
    }

    fn shutdown(&self) -> Result<()> {
        self.send(MprisCommand::Shutdown);
        Ok(())
    }

    fn register_event_handler(&self, callback: SystemMediaThreadsafeFunction) -> Result<()> {
        self.send(MprisCommand::RegisterCallback(callback));
        Ok(())
    }

    fn update_metadata(&self, payload: MetadataPayload) {
        self.send(MprisCommand::UpdateMetadata(Box::new(payload)));
    }

    fn update_playback_status(&self, payload: PlayStatePayload) {
        self.send(MprisCommand::UpdatePlaybackStatus(payload.status));
    }

    fn update_playback_rate(&self, rate: f64) {
        self.send(MprisCommand::UpdatePlaybackRate(rate));
    }

    fn update_volume(&self, _volume: f64) {
        // CeruMusic 的音量由渲染端 <audio> 控制，不映射到 MPRIS。
    }

    fn update_timeline(&self, payload: TimelinePayload) {
        self.send(MprisCommand::UpdateTimeline {
            current: payload.current_time,
            total: payload.total_time,
        });
    }

    fn update_play_mode(&self, payload: PlayModePayload) {
        self.send(MprisCommand::UpdatePlayMode {
            repeat: payload.repeat_mode,
            shuffle: payload.is_shuffling,
        });
    }
}
