# Round 143 验证与边界

## 实现与复核

计划先于代码，见plan.md；新增非空（含损坏）槽覆盖确认，目标ID/摘要/原载荷绑定，全文无损计量分页，默认取消、读完全部页才能明确确认。取消及Esc保留同槽和槽标签页；关闭清除暂存状态。写前重新读取并比较原始载荷，改变或读取异常拒绝，空槽也即时确认仍空。提交前消耗确认防重复提交；失败不自动重试。不修改v1字段，不承诺备份、恢复或跨进程CAS。

本地Claude Code默认配置完成同一任务链（session af6c89d0-ca42-41cc-b8dc-d0c88609765f），主代理复核并修复实际截图中的双footer重叠、窄屏确认标签和←→/手柄翻页，增加回调失败单次提交与320×360/1.4布局测试。旧R121测试按新确认契约更新。

## 命令

- `npx vitest run tests/round143-save-overwrite.test.ts tests/round121-dossier-and-slots.test.ts tests/round140-abandon-confirmation.test.ts`：3文件69测试通过，957ms，focused-final.txt。
- 初次`npm run build`因新增测试fixture接口漏声明failSaves而类型检查失败，build.txt保留。补齐接口后最终`npm run build`exit0：144文件1257测试，96.01秒；100资源Schema、默认MOD检查、tsc、R34/R48审计、Vite通过，build-final.txt。
- 入口685.17KB/gzip192.75、Phaser1374.54KB/gzip357.49，大分块警告保留；本轮不代表独立发行验收。

## 正常浏览器键盘验收

127.0.0.1:5178，正常输入与可见截图，无运行状态/存储注入。

1. 基线slot1 Lv13/2026-10-2 06:21:45，slot2 Lv5/2026-9-28 05:16:02，slot3 Lv13/06:22:11。第一栏的R142旧Lv4误覆盖仍未恢复。
2. 第一栏确认摘要完整，Enter默认取消、再次打开再取消仍旧时间；第二栏摘要Lv5正确，Esc返回同槽。截图cancel-first-final、prompt-second、escape-second-same-row。
3. 特大1.4第三栏摘要、永久替换提示、选项完整可读；当前短名一页，默认取消时间不变。prompt-third-max/max-cancel-third。长名/多页/320宽只在计量与面板测试中验收。
4. 恢复标准字号，逐次选中第三栏并观察，再明确下选确认覆盖，第三栏正常保存06:54:55。再次Enter仅打开新的默认取消确认，取消后时间不变。third-saved/after-save-enter-default-cancel/after-save-cancel-same-time。
5. 返回主菜单正常读第三栏，霜松谷50,62/青阳15日21:50/晴，Lv13/342银/144命/67气、七类物品、无装备；顾夜尘关系15、四闻、每2次成功行动援攻9保持。read-select-third/readback-resources/readback-companion。前两栏本轮时间不变。

损坏载荷、读取异常、配额/回调失败、写前改变、手柄、窄屏为内存适配器测试，未对用户槽注入故障。写前比较不是跨标签原子锁。全过程不移动或推进游戏时间。

## 持续目标

docs/PROJECT-GOALS.md、DEEPENING-ACCEPTANCE.md与目标附件同步，tracker仍active。三章两处代价选择双结果与后续、三新终章完整旅程、两完整战斗路线、区域优化和旧v1/MOD/空坏资料/独立发行仍有缺口。Round144优先合法离门与照心石混合终章实走，作者源预检next-journey-scope.md不能作为结局实走证据。

文档收尾首次R48审计因README缺下一轮标记失败；补齐“Round 143 已完成；下一轮 Round 144”后重跑审计和文档专项，结果见docs-final.txt。
