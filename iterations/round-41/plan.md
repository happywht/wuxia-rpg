# Round 41 计划：输入方案与无障碍显示选项

## 本轮目标

扩展主菜单与暂停菜单共用的设置，让玩家能选择方向键/WASD 移动方案、启用或关闭手柄、提升画面对比度、减少动态效果并调整字号；让这些设置跨启动保存，并在探索和菜单场景实际生效。

## 用户故事

- 作为习惯不同键位的玩家，我希望能只用方向键、只用 WASD 或同时启用两套移动键位。
- 作为手柄玩家，我希望用方向键或左摇杆逐格探索，并用手柄在主菜单和暂停菜单中选择、确认与返回。
- 作为需要更清晰文字或较少动画的玩家，我希望字号、对比度和动态效果设置能即时生效，并在下次启动后保留。

## 验收标准

1. 设置存储向前兼容 Round 09 的 `{ volume, textScaleIndex }` 旧载荷；损坏值仍安全回退默认值。
2. 键盘移动方案可配置为方向键、WASD、两者并用，移动帮助文本随方案更新。
3. 启用时，标准 Gamepad 的 D-pad 与左摇杆可触发单步网格移动；主菜单和暂停菜单支持 D-pad/摇杆选择、底部按钮确认与右侧按钮返回；关闭后控制器不触发动作。无控制器环境保持可用。
4. 高对比度切换会改变游戏画布显示；更大字号即时影响新旧 UI 文本；减少动态效果让移动、昼夜/天气渐变与伙伴移动以无补间方式呈现。
5. 有自动化测试覆盖旧设置迁移、设置验证/持久化、键位映射与摇杆死区/方向边沿；运行 `npm run check`、`npm run build` 与已有关键 smoke。若硬件不可用，手柄真实输入记录为限制，并用可重复单测验证输入解析。
6. 更新 `docs/ACCESSIBILITY.md`、`docs/REFERENCES.md`、README/TESTING、CHANGELOG、DEVLOG、ROADMAP 与本计划实施记录，按格式提交 `round-41:` commit。

## 子任务

1. 扩展设置数据模型与兼容解析；构建可单测的键位布局和游戏手柄方向解析模块。
2. 接入主菜单/暂停设置 UI、探索移动与菜单控制器输入；应用字号、高对比度、减少动态效果。
3. 补充设置与输入回归测试、说明文档及日志；运行质量门槛、构建和场景烟测并提交。

## 涉及文件

- `src/game/settings.ts`、`src/game/input-settings.ts`（新增）、`src/main.ts`、`src/game/grid-scene.ts`
- `src/game/menu-scene.ts`、`src/game/pause-menu.ts`、`src/game/controls-ui.ts`
- 新增 `tests/settings.test.ts` 与 `tests/input-settings.test.ts`
- 新增 `docs/ACCESSIBILITY.md`；更新 `docs/REFERENCES.md`、`docs/TESTING.md`、`README.md`
- `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`、本文件

## 风险

- 浏览器 Gamepad API 可能要求玩家先按控制器按钮才开放设备；必须无设备降级，并避免摇杆持续按住导致每帧重复移动。
- Phaser scene input 各版本 API 细节不同；实现以仓库锁定的 Phaser 4.2.1 类型/运行时为准，并记录官方输入 API 来源。
- CSS 对比度滤镜作用于整张游戏画布（包含场景画面），不等同符合 WCAG 的逐元素色彩审计；文档应准确说明作用范围。
- 减少动态效果关闭补间时仍需触发移动完成、NPC 跟随和区域事件回调，防止游戏状态卡在移动中。

## 预计人类工程师工时

约 2–4 小时；包含旧设置兼容、输入与外设接入、设置 UI/即时应用、回归测试、文档和验证。

## 实施与验证记录（2026-09-28）

### 实际交付

