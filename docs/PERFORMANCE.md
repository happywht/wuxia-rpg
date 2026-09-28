# 性能记录（PERFORMANCE）

Round 40 起本项目拥有可重复运行的性能与内存测量工具：`npm run benchmark:round-40`。本文记录该命令的构成、测量边界、本轮（R40）优化前后的实际读数与已知局限。**所有毫秒与堆字节数字都是单机描述性观察，不是回归阈值**——CI 与 `npm run check` 从不因速度变慢而失败，结构性断言（对象数、资源数、诊断数）才进测试门槛。

## 命令与运行方式

```bash
npm run benchmark:round-40
```

由 `scripts/benchmark-round-40.mjs` 串联两段测量，任一段非零退出则整体非零：

1. **Vitest bench 通道**：`vitest bench --run --silent=false`，并以 `NODE_OPTIONS=--expose-gc` 把 GC 暴露给 worker，使长跑观测可以在读堆前强制 Full GC（未暴露时输出会标注为"无强制 GC 的上界"）。基准文件 `tests/performance-round-40.bench.ts` 由 `vitest.config.ts` 的 `benchmark.include`（`tests/` 下全部 `*.bench.ts`）匹配；普通 `npm test` 的 glob 只匹配 `*.test.ts`，两通道互不可见（Vitest 5 重写后的 bench API 是 `test()` 回调里的 `bench` fixture，普通 `run` 模式直接忽略基准文件）。
2. **裸 Node 通道**：`scripts/benchmark-round-40-bare.mjs` 用 Vite 的 `build` API（`build.ssr` 模式，Node 内置保持 external）把真实渲染器打包成单一 ESM 后在纯 Node 中计时——这是 Vitest 官方基准指南对库作者建议的"测构建产物"口径，用于抵消 Vitest 模块 runner 的 export-getter 开销（见下文局限）。

输出包含：Node 版本/平台/CPU/GC 可用性、每张图一次渲染的场景对象数与绘制调用数（结构，不计时）、四个尺寸的渲染基准、真实 26 资源加载基准与 50 轮长跑的堆观察。

## 测量内容

| 基准 | 被测路径 | 数据 |
| --- | --- | --- |
| 渲染 100×100 / 32×24 / 64×48 / 128×96 | `renderGridMap`（命令生成 + 场景对象装配，recording scene 替身） | 当前真实 `round-01-grid.json` 的 100×100 碰撞格（基准临时移除 art 字段）+ 确定性合成大图 |
| `loadGameData` 26 资源 | 真实 manifest → AJV schema 编译校验 → 资源解析管线 | 磁盘预读 `data/base` + `data/schema` 全部 53 个 JSON，经内存 fetch stub 提供（零网络延迟） |
| 50 轮连续加载 | 同上，循环 50 轮 | 每轮断言 26 资源 / 0 诊断（结构性）；GC 后记录堆差值 |

Round 51 将真实地图改为 100×100 且新增贴图层。为保留原本针对 Phaser-free 碰撞格回退渲染器的性能测量边界，现行 R40 基准在**读取后的临时对象**上移除可选 `art`，并使用当前 100×100 网格；它不绘制/测量浏览器里的五层像素贴图。上表与 100×100 实际运行样本同步；下文 Round 40 的 16×9 对比数字是当时采样的历史基线，不重算为新数据。

## 方法边界与局限（读数前必读）

- **渲染基准不是 GPU 帧率**：它测的是"绘制命令生成 + 场景对象分配"，场景是轻量 recording 替身——不含真实 Phaser 对象构造、WebGL 批处理与光栅化。真实浏览器中的收益（场景树遍历、渲染批次提交、GC 压力随对象数下降）在本基准边界之外，由单元测试（视觉参数逐项锁定）与浏览器烟测（实际画面与切换）覆盖。
- **Vitest 通道的绝对时间被模块 runner 开销放大**：Vitest 默认经 Vite module runner 运行源码，每次跨模块导出访问都经过 getter；官方基准指南明确警告这会让基准"不可靠"。对比显示该口径下 128×96 约 4,800–5,970 ms/op，而同一代码打包后在裸 Node 仅约 3.7–4.2 ms/render——**放大约三个数量级**。因此 Vitest 口径的毫秒数只用于同机同口径的运行间对比，真实数量级以裸 Node 通道为准；`vitest.config.ts` 设置 `benchmark.suppressExportGetterWarnings` 仅静默重复告警，不改变该开销。
- **异步任务不用 tinybench 计时**：实测 Vitest 5（实验性）bench runner 对 async 任务的 period 严重失真（一次约 150 ms 的加载被报为数十万 ms/op），因此 `loadGameData` 与 50 轮长跑均使用显式 wall-clock 循环自计时。
- **堆观察不是泄漏证明**：50 轮前后的 `heapUsed` 差值在 GC 后读取，量级在 ±几百 KiB 至 ~3 MiB 间随 GC 时机与机器负载波动；它回答"多轮加载后资源数与诊断数是否稳定、对象是否大体可回收"，不是严格的内存泄漏判定。
- **旧渲染器无法进 Node 基准**：R39 及之前的渲染器在模块顶层运行时导入 Phaser（Node 进程内 `window is not defined`），其"优化前"时间读数只能在带 mock 场景的 Vitest 口径下取得；裸 Node 通道是 R40 重写（`import type Phaser`，运行时零依赖）带来的新能力。

