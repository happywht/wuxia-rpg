# 变更日志（CHANGELOG）

格式参考 Keep a Changelog；版本号遵循语义化版本。逐轮开发细节见 `DEVLOG.md`。

## [0.0.1] — 2026-09-26（Round 00）

### Added

- 工程脚手架：`package.json`（dev/build/preview/typecheck 脚本；`engines.node >= 22.12.0`）、`tsconfig.json`、`vite.config.ts`、`index.html`、`.gitignore`。
- 引擎引导占位：`src/main.ts`（Phaser 4 静态占位画面，无玩法、无设定文本）、`src/style.css`。
- 目录骨架：`src/engine/`、`src/game/`、`data/base/` 十大数据族（worldview / characters / maps / quests / dialogues / knowledge_graph / items / skills / factions / endings）、`data/schema/`、`mods/`（均以 `.gitkeep` 占位）。
- 设计与规范文档：`docs/GDD.md`、`docs/ADR.md`（ADR-0001~0005 与版本冻结总表）、`docs/REFERENCES.md`、`docs/ORIGINAL-FIDELITY.md`、`docs/ARCHITECTURE.md`、`docs/DATA-GUIDE.md`。
- 治理文件：`README.md`、`ROADMAP.md`（R00–R50 共 51 轮）、`CHANGELOG.md`、`DEVLOG.md`。
- 保留 `iterations/round-00/plan.md` 原样（本轮计划，未改动）。
- 安装锁文件：`package-lock.json`，锁定当前可复现的 npm 依赖树。
- Round 01–12 路线按目标文件要求重排，保留后续创新系统、内容数量目标与质量轮次。
- `docs/REFERENCES.md` 补充各类来源的授权状态、软件包许可和本项目使用方式。

### 验证

- `npm install`：成功，安装 18 个包。
- `npm run build`：TypeScript 检查与 Vite 生产构建成功；Phaser 主包 chunk 约 1.38 MB，出现超过 500 kB 的非阻断提示。
- 本轮没有测试文件，因此未运行测试套件。
