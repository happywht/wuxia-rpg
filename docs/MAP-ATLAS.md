# 世界舆图与区域旅行

Round 10 将单张网格地图扩展为由资料驱动的区域集合；Round 51 将起始区域扩展为 100×100 格的连续大地图，并换成公开 CC0 像素图集；Round 52 校正视觉地图坐标并加入资料地标图例及独立视口相机裁切；Round 55 将雾雨渡口扩建为第二张 100×100 十层 CC0 大地图并新增四个渡口地标；Round 57 让已选地标目的地在区域间接续；Round 62 新增第三块 100×100 铁嶂北道山地大区；Round 65 以官方 RPG Urban Pack 图集为起始区域增绘城镇街市两层，并把百格地图人物精灵升级为多帧正式像素人物；Round 66 增加独立 128×80 格五层全域地理总图；Round 67 新增第四张 100×100 西陲盐道地图，并把全域地理总图扩至 176×112 格；Round 68 以四区真实资料串联长途、存档与结局回归。玩家可在四区总览与当前区域细图间切换，拖动、缩放和方向键平移。地图尺寸、碰撞、分层贴图、区域命名、地标、关口端点和区域事件仍由 `data/` 声明；引擎只执行通用协议。

## 当前地图资源总表

下表逐项列出当前 `data/base/manifest.json` 登记的全部 `grid-map` 资源及其在 `data/base/world/world-map.json` 中的区域声明（本表由 `npm run audit:round-34` 对照数据核验）：

| 地图资源 id | 区域名 | 舆图坐标 | 尺寸（列×行） | 玩家起点 | 瓦片通行性 |
|---|---|---:|---|---|---|
| `map.round-01-grid` | 江南道·七镇行旅 | (24, 52) | 100×100 | (43, 37) | `.` 可走；`#` 水域/树木/屋顶阻挡 |
| `map.round-10-mist-ferry` | 雾雨渡口 | (76, 70) | 100×100 | (7, 7) | `.`、`,` 可走；`~`、`#` 阻挡 |
| `map.round-62-iron-ridge` | 铁嶂北道·岩关驿镇 | (76, 30) | 100×100 | (4, 7) | `.`、`,` 可走；`#` 岩壁/松林阻挡 |
| `map.round-67-salt-road` | 西陲盐道·青岩驿 | (24, 70) | 100×100 | (95, 74) | `.`、`,` 可走；`#` 盐碱岩脊/驿镇墙体阻挡 |

- 世界图 `world.atlas` 的 `startingMapResourceId` 为 `map.round-01-grid`；每张地图的 `id` 与 manifest 资源 id 一致，地图格尺寸均为 48 世界像素。
- 四张百格大地图均将 16×16 素材格最近邻放大至 48×48 世界像素；独立画面层从 Tiled GID 绘制（起始图七层、渡口图十层、铁嶂北道八层、西陲盐道十层），移动碰撞始终只看 `grid`，不会根据美术像素推断阻挡。
- 玩家行走在四张百格大地图时镜头均跟随并限制在地图范围内；地图视觉对象显式采用世界滚动系数，不继承场景为 HUD 设定的固定坐标。HUD、面板与天气覆盖层固定在画面上。
- 芦苇河滩（`place.reedbank`）仍是知识图谱地点词条而非地图资源：第三张 `grid-map` 是铁嶂北道，河滩不可旅行，详见 [`WORLD-SETTING.md`](WORLD-SETTING.md) §2。

## 关口端点

`transitions` 中的 `from` 是玩家所在地图的交互格，`to` 是另一张地图的落点。当前基础世界声明的全部关口：

