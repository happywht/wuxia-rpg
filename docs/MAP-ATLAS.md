# 世界舆图与区域旅行

Round 10 将单张网格地图扩展为由资料驱动的区域集合。舆图、区域命名、地图文件、关口端点和区域事件都放在 `data/`，引擎只执行通用协议。Round 17 为区域事件增加线索/时段/天气门槛和百科发现效果。

## 当前样例

| 地图资源 id | 区域 | 舆图位置 | 说明 |
|---|---|---:|---|
| `map.round-01-grid` | 方格试炼场 | (27, 52) | 原始起始地图；石阶关口在 (14, 7) |
| `map.round-10-mist-ferry` | 雾雨渡口 | (72, 52) | Round 10 新增区域；返程关口在 (2, 4) |

玩家按 **M** 打开舆图，当前区域高亮；图册开启时探索输入锁定。相邻关口按 **E** 旅行。该键的冲突优先级固定为 NPC、战斗遭遇、关口，避免旅行抢占既有交互。

## 资料协议

1. 在 `data/base/manifest.json` 登记每份地图，schema id 使用 `grid-map`。地图 JSON 的 `id` 必须与 manifest resource id 完全相同。
2. 登记唯一的 `world-map` 资源。其 `startingMapResourceId` 必须指向一份有效地图；`regions` 为每张地图提供标题、说明和 0–100 的舆图相对坐标。
3. `transitions` 中的 `from` 是玩家所在地图的交互格，`to` 是另一张地图的落点。端点必须可走且不得位于玩家出生格。往返必须显式声明反向关口；协议不会自动推断双向旅行。
4. `events` 绑定可走格和原创文本。玩家进入对应格后，只有 `conditions` 全部满足才触发；字段可省略以保持旧事件无条件触发。条件组之间为 AND：`knowledgeNodeIds` 中每个线索都必须已知，`periodIds` 和 `weatherIds` 各自按 OR 匹配一个当前值。条件未满足不会消耗一次性事件；成功移动、跨区抵达和原地等候后都会检查当前格，因此可等到合适时辰/天气。`once: true` 的事件只成功结算一次，完成 id 会随 v1 存档保存，`once: false` 每次检查都可提示。可选的 `discoverKnowledgeNodeId` 在成功触发时解锁一个已登记的百科节点；词条标题来自图谱资料。

世界地图语义解析器检查 id 唯一性、地图/区域引用、端点和事件坐标；事件的图谱节点、历法时段、天气引用也会逐条校验。坏事件（包括悬空条件引用）会单独禁用并写入诊断。地图装配完成后，若关口或事件格被 NPC/战斗遭遇占用，对应条目会被逐项隔离并写入诊断；同世界图中的其他有效条目仍可用。任一地图资源无效会使关键世界地图启动校验失败并给出资源诊断。

### 渡口奇遇示例（Round 17）

基础世界把 `event.ferry-first-arrival` 放在雾雨渡口的入口 (1, 4)：初见脚印会记录 `event.old-footprints`。向东到芦苇边 (5, 4) 后，`event.reedbank-traces` 还要求脚印线索已知、时段为黄昏/入夜且天气为细雨/降雨/骤雨；成功会解锁 `place.reedbank`。若在该格等候，时段变化后会重新判定，提示会合并等待摘要和奇遇文本。

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
