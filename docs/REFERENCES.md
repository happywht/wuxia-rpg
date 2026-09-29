# 参考来源与使用边界（REFERENCES）

核验日期：2026-09-29。历史/回忆类来源统一编号 **#1–#5**，官方技术来源统一编号 **#6–#22**；软件包元数据在独立表格中按精确包版本记录，不参与原作对照编号。来源授权状态只在核验到明确许可时标为已知；没有核验页面许可时，仅作事实性查阅，不复制内容。

---

## 一、总体声明（必读）

1. **本项目不包含任何原作游戏资产**：不复制、不嵌入、不改编文曲星系列或《白金英雄坛说》的角色、地名、对话、剧情、源代码、美术、音频或其他游戏文件。本仓库含自制程序与公开 CC0 授权的 Kenney、OpenGameArt 像素图集；图集文件、对应原始许可和实际用途登记在本文件第六节，不含原作图片或音频素材。
2. **历史类来源的内容授权未经验证**：go1980.org 文章未声明许可证；其余历史/回忆/第三方页面同样未确认授权。因此本项目仅以"事实摘要 + 链接引用"的方式使用，**不转载原文、不复制页面文字**。
3. **证据分级诚实原则**：可检索的《白金英雄坛说》资料多为玩家回忆、攻略或衍生作品说明，未发现可作为完整官方规格的公开资料。凡属二手、单一来源或回忆性信息，均在 `docs/ORIGINAL-FIDELITY.md` 中标注置信度，不冒充定论。
4. **项目许可边界**：当前仓库没有单独的项目 `LICENSE`。本表中的 npm 许可证仅记录依赖包的发布元数据，不代表项目代码/原创世界资料获得何种授权；历史网页和技术文档页面也未由此变成开放许可。分发边界见 `docs/RELEASE.md`，再分发前须由维护者确定并审阅项目自身授权政策。

## 二、历史 / 回忆类来源（仅摘要引用）