| 关口 id | 名称 | from（地图 · 格） | to（地图 · 格） |
|---|---|---|---|
| `gate.trial-to-ferry` | 石阶渡口 | `map.round-01-grid` · (90, 50) | `map.round-10-mist-ferry` · (1, 4) |
| `gate.ferry-to-trial` | 回望石阶 | `map.round-10-mist-ferry` · (2, 4) | `map.round-01-grid` · (89, 50) |
| `gate.ferry-north-to-iron-ridge` | 雾岬北口 | `map.round-10-mist-ferry` · (89, 15) | `map.round-62-iron-ridge` · (4, 7) |
| `gate.iron-ridge-to-ferry-north` | 铁嶂南隘 | `map.round-62-iron-ridge` · (3, 7) | `map.round-10-mist-ferry` · (89, 16) |
| `gate.iron-ridge-to-salt-road` | 石脊西道 | `map.round-62-iron-ridge` · (52, 90) | `map.round-67-salt-road` · (95, 74) |
| `gate.salt-road-to-iron-ridge` | 青岩东关 | `map.round-67-salt-road` · (94, 74) | `map.round-62-iron-ridge` · (53, 90) |

引擎装配规则（`src/engine/world-map.ts` 的 `assembleWorldMap`）：`from` 端点必须可走**且不得位于该图玩家出生格**；`to` 落点必须可走；两端地图必须都已登记进 `regions`。任一不满足即整条关口禁用并给出警告，不影响其他关口。协议不自动推断双向旅行——往返必须像上表一样显式声明两条记录。

## 区域事件触发格

当前基础世界声明的全部 `events`（坐标均为所在地图格）：

| 事件 id | 地图 · 格 | 一次性 | 条件 | 成功发现 |
|---|---|---|---|---|
| `event.trial-cloudbreak` | `map.round-01-grid` · (43, 36) | 是 | 无 | — |
| `event.ferry-first-arrival` | `map.round-10-mist-ferry` · (1, 4) | 是 | 无 | `event.old-footprints`（雨后的脚印） |
| `event.reedbank-traces` | `map.round-10-mist-ferry` · (5, 4) | 是 | 已知 `event.old-footprints`；时段 黄昏/入夜；天气 细雨/降雨/骤雨 | `place.reedbank`（芦苇河滩） |
| `event.r55-sluice-inscription` | `map.round-10-mist-ferry` · (46, 53) | 是 | 无 | `place.mist-sluice`（旧渠石闸） |
| `event.r56-north-water-gauge` | `map.round-10-mist-ferry` · (86, 15) | 是 | 无 | `place.mist-north-cap`（雾岬北岸水尺） |
| `event.r56-south-waterway-mark` | `map.round-10-mist-ferry` · (81, 87) | 是 | 无 | `place.mist-south-pool`（南湾苇池） |
| `event.r58-market-first-visit` | `map.round-10-mist-ferry` · (59, 65) | 是 | 无 | `place.mist-willow-market`（芦桥集） |
| `event.r58-south-hamlet-arrival` | `map.round-01-grid` · (70, 75) | 是 | 无 | `place.south-hamlet`（南麓聚落） |
| `event.r62-ridge-arrival` | `map.round-62-iron-ridge` · (4, 7) | 是 | 无 | `map.round-62-iron-ridge`（铁嶂北道·岩关驿镇） |
| `event.r62-pass-marks` | `map.round-62-iron-ridge` · (30, 29) | 是 | 无 | `place.iron-ridge-pass`（碎岭旧道） |
| `event.r62-post-ledger` | `map.round-62-iron-ridge` · (51, 49) | 是 | 无 | `place.iron-ridge-post`（岩关驿镇） |
| `event.r62-beacon-code` | `map.round-62-iron-ridge` · (84, 83) | 是 | 无 | `place.iron-ridge-beacon`（北脊旧烽台） |
| `event.r67-salt-road-arrival` | `map.round-67-salt-road` · (95, 74) | 是 | 无 | `map.round-67-salt-road`（西陲盐道·青岩驿） |
| `event.r67-well-reading` | `map.round-67-salt-road` · (26, 28) | 是 | 无 | `place.r67-brine-well`（回声苦井） |

