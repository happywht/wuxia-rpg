# Round189 验证结果

## 静态路径与针对性回归

- 阅读`src/engine/item-system.ts`成功购买/出售路径，`src/game/shop-ui.ts`打开商铺与购买提交路径，`src/game/grid-scene.ts`奖励、制作调用、过图fare扣款，`src/engine/save-system.ts`货币快照/恢复。未发现任何单格移动直接修改银两的代码。代码检索不能证明本次实机历史输入是否有其他成交或奖励。
- `gate.r97-lanxin-to-pilot`和`gate.r97-pilot-to-lanxin`均未设置`fare`，fare缺省值0；因此当前数据下这两个关口不会造成201银扣款。
- 测试命令：`npx vitest run tests/round159-lanxin-supply.test.ts tests/round112-cloud-routes-supply.test.ts tests/round123-transition-cost.test.ts tests/round123-travel-refusals.test.ts`
- 结果：4个测试文件、41项测试通过。它们覆盖供应交易/路线补给与交通费用，不覆盖Round188 UI操作录像或给定slot的原位逐动作追踪。

## 当前实机证据

5181主菜单Continue列表明确选第三栏，槽摘要时间戳为2026/10/2 22:59:46，与Round188既有记录一致。正常读档到澜心洲(42,47)、约03:37，B余额573银。之后实际慢速实走66格至(64,3)，B仍573；再实走66格回(42,47)，B仍573。再次不写存档重读同一slot3，在起始时段按E实际打开候潮备药匣；面板余额573、回春膏库存3且单价15、清心丸库存2且单价12；Esc关闭后再开B仍573。未购买、出售、制作、交差、过图、手动保存；没有写入任一游戏存档槽。文字大小为读取槽摘要临时调大，已恢复标准。

因此“步行扣款”和“打开商店扣款”被本次同一slot3实测否定。Round188记372的画面读数与同slot重读不一致；现有留档没有Round188余额截图或运行日志可追溯其读数路径，不能确认是过往误读、当时加载状态不同或其他原因。路线结束后E未打开店铺而重读slot3后可打开，说明NPC位置/时段是相关条件，但前次具体坐标和时段未被记录，不将这一点写成确定原因。

回归命令：`npx vitest run tests/round159-lanxin-supply.test.ts tests/round112-cloud-routes-supply.test.ts tests/round123-transition-cost.test.ts tests/round123-travel-refusals.test.ts`，4文件/41项通过。Round34、Round48、Round173六区审计及100资源Schema于2026-10-02在本轮实测与文档更新后复跑，全部通过；见最终验证命令结果。

## 范围偏离与保留项

- 未按Enter尝试购买：`shop-ui.ts`确认该键立即调用`buyItem`并扣款，没有购买确认/取消页；为保留slot3隔离基线，不制造不可逆交易。本轮只验证开商店/关商店不扣款。
- 未跨图：澜心—引航礁两条关口在数据中fare均缺省0；与来回132格/商店开关的实机无扣款证据及既有过图单测结合，跨图不是定位201两历史观测矛盾的必要动作。避免扩大状态变化。
- 未覆盖保存：已通过正常Continue实际重新读回同一时间戳slot3完成持久化前后比对；后续读盘保持573，不对存档槽写入，以保存唯一可复核基线。
- Round188文件夹没有余额截图或运行日志附件，故不能追溯当时“372”面板读数对应的具体加载行为。它作为历史观察留存并标记冲突，不宣称错误已定位。

除专项测试外，本轮代码只读，未需Vite构建；文档/Schema/六区审计均按下方验证结果通过。
