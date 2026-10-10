//! macOS 媒体集成。
//!
//! 照搬 SPlayer 的 `sys_media/macos.rs` 思路：
//!   * 用 `objc2` 调 `MPNowPlayingInfoCenter` 写入当前播放信息。
//!   * 用 `MPRemoteCommandCenter` 注册 command handler 接收系统按键。
//!
//! 封面用 `NSData` → `NSImage` → `MPMediaItemArtwork`，同样是**原始字节**。

use std::{
    ptr::NonNull,
    sync::{Arc, Mutex},
};

use anyhow::Result;
use block2::RcBlock;
use objc2::{
    AnyThread,
    rc::Retained,
    runtime::{AnyObject, ProtocolObject},
};
use objc2_app_kit::NSImage;
use objc2_foundation::{NSData, NSDictionary, NSMutableDictionary, NSNumber, NSSize, NSString};
use objc2_media_player::{
    MPMediaItemArtwork, MPMediaItemPropertyAlbumTitle, MPMediaItemPropertyArtist,
    MPMediaItemPropertyArtwork, MPMediaItemPropertyPlaybackDuration, MPMediaItemPropertyTitle,
    MPNowPlayingInfoCenter, MPNowPlayingInfoPropertyElapsedPlaybackTime,
    MPNowPlayingInfoPropertyPlaybackRate, MPNowPlayingPlaybackState, MPRemoteCommandCenter,
    MPRemoteCommandEvent, MPRemoteCommandHandlerStatus,
};
use tracing::{error, trace};

use crate::{
    model::{
        MetadataPayload, PlayModePayload, PlayStatePayload, PlaybackStatus, SystemMediaEvent,
        SystemMediaEventType, TimelinePayload,
    },
    sys_media::{SystemMediaControls, SystemMediaThreadsafeFunction},
};

pub struct MacosImpl {
    cmd_ctr: Retained<MPRemoteCommandCenter>,
    info: Mutex<Retained<NSMutableDictionary<NSString, AnyObject>>>,
    event_handler: Arc<Mutex<Option<SystemMediaThreadsafeFunction>>>,
    /// 保存 (command, target) 以便 shutdown 时移除。
    target_tokens: Mutex<Vec<Retained<AnyObject>>>,
}

unsafe impl Send for MacosImpl {}
unsafe impl Sync for MacosImpl {}

impl MacosImpl {
    pub fn new() -> Self {
        Self {
            cmd_ctr: unsafe { MPRemoteCommandCenter::sharedCommandCenter() },
            info: Mutex::new(unsafe { NSMutableDictionary::new() }),
            event_handler: Arc::new(Mutex::new(None)),
            target_tokens: Mutex::new(Vec::new()),
        }
    }

    fn dispatch(&self, event: SystemMediaEvent) {
        let guard = match self.event_handler.lock() {
            Ok(g) => g,
            Err(_) => {
                error!("macOS 事件回调锁中毒");
                return;
            }
        };
        if let Some(tsfn) = guard.as_ref() {
            let status = tsfn.call(
                event.to_json(),
                napi::threadsafe_function::ThreadsafeFunctionCallMode::NonBlocking
            );
            if status != napi::Status::Ok {
                error!("调用 JS 回调失败, status: {status:?}");
            }
        }
    }