### 随机漫游奇遇（Round 43–44）

`randomEvents` 不需要固定坐标，在当前地图完成一次成功走格后才尝试一次。引擎先筛选地图、线索、时段、天气都符合且尚未完成的一次性事件，再按 id 排序均匀选一个候选并掷其 `chance`；每步最多出现一则漫游奇遇。没有候选时不消耗随机数。读档沿用区域事件完成 id 保存已触发的一次性漫游奇遇；旧世界图可以省略 `randomEvents`，会按空数组解析。

| 奇遇 id | 地图 | 尝试概率 | 一次性 | 条件 | 成功发现 |
|---|---|---:|---|---|---|
| `event.r43-wayfarer-letter` | 雾雨渡口 (`map.round-10-mist-ferry`) · 成功走格时 | 12% | 是 | 已知 `event.old-footprints`；黄昏/入夜；细雨/降雨/骤雨 | `event.r43-wayfarer-letter`（风雨传函） |
| `event.r44-dock-claim` | 雾雨渡口 (`map.round-10-mist-ferry`) · 成功走格时 | 35% | 是 | 已知 `event.r43-wayfarer-letter`；黄昏；细雨/降雨/骤雨；邻近石北 (`char.shi-bei`) 与白鹭洲 (`char.bai-luzhou`) | `event.r44-dock-claim`（雨夜旧桩之争） |

玩家按 **M** 打开舆图，当前大地图底图和金色玩家位置标记随地图资料绘制。鼠标/触屏拖动可平移，滚轮可缩放，方向键小幅平移；缩放后地图边缘受视窗约束，不会漏出边框。按 **M** 或 **Esc** 收起，打开时探索输入锁定。相邻关口按 **E** 旅行。

## Round 52 资料地标与舆图裁切

`world-map.json` 可选 `landmarks` 数组以格坐标声明一个地图上的关注点；旧资料省略该字段时解析为空列表。每条地标包含唯一 `id`、`mapResourceId`、`col`、`row`、数据标题 `name` 与通用 `category`（`settlement`、`water`、`crossing`、`route`、`other`）；可选 `discoveryNodeId` 引用知识图谱节点，控制地点何时向玩家显露。JSON Schema 检查字段/类别，运行时装配再检查地图是否已登记、坐标是否在地图范围内及发现节点是否存在；失效条目单独警告并跳过。类别只映射通用图例颜色，不在引擎中绑定某个具体地点名。

基础世界资料登记西北聚落、村北湖泊、东野池塘、南麓聚落、石阶渡口与芦岸登船点，以及雾岬林地 (86,15)、芦桥集 (59,65)、旧渠石闸 (46,53) 与南湾苇池 (81,87)；芦岸登船点、旧渠石闸、雾岬林地和南湾苇池需先发现关联见闻才会显露。Round 56 在雾岬与南湾的同名地标格配置一回性区域事件，发现 `place.mist-north-cap` / `place.mist-south-pool` 后才公开舆图标记；路线可直达两个事件格。M 面板在本区图上画出可见地标色点、玩家金点，并在侧栏列出已知地点。地图图像和标点放入只供舆图相机绘制的内容容器；独立相机视口将其裁切到地图窗口，所以高倍率平移不能盖住标题或右侧图例。玩家仍可使用鼠标/触屏拖动、窗口内滚轮和方向键来定位，关闭时销毁临时相机并卸载输入监听。

## Round 53 地标导航与地点发现

M 舆图的侧栏可点选已知地点或关口，直接点选地图内的色点也可选为寻路目标。路线按地图 `grid` 的阻挡定义进行确定性四向最短路搜索，不会穿过水面、房舍或墙体；如果一个地标标在不可行格，路线结束在两格内最近的可行停靠点。地图上会叠画路线，并显示步行格数、方向分段；去往关口的路线终点是可按 E 的相邻可行格。关口额外显示抵达后连接的区域。舆图关闭时探索输入仍由原系统处理，当前运行选中的地标 id 会保留；走格后 HUD 和重开舆图都会按新坐标重新计算本区路线。此功能提供导航提示，不自动移动或传送角色。

