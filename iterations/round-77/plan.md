# Round 77 计划：网页 CC0 像素人物与方向动画

## 本轮目标

接入可合法再分发、可辨识的像素人物素材，替换五区玩家与 NPC 当前的静态人物格；保留大地图、五区碰撞和资料驱动边界，加入方向 idle 帧与短步行循环。

## 用户故事

作为玩家，我希望在可移动的大地图场景中看清自己所操控的人物，并能从服饰上辨认不同 NPC；移动方向变化时，角色朝向和行走帧也应同步变化。

## 验收标准

- 素材来自已核验的 CC0 来源，`docs/REFERENCES.md` 登记来源、许可、裁切方式和发行范围。
- 生成一个小型透明人物图集，包含多种服饰外观的方向 idle 帧与步行帧；发行包只包含运行时图集及来源通知，不打包原始整套素材。
- 五张 100×100 地图均以资料声明玩家方向帧，NPC 外观继续由人物资料中的 `spriteFrame` 指定。
- 玩家使用方向键移动/碰撞受阻时仍能面向对应方向；行走帧随移动播放，并在动作结束后回到该方向 idle 帧。
- 旧地图或 MOD 缺省方向帧表时维持原静态帧回退；本轮不得改变五区碰撞格与既有玩法锚点。
- 专项测试验证图集有效像素、帧表、NPC 外观差异、旧数据兼容与发行清单；全量校验、发行 smoke 和浏览器手动复核通过。

## 预计人类工程师工时

3–4 小时（素材/帧序核验、生成工具与数据接入、运行时动画、测试/发行和文档）。

## 子任务

1. 搜索并核验可发行素材及许可，制作中心裁切的透明 16px 运行时图集和来源通知。
2. 扩展地图 Schema/资料与渲染、场景逻辑，让玩家按方向切换 idle/walk 帧，给五区 NPC 分配多样外观。
3. 更新跨轮回归、发行 smoke 和项目文档；检查旧 MOD 回退、全量构建与浏览器中的地图/人物表现。

## 涉及文件

- `scripts/sources/opengameart/puny-characters/`、`scripts/generate-round77-character-atlas.mjs`
- `data/assets/opengameart/puny-characters/`、`data/base/maps/*.json`、`data/base/characters/*.json`、`data/schema/grid-map.schema.json`
- `src/engine/grid-map.ts`、`src/engine/grid-map-renderer.ts`、`src/game/grid-scene.ts`
- `tests/round77-character-art.test.ts` 及人物/地图兼容回归、`scripts/package-release.mjs`、`scripts/smoke-round-47.mjs`、`package.json`
- `README.md`、`ROADMAP.md`、`CHANGELOG.md`、`DEVLOG.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`、`docs/MAP-ATLAS.md`、`docs/PLAYER-GUIDE.md`、`docs/REFERENCES.md`、`docs/TESTING.md`

## 风险

- 原始图集的方向行/动作帧次序若理解错误，会出现反向走路或攻击姿势冒充待机；接入前按原始图集逐格目检。
- 更新活动人物图集会改变旧测试对静态人物帧的假设；回归应继续锁定旧地形层与碰撞不变，并将人物授权/新帧表单独验证。
- 浏览器像素缩放、动画计时及键盘焦点会影响手动观察结果；记录实际确认范围，不把无法稳定复现的输入现象写成通过。
