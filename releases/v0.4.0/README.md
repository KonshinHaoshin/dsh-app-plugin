# v0.4.0

配合手机 App v0.5.0：

- 开放 `fileUploads/upload`，由 Typert Gateway 解析 Agent 作用域并返回会话专属上传凭据；手机不能直接写文件路径。
- 开放 `session/attachment`，按 DSH 的历史记录归属检查读取图片，过大的图片返回可读错误。
- 增加应用心跳应答和局域网断线回收。已保存的配对不受二维码有效期影响。
- 保留 v0.3.1 的新版 scoped Peer 适配、连接隔离与旧版 operator 支持。

在 DSH 插件页安装 `github:KonshinHaoshin/dsh-app-plugin#v0.4.0` 后重启，保留原有配置和配对信息。

验证：13 项插件回归测试；在官方 DSH 0.2.1-rc.5 隔离 profile 通过真实局域网及公网中继，验证心跳、文件上传、跨会话凭据拒绝、图片发送/入库/历史读取和推理强度设置。使用本地回显模型，不访问外部模型 API。

作者：konshinhaoshin