地标若带 `discoveryNodeId`，玩家没有对应见闻时，该标记、标题、类别、清单项与计数都不会进入舆图；已知集合与 M 面板一起从当前运行状态传入。基础资料把芦岸登船点关联到 `place.reedbank`，该词条在雾雨渡口的脚印探索事件后才被发现。缺引用的发现节点会在世界地图装配时隔离该行并给诊断，不会让无关地标失效。

## Round 54 跨区域行程与 waypoint 操作

`src/engine/world-travel.ts` 在已装配的 `regions` 与 `transitions` 上执行 Phaser-free 有向 BFS。关口只按 `from → to` 单向使用，不从资料外推反向连接；同长度路线按关口 id 稳定决胜。起点等于终点时返回零段行程，未知地图与孤立区域返回 `null`。`world-navigation.ts` 把所选远区目的地投影到当前地图首段关口格，所以本区寻路从不读取另一张地图的无关格坐标；抵达后重开舆图会以当前地图重新投影下一关。

清单含本区地标、本区出入口、直接关口目标区域，以及已发现的远区地标。直接相邻区域名来自玩家可见的关口连接；更深层的区域名不会因后台存在一条可达路径就出现在候选中。远区地点仍先经过 `discoveryNodeId` 过滤，再生成带途经区域的行程；没有发现时不泄露地点 id、名称、类别或候选终点区域。远区候选共用当前首关口坐标，不额外绘制重叠 pin。

## Round 57 跨区目的地接续

选择任一可见地标后，场景只保留其稳定地标 id；关掉或重新打开 M 时，舆图在当前区域重新投影并恢复该目标的选择。每次成功走格、通过关口或切换资料后，Phaser-free 指引函数根据当前区域重新求有向剩余路线，并在当前 100×100 碰撞网格上重算下一段路径。HUD 显示目的地、本地图内的方向和格数；跨区时路线停在关口四向可行的交互格，站到那里后提示按 E 过关。目标在本区到达地标格或阻挡地标两格内的可行停靠点时清除；资料目标/路线失效或本区无路时也清理目标并显示重新规划提示。

## Round 58 两地任务发现点

「芦桥寻集」沿旧渠碑记和南湾浅槽指向芦桥集；玩家步入已常显地标格 `(59,65)` 时触发一次事件并解锁 `place.mist-willow-market`。江南道「南麓寻村」则在既有聚落地标 `(70,75)` 首次步入时解锁 `place.south-hamlet`。两处区域事件都从对应图的出生点可达，并与同格地标重合；本轮不为这些新词条添加 `discoveryNodeId` 到既有地标，老存档仍可照常看见芦桥集和南麓聚落。

两场差事遭遇也在百格碰撞图上可达：芦桥集外沿的旧例索钱人位于雾雨渡口 `(60,67)`，东野池塘附近的冒牌护药队位于江南道 `(80,20)`。后者避开东野池塘地标的阻挡格 `(80,25)`，两者都使用可重战遭遇；无论初次到访时是否已赢过，接到任务后仍能挑战并推进/失败对应任务。

## Round 62 铁嶂北道·岩关驿镇

`map.round-62-iron-ridge` 是第三块可玩百格区域，舆图坐标 `(83,20)`，入口与出生格为 `(4,7)`。确定性生成器 `scripts/generate-round62-iron-ridge.mjs`（`npm run generate:round-62-iron-ridge`）复用已登记的 Kenney 官方 CC0 Roguelike/RPG 与 Tiny Dungeon 图集，构成八层地表、岩脊、松林、驿镇与山路贴图；独立碰撞网格含 7,818 个可行格。道路贯穿南关、碎岭旧道、岩关驿镇并分支通往北脊旧烽台；生成前会保护所有关口、地标、事件、人物日程和遭遇锚点，并以四向 BFS 验证从入口可达。

