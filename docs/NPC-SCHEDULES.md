# NPC 时段日程

Round 16 为 NPC 资料增加可选的每日时段位置。日程由 `data/base/characters/round-03-npcs.json` 或同路径 MOD 提供；引擎读取通用 `periodId` 和网格坐标，不包含具体人物、地点或剧情规则。

## 数据格式

NPC 原有 `position` 是基础位置。新增可选 `schedule` 数组，每项指定一个历法时段和该 NPC 在自己所属地图内的网格坐标：

```json
{
  "id": "char.example",
  "name": "原创人物",
  "mapResourceId": "map.round-01-grid",
  "position": { "col": 4, "row": 1 },
  "dialogueId": "dlg.example",
  "schedule": [
    { "periodId": "period.midday", "position": { "col": 3, "row": 1 } },
    { "periodId": "period.night", "position": { "col": 7, "row": 5 } }
  ]
}
```

- `periodId` 必须引用 `data/base/worldview/calendar.json` 的 `periods[].id`。修改历法时段 id 后，日程引用需要一起更新。
- `position` 必须在 NPC 的 `mapResourceId` 地图范围内，且是可走格。
- 一个 NPC 不得重复声明同一个 `periodId`；没有为当前时段写日程时，使用基础 `position`。
- `schedule` 可省略或为空数组；这种 NPC 始终留在基础位置。
- NPC 不会因日程跨地图传送；各 NPC 只在自己的地图资源上出现。跨区域旅行按抵达后的时段放置目的地图人物。

NPC Schema 负责结构类型和字段形状；Phaser-free 装配器 `src/engine/npc-schedule.ts` 再检查历法、地图和占位关系。坏日程项按最小范围隔离并给出 warning：未知时段、重复时段、阻挡格/出生格、固定遭遇冲突或其他 NPC 同时段占位冲突时，该项回退基础位置，人物及其他有效日程继续可用。重复项保留首条。基础 NPC 记录自身若无效，仍按原有 NPC 逐条校验规则禁用该人物。

## 运行时位置优先级

装配阶段为每个历法时段生成稳定的位置集合。开局、读档、时段切换和抵达新区域时，场景以玩家格、活动遭遇格和人物当前位置进行防御性解析，然后同步人物标记、姓名牌、碰撞占位及交互目标。时段未变化时不重建。玩家所在格始终优先：固定 NPC 若被占用则暂不放置；移动 NPC 先尝试该时段地点，若不能放置则回到基础地点；基础地点仍不可用时，该人物本时段暂不显示。

## 存档与派生

当前地点不是存档字段。v1 快照中的 `mapResourceId` 与 `elapsedGameMinutes` 足以重建当前历法时段，NPC 位置再由已加载的日程资料派生，故 Round 16 不增加存档版本或字段，也不要求旧档迁移。

恢复预检也使用快照时段及快照玩家格解析当前地图的人物占位。这样玩家可以站在一个已按日程迁走的 NPC 原基础格；检查不会用不适用于当前时段的静态基础坐标误拒有效存档。固定遭遇仍按存档中的完成状态参加占位校验。

## 当前样例

基础资料有六名角色带有日程：沈墨涵、陆贞娘、姜百味和马尚义在方格试炼场按时段更换位置；石北和闻素心在雾雨渡口按时段更换位置。具体坐标、名字和对话均由 NPC JSON 提供。新增或替换内容应使用 MOD 同路径覆盖，并保持日程时段符合当前历法 Schema；可在 `docs/DATA-GUIDE.md` 查看作者速查和示例。