## Round 40 记录：地图渲染对象数 O(3N+1) → O(1)

### 变更

`src/engine/grid-map-renderer.ts` 由"每格 3 个 Rectangle（底色块+顶部亮边+右缘暗边）"重写为：

1. `buildGridMapDrawCommands(map)` 纯函数生成每格 4 条绘制命令（底色 fill → 边线 stroke → 亮边 fill → 暗边 fill，顺序、几何、颜色派生（±18/−20 明暗）、alpha（1 / 0.35 / 0.75 / 0.75）与旧实现逐项一致），瓦片颜色解析与明暗派生按颜色字符串缓存；
2. `renderGridMap` 把命令烘焙进单个 Graphics（连续相同的 fillStyle/lineStyle 去重），连同该 Graphics 装进返回的 Container——**每张图恒定 2 个场景对象**；
3. `cellCenterOffset` 返回普通 `{ x, y }`（原 `Phaser.Math.Vector2`，全部 13 处调用只读 x/y，类型检查证实等价）；
4. 模块改为 `import type Phaser`（运行时零依赖）；公共 API 签名与地图切换时的 `mapLayer?.destroy()` 容器销毁语义不变。

结构回归由 `tests/grid-map-renderer.test.ts`（10 用例）锁定：对象数随面积增长恒为 2、逐格几何/颜色/alpha/顺序、绘制范围与地图像素尺寸一致、Graphics 挂在返回容器内（销毁级联）、样式去重。

### 环境

- Windows 11 Home（10.0.26200）、Node v22.18.0（win32 x64）、Intel Core Ultra 5 225H（14 核）
- Vitest 5.0.2、Vite 8.3.1、Phaser 4.2.1；基准命令全程 `--expose-gc`
- 同机同会话内先后采集（先基线后重写，同一命令、同一口径）

### 读数（优化前 → 优化后）

**场景对象数（结构性，与机器无关）**

| 地图 | 格数 | 优化前（R39 渲染器） | 优化后（R40） |
| --- | --- | --- | --- |
| 16×9 实图（方格试炼场） | 144 | 433（1 容器 + 432 矩形） | **2**（1 容器 + 1 Graphics） |
| 32×24 合成 | 768 | 2,305 | **2** |
| 64×48 合成 | 3,072 | 9,217 | **2** |
| 128×96 合成 | 12,288 | 36,865 | **2** |

优化后单次渲染的 Graphics 绘制调用随格数线性（144 格 1,009 次 → 12,288 格 86,017 次，含样式设置；这是命令数不是对象数）。

**渲染耗时**

| 地图 | Vitest 口径（基线） | Vitest 口径（重写后） | 裸 Node 口径（重写后） |
| --- | --- | --- | --- |
| 16×9 实图 | 19.1 ms/op | 18.1–18.9 ms/op | 0.10 ms/render（0.72 µs/格） |
| 32×24 | 121.5 ms/op | 93.8–99.6 ms/op | 0.12 ms/render（0.16 µs/格） |
| 64×48 | 951.5 ms/op | 885.6–1,032.3 ms/op | 0.80 ms/render（0.26 µs/格） |
| 128×96 | 5,664.7 ms/op | 4,800.0–5,966.2 ms/op | 4.17 ms/render（0.34 µs/格） |

结论：Vitest 口径（模块 runner 开销主导）下合成时间在运行间噪声内基本持平、略有下降；裸 Node 口径给出真实数量级——12,288 格的命令生成约 4 ms。**决定性收益是对象数从随面积线性增长降为恒定 2**；其带来的场景树/批次/GC 收益发生在真实 Phaser 运行时，属基准边界之外。

**数据加载（26 资源，内存 fetch stub，wall clock）**

| 指标 | 基线 | 重写后 |
| --- | --- | --- |
| 20 轮平均 | 162.49 ms/轮 | 156.45–181.12 ms/轮 |
| 20 轮 min/max | 118.29 / 372.58 ms | 113.72–125.16 / 338.36–456.70 ms |

（渲染重写不触及加载管线；数字列出仅为同机参照，轮间波动来自进程与 GC 调度。）

**50 轮长跑**

| 指标 | 基线 | 重写后 |
| --- | --- | --- |
| 每轮资源数 / 诊断数 | 恒 26 / 0（逐轮断言） | 恒 26 / 0（逐轮断言） |
| 平均耗时 | 146.17 ms/轮（min 109.03 / max 196.46） | 127.01–144.28 ms/轮（min 85.17–111.91 / max 186.58–211.13） |
| GC 后 heapUsed | 18.79 → 20.07 MiB（+1,306.5 KiB） | 18.61 → 19.87 MiB（+1,289.6 KiB；另一次运行 +2,153.7 KiB） |

结论：多轮完整加载后资源数与诊断数逐轮稳定，GC 后堆差值在 ~1–3 MiB 区间波动、未见随轮数累积增长的趋势。

### 验证轮次的完整输出

以上数字取自本机实际运行（命令与退出码见 `DEVLOG.md` Round 40 条目）；复现直接运行 `npm run benchmark:round-40` 即可。
