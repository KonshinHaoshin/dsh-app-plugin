# v0.3.1

修复 DSH 0.2.1-rc.5 配对成功后提示 `Cannot read properties of undefined (reading 'signal')`。

新版通过 DSH 官方 `connection.createPeer` 接口，为每条已认证手机连接创建独立 owner Peer；断开连接时释放该 Peer。旧版继续使用其 `connection.operator`。所有操作仍通过 Remote Gateway 和既有端点白名单。

在电脑 DSH 的插件页安装：

```text
github:KonshinHaoshin/dsh-app-plugin#v0.3.1
```

也可下载本目录的 `shelterhub-dsh-mobile-bridge-0.3.1.tgz` 安装。更新后重启 DSH，保留原配对和中继配置；手机 APK 无需重新安装。

验证：

- 12 项自动回归测试通过，覆盖身份传递、连接隔离、取消、认证和旧版兼容。
- 在官方 DSH 0.2.0-rc.2 和 0.2.1-rc.5 的隔离 profile 安装本 tgz，分别验证 LAN 和真实 WSS 公网中继。
- 两版本均通过 session/list、session/modelCatalog、workspace/follow、session/control、$events；通过工作区和会话创建、session/follow 历史快照，以及断开一条连接后另一连接继续调用。
- 未调用模型或发送实际任务。

作者：konshinhaoshin
