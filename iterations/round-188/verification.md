# Round188 验证记录

## 计划与实际

- 目标：以隔离存档核实澜心洲—引航礁出口、季无潮补给路线和库存，并安全存读；计划见`plan.md`。
- 完成：引航礁返回澜心洲的出口在从关口邻格正常交互后切图成功；澜心入口至季无潮邻位按HUD分段走南44格、西22格，共66个成功格。路线段未见战斗、互动或区域事件。候潮备药匣显示回春膏3×15两、清心丸2×12两；未购买。
- 保存：仅操作隔离页第三栏。22:59:46保存后从主菜单读回，位置(42,47)、03:37、372银及库存3/2保持；5178及隔离页槽1/2未写。
- 限制：完整澜心—引航礁往返总步数、去程准确步数、过关分钟和起始游戏时刻不可从现有记录精确重建，不填估值。

## 未解释差异

Round187摊位附近显示573银；Round188从澜心入口的R补给页面也显示573银。完成66格路线、没有有意确认购买后，B及商店页显示372银，差额201；库存仍为3/2且读回保留372。当前证据无法确定变更动作或时间，不能推断为步行成本，也不注资或回写其他槽。此问题移交Round189做隔离档逐操作对照。

## 自动验证

命令：

```text
npx vitest run tests/round159-lanxin-supply.test.ts tests/round160-shop-guide-hint.test.ts tests/round123-transition-cost.test.ts
npm run validate:data
npm run audit:round-173-six-region-evidence
npm run audit:round-34
npm run audit:round-48-docs
git diff --check
```

结果：专项3个测试文件/30项通过；100项资源Schema通过；六区证据审计通过（6区、19个引用，保留1项来源勘误及明确缺口）；Round34与Round48文档审计通过；`git diff --check`退出码0，ROADMAP与PLAYER-GUIDE报告CRLF格式提示。未更改运行时代码或玩法资料，故没有声称代码缺陷修复；Round189继续确认银两差异的成因。
