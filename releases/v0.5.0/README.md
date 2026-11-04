# v0.5.0

安装：`github:KonshinHaoshin/dsh-app-plugin#v0.5.0`

配合手机端 v0.7.0，提供 WebRTC P2P 数据直连和 WSS 中继回退。纯 Node.js WebRTC 实现支持桌面 Host；仅协商数据，不唤起窗口或采集音视频。原有配对身份、局域网设置、公网服务器及中继密钥保留。

P2P 与 WSS 共享审批和 RPC 通道，带序号确认、去重、有界缓冲及大消息分块。协商使用配对密钥签名。旧手机继续走中继；自建中继需更新能力透传和摘要认证。默认 STUN 已在官方中继服务器部署（UDP 3478）。

验证：17 项插件测试通过；真实 Chromium 与 Node 的 DataChannel 验证大消息、信令重连及不中断审批的回退；Android 原生通过公网信令/STUN 建立 P2P，在强制 Doze、锁屏及暂停 WebView JS 后验证通知，切断 P2P 后通知和待审批仍可经 WSS 处理。

作者：konshinhaoshin
