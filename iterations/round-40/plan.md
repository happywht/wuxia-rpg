# Round 40 计划：地图渲染、资料装配与长时间运行基线

## 本轮目标

建立可重复运行的性能/内存测量工具，覆盖网格地图绘制命令生成、真实 26 项基础资源的数据加载，以及多轮连续加载后的堆内存与资源数；用测量结果优化地图渲染对象分配，并保留可重复的结构性回归断言。

## 用户故事

- 作为开发者，我希望能在本机对小图和大图运行同一基准，知道地图绘制成本如何随格子数增长。
- 作为内容作者，我希望量到 manifest 驱动的 Schema/资源加载成本，并区分本地解析装配成本与网络延迟。
- 作为维护者，我希望能重复完整世界数据加载若干轮，检查资源数是否稳定、对象能否回收，并把本机基线记录在案。

## 验收标准

1. 提供专用 `npm run benchmark:round-40` 命令，和常规 `npm test` 隔离；输出 Node/平台信息、吞吐/耗时统计、地图对象数、加载资源数与连续加载后的堆内存观察值。
2. 地图绘制基准使用现有 `GridMap` / `renderGridMap` 公共 API 和 32×24 实图尺寸及更大的合成图；渲染改动将每格多个 Phaser GameObject 降到 O(1) 个图层对象，同时保留底色、边线、亮边、暗边的相对位置和 alpha。
3. `loadGameData` 基准从真实 `data/base`、`data/schema` 读取 fixture，以本地内存 Fetch stub 运行真实 manifest、AJV 与资源管线；明确不把网络延迟算进基准。
4. 长跑测量至少连续加载 50 轮，每轮资源数和诊断数保持稳定；在 GC 可用时执行 GC 后记录堆使用差值，但不对易受平台影响的绝对时间/堆字节设脆弱阈值。
5. 有普通单测验证地图绘制对象数不随网格面积增长、绘制范围与地图格数一致；更新 `docs/PERFORMANCE.md`、README/TESTING 相关命令、CHANGELOG、DEVLOG、ROADMAP 与来源登记。
6. 运行常规质量门槛、基准、关键场景烟测和生产构建，记录每条命令的结果；按格式提交 `round-40:` commit。

## 子任务

1. 先对当前 tile-per-rectangle 渲染器、真实数据加载与 50 轮加载做基准，记录同环境基线和方法局限。
2. 将地图装饰绘制整合到单一 Phaser Graphics 层（或由基线证明更合适的等价方案），缓存瓦片颜色/阴影派生值，并添加对象数量与几何回归测试。
3. 运行优化前后相同基准、完整质量门槛、地图/世界装配相关烟测和生产构建；整理性能文档及三项日志后提交。

## 涉及文件

- `src/engine/grid-map-renderer.ts`
- 新增 `tests/grid-map-renderer.test.ts` 与 `tests/performance-round-40.bench.ts`
- `package.json`
- 新增 `docs/PERFORMANCE.md`；更新 `README.md`、`docs/TESTING.md`、`docs/REFERENCES.md`
- `CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`
- `iterations/round-40/plan.md`

## 风险

- Vitest/Node 合成基准测的是地图绘制命令生成和数据管线，不等于真实 GPU 帧率；文档必须标明测量边界。
- CI/开发机、GC 和进程负载会影响毫秒及堆内存读数；保留精确环境与计数，避免把单机快照当作通用阈值。
- Phaser Graphics 的绘制顺序、alpha 和容器销毁语义必须保持原图层观感并在地图切换烟测中验证。

## 预计人类工程师工时

约 2–4 小时；包含真实数据基准、渲染路径改造、边界测试、长跑观测、性能记录与回归检查。

## 实施记录（2026-09-28）

实际涉及文件：`src/engine/grid-map-renderer.ts`（重写）、`tests/performance-round-40.bench.ts`（新增）、`tests/grid-map-renderer.test.ts`（新增）、`scripts/benchmark-round-40.mjs`（新增）、`scripts/benchmark-round-40-bare.mjs`（新增）、`vitest.config.ts`、`package.json`、`docs/PERFORMANCE.md`（新增）、`README.md`、`docs/TESTING.md`、`docs/REFERENCES.md`、`CHANGELOG.md`、`DEVLOG.md`、`ROADMAP.md`、本文件。README 与路线图已更新为 **R40 已完成 / 下一轮 R41**。

与计划的偏差：计划所写"32×24 实图尺寸"与仓库实际不符（真实地图为 16×9 两张），基准按计划意图改为"16×9 真实实图 + 32×24/64×48/128×96 确定性合成图"。落地中实证 Vitest 5 的 `bench` 已改为 test 回调 fixture（非顶层导入）、worker 不继承主进程 `--expose-gc`（改用 `NODE_OPTIONS` 传递）、async 任务 tinybench period 失真（改 wall-clock 自计时）、模块 export-getter 开销放大约三个数量级（新增 Vite 打包裸 Node 通道对照；初稿 esbuild 不在依赖树内，弃用）。

核心结果：场景对象数 433/2,305/9,217/36,865（16×9 至 128×96）→ 全部恒 2；50 轮长跑每轮 26 资源 0 诊断，GC 后堆差值 +1.3~3.4 MiB 波动无累积；`npm run check`（63 用例）、`npm run build`、`smoke:round-20/30/33/35/36/37`、生产构建 + `vite preview` 浏览器双向切换烟测全部通过。命令、环境、完整读数与方法局限见 `docs/PERFORMANCE.md` 与 `DEVLOG.md` Round 40 条目。

未处理（超出本轮）：R32 锻造配方 `forge.recipe.r32-marsh-amber-seal` 运行时语义禁用的既有警告（HUD 聚合通知触发源），与渲染改动无关，留待内容/语义轮次处理；基准不进 CI 门槛（快照式读数不适合作阈值）。

提交：`round-40: 地图渲染单 Graphics 层（每图 O(1) 场景对象）与可重复性能/内存基准`
