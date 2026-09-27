# 知识图谱与江湖百科

Round 11 建立可替换的图谱资料和玩家见闻状态。当前实现用于解锁个人线索、支持知识条件对话和展示已知关联；Round 17 的区域奇遇和 Round 21 的门派战结局也能记录/发现图谱节点。雾渡药道会盟的胜、平、负分别解锁事件节点，并在两名参战门派师长的对白中呈现对应结果。NPC 之间的一般情报传播与态度变化留待 Round 26。

## 文件与资源

两份资源分别登记在 `data/base/manifest.json`，因此可以独立同名覆盖：

- `data/base/knowledge_graph/nodes.json`，Schema：`data/schema/knowledge-nodes.schema.json`。
- `data/base/knowledge_graph/edges.json`，Schema：`data/schema/knowledge-edges.schema.json`。

每个节点使用 `id`、`kind`、`title`、`summary`、`knownByDefault`。`kind` 可取 `character`、`place`、`faction`、`item`、`martialArt`、`event`、`quest`、`ending`。建议 id 稳定并按族使用 `char.`、`place.`、`faction.`、`item.`、`skill.`、`event.`、`quest.`、`ending.` 前缀。

每条关系使用 `id`、`fromId`、`toId`、`relation` 和 `summary`。关系枚举为 `mentorOf`、`parentOf`、`hostileTo`、`belongsTo`、`locatedAt`、`holds`、`triggers`、`requires`、`rewards`、`knows`、`participatesIn`、`influences`。两个端点必须都声明在节点集内。

当前基础资料包含 28 个节点和 19 条关系。Round 21 新增三种雾渡会盟结局事件节点（胜、平、负），以及分别指向铁嶂派和云隐山庄的 6 条 `influences` 边；实际节点/边文本仍以 JSON 为准。

示例：

```json
{
  "nodes": [
    {
      "id": "char.example-mentor",
      "kind": "character",
      "title": "示例人物",
      "summary": "一位可供测试的原创人物。",
      "knownByDefault": true
    }
  ]
}
```

Schema 检查资源结构和字段值域；Phaser 无关装配器再处理重复 id 和悬空关系端点，保留首条重复声明并逐边忽略悬空关系。内容静态 Schema 不通过时仍按资料加载器规则禁用相应资源。节点集或关系集缺失时按空集合运行，并保留加载诊断。

## 发现与百科

新游戏初始知道所有 `knownByDefault: true` 节点。对话效果和区域事件都可以发现其他节点；发现状态只属于当前存档，不回写世界资料。区域事件的 `discoverKnowledgeNodeId` 必须引用图谱中存在的节点，事件触发成功后才会解锁；相同节点重复发现是幂等操作，百科标题和摘要始终来自图谱数据。

- `K`：打开/关闭江湖百科。
- `←`/`→` 或 `A`/`D`：切换全部、人物、地点、门派、物品、武学、事件、任务、结局类别。
- `↑`/`↓` 或 `W`/`S`：浏览词条。
- `Esc`：关闭百科。

已知词条显示标题、摘要和关联。只有关系两端都已知时才展示边，避免由边泄漏未知人物/事件。某一类别有未解锁节点时，列表只显示一个泛化的“未解锁见闻”行，不展示数量、名称或摘要。百科打开期间探索输入锁定，并与其他探索面板互斥。

## 对话协议接入

选项 `conditions` 数组可写入知识条件：

```json
{ "kind": "knowledgeKnown", "nodeId": "event.example-rumor" }
```

该选项只有当玩家已发现节点时才可见。`effects` 数组可写入发现效果：

```json
{ "kind": "discoverKnowledgeNode", "nodeId": "event.example-rumor" }
```

效果在现有对话事务中执行；同一节点重复解锁是幂等操作。图谱节点在对话集合装配时做跨资源引用校验：悬空条件或发现效果只让该选项失效，不影响同节点或同集合中的有效对话。Schema 与引擎解析器都使用封闭的 kind/字段协议。

基础示例可在 `data/base/dialogues/round-03-conversations.json` 与 `data/base/world/world-map.json` 查看：茶棚对白或初抵渡口可记录“雨后的脚印”，之后在黄昏/入夜的降雨天气探索芦苇边才会解锁河滩地点。询问拦路旅人仍可解锁人物词条；后续选项根据已知词条出现。

Round 25 的三张药方各自对应一个默认未知的 `event` 知识节点。药师对话以 `discoverKnowledgeNode` 逐方传授；同一 `knownKnowledgeNodeIds` 状态同时控制药炉能否制作和百科能否展示已知的配方关联。成药 item 节点在首次制得后进入已知集。图谱关系由资料声明，药方被 MOD 移除时，既有 v1 恢复预检会过滤失效知识 id。

## 存档行为

v1 快照字段 `knownKnowledgeNodeIds` 保存玩家已知节点；区域奇遇的一次性状态沿用 `completedRegionalEvents`。Round 17 没有新增存档字段。Round 21 结局将资料指定的见闻节点加入同一字段。读取 Round 10 及更早的 v1 存档时，缺失知识/事件字段归一为空数组；恢复预检会补入当前图谱公开词条、过滤当前图谱不存在的 id 并发出警告。移除资料后，相关百科条目和对话选项不再可用，但旧存档仍可加载。