- **子任务 1（设置模型 + 输入模块）**：`src/game/settings.ts` 扩展六字段 `GameSettings`（新增 movementLayout/gamepadEnabled/highContrast/reducedMotion），`TEXT_SCALE_STEPS` 追加 1.6 档（五档，两个设置页 6 行布局按最大档校验）；解析向前兼容 Round 09 旧载荷（缺失补默认、存在但无效整载荷拒绝且不动存储）。新增 Phaser-free 的 `src/game/input-settings.ts`：三档移动布局解析/键集/逐键启用/帮助文本、摇杆死区（0.5）与主导轴方向解析、D-pad 基数优先组合、标准映射采样（A 确认/B 返回）、`GamepadEdgeTracker` 边沿检测（按住只发一次）。实现前以仓库锁定的 Phaser 4.2.1 `types/phaser.d.ts` 核对 Gamepad/GamepadPlugin 形态（`pad1` 运行时可 undefined、`leftStick` 已含轴阈值），官方来源登记 `docs/REFERENCES.md` #17/#18。
- **子任务 2（场景接入与设置应用）**：`src/main.ts` 以 `input: { gamepad: true }` 启用插件；`GridScene.update()`/`MenuScene.update()` 每帧轮询首只手柄（全部动作以 `gamepadEnabled` 为门、无设备早退、按住不逐帧触发）；暂停菜单打开时边沿经 `PauseMenuPanel.handleGamepadEdges` 路由（上下选行/左右调整/A 确认/B 返回）；移动八键免重绑按布局门控，HUD 与操作手册帮助文本随布局更新；高对比度经 `applyGameSettings` 写画布 CSS 滤镜即时生效；减少动态贯穿玩家移动（瞬移+同帧完成回调，伙伴跟随/区域事件/热重载边界保留）、昼夜与天气渐变（直接设值）、NPC 重定位（直接定位）与降水粒子（不生成）；设置变更回调会即时停止已有昼夜/天气补间、销毁降水粒子，关闭减少动态时按当前天气恢复降水。主菜单与暂停菜单设置页由共享 `settingsRows`/`adjustGameSetting` 渲染调整（两处同源）。
- **子任务 3（测试/文档/验证）**：新增 `tests/settings.test.ts`（21 用例）与 `tests/input-settings.test.ts`（21 用例）；`npm test` 7 文件 105 用例全绿。新增 `docs/ACCESSIBILITY.md`；更新 `docs/REFERENCES.md`（#17/#18 与编号说明）、`docs/TESTING.md`（覆盖表/统计/变更记录）、README.md、CHANGELOG.md、DEVLOG.md、ROADMAP.md 与本记录。

### 验证命令与结果（本机 Windows 11 / Node v22.18.0）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm test` | 7 文件 105 用例全部通过（新增 42） |
| `npm run check` | exit 0（26 资源、0 MOD 问题、类型、105 用例、文档审计） |
| `npm run build` | exit 0（主 JS 1,886.46 kB / gzip 497.52 kB，较 R40 +4.45 kB） |
| `npm run smoke:round-20/30/33/35/36/37` | 全部 exit 0 |
| `git diff --check` | 通过（仅换行提示） |
| 浏览器烟测（生产构建 + `vite preview` + Playwright 键盘路径） | 主菜单设置 6 行：高对比度当帧改变画布滤镜并写入六字段载荷、刷新后启动自动恢复；暂停菜单设置 6 行调整减少动态成功；移动布局切"仅 WASD"后游戏内方向键零位移、W 键移动（按键到达经页面监听核验）；减少动态下移动仍发生且静置画面完全静止；控制台无新增错误 |

### 验收标准逐条核对

1. ✅ 旧 `{ volume, textScaleIndex }` 载荷加载并补默认；损坏值回退默认且不动存储（测试断言旧存储字节不变）。
2. ✅ 三档移动布局可配置，HUD 与操作手册帮助文本随方案更新（浏览器烟测实证免重绑即时生效）。
3. ✅ 标准手柄 D-pad/左摇杆单步移动、菜单选择/确认/返回接入且以持久设置为门；无设备环境键盘不受影响。**物理硬件未测试**（见限制）。
4. ✅ 高对比度改变游戏画布显示；五档字号即时影响新旧 UI；减少动态使移动/昼夜天气渐变/NPC 重定位/粒子以无补间方式呈现且完成回调保留（浏览器烟测 + 单测）。
5. ✅ 覆盖旧设置迁移、验证/持久化、画布外观、键位映射、死区/边沿的 42 个自动化测试；check/build/六条 smoke/diff-check 全过。
6. ✅ 文档八处更新；提交 `round-41:` commit。

### 限制与如实声明

- **物理手柄硬件未测试**：无控制器环境；手柄方向解析、死区、边沿与菜单路由由单元测试覆盖，浏览器内硬件路径未验证。
- **高对比度是画布级滤镜**，不等同 WCAG 逐元素色彩审计（计划风险已预判，`docs/ACCESSIBILITY.md` 标注作用范围）。
- 字号档位上限 1.6：更大档在当前 960×540 布局下会与设置页反馈/提示行冲突，未提供。
- 烟测中重申既有非本轮问题：R32 锻造配方可选警告触发的 HUD 聚合通知（R40 已记录）。