| 关口 | 坐标与去向 |
|---|---|
| 雾岬北口 | 渡口 `map.round-10-mist-ferry` `(89,15)` → 铁嶂北道 `map.round-62-iron-ridge` `(4,7)` |
| 铁嶂南隘 | 铁嶂北道 `map.round-62-iron-ridge` `(3,7)` → 渡口 `map.round-10-mist-ferry` `(89,16)` |

四个地标分别是铁嶂南隘 `(4,7)`、碎岭旧道 `(30,29)`、岩关驿镇 `(51,49)`、北脊旧烽台 `(84,83)`。四处一次性发现事件分别发现大区、旧道、驿镇与烽台词条；详见本节上方「区域事件触发格」表。

驿镇邵长庚 `(48,49)` 发布「北隘校标 → 驿镇更次 → 碎岭清道」三段差事；秦素砚 `(57,49)` 承接第二段谈话目标。第一段要求先发现雾岬北岸水尺见闻，再去碎岭旧道核对界石；第二段校对烽台巡山更次；第三段击退碎岭拦路客并提升铁嶂派声望。北脊另有可重战的烽台盗石人遭遇。Round 62 专项测试把两位 NPC 的基础/日程位置、两场遭遇和三个任务目标按七个时段执行占位感知路线检查；两个方向关口仍需玩家实际走到后按 E 通行。

本区只复用现有 Kenney CC0 图集，没有新增下载素材；具体素材包授权与用途见 [`REFERENCES.md`](REFERENCES.md) 第六节。

关口移动和切区仍由玩家手动完成，没有自动寻路移动或传送。行路目标属于临时运行状态，不写入 v1 存档；读档后可从 M 舆图重新选择。

鼠标点侧栏行或当前地图 pin 会选中目的地并在面板保持打开时显示首段路径/行程；在 FIT 缩放画布中，点击的 CSS 纵坐标会按 canvas backing/client 高度比转为逻辑画布坐标，列表、pin、拖图和滚轮共用此变换。地图拖动与 pin 点击以是否产生位移区分。键盘可用 **W/S** 循环 waypoint 并以 **Enter** 规划，**M/Esc** 关闭时清除焦点和当前选择。导航只给路线提示，切换区域仍要求玩家实际步行至关口并按 **E**。

## Round 55 第二块百格可步行区域

`map.round-10-mist-ferry` 由 16×9 过场小图扩建为 100×100 十层 CC0 像素河湾地貌：草地、岸线、繁花与林木四层构成河流走廊，五层芦桥集渡镇聚落叠在东南，一层步径贯穿全图；独立碰撞网格给出 7,340 个可行格（`,` 芦苇滩草地与 `.` 地面可走，`~` 江水与 `#` 岩岸阻挡），林木层含 388 处树木精灵。地图由确定性生成脚本 `scripts/generate-round55-ferry-world.mjs` 重建（`npm run generate:round-55-ferry`）：以格坐标种子哈希与折线河道路径距离场铺地貌，并对全部关口端点、区域事件格、NPC 基础/日程位、遇怪格与出生点设保护落点——出生点 (7,7)、两向关口、既有事件、五名 NPC 日程与三处遇怪格均原位保留，专项回归以 BFS 从出生点锁定这些锚点可达。

