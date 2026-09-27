# 同行伙伴资料协议（Round 19）

伙伴是独立于 NPC 的可选规则资料：NPC 负责身份、名字、关系和基础地图位置，伙伴资料赋予其可招募身份与战斗支援。没有伙伴资源时世界照常启动，伙伴册显示空 roster。

## 资源与 Schema

默认资源登记于 `data/base/manifest.json`：`companion.round-19-set` → `companions/round-19-companions.json` → `companion-set`。Schema 位于 `data/schema/companion-set.schema.json`。同路径 MOD 文件可以替换整份默认集合；Schema 失败时禁用伙伴集合并保留世界，单条跨资源 NPC 引用失败时只禁用该伙伴。

```json
{
  "companions": [
    {
      "id": "companion.gu-yechen",
      "npcId": "char.gu-yechen",
      "description": "雾路刀客。每两次成功的玩家行动后，以精准的一击援护队友。",
      "combatSupport": {
        "kind": "attack",
        "power": 9,
        "everyPlayerActions": 2
      }
    }
  ]
}
```

| 字段 | 约束 | 说明 |
|---|---|---|
| `id` | `companion.` 前缀 id | 稳定的伙伴规则身份；存档引用该 id |
| `npcId` | 已装配的 NPC id | 显示姓名、读取关系和基础人物资料的来源 |
| `description` | 1–300 字符 | 伙伴册中的说明，不写入引擎 |
| `combatSupport.kind` | `attack` / `heal` | 自动援护是攻击或治疗 |
| `combatSupport.power` | 1–999 整数 | 攻击固定伤害或治疗固定生命值 |
| `combatSupport.everyPlayerActions` | 1–20 整数 | 每 N 次成功且实际执行的玩家战斗行动触发一次；无效/未支付行动不计 |

目前每次仅一名伙伴同行。招募和暂离由对白事务效果驱动，也可在 P 键伙伴册按 Enter 暂离。招募门槛由对白的 `npcRelationship` 等条件配置；引擎不会固定特定 NPC 或关系阈值。关系保存在既有逐 NPC 社会状态中。招募后其静态 NPC 日程及格子占用被移除，伙伴以程序生成标记在安全可走格同行，不会挡路；地图上四邻格均不可用时暂时隐藏标记，下一步再重新计算。伙伴会跟随玩家跨区。

支援仅在战斗中的成功玩家行动后累计计数。攻击按资料中的 `power` 直接扣除敌方生命，不叠加属性；治疗按 `power` 恢复玩家生命且受最大生命限制。支援在敌方回合前结算，击倒敌人时直接结束战斗。没有伙伴时，现有战斗轮转保持不变。

## 存档

v1 顶层 `activeCompanionId` 保存当前同行伙伴 id 或 `null`。旧 v1 缺少该字段时解析为 `null`；恢复时若当前集合已删除该伙伴，队伍清空并给出 warning。跟随坐标不入档，由地图、玩家位置和当前占位在载入/跨区时安全重算。
