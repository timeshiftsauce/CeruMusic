//! 极简日志初始化：把 tracing 输出写到文件 + stderr。
//!
//! CeruMusic 主进程已经有 `electron-log`，这里保留文件日志是为了排查
//! 原生层的 WinRT / D-Bus 问题 —— 这些错误经常在 JS 侧完全看不到。

use std::path::Path;

use anyhow::{Context, Result};
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

/// 初始化日志。
///
/// * `log_dir` —— 日志目录，不存在会自动创建。
///
/// 重复调用是安全的（第二次会因全局 subscriber 已设置而静默返回）。
pub fn init(log_dir: &str) -> Result<()> {
    let dir = Path::new(log_dir);
    std::fs::create_dir_all(dir)
        .with_context(|| format!("创建日志目录失败: {}", dir.display()))?;

    let file_appender = tracing_appender::rolling::daily(dir, "external-media-integration.log");
    // 注意：guard 一旦 drop，非阻塞写入的剩余缓冲会丢。所以这里 leak 掉它，
    // 让日志在进程生命周期内一直有效（进程退出时由 OS 回收）。
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
    std::mem::forget(guard);

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("external_media_integration=debug,warn"));

    let result = tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_writer(std::io::stderr))
        .with(fmt::layer().with_ansi(false).with_writer(non_blocking))
        .try_init();

    // 已经初始化过（例如 dev 下热重载）时不算错误。
    if result.is_err() {
        tracing::debug!("日志 subscriber 已存在，跳过重复初始化");
    }

    Ok(())
}