- 素材仅复用已授权 Kenney Roguelike/RPG 与 Tiny Dungeon 图集（许可登记见 [`REFERENCES.md`](REFERENCES.md) 第六节），未新增外部资产；两张图集原始 `License.txt` 继续随游戏素材分发。
- 世界图同步登记雾岬林地 (86,15)、芦桥集 (59,65)、旧渠石闸 (46,53)、南湾苇池 (81,87) 四个渡口地标；旧渠石闸带 `discoveryNodeId: place.mist-sluice`，在碑记事件 `event.r55-sluice-inscription` (46,53) 触发前不进入舆图展示。
- `scripts/import-round51-kenney-world.mjs` 收窄为只重建起始大地图，不再改写渡口地图；渡口图层的唯一来源是 Round 55 生成脚本，防止重建起始图时覆盖第二区域。
- 浏览器跨区往返闭环：江南道石阶渡口关卡 (90,50) → 渡口落点 (1,4) → 芦桥集 (59,65) → 旧渠石闸 (46,53) 解锁见闻 → 回望石阶关口 (2,4) → 江南道 (89,50)；详见 `DEVLOG.md` Round 55。

## Round 56 巡标事件与发现任务闭环

雾岬北岸水尺 `(86,15)` 和南湾旧水标 `(81,87)` 各有一条固定格一次性事件，事件落在相同地标坐标并发现关联地点知识节点。两格均从渡口出生点按碰撞网格可达；地图标记直到对应地点见闻被发现后才出现。

石北发布的「雾岬水尺巡查」要求先发现旧渠石闸，再实际走到北岸水尺；完成后解锁「南湾水路测绘」，继续发现南湾苇池。任务使用通用 `discoverKnowledge` 目标：匹配的新发现信号一次推进，接取时按已知见闻回填；旧兼容存档恢复后也会依据玩家已知节点重算活动任务，不改变 v1 存档字段。任务发布人、先后关系、区域事件和事件所在地点都在图谱中相连。专项覆盖见 [`tests/round56-discovery-quests.test.ts`](../tests/round56-discovery-quests.test.ts) 与 [`iterations/round-56/plan.md`](../iterations/round-56/plan.md)。

## Round 65 城镇街市美术与人物精灵

回应试玩反馈的起始区域美术升级：起始大地图在既有五层 Tiled 美术之上新增 `urban-street-ground`（铺装街面）与 `urban-street-details`（路面细节）两个图层，素材来自官方 Kenney RPG Urban Pack（CC0）。生成器 `scripts/import-round65-urban-town.mjs` 只在原装饰层 2–5 均为空的可走格绘制小型街面、车道和市集铺地，共 42 格铺装；另在新街面上叠加 2 个井盖细节。近出生点阻挡格原本绘有墓园石碑、围墙与墓道，故本轮没有把它们误判为商铺或空白建筑位，没有放置门面/街灯/消防栓/行道树，也不覆盖现有土路。碰撞网格 `grid` 一格未动；数据测试逐格确认铺装可走且不压旧装饰，井盖一定有新路面底层，出生点、NPC、任务与跨区关口仍可达。三张百格地图的人物图集同轮切换到该图集：人物格只存在于图集列 23–26 的 4 格组（23–26 深色便装、131–134 浅色长袍、239–242 红褐上衣、347–350 橄榄工装、455–458 蓝色制服，每组为同一人物的 4 个静态朝向/姿态格），玩家用 24，14 名 NPC 的 `spriteFrame` 分配其中 14 个互异格，帧号仍完全由地图/NPC JSON 数据驱动，引擎无任何人物硬编码；专项测试同时守卫"角色列帧禁入环境图层"与"角色帧必须落在角色列"。专项审计见 [`tests/round65-urban-art.test.ts`](../tests/round65-urban-art.test.ts)。

## Round 66–67 全域可移动舆图

`data/base/world/world-map.json` 可选 `atlasArt` 声明独立的全域像素底图，`scripts/generate-round66-atlas.mjs`（`npm run generate:round-66-atlas`）从世界区域坐标、已装配大地图与明确登记的 Kenney Roguelike CC0 图集确定性生成 176×112 格、16 像素/格、五个分层的海面/陆地/海岸/地貌/道路。Round 67 重排四个区域锚点，让江南道/西陲盐道占据西侧、渡口/铁嶂北道占据东侧，留出可平移的开阔全图。`world-map.schema.json` 与 Phaser-free `parseWorldMap` 均检查尺寸、图集引用、图层网格和瓦片范围；旧世界资料与不声明 `atlasArt` 的 MOD 仍可用，M 面板回退到本区细图。