    /// 给某个 `MPRemoteCommand` 挂一个 handler，按下时往 JS 派发 `event_type`。
    fn add_command_handler(
        &self,
        command: &objc2_media_player::MPRemoteCommand,
        event_type: SystemMediaEventType,
    ) {
        let handler = self.event_handler.clone();
        // objc2 0.6: handler 参数要求 NonNull<MPRemoteCommandEvent>，
        // 且 addTargetWithHandler 接受 &DynBlock（不是 &RcBlock）→ 用 &*block 解引用。
        let block = RcBlock::new(
            move |_event: NonNull<MPRemoteCommandEvent>| -> MPRemoteCommandHandlerStatus {
                let guard = match handler.lock() {
                    Ok(g) => g,
                    Err(_) => return MPRemoteCommandHandlerStatus::CommandFailed,
                };
                if let Some(tsfn) = guard.as_ref() {
                    let _ = tsfn.call(
                        SystemMediaEvent::new(event_type).to_json(),
                        napi::threadsafe_function::ThreadsafeFunctionCallMode::NonBlocking,
                    );
                    MPRemoteCommandHandlerStatus::Success
                } else {
                    MPRemoteCommandHandlerStatus::CommandFailed
                }
            },
        );

        let token = unsafe { command.addTargetWithHandler(&block) };
        if let Ok(mut tokens) = self.target_tokens.lock() {
            tokens.push(token);
        }
    }

    fn setup_event_listeners(&self) {
        self.add_command_handler(
            unsafe { &self.cmd_ctr.playCommand() },
            SystemMediaEventType::Play,
        );
        self.add_command_handler(
            unsafe { &self.cmd_ctr.pauseCommand() },
            SystemMediaEventType::Pause,
        );
        self.add_command_handler(
            unsafe { &self.cmd_ctr.togglePlayPauseCommand() },
            SystemMediaEventType::Play,
        );
        self.add_command_handler(
            unsafe { &self.cmd_ctr.nextTrackCommand() },
            SystemMediaEventType::NextSong,
        );
        self.add_command_handler(
            unsafe { &self.cmd_ctr.previousTrackCommand() },
            SystemMediaEventType::PreviousSong,
        );
    }

    fn set_commands_enabled(&self, enabled: bool) {
        unsafe {
            self.cmd_ctr.playCommand().setEnabled(enabled);
            self.cmd_ctr.pauseCommand().setEnabled(enabled);
            self.cmd_ctr.togglePlayPauseCommand().setEnabled(enabled);
            self.cmd_ctr.nextTrackCommand().setEnabled(enabled);
            self.cmd_ctr.previousTrackCommand().setEnabled(enabled);
        }
    }
}

impl SystemMediaControls for MacosImpl {
    fn initialize(&self) -> Result<()> {
        self.setup_event_listeners();
        Ok(())
    }

    fn enable(&self) -> Result<()> {
        self.set_commands_enabled(true);
        Ok(())
    }

    fn disable(&self) -> Result<()> {
        self.set_commands_enabled(false);
        Ok(())
    }

    fn shutdown(&self) -> Result<()> {
        self.set_commands_enabled(false);

        if let Ok(mut tokens) = self.target_tokens.lock() {
            for token in tokens.drain(..) {
                unsafe {
                    // 逐个从所有 command 上摘除
                    self.cmd_ctr.playCommand().removeTarget(Some(&token));
                    self.cmd_ctr.pauseCommand().removeTarget(Some(&token));
                    self.cmd_ctr.togglePlayPauseCommand().removeTarget(Some(&token));
                    self.cmd_ctr.nextTrackCommand().removeTarget(Some(&token));
                    self.cmd_ctr.previousTrackCommand().removeTarget(Some(&token));
                }
            }
        }

        unsafe {
            let ctr = MPNowPlayingInfoCenter::defaultCenter();
            ctr.setNowPlayingInfo(None);
        }

        trace!("销毁了 MacosImpl");
        Ok(())
    }

    fn register_event_handler(&self, callback: SystemMediaThreadsafeFunction) -> Result<()> {
        if let Ok(mut guard) = self.event_handler.lock() {
            *guard = Some(callback);
        }
        Ok(())
    }

