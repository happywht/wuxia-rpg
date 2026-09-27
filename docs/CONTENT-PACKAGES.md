# 内容包规范（CONTENT-PACKAGES）

- 状态：Round 37 已落地单文件 v1 内容包格式（`.wuxia.json`）、导出/导入 CLI 与专项烟测。
- 关联：`docs/DATA-GUIDE.md` §5（MOD 覆盖规则与作者工作流）、`docs/ADR.md`、`scripts/content-package.mjs`、`data/schema/content-package.schema.json`。

---

## 1. 目标与范围

内容包解决一个问题：把一个 `mods/<modId>/` 布局的传统 MOD 变成**可验证、可迁移的单文件**，在不同副本的同一引擎之间分享。命令分两步：

1. **导出**（`npm run content:export`）：作者把已有 MOD 目录导出为带格式版本、引擎兼容声明和逐资源 SHA-256 校验的 v1 包；
2. **导入**（`npm run content:import`）：玩家/维护者先做**只读预检**，确认无误后用 `--apply` 安装到 `mods/` 下的**全新目录**。

明确的边界（这些事内容包**不做**）：

- 不改 `data/base/manifest.json`，不把包装进 `enabledMods`——是否启用永远由使用者按 `docs/DATA-GUIDE.md` §5.2 手动决定；
- 不做跨资源语义校验（引用闭合、坐标/占格、历法分区等）——那仍是运行时加载器的职责，包预检只保证静态 JSON/schema/兼容性；
- 不管理包的下载、更新或卸载——安装出的目录就是一个普通 MOD 目录，后续一切按 MOD 工作流处理。

## 2. v1 包格式

单文件 JSON（惯例后缀 `.wuxia.json`），结构由 `data/schema/content-package.schema.json`（draft-07）约束：

```jsonc
{
  "formatVersion": 1,                    // 包格式协议版本；当前引擎只实现 1
  "package": {
    "id": "my-mod",                      // 安全单一目录名；安装目录即 mods/<id>/
    "name": "我的魔改",                   // 人类可读包名
    "version": "1.0.0",                  // 严格三段数字 X.Y.Z
    "description": "可选一句话说明",
    "author": "可选作者署名"
  },
  "minimumEngineVersion": "0.0.1",       // 严格三段数字；导入端按数字逐段比较
  "resources": [
    {
      "id": "map.round-01-grid",         // 必须是目标仓库 manifest 已登记的资源 id
      "sha256": "<64 位小写十六进制>",     // data 规范 JSON 的 SHA-256
      "data": { /* 资源 JSON 本体 */ }
    }
  ]
}
```

关键设计：

- **包内不携带文件路径**。`resources[]` 条目只有 `id`、`sha256`、`data` 三个字段（schema `additionalProperties: false`）；安装路径一律由**目标仓库当前可信 manifest** 的资源登记按 id 解析。包作者无法指定、也无处声明"写到哪个文件"。
- **校验和与格式无关**。`sha256` 按**规范 JSON**计算：对象键**递归排序**（UTF-16 码元序）、无空白、UTF-8 编码、`JSON.stringify` 语义（`undefined` 值的键被丢弃）。因此同一份数据无论源文件缩进/键序如何，摘要一致；篡改任何值都会被检出，而重新排版不会误报。
- **资源按 manifest 顺序排列**，导出结果对同一 MOD 目录是字节级确定的（同一输入两次导出逐字节相同）。

## 3. 命令

```bash
# 导出：把 mods/<modId>/ 下按 data/base 相对路径存放的传统 MOD 导出为 v1 包
npm run content:export -- --mod <modId> [--id <包id>] [--name <名称>] [--version X.Y.Z]
                            [--description <说明>] [--author <作者>] [--out <文件>] [--repo <根目录>]
# 例：npm run content:export -- --mod example --name "示例魔改包" --out example.wuxia.json
# 默认：包 id = modId、名称 = modId、版本 1.0.0、输出 <包id>.wuxia.json（当前目录）、最低引擎版本 = `--repo` 目标仓库当前引擎版本

# 导入：默认只读预检（不写任何文件）
npm run content:import -- <file.wuxia.json> [--repo <根目录>]

# 导入并安装：预检全过后安装到 mods/<包id>/ 新目录
npm run content:import -- <file.wuxia.json> --apply
```

`--repo` 可把命令指向另一份仓库副本（默认脚本所在仓库）；`npm run` 记得用 `--` 分隔传参。

导出要求（任一不满足即失败并给出可定位诊断）：

- MOD id 是安全单一目录名（字母/数字/`_`/`-`/`.`/中文，禁止路径分隔符与穿越）；
- MOD 目录内**每个** JSON 文件都对应 manifest 已登记的 `resources[].path`——孤儿文件会被点名拒绝（否则包会静默丢内容）；
- 每个文件是合法 JSON 且通过其登记 schema（MOD 不能借导出绕开数据契约）；
- 最终包对象也通过 `content-package.schema.json`（空名称、非法作者/说明元数据等不会生成不可导入包）；
- 包 id、包版本合法（包 id 同 MOD id 规则；版本严格三段数字且各段可精确表示）。