M 默认打开宽幅全域总览：`regions[].atlasPosition` 决定区域落点，地图格换算为该区域在全图上的呈现范围，真实 `transitions.from/to` 端点生成关口连线，当前位置和 `discoveryNodeId` 门控后的已知地标由同一组投影函数计算。区域名和标题完全来自世界资料。玩家可拖动地图、用窗口内滚轮缩放或方向键平移；相机将图像与标记裁切在视窗内。按 **G** 或点击右上角按钮切到本区细图，原有格级路线、已选目的地与跨区行程提示仍按地图碰撞/关口规则运行；总览连线仅表达资料中的旅行连接，不会自动移动或传送。舆图会在 **M/Esc** 关闭。

专项 `tests/round66-world-atlas.test.ts` 与 `tests/round67-salt-road.test.ts` 覆盖两版全图尺寸、五层图像数据、瓦片 GID 范围、旧资料回退、运行时错误输入、全部区域/关口/玩家坐标投影、地图边界与未发现地标隔离。确定性生成器在浏览器里实测后调整为连续主地表与更成片的林/脊线覆盖，以免缩放适配时呈现成噪点。

## Round 67 西陲盐道·青岩驿

西陲盐道是第四块 100×100 可玩区域，位于全域舆图 `(24,70)`，从铁嶂北道石脊西道 `(52,90)` 抵达盐道青岩东关 `(95,74)`，另以盐道 `(94,74)` 回到铁嶂 `(53,90)`。`scripts/generate-round67-salt-road.mjs` / `npm run generate:round-67-salt-road` 确定性生成十层地貌、盐地覆盖、山路与驿站画面，独立碰撞图从新区域入口经 BFS 可达 8,280 格；生成器保护 58 个关口、地标、事件、NPC 日程、遭遇及其他游戏锚点。

四个地图地标为青岩东关 `(95,74)`、青岩驿 `(48,49)`、回声苦井 `(26,28)`、白石晒盐坪 `(76,25)`。苦井地标仅在知识节点 `place.r67-brine-well` 已知后显露。首次抵达事件记录整个大区；苦井事件读出井壁水线并解锁地点见闻。驿站 NPC 罗金子 `(48,49)` 按晨光/夜间日程换位，提供「苦井辨线」差事：发现苦井后带回路线线索，完成时获得 24 经验与 17 银两。盐道另有可重战的拦路遭遇。区域、图层、人物、任务、发现、路线与奖励均为数据驱动，继续复用现有 Kenney CC0 图集，不新增授权来源。

## Round 68 四区长途旅程验证

`tests/round68-long-journey.test.ts` 使用四张基础地图与全域关口资料、日历/气候、NPC 时段布置、遭遇、对白/任务、区域发现、v1 存档和结局定义，逐格从江南道走到西陲盐道并回到雾雨渡口。每段动态寻路在关口四向相邻格停止后才按真实旅行耗时切图；行程推进 974 游戏分钟、跨入第二日，覆盖六个昼夜时段、发现脚印和苦井，盐道存档恢复后完成「苦井辨线」并选择「行舟万里」。

隔离浏览器本轮另实走 67 格至江南道石阶渡口，按 E 到达雾雨渡口入口；实测全域总览/本区细图、滚轮缩放、拖动平移、选择关口和重新规划。跨四区/存档/结局的完整旅程是自动化引擎回归，不计为浏览器手测；操作路径与边界见 [`ROUND-68-JOURNEY-PLAYTEST.md`](ROUND-68-JOURNEY-PLAYTEST.md)。

## Round 51 地图美术资源

