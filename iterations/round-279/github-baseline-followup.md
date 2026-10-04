# GitHub 基线后续核验（Round279 收束前）

2026-10-04：公开仓库 happywht/wuxia-rpg main 与 round278-baseline 指向 51f3355；Round279 未提交内容未上传。

更正：先前隔离副本执行 core.autocrlf=false 与 checkout-index 后，没有逐文件确认，后续日志仍显示 world-map.json 为 CRLF、1,594,979 字节。因此上次“原始 LF 重测仍失败”的结论证据不足。

本次使用 git -c core.autocrlf=false archive 后重新解包，并由 Node 直接测得 world-map.json 为 1,554,209 字节且无 CRLF；七组受影响回放测试启动，输出在隔离副本 stable-lf-targeted.txt，活进程句柄 11789。尚未取得最终结果。

生产数据、源码冻结保持；不以 GitHub 基线发布代替 Round279 实走或第一阶段整体验收。

后续核验：两份旧基线分别与 6f2be38、490b7a3 的 world-map 原始资料逐层解码比对，28/33 个图层哈希、10/11 个区域百分比与尺寸均一致。证明记录见 baseline-provenance.json。已仅复制到隔离验证目录；原工作区旧文件未修改。两组测试正在重跑，不能提前声称通过。