## 4. 预检与安装

预检（默认模式，零写入）按序检查：

1. **包大小**：超过上限（默认 10 MiB）直接拒绝，不读入内存；
2. **JSON 解析**与**包 schema**（`content-package.schema.json`）全量校验；
3. **格式版本**：`formatVersion` 不等于 1 即拒绝——更大值提示"可能来自更新版本的工具，请升级引擎"；非法小值同样拒绝；
4. **引擎兼容**：`minimumEngineVersion` 必须严格三段数字（宽松串如 `1.2`、`v1.0.0` 一律拒绝），且逐段数值比较不大于目标仓库 `package.json` 的 `version`；使用 `--repo` 时按该目标仓库判断；
5. **资源 id**：包内不重复；每个 id 必须在目标仓库 manifest 登记（未知 id 点名拒绝），并由此解析出安装路径与 schema；
6. **逐资源校验和**（规范 JSON 重算比对）与**当前 schema** 校验。

预检通过仅表示"静态可安装"；安装出的 MOD 启用时仍走运行时装配与语义校验。

`--apply` 安装流程：

1. 先完成**整包**预检——任何一项失败都不写一个字节；
2. 把全部资源写入 `mods/.staging-<进程>-<随机>` **同盘暂存目录**；
3. **写完后**检查 `mods/<包id>/` 不存在——已存在则删除暂存目录并拒绝（不覆盖任何已有内容；这一步同时验证暂存清理逻辑）；
4. `rename` 暂存目录为 `mods/<包id>/`（同盘原子改名）；rename 失败同样清理暂存目录；
5. 不改 manifest、不写入 `enabledMods`。启用请按 `docs/DATA-GUIDE.md` §5.2 手动操作。

## 5. 版本与兼容策略

| 版本 | 语义 | 规则 |
|---|---|---|
| `formatVersion` | 包格式协议 | 当前只支持 1；未知/未来值明确拒绝并提示升级，绝不尝试猜测解析 |
| `package.version` | 包自身版本 | 严格三段数字；仅供作者与玩家识别，导入端不比较 |
| `minimumEngineVersion` | 引擎兼容下界 | 严格三段数字，逐段数值比较 ≤ 当前引擎才放行 |

设计动机：宽松版本串（`1.2`、`v1.0.0`、`1.0.x`）语义不明，宁可拒绝也不误判。导出时 `minimumEngineVersion` 固定写源目标仓库版本；超过 10 MiB 的导出结果会被拒绝，已有输出文件不会被静默覆盖。未来引擎仍须通过包资源的当前 Schema 和运行时跨资源语义校验，不因最低版本字段而被无条件视作兼容。

## 6. 传统 MOD 迁移语义

`mods/<modId>/` 的传统布局没有包元数据（无版本、无校验和、无兼容声明）。导出即迁移：

- 包 id 默认沿用 modId（可用 `--id` 另取，安装目录随之改变，与源目录无关）；
- 资源集合 = MOD 目录 JSON 文件 ∩ manifest 登记路径，**全有或全无**：存在孤儿文件/坏文件时导出失败，不产出半成品包；
- 迁移后的包与手写包无任何区别，可再导出、再导入任意次（校验和基于数据本体，不绑定文件来源）。

## 7. 安全模型

威胁假设：**包文件来自外部，完全不可信**；目标仓库的 manifest 与 schema 是本地可信源。

- **无路径注入面**：包 schema 禁止资源级 `path`/任意附加字段；即使手改 schema，导入代码也不从包内读任何路径——安装位置唯一来源是本地 manifest 的登记路径，且写入前再次校验目标落在暂存目录之内；
- **无越界写入**：包 id、MOD id 必须是安全单一目录名（拒绝 `../evil`、`a/b`、`.hidden`）；manifest 登记路径按安全段规则校验（拒绝反斜杠、绝对路径、点开头段、穿越）；
- **无覆盖**：目标目录存在即拒绝，安装只发生在全新目录；失败路径一律清理暂存目录，不留半成品；
- **资源可控**：拒绝未登记 id（包不能把内容塞进未知的落点）、逐项校验和（防篡改）与当前 schema（防协议漂移）；
- **资源上限**：包大小硬上限（默认 10 MiB）在读入前生效。

## 8. 常见问题

- **预检通过但游戏里 MOD 报错？** 预检是静态检查；跨资源语义（如对话引用的任务、遭遇坐标）由运行时加载器装配时校验，坏引用按 MOD 回退规则处理，F2 面板可查诊断。
- **换了一版数据但校验和失败？** 校验和对应导出时的数据本体。改数据请用导出工具重新生成包，不要手改包内 `data` 或 `sha256`。
- **想重装已存在的包？** 先手动移除/重命名 `mods/<包id>/`（自行确认内容），再 `--apply`。工具不做覆盖安装。
- **导出报"不对应清单已登记资源"？** MOD 目录里有 manifest 未登记路径的 JSON。把文件移到登记路径，或先在 `data/base/manifest.json` 登记该资源。
