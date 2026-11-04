# 安装验收

验证日期：2026-11-04（Asia/Taipei）。作者：konshinhaoshin。

- DSH 版本：本机官方 Desktop 随附的 `0.2.0-rc.2` 运行时。
- 独立插件 `npm run check`：客户端构建成功，10 项测试通过。
- `npm pack`：包含 Host 入口、预编译客户端、`dsh.bundle` 配置及其引用的所有文件；不包含手机源码、部署配置或真实密钥。
- 使用真实 `dsh plugin --profile web add <tgz>` 安装到全新的临时 profile，安装成功并自动加入 `dsh.profile.bundles`。
- 没有手动插入插件行，DSH 启动后发现客户端模块并加载插件。
- 推送后使用真实 `dsh plugin --profile web add github:KonshinHaoshin/dsh-app-plugin#v0.3.0` 安装成功，安装后的包包含预编译客户端及组合声明。
- 初次启动自动生成设备 ID 和独立手机密钥，身份文件权限为 `0600`，默认局域网和公网连接均未启用。
- 使用真实 DSH 认证后的设置 API：状态读取、开启局域网、通过 ConfigEditor 保存名称和端口、生成二维码均成功。
- 自动测试验证重启配置解析时保留配对身份、二维码过期与单次兑换、来源限制、RPC 白名单及保存时保留原密钥。

测试使用独立的临时 DSH profile；不调用模型，也不修改现有 desktop profile。公网转发使用既有插件协议，本次独立包验收不代表所有 DSH 版本均兼容。
