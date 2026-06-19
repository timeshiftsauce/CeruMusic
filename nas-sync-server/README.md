# Ceru NAS Sync Server

Ceru Music 的自部署歌单同步服务。它用 SQLite 保存用户、歌单、歌曲和收藏关系，桌面端通过 NAS 同步插件连接它。

## 目录

```text
nas-sync-server/
├── src/                  # 服务端源码
├── data/                 # SQLite 数据目录，运行后生成
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## 端口和环境变量

默认监听 `31231`。

```bash
CERU_SYNC_HOST=0.0.0.0
CERU_SYNC_PORT=31231
CERU_SYNC_DB_PATH=/data/ceru-sync.sqlite
CERU_SYNC_ADMIN_TOKEN=change-this-admin-token
```

`CERU_SYNC_ADMIN_TOKEN` 用来创建用户和绑定码，请设置成足够长的随机字符串。

## Docker 部署

在本目录创建 `.env`：

```bash
cd nas-sync-server
cp .env.example .env
```

编辑 `.env`，把 `CERU_SYNC_ADMIN_TOKEN` 改成你自己的值。

启动：

```bash
docker compose up -d --build
```

检查服务：

```bash
curl http://你的NAS地址:31231/health
```

看到类似结果说明服务已启动：

```json
{"status":"ok","service":"ceru-nas-sync-server"}
```

数据会保存在：

```text
nas-sync-server/data/ceru-sync.sqlite
```

## 普通 Node 部署

需要 Node.js 22。

```bash
cd nas-sync-server
yarn install
CERU_SYNC_ADMIN_TOKEN=你的管理token yarn start
```

也可以指定数据路径：

```bash
CERU_SYNC_ADMIN_TOKEN=你的管理token \
CERU_SYNC_DB_PATH=/你的数据目录/ceru-sync.sqlite \
yarn start
```

## 创建用户

```bash
curl -X POST http://你的NAS地址:31231/admin/users \
  -H "Content-Type: application/json" \
  -H "x-admin-token: 你的管理token" \
  -d '{"username":"song","password":"你的用户密码","nickname":"Song"}'
```

## 生成插件登录绑定码

绑定码默认 10 分钟有效。

```bash
curl -X POST http://你的NAS地址:31231/admin/pair-codes \
  -H "Content-Type: application/json" \
  -H "x-admin-token: 你的管理token" \
  -d '{"username":"song"}'
```

返回里的 `pairCode` 填到桌面端 NAS 同步插件里。

## 桌面端插件导入

插件文件在项目根目录：

```text
plugins/ceru-nas-sync-service.js
```

桌面端操作：

```text
设置 -> 插件 -> 添加插件 -> 澜音插件 -> 本地导入 -> 选择 ceru-nas-sync-service.js
```

配置插件：

```text
服务器地址: http://你的NAS地址:31231
登录绑定码: 上一步生成的 pairCode
```

点击 `登录 NAS 同步服务`，状态显示 `已连接` 后即可同步。

## 反向代理建议

局域网内可以直接用 `http://NAS_IP:31231`。

如果要公网访问，建议放到 HTTPS 反向代理后面，例如：

```text
https://music-sync.example.com -> http://127.0.0.1:31231
```

不要把 `CERU_SYNC_ADMIN_TOKEN` 写进前端或插件。它只用于服务端管理接口。

## 同步轮询

桌面端会低频请求：

```text
GET /sync?sinceRevision=上次revision
```

服务端只返回变更事件，不会每次传完整歌单。桌面端收到变更后再刷新歌单列表或当前歌单，因此 CPU、内存和网络压力都很低。