- 起始大地图使用 `data/assets/kenney/roguelike-rpg/roguelikeSheet_transparent.png` 的 16×16 地表、道路、林木、岸线、聚落与屋顶瓦片，以及该 CC0 素材包附带的 `scripts/sources/kenney-roguelike-sample-map.tmx` 五层 100×100 地图作为底稿。`scripts/import-round51-kenney-world.mjs` 可从底稿重建**起始大地图**的 JSON 图层和独立碰撞网格（Round 55 起不再改写雾雨渡口地图，见上文「Round 55」一节）；扩展的林带、池塘、道路与第二聚落也都使用这张 CC0 图集。Round 65 起起始地图另有叠加其上的城镇街市两层（见上节）。
- 玩家、NPC 和伙伴的人物帧：Round 51–64 使用 `data/assets/kenney/tiny-dungeon/tilemap_packed.png`；Round 65 起百格地图的 `art.actors` 与全部 NPC 帧改用 `data/assets/kenney/rpg-urban-pack/tilemap_packed.png`（432×288、27×18、16px、0 间距）。帧索引、图集尺寸和画面图层都随地图数据声明，NPC 可选 `spriteFrame` 覆盖默认人物帧。
- 三套图集的原始 `License.txt` 随游戏素材一起打包；许可来源、素材用途和发布边界见 [`REFERENCES.md`](REFERENCES.md) 第六节与 [`PLAYER-GUIDE.md`](PLAYER-GUIDE.md)。美术素材可替换而不改变地图移动碰撞协议。

## 资料协议

1. 在 `data/base/manifest.json` 登记每份地图，schema id 使用 `grid-map`。地图 JSON 的 `id` 必须与 manifest resource id 完全相同。
2. 登记唯一的 `world-map` 资源。其 `startingMapResourceId` 必须指向一份有效地图；`regions` 为每张地图提供标题、说明和 0–100 的舆图相对坐标；可选 `landmarks` 为相应地图提供地图内格坐标地标（端点与事件的坐标校验规则见上文「关口端点」「区域事件触发格」两节）。
3. `transitions` 声明关口的 `from`/`to` 端点；`events` 声明区域事件的触发格。二者的静态字段（id、名称、文本、坐标）由 `world-map` Schema 与解析器校验，跨地图/图谱/历法/气候引用在装配期逐条校验。
4. `events` 绑定固定可走格；`randomEvents` 是可选的漫游事件数组，每条需声明 `mapResourceId`、`chance`（0–1）与 `once`，可复用 `events` 的线索/时段/天气条件以及百科发现字段；`nearbyNpcIds` 要求列出的每名 NPC 都按当前地图和历法时段实际落位，并与玩家四向相邻。漫游事件只在成功走格后抽取，不会在等待、读档或跨区抵达时抽取。条件组之间为 AND：`knowledgeNodeIds` 中每个线索都必须已知，`periodIds` 和 `weatherIds` 各自按 OR 匹配一个当前值。条件未满足不会消耗一次性事件；固定格事件在移动、跨区抵达和原地等候后重查，漫游奇遇可在符合环境时继续走格重试。`once: true` 的两类事件只成功结算一次，完成 id 会随 v1 存档保存；固定格 `once: false` 每次检查都可提示。可选的 `discoverKnowledgeNodeId` 在成功触发时解锁一个已登记的百科节点；词条标题来自图谱资料。

世界地图语义解析器检查 id 唯一性、地图/区域引用、地标坐标、端点和事件坐标；事件的图谱节点、历法时段、天气引用也会逐条校验。坏地标或事件（包括悬空条件引用）会单独禁用并写入诊断。地图装配完成后，若关口或事件格被 NPC/战斗遭遇占用，对应条目会被逐项隔离并写入诊断；同世界图中的其他有效条目仍可用。任一地图资源无效会使关键世界地图启动校验失败并给出资源诊断。

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
