# 世界舆图与区域旅行

Round 10 将单张网格地图扩展为由资料驱动的区域集合；Round 51 将起始区域扩展为 100×100 格的连续大地图，并换成公开 CC0 像素图集。地图尺寸、碰撞、分层贴图、区域命名、关口端点和区域事件仍由 `data/` 声明；引擎只执行通用协议。

## 当前地图资源总表

下表逐项列出当前 `data/base/manifest.json` 登记的全部 `grid-map` 资源及其在 `data/base/world/world-map.json` 中的区域声明（本表由 `npm run audit:round-34` 对照数据核验）：

| 地图资源 id | 区域名 | 舆图坐标 | 尺寸（列×行） | 玩家起点 | 瓦片通行性 |
|---|---|---:|---|---|---|
| `map.round-01-grid` | 江南道·七镇行旅 | (42, 50) | 100×100 | (43, 37) | `.` 可走；`#` 水域/树木/屋顶阻挡 |
| `map.round-10-mist-ferry` | 雾雨渡口 | (85, 80) | 16×9 | (7, 7) | `.`、`,` 可走；`~`、`#` 阻挡 |

- 世界图 `world.atlas` 的 `startingMapResourceId` 为 `map.round-01-grid`；每张地图的 `id` 与 manifest 资源 id 一致，地图格尺寸均为 48 世界像素。
- 起始大地图将 16×16 素材格最近邻放大至 48×48 世界像素；五个独立画面层从 Tiled GID 绘制，移动碰撞始终只看 `grid`，不会根据美术像素推断阻挡。
- 玩家行走在起始地图时镜头跟随并限制在地图范围内，HUD、面板与天气覆盖层固定在画面上；短渡口地图仍居中显示，不强行滚动。
- 芦苇河滩（`place.reedbank`）是知识图谱地点词条而非地图资源：当前世界没有第三张 `grid-map`，详见 [`WORLD-SETTING.md`](WORLD-SETTING.md) §2。

## 关口端点

`transitions` 中的 `from` 是玩家所在地图的交互格，`to` 是另一张地图的落点。当前基础世界声明的全部关口：

| 关口 id | 名称 | from（地图 · 格） | to（地图 · 格） |
|---|---|---|---|
| `gate.trial-to-ferry` | 石阶渡口 | `map.round-01-grid` · (90, 50) | `map.round-10-mist-ferry` · (1, 4) |
| `gate.ferry-to-trial` | 回望石阶 | `map.round-10-mist-ferry` · (2, 4) | `map.round-01-grid` · (89, 50) |

引擎装配规则（`src/engine/world-map.ts` 的 `assembleWorldMap`）：`from` 端点必须可走**且不得位于该图玩家出生格**；`to` 落点必须可走；两端地图必须都已登记进 `regions`。任一不满足即整条关口禁用并给出警告，不影响其他关口。协议不自动推断双向旅行——往返必须像上表一样显式声明两条记录。

## 区域事件触发格

当前基础世界声明的全部 `events`（坐标均为所在地图格）：

| 事件 id | 地图 · 格 | 一次性 | 条件 | 成功发现 |
|---|---|---|---|---|
| `event.trial-cloudbreak` | `map.round-01-grid` · (43, 36) | 是 | 无 | — |
| `event.ferry-first-arrival` | `map.round-10-mist-ferry` · (1, 4) | 是 | 无 | `event.old-footprints`（雨后的脚印） |
| `event.reedbank-traces` | `map.round-10-mist-ferry` · (5, 4) | 是 | 已知 `event.old-footprints`；时段 黄昏/入夜；天气 细雨/降雨/骤雨 | `place.reedbank`（芦苇河滩） |

### 随机漫游奇遇（Round 43–44）

`randomEvents` 不需要固定坐标，在当前地图完成一次成功走格后才尝试一次。引擎先筛选地图、线索、时段、天气都符合且尚未完成的一次性事件，再按 id 排序均匀选一个候选并掷其 `chance`；每步最多出现一则漫游奇遇。没有候选时不消耗随机数。读档沿用区域事件完成 id 保存已触发的一次性漫游奇遇；旧世界图可以省略 `randomEvents`，会按空数组解析。

