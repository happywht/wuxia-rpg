# Round 78 计划：人物面向与纵深遮挡

## 本轮目标

让地图人物在对话/交互时彼此面向，并让伙伴跟随时回望玩家；地图资料可标出需要按纵深覆盖人物的树木、建筑等图层，角色与这些前景层依据行走深度正确排序。人物朝向、图层渲染策略仍由可校验 JSON 声明，旧地图/MOD 保持可运行。

## 用户故事

作为玩家，我希望按 E/F 与 NPC 交谈时双方自然转向对方，跟随伙伴能看向我；走到树木或建筑前后时，角色会被应该挡住的图素遮住，而不是始终浮在整张地图上方。

## 验收标准

- NPC Schema 与解析器支持可选四向 `spriteFrames`；帧号按地图人物图集范围校验，未提供时继续使用 `spriteFrame` 静态回退。
- 五区 NPC 资料为当前服饰外观声明四向 idle 帧；E/F 交互时玩家与 NPC 分别面向彼此，商店/任务板交互同样转向；伙伴跟随位置更新后面向玩家。
- 地图图层可选声明 `depthSort: "y"`；默认图层保持原静态背景路径，标记图层按行生成透明前景片，并与角色脚底深度共同排序。
- 五区玩家起点、碰撞网格、NPC/事件/关口等玩法锚点坐标及现有地表/环境装饰 GID 不变；旧地图和旧 MOD 缺省新字段仍通过解析和装配。
- 新增朝向数据/选择、深度分层/图集缓存键和旧格式回退专项测试；数据 Schema、全量测试、生产构建及发行子路径 smoke 通过。
- 在隔离预览页检查人物交谈面向、伙伴跟随、树/屋前后遮挡与两种窗口尺寸下 nearest-neighbor 像素边缘；记录无法稳定确认的范围。

## 预计人类工程师工时

3–4 小时（数据协议、人物状态、地图分层渲染、回归测试与浏览器验收）。

## 子任务

1. 扩展 NPC 四向帧资料与 Schema/解析/语义校验，接入交互面向和伙伴朝向，并维持静态 `spriteFrame` 回退。
2. 为地图 art 图层声明可选 y 深度排序；把被标记图层独立烘焙成按行前景片，使玩家、NPC、伙伴和前景片处于同一排序坐标系。
3. 锁定五区碰撞/玩法锚点与旧 MOD 兼容，补专项回归；复核隔离浏览器在不同窗口尺寸下的朝向、遮挡和像素采样，并更新文档/发行检查。

## 涉及文件

- `data/base/maps/*.json`、`data/base/characters/*.json`、`data/schema/grid-map.schema.json`、`data/schema/npc-set.schema.json`
- `src/engine/grid-map.ts`、`src/engine/grid-map-renderer.ts`、`src/engine/npc-placement.ts`、`src/game/grid-scene.ts`
- `scripts/generate-round78-actor-depth.mjs`、`package.json`、`tests/round78-actor-depth.test.ts` 及既有地图/NPC 回归
- `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`、`README.md`、`docs/MAP-ATLAS.md`、`docs/DATA-GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/TESTING.md`

## 风险

- 同行/相邻格交界处的 depth 相等会造成一帧闪烁或前后反转；为角色脚底与行前景设定稳定 tie-break，并覆盖精确相等情形。
- 纵深图层一旦过滤不进底图，缓存 key 必须区分渲染通道，否则 HMR/场景重载会复用旧合成图；Schema 约束 layer 格尺寸、命名和帧引用保持原规则。
- 100 行透明前景纹理会增加对象数；仅为实际含内容且声明 y 排序的行创建对象，避免扩大空世界/MOD 的渲染成本。
- 图片浏览器窗口尺寸不能完全等同系统浏览器缩放；把 viewport 检查如实记录为尺寸覆盖验证，不冒称所有平台缩放均已手测。