| # | 来源 | 性质与用途 | 授权 / 使用方式 | 证据边界 |
|---|---|---|---|
| 1 | go1980.org《文曲星和它的游戏时代》 [来源页](https://go1980.org/%E6%96%87%E6%9B%B2%E6%98%9F%E5%92%8C%E5%AE%83%E7%9A%84%E6%B8%B8%E6%88%8F%E6%97%B6%E4%BB%A3) | 历史综述文章；用于了解文曲星系列掌上设备的游戏生态、早期 MUD 式武侠 RPG 的背景，以及该文对系列道德选择/NPC 互动和一项白金版结局机制的报道 | 页面未声明开放许可证；仅作事实摘要并链接，不复制文字、代码或素材 | 系列通用玩法描述主要指早期《英雄坛说》；白金版专属结局信息是文章对参与开发者证言的转述，并非官方规格或独立交叉验证 |
| 2 | TapTap《英雄群侠传》介绍页（app 28348）[来源页](https://www.taptap.cn/app/28348/all-info) | 后作介绍页中的第一人称叙述提及叙述者曾在文曲星上玩《白金英雄坛说》并受其吸引；仅用于记录页面自述的启发来源，不用来推断原作机制 | 页面未确认可复用授权；仅作概括性摘要并链接，不复制文字或素材 | 不是独立玩家评测或原作规格；页内玩法说明属于后作《英雄群侠传》，不能映射为白金版机制 |
| 3 | stahuj.cz《江湖群雄传·英雄坛说》[来源页](https://www.stahuj.cz/ios/hry/jiang-hu-qun-xiong-chuan-ying-xiong-tan-shuo/) | 第三方衍生作品的应用条目；只用于辨别衍生生态，不用于推断原作机制 | 页面未确认可复用授权；不复制页面文字、代码或素材 | 非权威、非官方，对原作不具证明力 |
| 4 | 界面新闻《文曲星和它的游戏时代》[页面](https://www.jiemian.com/article/1144843.html) | 与来源 #1 呈现相同稿件内容；仅用于核对同文刊载，不作为独立交叉证据 | 页面未确认可复用授权；只核对来源归属，不复制文字、图片或素材 | 与来源 #1 并非独立报道；相同的开发者证言仍只有一份媒体采访证据 |
| 5 | ZOL 问答《关于英雄坛说(白金版)的問題!急!!!》[来源页](https://ask.zol.com.cn/x/22737349.html) | 页面中的长篇玩法指南转载；发帖者注明内容来自百度“白金英雄坛说吧”，仅用于低置信度地核对高层操作/战斗形式（方向键行走、NPC 动作菜单、回合制战斗） | 用户投稿内容未声明开放许可证；仅作摘要并链接，不复制指南原文、专有名词、图片或素材 | 当前可检索页面文本未提供可核验发布日期；内容属社区转载、无官方背书且未用原设备验证，不能当作白金版规格 |

## 三、官方技术文档（工程决策依据）

官网发布公告和技术文档页面的内容许可未逐页核实，不据此推断为开放许可。本项目只使用其中的技术事实作为决策依据，不复制文档段落、示例代码、图片或其他页面素材。该状态与下节 npm 软件包的许可证元数据相互独立。

| # | 来源 | 用途 | 授权 / 使用方式 |
|---|---|---|---|
| 6 | Phaser v3.90 官方发布公告 [来源页](https://phaser.io/news/2025/05/phaser-v390-released) | 确认官方对 v3 发布线的说明（ADR-0001；发布日期 2025-05-23） | 页面许可未逐页核实；只查阅/转述技术事实，不复制文本、示例代码或素材 |
| 7 | Phaser v4 官方发布归档 [来源页](https://phaser.io/download/archive) | 确认 v4 发布版本及版本线（ADR-0001） | 页面许可未逐页核实；只查阅/转述版本事实，不复制文本、代码或素材 |
| 8 | [Phaser 官方安装文档](https://docs.phaser.io/phaser/getting-started/installation) | Phaser 接入方式参考 | 页面许可未逐页核实；只查阅技术事实，不复制文档文字、示例代码或素材 |
| 9 | [Vite 官方指南](https://vite.dev/guide/) | 构建配置与 Node 兼容条件参考（ADR-0003） | 页面许可未逐页核实；只查阅技术事实，不复制文档文字、示例代码或素材 |
| 10 | [TypeScript 官方文档](https://www.typescriptlang.org/docs/) | 语言与编译器选项参考（ADR-0002） | 页面许可未逐页核实；只查阅技术事实，不复制文档文字、示例代码或素材 |
| 11 | [Ajv 官方文档](https://ajv.js.org/) | Round 02 JSON Schema 校验管线参考（ADR-0004） | 页面许可未逐页核实；只查阅技术事实，不复制文档文字、示例代码或素材 |
| 12 | [Vitest 官方指南](https://vitest.dev/guide/) | ADR-0005、Round 38：确认 Vitest 安装方式、独立配置可用，以及最低兼容条件 Vite >=6.4.0、Node >=22.12.0 | 页面许可未逐页核实；只查阅技术事实，不复制文档文字、示例代码或素材 |
| 13 | [Vite HMR API](https://vite.dev/guide/api-hmr) 与 [Vite Plugin API](https://vite.dev/guide/api-plugin) | Round 36 自定义客户端 HMR 事件及 Vite Environment API `hotUpdate` 钩子的实现依据 | 页面许可未逐页核实；只查阅/转述技术事实，不复制文档段落、示例代码或素材 |
| 14 | [GitHub Actions 官方文档](https://docs.github.com/actions) | Round 39 持续集成工作流的触发事件（push/pull_request/workflow_dispatch）、`permissions`、`timeout-minutes` 与 `npm ci` 缓存等语法依据 | 页面许可未逐页核实；只查阅/转述技术事实，不复制文档段落、示例代码或素材 |
| 15 | [actions/checkout](https://github.com/actions/checkout) 与 [actions/setup-node](https://github.com/actions/setup-node) 官方仓库 | Round 39 CI 检出代码与 Node 22/npm 缓存环境搭建（`@v7`）所用官方 action 的用法与版本依据 | 仓库许可未逐项核实（两者为 GitHub 官方维护的开源 action）；只查阅用法事实，不复制其源码或文档段落 |
| 16 | [Vitest 官方基准指南](https://vitest.dev/guide/benchmarking) 与 [迁移指南](https://vitest.dev/guide/migration/) | Round 40 基准通道依据：Vitest 5 起 `bench` 从顶层导入改为 `test()` 回调的 bench fixture、`*.bench.ts` 按 `benchmark.include` 与普通测试互不可见、`vitest bench` 命令语义、模块 runner export-getter 开销警示及"测构建产物/局部捕获"缓解建议 | 页面许可未逐页核实；只查阅/转述技术事实，不复制文档段落、示例代码或素材 |
| 17 | [Phaser Gamepad 官方 API 文档](https://docs.phaser.io/api-documentation/class/input-gamepad-gamepad) | Round 41 手柄输入的设备模型依据：标准映射 D-pad 布尔（up/down/left/right）、左摇杆 `leftStick` 向量、A/B 按钮簇语义、`getAxisValue` 取值范围及按钮需先按下浏览器才开放设备的行为 | 页面许可未逐页核实；只查阅/转述技术事实，不复制文档段落、示例代码或素材 |
| 18 | [Phaser GamepadPlugin 官方 API 文档](https://docs.phaser.io/api-documentation/class/input-gamepad-gamepadplugin) | Round 41 场景接入依据：`this.input.gamepad` 场景级插件、`input: { gamepad: true }` 配置启用、`pad1`–`pad4`/`getAll()`/`total` 设备发现、`enabled` 开关与 SSL/浏览器安全限制说明 | 页面许可未逐页核实；只查阅/转述技术事实，不复制文档段落、示例代码或素材 |
| 19 | [GitHub Pages 配置发布源文档](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) | Round 47 静态发布方案与人工 Pages source 配置依据；Actions 发布由静态构建、Pages artifact 与独立 deploy job 组成 | 文档页面许可未逐页核实；只查阅/转述操作事实，不复制文档段落、示例代码或素材 |
| 20 | GitHub 官方 Actions 仓库：[upload-pages-artifact](https://github.com/actions/upload-pages-artifact)、[deploy-pages](https://github.com/actions/deploy-pages)、[upload-artifact](https://github.com/actions/upload-artifact) | Round 47 将生产 `dist/` 上传 Pages、部署此前 Pages artifact，并保留版本包为短期 Actions artifact；workflow 按官方 action 文档声明独立权限和环境 | 各仓库为官方维护开源 action；本轮未逐版本核验仓库内全部依赖许可，不复制 action 源码或文档段落；按官方发布列表锁定 major/minor/patch 标签 |
| 21 | [Vite Build Options](https://vite.dev/config/build-options) | Round 72 核对 Vite 8 生产构建中的 `build.rolldownOptions` 与兼容但已弃用的 `rollupOptions` 配置入口 | 页面许可未逐页核实；只查阅/转述技术事实，不复制文档段落、示例代码或素材 |
| 22 | [Rolldown `OutputOptions.codeSplitting`](https://rolldown.rs/reference/OutputOptions.codeSplitting) | Round 72 Phaser 运行时分块配置、模块分组优先级与路径分隔符匹配方式 | 页面许可未逐页核实；只查阅/转述技术事实，不复制文档段落、示例代码或素材 |

## 四、软件包许可核验（npm 元数据）

下表记录被选用的软件包及 npm registry 在指定版本发布元数据中的许可证标识。该标识是软件包许可证元数据，不代表 npm 网站、官方文档页面或包内所有第三方内容的许可。本项目通过包管理器引用依赖，没有复制或提交第三方库源码；分发时仍须核对包内许可证文件与 NOTICE，并随构建物提供适用的第三方许可声明。Round 02 已安装 Ajv 与 Node 类型声明；Round 38 加入 Vitest。

| 软件包 | Registry 元数据 URL | 许可 | 用途 |
|---|---|---|---|
| `phaser@4.2.1` | https://registry.npmjs.org/phaser/4.2.1 | MIT | Round 00 起的 2D 渲染与场景运行时 |
| `vite@8.3.1` | https://registry.npmjs.org/vite/8.3.1 | MIT | 开发服务器与生产构建 |
| `typescript@5.9.3` | https://registry.npmjs.org/typescript/5.9.3 | Apache-2.0 | 类型检查与语言工具链 |
| `ajv@8.20.0` | https://registry.npmjs.org/ajv/8.20.0 | MIT | Round 02 起 JSON Schema 数据校验 |
| `@types/node@26.6.3` | https://registry.npmjs.org/@types/node/26.6.3 | MIT | Round 02 Vite 配置的 Node API 开发期类型 |
| `vitest@5.0.2` | https://registry.npmjs.org/vitest/5.0.2 | MIT | Round 38 自动化测试 |
| `eventemitter3@5.0.4` | https://registry.npmjs.org/eventemitter3/5.0.4 | MIT | Phaser 4 运行时依赖；版本包的第三方通知附带其 license 文本 |
| `fast-deep-equal@3.1.3` | https://registry.npmjs.org/fast-deep-equal/3.1.3 | MIT | Ajv 运行时比较依赖；版本包通知列出确切版本及许可原文 |
| `fast-uri@3.1.8` | https://registry.npmjs.org/fast-uri/3.1.8 | BSD-3-Clause | Ajv 运行时 URI 依赖；版本包通知列出确切版本及许可原文 |
| `json-schema-traverse@1.0.0` | https://registry.npmjs.org/json-schema-traverse/1.0.0 | MIT | Ajv 运行时 Schema 遍历依赖；版本包通知列出确切版本及许可原文 |
| `require-from-string@2.0.2` | https://registry.npmjs.org/require-from-string/2.0.2 | MIT | Ajv 运行时依赖；版本包通知列出确切版本及许可原文 |

> 版本号核验方式：npm registry（`registry.npmjs.org`）元数据查询，结果记录于 `docs/ADR.md` 版本表与 `DEVLOG.md` 对应轮次条目。

## 五、使用规则（对本仓库所有贡献者生效）

- 引用上述历史类来源时，只允许出现**本项目自己撰写的摘要**与**指向原页面的链接**。
- 任何原作系列的具名细节（人名、地名、剧情点）不得进入 `src/`、`data/`；研究性讨论只出现在 `docs/`，且必须携带来源与置信度。
- 若未来需要引用带授权的资料，必须先在本文件登记来源、许可证与使用范围，再进入仓库。

## 六、Round 51+ 网页像素素材与再分发许可

| 素材来源 | 官方页面 / 许可依据 | 本项目实际使用内容 | 授权与发行处理 |
|---|---|---|---|
| OpenGameArt：ansimuz 的 RPG Town Pixel Art Assets | [素材页](https://opengameart.org/content/rpg-town-pixel-art-assets)；[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)；下载包内 `License.txt` | `data/assets/opengameart/rpg-town-pixel-art-assets/transparent-bg-tiles.png`（352×288、22×18 格、16px、RGBA 透明 PNG）：Round 76 五区 100×100 地图的低密度林木、岩石、岸线与驿镇环境补充图层；Round 82 用于青帆埠集市与东汊潮尺场景；图层帧号由对应确定性生成器声明 | 素材页标明 16×16 俯视图素与 CC0；包内许可注明作者 Luis Zuno（@ansimuz）及 CC0 1.0。保留原始 `License.txt`；仅发行透明打包图集与许可，不携带下载压缩包、角色/NPC 图集或 PSD |
| Kenney Roguelike/RPG Pack | [素材页](https://kenney.nl/assets/roguelike-rpg-pack)；[Kenney 许可说明](https://kenney.nl/support) | `data/assets/kenney/roguelike-rpg/roguelikeSheet_transparent.png` 用于地表、道路、树木、岸线、建筑与聚落；素材包所附 `Map/sample_map.tmx` 作为 100×100 五层世界底稿，项目本地副本为 `scripts/sources/kenney-roguelike-sample-map.tmx`；Round 62 铁嶂北道八层地貌与 Round 74 云岭古道十层山地/松林/石路/驿站构图复用同一图集 | 素材包页面与作者说明采用 CC0/公有领域许可；保留原始 `License.txt`。地图扩建只复用该图集瓦片，不引入未授权外部素材；源码 TMX 不进入版本包 |
| Kenney Tiny Dungeon | [素材页](https://kenney.nl/assets/tiny-dungeon)；[Kenney 许可说明](https://kenney.nl/support) | `data/assets/kenney/tiny-dungeon/tilemap_packed.png`；Round 65 前用于玩家、NPC 与伙伴像素人物，Round 65 起保留图集声明供旧资料/MOD 兼容引用 | CC0/公有领域许可；保留原始 `License.txt`，人物帧号由地图/NPC JSON 数据指定 |
| Kenney Tiny Town | [素材页](https://kenney.nl/assets/tiny-town)；[Kenney 许可说明](https://kenney.nl/support) | `data/assets/kenney/tiny-town/tilemap_packed.png`（192×176、12×11 格、16px、0 间距）：Round 70 世界总图林木、驿车与告示牌装饰；图素帧号由 `scripts/generate-round70-atlas.mjs` 烘焙到世界图层数据 | 官方素材页标示 CC0；保留素材包原始 `License.txt`，只发行实际使用的打包图集与许可文件 |
| Kenney RPG Urban Pack | [素材页](https://kenney.nl/assets/rpg-urban-pack)（官方下载 `https://kenney.nl/media/pages/assets/rpg-urban-pack/0a097d1dc7-1677578575/kenney_rpg-urban-pack.zip`）；[Kenney 许可说明](https://kenney.nl/support) | `data/assets/kenney/rpg-urban-pack/tilemap_packed.png`（432×288、27×18 格、16px、0 间距）：Round 65 起始地图 `urban-street-ground`/`urban-street-details` 两层使用经目检核验的路面/井盖族 432–445；Round 65–76 五张百格地图的人物精灵曾使用图集列 23–26 的 4 格人物组 23–26/131–134/239–242/347–350/455–458，各组为同一外观的 4 个静态朝向格，Round 74 新人物沈雨霁使用帧 350；Round 77 起玩家与 NPC 使用 Puny Characters 图集 | 包内 `License.txt` 声明 Creative Commons Zero (CC0) 1.0（包版本 RPG Urban Pack 1.0，创作日期 2019-01-05）；保留原始许可文件随素材分发。包内 `Tilemap/tilemap.txt` 声称 Spacing: 1px 与实际 PNG 尺寸矛盾（27×17−1=458≠432），以逐像素核验的 16px 无间距网格为准。只导入打包图集与原始许可两个文件，不携带未使用的散片瓦片或整包 |
| OpenGameArt：Shade 的 Puny Characters | [素材页](https://opengameart.org/content/puny-characters)；[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)；OGA 页面标明 CC0 | `data/assets/opengameart/puny-characters/actors.png`（320×256 RGBA、20×16 个 16px 格）：Round 77 五区与 Round 79/82 新区域玩家、NPC 与伙伴使用；由 `scripts/generate-round77-character-atlas.mjs` 从十种角色图集裁切中心 16×16 区域，打包各方向 idle 与三帧 walk；对应帧号由地图 `art.actors.playerFrames` 和 NPC `spriteFrame` 声明 | OGA 作者 Shade；来源页面列出俯视/正交图集、8 方向动画和 CC0，并说明允许修改/商用且无需署名。发行仅包含裁切合成图集与项目来源通知 `NOTICE.txt`；原始 PNG 生成输入保留在 `scripts/sources/opengameart/puny-characters/`，不进入版本包 |
| OpenGameArt：Shade 的 16x16 Puny World Tileset | [素材页](https://opengameart.org/content/16x16-puny-world-tileset)；[源 PNG](https://opengameart.org/sites/default/files/punyworld-overworld-tileset_0.png)；页面标明 CC0 | `data/assets/opengameart/puny-world/tileset.png`（432×1040 RGBA、27×65 格、16px、0 间距）：Round 79 东海群岛、Round 82 东溟海岸与 Round 84 风回岛地图使用海水、沙滩、草地、树林图素，并用于 384×256 全域舆图的东岸/南部岛链；地图 JSON 按 tile id 引用 | 作者 Shade；OGA 页面说明全图素以 16×16 格绘制，并许可商业/非商业使用与修改、无需署名。随图集保留项目来源通知 `NOTICE.txt`；发行只带被地图直接引用的同一张打包图集和通知 |

Kenney 的许可 FAQ 明确说明 Kenney.nl 提供的素材可在 CC0 条款下用于个人、教育及商业项目，署名并非强制。为保留来源并方便后续核验，本项目仍链接官方素材页并随素材包保存原许可文件。仅加入运行实际需要的图集及各自许可文件；Round 77 将 Puny Characters 接入人物图集；其他检查过但未使用的素材仍不打包。全域舆图另外使用 `scripts/generate-round70-atlas.mjs` 生成的纯色调色板 `data/assets/generated/world-palette.png`，它只承载低分辨率地貌底色，不含外部绘画素材。该素材来源独立于原作研究资料，不含《白金英雄坛说》的美术资源。