| 奇遇 id | 地图 | 尝试概率 | 一次性 | 条件 | 成功发现 |
|---|---|---:|---|---|---|
| `event.r43-wayfarer-letter` | 雾雨渡口 (`map.round-10-mist-ferry`) · 成功走格时 | 12% | 是 | 已知 `event.old-footprints`；黄昏/入夜；细雨/降雨/骤雨 | `event.r43-wayfarer-letter`（风雨传函） |
| `event.r44-dock-claim` | 雾雨渡口 (`map.round-10-mist-ferry`) · 成功走格时 | 35% | 是 | 已知 `event.r43-wayfarer-letter`；黄昏；细雨/降雨/骤雨；邻近石北 (`char.shi-bei`) 与白鹭洲 (`char.bai-luzhou`) | `event.r44-dock-claim`（雨夜旧桩之争） |

玩家按 **M** 打开舆图，当前大地图底图和金色玩家位置标记随地图资料绘制。鼠标/触屏拖动可平移，滚轮可缩放，方向键小幅平移；缩放后地图边缘受视窗约束，不会漏出边框。按 **M** 或 **Esc** 收起，打开时探索输入锁定。相邻关口按 **E** 旅行。

## Round 51 地图美术资源

- 起始大地图使用 `data/assets/kenney/roguelike-rpg/roguelikeSheet_transparent.png` 的 16×16 地表、道路、林木、岸线、聚落与屋顶瓦片，以及该 CC0 素材包附带的 `scripts/sources/kenney-roguelike-sample-map.tmx` 五层 100×100 地图作为底稿。`scripts/import-round51-kenney-world.mjs` 可从底稿重建 JSON 图层和独立碰撞网格；扩展的林带、池塘、道路与第二聚落也都使用这张 CC0 图集。
- 玩家、NPC 和伙伴使用 `data/assets/kenney/tiny-dungeon/tilemap_packed.png` 中配置的人物帧。帧索引、图集尺寸和画面图层都随地图数据声明，NPC 可选 `spriteFrame` 覆盖默认人物帧。
- 两套图集的原始 `License.txt` 随游戏素材一起打包；许可来源、素材用途和发布边界见 [`REFERENCES.md`](REFERENCES.md) 与 [`PLAYER-GUIDE.md`](PLAYER-GUIDE.md)。美术素材可替换而不改变地图移动碰撞协议。

## 资料协议

1. 在 `data/base/manifest.json` 登记每份地图，schema id 使用 `grid-map`。地图 JSON 的 `id` 必须与 manifest resource id 完全相同。
2. 登记唯一的 `world-map` 资源。其 `startingMapResourceId` 必须指向一份有效地图；`regions` 为每张地图提供标题、说明和 0–100 的舆图相对坐标（端点与事件的坐标校验规则见上文「关口端点」「区域事件触发格」两节）。
3. `transitions` 声明关口的 `from`/`to` 端点；`events` 声明区域事件的触发格。二者的静态字段（id、名称、文本、坐标）由 `world-map` Schema 与解析器校验，跨地图/图谱/历法/气候引用在装配期逐条校验。
4. `events` 绑定固定可走格；`randomEvents` 是可选的漫游事件数组，每条需声明 `mapResourceId`、`chance`（0–1）与 `once`，可复用 `events` 的线索/时段/天气条件以及百科发现字段；`nearbyNpcIds` 要求列出的每名 NPC 都按当前地图和历法时段实际落位，并与玩家四向相邻。漫游事件只在成功走格后抽取，不会在等待、读档或跨区抵达时抽取。条件组之间为 AND：`knowledgeNodeIds` 中每个线索都必须已知，`periodIds` 和 `weatherIds` 各自按 OR 匹配一个当前值。条件未满足不会消耗一次性事件；固定格事件在移动、跨区抵达和原地等候后重查，漫游奇遇可在符合环境时继续走格重试。`once: true` 的两类事件只成功结算一次，完成 id 会随 v1 存档保存；固定格 `once: false` 每次检查都可提示。可选的 `discoverKnowledgeNodeId` 在成功触发时解锁一个已登记的百科节点；词条标题来自图谱资料。

