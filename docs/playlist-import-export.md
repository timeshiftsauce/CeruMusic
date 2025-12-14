# CeruMusic 当前歌单导入/导出对接文档（移动端）

> 目标：在移动端实现与桌面端一致的“当前歌单”导入/导出能力，覆盖剪贴板与文件两种通道；兼容 `.cpl`（旧版）与 `.cmpl`（压缩新版）格式。

## 概述
- 桌面端对外输出为加密后的播放列表数据（`SongList[]`），可通过剪贴板或文件导出。
- 加密采用 AES（CryptoJS 的 OpenSSL 兼容密码模式），密钥为 `CeruMusic-PlaylistSecretKey`。
- 新版 `.cmpl` 文件在加密文本基础上进行 gzip 压缩；旧版 `.cpl` 为未压缩的纯加密文本。

## 数据结构
播放列表项（`SongList`）是 `PlayList` 的别名，类型定义如下：

```ts
// src/common/types/playList.ts
export default interface PlayList {
  songmid: string | number
  hash?: string
  singer: string
  name: string
  albumName: string
  albumId: string | number
  source: string
  interval: string
  img: string
  lrc: null | string
  types: string[]
  _types: Record<string, any>
  typeUrl?: Record<string, any>
  url?: string
}
```

最小必需字段（导入校验必须通过）：`songmid`、`name`、`singer`、`img`（string，可为空字符串）、`interval`（string）、`source`（string）。

## 桌面端实现位置（代码参考）
- 加密：`encryptPlaylist`（`src/renderer/src/utils/playlist/playlistExportImport.ts:12`）
- 解密：`decryptPlaylist`（`src/renderer/src/utils/playlist/playlistExportImport.ts:28`）
- 从系统路径导入：`importPlaylistFromPath`（`src/renderer/src/utils/playlist/playlistExportImport.ts:59`）
- 导出到文件：`exportPlaylistToFile`（`src/renderer/src/utils/playlist/playlistExportImport.ts:78`）
- 复制到剪贴板：`copyPlaylistToClipboard`（`src/renderer/src/utils/playlist/playlistExportImport.ts:117`）
- 从文件对象导入（前端）：`importPlaylistFromFile`（`src/renderer/src/utils/playlist/playlistExportImport.ts:138`）
- 从剪贴板导入：`importPlaylistFromClipboard`（`src/renderer/src/utils/playlist/playlistExportImport.ts:194`）
- 数据校验：`validateImportedPlaylist`（`src/renderer/src/utils/playlist/playlistExportImport.ts:214`）

## 序列化与加密流程
1. 将 `SongList[]` 用 `JSON.stringify` 序列化成字符串。
2. 使用 CryptoJS 执行 AES 加密（OpenSSL 兼容密码模式，含随机 `Salt`）：
   - 密钥：`CeruMusic-PlaylistSecretKey`
   - 模式与填充：CryptoJS 默认（`AES-CBC` + `PKCS7`）
   - 输出：Base64 字符串（常见带 `Salted__` 头）
3. `.cmpl` 文件在上述加密文本的基础上进行 gzip 压缩；`.cpl` 为未压缩加密文本。

## 文件格式
- `.cpl`（旧版）：内容为加密后的 Base64 文本。
  - 导入：读取文本 → AES 解密 → JSON 解析 → 校验。
- `.cmpl`（新版）：对加密文本进行 gzip 压缩，文件为二进制。
  - 导入：读取二进制 → gunzip 解压为文本 → AES 解密 → JSON 解析 → 校验。
- 默认导出文件名：`cerumusic-playlist-YYYY-MM-DD.cmpl`

## 剪贴板通道
- 桌面端复制到剪贴板的是“未压缩的加密文本”（Base64）。
- 移动端读取剪贴板文本后，直接执行 AES 解密并解析 JSON。

## 移动端对接方案
### 通用建议
- 优先保证与 CryptoJS 的“OpenSSL 兼容密码模式”一致：随机 Salt，`EVP_BytesToKey` 派生，`AES-CBC`，`PKCS7`。
- 若采用原生实现，需正确解析 Base64 开头的 `Salted__` 头和后续的 salt/iv。
- `.cmpl` 文件必须先 gzip 解压，再进行解密。

### Android
- 方案一：在 WebView/JS 引擎中直接使用 CryptoJS 完成解密，避免格式细节不一致。
- 方案二：原生实现 OpenSSL 兼容派生与 AES-CBC，严格匹配 CryptoJS 输出格式。
- 解压：使用系统或三方 gzip 库（例如 `java.util.zip.GZIPInputStream` 或 Okio）。

### iOS
- 方案一：在 JS 环境使用 CryptoJS 完成解密。
- 方案二：原生实现 EVP_BytesToKey + AES-CBC + PKCS7。
- 解压：使用系统或三方 gzip 支持（例如 `Compression` 框架或 zlib）。

## 端到端流程示例
### 桌面 → 移动（文件）
1. 桌面：`SongList[]` → JSON → AES(密钥) → gzip → 写 `.cmpl`。
2. 移动：读 `.cmpl` → gunzip → AES(同密钥) → JSON.parse → `validateImportedPlaylist` 等效校验 → 入库。

### 桌面 → 移动（剪贴板）
1. 桌面：`SongList[]` → JSON → AES → 写剪贴板（Base64 文本）。
2. 移动：读剪贴板文本 → AES → JSON.parse → 校验 → 入库。

### 旧版 `.cpl` 兼容
- 移动：读取文本 → AES → JSON.parse → 校验 → 入库。

## 错误处理与兼容提示
- 加密失败：`encryptPlaylist` 抛错。
- 解密失败或 JSON 数据格式不正确：`decryptPlaylist` 抛错（参考：`src/renderer/src/utils/playlist/playlistExportImport.ts:34`）。
- 读取/解压失败：文件读取或 gzip 解压阶段抛错。
- 兼容要点：
  - `.cmpl` 必须 gzip 解压；
  - 剪贴板为未压缩加密文本；
  - 导入后需进行最小字段校验。

## 测试建议
- 构造包含 1–2 首歌曲的最小 `SongList[]`，分别验证以下场景：
  - 剪贴板文本：读取 → 解密 → 解析 → 校验。
  - `.cpl` 文件：读取 → 解密 → 解析 → 校验。
  - `.cmpl` 文件：读取 → 解压 → 解密 → 解析 → 校验。
- 使用桌面端导出样例文件进行移动端端到端导入。

## 版本拓展建议
- 若将来升级算法或密钥，建议在 JSON 顶层增加 `version` 字段，双方根据版本号走不同的解析与解密逻辑，以保持向后兼容。

## 示例
### 最小播放列表 JSON（单项）
```json
[
  {
    "songmid": "123456",
    "name": "歌曲示例",
    "singer": "歌手示例",
    "albumName": "专辑示例",
    "albumId": "album-1",
    "source": "tx",
    "interval": "03:45",
    "img": "https://example.com/cover.jpg",
    "lrc": null,
    "types": [],
    "_types": {},
    "typeUrl": {},
    "url": ""
  }
]
```

### 剪贴板内容（形如）
```
U2FsdGVkX1+...（AES 加密后的 Base64 文本）
```

> 注意：上述加密文本为示意。实际内容由 CryptoJS 生成，包含随机 `Salt`，每次加密结果不同。

