# DSH App Plugin

**作者：konshinhaoshin**

DeepSeek Harness 手机配套插件，提供局域网直连、公网中继、二维码配对，以及电脑端「设置 → 手机连接」。手机复用电脑 DSH 的会话、工作区、模型、任务执行和审批，不创建另一套模型后端。

## 安装

适用于 **DSH 0.2.0-rc.2 / 0.2.1-rc.5**。本仓库根目录就是可安装的 DSH 组合包，已包含构建好的客户端文件，安装无需额外执行构建脚本。

在 DSH 侧边栏「插件」中安装以下地址：

```text
github:KonshinHaoshin/dsh-app-plugin#v0.4.0
```

或者使用 DSH 命令行：

```sh
dsh plugin --profile desktop add github:KonshinHaoshin/dsh-app-plugin#v0.4.0
```

命令行的 `desktop` 应替换为实际使用的 profile；Web 版可用 `web`。安装后重启对应 DSH。包名保持为 `@shelterhub/dsh-mobile-bridge`，不需要发布到 npm 即可从 GitHub 安装。

也可以下载本仓库 [v0.4.0 安装包](releases/v0.4.0/shelterhub-dsh-mobile-bridge-0.4.0.tgz)，再执行：

```sh
dsh plugin --profile desktop add /绝对路径/shelterhub-dsh-mobile-bridge-0.4.0.tgz
```

## 配对手机

1. 打开电脑 DSH「设置 → 手机连接」。
2. 首次安装展开的「连接配置」中，启用局域网连接并保存；需要公网时填写公网服务器及中继认证密钥。
3. 选择「局域网配对」或「公网配对」，生成二维码。
4. 手机 DSH 打开「连接 → 扫一扫」扫描；也可在电脑复制配对链接，粘贴到手机的「使用配对链接」。

二维码 5 分钟内有效且只能使用一次，不包含长期手机密钥。设置页显示公网连接、局域网启用和手机在线数量。手机端可搜索电脑已登记的工作区，按工作区查看会话和创建任务。

首次安装会为每个 profile 随机生成独立设备 ID 和手机配对密钥，保存在该 profile 的 `.dsh-mobile-bridge/identity.json`；POSIX 系统目录权限为 `0700`、文件为 `0600`。升级或重装插件不会自动更换它们。默认只监听本机 `127.0.0.1:43821`；公网和局域网按设置启用。

公网中继地址可以使用：

```text
wss://dshapi.shelterhub.moe/connect
```

公网需要中继服务端提供的认证密钥。仓库和安装包不包含部署密钥；仅填写域名不能取得中继访问权限。`relaySecret` 只保存在电脑端，手机扫码时不需要它。

## 已安装旧版时

如果已经使用本插件并在 `cordis.patch.yml` 中手动 `insert` 了 `shelterhub-mobile-bridge`，升级前先备份配置，将那一段改成对组合包条目的覆盖，保留原有 `config`：

```yaml
- id: shelterhub-mobile-bridge
  name: '@shelterhub/dsh-mobile-bridge'
  config:
    deviceId: your-existing-device-id
    token: '<保留原手机密钥>'
    name: 我的电脑
    host: 0.0.0.0
    port: 43821
    # 原来使用公网时，也保留原 relayUrl / relaySecret
```

组合包会自动插入同一条目，再手动插入会造成重复。普通首次安装无需手工编辑 YAML。

## 配置字段

| 字段 | 默认值 / 用途 |
| --- | --- |
| `deviceId` | profile 内自动生成；可使用已有设备 ID |
| `token` | profile 内随机生成；手机操作者级配对密钥 |
| `name` | 电脑主机名，可在设置页修改 |
| `host` | `127.0.0.1`；启用局域网后为 `0.0.0.0` |
| `port` | `43821`，可在设置页修改 |
| `relayUrl` | 默认不启用；公网需 `wss://` 地址 |
| `relaySecret` | 与中继服务端配置一致；设置页留空保留原值 |
| `allowedOrigins` | 默认允许 Android/iOS App 来源；浏览器开发需显式加入来源 |

仅本机还可打开 `http://127.0.0.1:43821/pair` 使用独立二维码页面。该页面不向局域网公开，并检查请求来源。

## 范围与兼容性

- 适配 DSH `0.2.0-rc.2` 的 operator 和 `0.2.1-rc.5` 的显式 Peer 接口，依赖其 Remote Gateway、客户端模块系统和 ConfigEditor；其他版本需重新验证。
- `0.3.1` 起修复新版 DSH 配对成功后出现 `Cannot read properties of undefined (reading 'signal')` 的问题。已安装旧版的电脑请在插件页更新安装到 `v0.4.0` 并重启 DSH；保留原有连接配置，手机端无需重新安装。
- 手机配对代表操作者权限，可访问该 DSH 的所有会话；没有多用户权限隔离。
- 局域网 WS 为明文，仅适用于可信私人网络；公网使用 WSS，中继可读取转发内容，目前没有端到端加密。
- 断线后手机重新订阅并读取完整基线；不会自动重发改变状态的操作。
- 本仓库只包含电脑端插件，不包含 Android APK、手机源码或中继服务部署配置。

## 附件与长期连接

配合手机端 v0.5.0，可发送 PNG、JPEG、WebP、GIF 图片及普通文件；每次合计最多 4 MB、6 个附件。图片由 DSH 的图片校验和存储处理，文件通过 `fileUploads/upload` 的 Agent 作用域和会话专属凭据上传。历史图片只能经 `session/attachment` 验证属于当前会话后读取。模型是否支持图片由 DSH 决定。

已配对手机使用长期凭据自动重连；二维码仅用于初次配对，有效期不会让已保存的连接过期。v0.4.0 加入应用心跳和局域网失效连接回收。

## 开发与打包

需要 Node.js 22+。

```sh
npm ci
npm run check
npm pack --pack-destination artifacts
```

客户端源码为 `client-entry.cjs`，`npm run build` 生成供 DSH 加载的 `client.js`。该产物随 Git 和安装包提供；不使用安装生命周期脚本。Host 入口为 `index.mjs`，组合声明为 `cordis.patch.yml`。

Copyright © 2026 konshinhaoshin.