世界地图语义解析器检查 id 唯一性、地图/区域引用、端点和事件坐标；事件的图谱节点、历法时段、天气引用也会逐条校验。坏事件（包括悬空条件引用）会单独禁用并写入诊断。地图装配完成后，若关口或事件格被 NPC/战斗遭遇占用，对应条目会被逐项隔离并写入诊断；同世界图中的其他有效条目仍可用。任一地图资源无效会使关键世界地图启动校验失败并给出资源诊断。

### 固定格渡口奇遇示例（Round 17）

基础世界把 `event.ferry-first-arrival` 放在雾雨渡口的入口 (1, 4)：初见脚印会记录 `event.old-footprints`。向东到芦苇边 (5, 4) 后，`event.reedbank-traces` 还要求脚印线索已知、时段为黄昏/入夜且天气为细雨/降雨/骤雨；成功会解锁 `place.reedbank`。若在该格等候，时段变化后会重新判定，提示会合并等待摘要和奇遇文本。

Round 43 的「风雨传函」是漫游奇遇：玩家已发现雨后脚印后，在雾雨渡口黄昏或夜间的细雨、降雨、骤雨中行走，每成功走一步有 12% 概率遇到赶路人。该奇遇只发出一次，记录同名百科见闻；此后五派导师才会分别展示本门限定的求助支线。概率由可注入随机数的纯选择器执行，自动化测试不依赖实际运气。

Round 44 的「雨夜旧桩之争」沿用相同的一次性漫游事件状态：收到风雨传函后，只有黄昏雨天走格，并且石北、白鹭洲按该时段日程落位后同时与玩家四向相邻，才会参与概率抽取。事件触发后在白鹭洲处选择「先固旧桩」或「先核渡簿」之一；任务完成时一次性结算铁嶂派/寒山书院声望与对应百科见闻。事件条件里声明的是 NPC id，装配期对照 NPC 资料校验，运行期使用实际地图和时段落位，不看动画插值坐标。

```json
{
  "id": "event.example-rumor",
  "mapResourceId": "map.example",
  "col": 4,
  "row": 2,
  "text": "原创区域见闻文本。",
  "once": true,
  "conditions": {
    "knowledgeNodeIds": ["event.example-clue"],
    "periodIds": ["period.dusk", "period.night"],
    "weatherIds": ["weather.rain", "weather.storm"]
  },
  "discoverKnowledgeNodeId": "place.example"
}
```

## NPC 跨区域日程

Round 16 的 NPC 日程跟随人物记录的 `mapResourceId`，在该地图的网格内按 `calendar.json` 时段切换坐标。日程不会自动跨图传送人物：每名 NPC 只在自己声明的地图出现，进入新区域后仅按抵达时段放置当地人物。时段引用、地图边界/可走性、出生格、NPC/遭遇占位由加载期校验；坏日程项回退该 NPC 的基础位置并留下告警。存档仅保留历法分钟数，读档会按当前区域和该时段派生日程。字段例子、冲突处理及资料覆盖详见 [`NPC-SCHEDULES.md`](NPC-SCHEDULES.md)。

## 增加区域的步骤

1. 在 `data/base/maps/` 增加地图 JSON，并在 manifest 注册为 `grid-map`。
2. 在 `data/base/world/world-map.json` 增加区域节点及舆图坐标；如需往返旅行，为两个方向分别配置关口记录。
3. 为 NPC、遭遇和区域事件填对应地图资源 id；NPC 如使用时段日程，检查每个时段下的位置占位。区域事件的线索 id、时段 id、天气 id 和发现节点 id 必须分别存在于知识图谱、历法与气候资料中。
4. 运行项目 build 和资料校验，检查启动诊断，再手动走过正反两个关口、区域事件和保存/读档流程。

存档位置及旧 v1 字段兼容规则见 [`SAVES.md`](SAVES.md)。资料目录、MOD 覆盖和 Schema 约定见 [`DATA-GUIDE.md`](DATA-GUIDE.md)。