    fn update_metadata(&self, payload: MetadataPayload) {
        let Ok(info) = self.info.lock() else {
            error!("macOS info 字典锁中毒");
            return;
        };

        unsafe {
            let title = NSString::from_str(&payload.song_name);
            let artist = NSString::from_str(&payload.author_name);
            let album = NSString::from_str(&payload.album_name);

            info.setObject_forKey(&title, ProtocolObject::from_ref(MPMediaItemPropertyTitle));
            info.setObject_forKey(&artist, ProtocolObject::from_ref(MPMediaItemPropertyArtist));
            info.setObject_forKey(&album, ProtocolObject::from_ref(MPMediaItemPropertyAlbumTitle));

            if let Some(duration) = payload.duration {
                let num = NSNumber::new_f64(duration / 1000.0);
                info.setObject_forKey(
                    &num,
                    ProtocolObject::from_ref(MPMediaItemPropertyPlaybackDuration),
                );
            }

            // 封面：原始字节 → NSImage → MPMediaItemArtwork
            if let Some(data) = payload.cover_data {
                let ns_data = NSData::from_vec(data);
                let img = NSImage::alloc();
                if let Some(img) = NSImage::initWithData(img, &ns_data) {
                    let size = img.size();
                    let artwork = MPMediaItemArtwork::alloc();
                    let artwork = MPMediaItemArtwork::initWithBoundsSize_requestHandler(
                        artwork,
                        size,
                        &RcBlock::new(move |_: NSSize| -> NonNull<NSImage> {
                            let ptr = objc2::rc::Retained::as_ptr(&img);
                            NonNull::new(ptr.cast_mut()).expect("NSImage 指针不应为空")
                        }),
                    );
                    info.setObject_forKey(
                        &artwork,
                        ProtocolObject::from_ref(MPMediaItemPropertyArtwork),
                    );
                }
            } else {
                info.removeObjectForKey(MPMediaItemPropertyArtwork);
            }

            let dict: &NSDictionary<NSString, AnyObject> = info.as_ref();
            MPNowPlayingInfoCenter::defaultCenter().setNowPlayingInfo(Some(dict));
        }
    }

    fn update_playback_status(&self, payload: PlayStatePayload) {
        let state = match payload.status {
            PlaybackStatus::Playing => MPNowPlayingPlaybackState::Playing,
            PlaybackStatus::Paused => MPNowPlayingPlaybackState::Paused,
        };
        unsafe {
            MPNowPlayingInfoCenter::defaultCenter().setPlaybackState(state);
        }
    }

    fn update_playback_rate(&self, rate: f64) {
        if let Ok(info) = self.info.lock() {
            unsafe {
                let num = NSNumber::new_f64(rate);
                info.setObject_forKey(
                    &num,
                    ProtocolObject::from_ref(MPNowPlayingInfoPropertyPlaybackRate),
                );
                let dict: &NSDictionary<NSString, AnyObject> = info.as_ref();
                MPNowPlayingInfoCenter::defaultCenter().setNowPlayingInfo(Some(dict));
            }
        }
    }

    fn update_volume(&self, _volume: f64) {
        // macOS 播放器音量不映射到系统媒体控件。
    }

    fn update_timeline(&self, payload: TimelinePayload) {
        if let Ok(info) = self.info.lock() {
            unsafe {
                let elapsed = NSNumber::new_f64(payload.current_time / 1000.0);
                info.setObject_forKey(
                    &elapsed,
                    ProtocolObject::from_ref(MPNowPlayingInfoPropertyElapsedPlaybackTime),
                );
                if payload.total_time > 0.0 {
                    let duration = NSNumber::new_f64(payload.total_time / 1000.0);
                    info.setObject_forKey(
                        &duration,
                        ProtocolObject::from_ref(MPMediaItemPropertyPlaybackDuration),
                    );
                }
                let dict: &NSDictionary<NSString, AnyObject> = info.as_ref();
                MPNowPlayingInfoCenter::defaultCenter().setNowPlayingInfo(Some(dict));
            }
        }
    }

    fn update_play_mode(&self, _payload: PlayModePayload) {
        // MPNowPlayingInfoCenter 不支持 shuffle/repeat 展示。
    }
}
