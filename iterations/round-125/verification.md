# Round 125 验证

## 命令
- 首次 npm run typecheck exit1：测试闭包内解析结果的类型收窄丢失；缓存已解析profiles修正。
- npx vitest run tests/round125-faction-departure.test.ts tests/round103-faction-practice.test.ts：2文件29测试通过，924ms；focused-tests.txt。后续补充上界/无身份拒绝测试，最终以build-final.txt为准。
- npm run build：terminal session53419 exit0，100资源Schema、默认/MOD静态检查、tsc、121文件1023测试（88.82秒）、R34/R48文档审计和Vite通过；build.txt。
- npm run build第二次：build-final.txt，terminal72762 exit1；121文件1024测试（89.33秒）和类型/资料通过，但ROADMAP更新先于README/DATA/PLAYER状态，R48文档审计拒绝。已同步三份索引，并保留失败日志。
- npm run build最终：build-verified.txt，terminal92557 exit0；100资源Schema、默认/MOD静态检查、tsc、121文件1024测试（88.42秒）、R34/R48文档审计与Vite生产构建通过。
- 正常键盘手测：playtest.md与截图，覆盖取消/执行退派、最大字号两页、盘舷授艺、新护网战斗、复命和第三栏保存；读回已完成：第三栏19:12:59的身份/四门刀场武学预览/任务三个1/1/资源531银188命101气一致；前两栏不变。

## 复核
- 资料数字与名字来自解析Faction/MartialArt；引擎无具体人名地名硬编码。
- 纯projectFactionDeparture被预览与原子事务共同调用。可见项复制展示文本，保留原index/effects，确认仍读取原始图；长文复用既有分页。
- 只为第一项效果是leaveFaction的选项预览其退派当步；有早于退派的效果时不推测未计算的状态；后续复合效果不在此预览的承诺范围。当前5个门派退派均第一项且单一效果，测试核对全目录。
- 无新增资料协议/Schema/存档字段，既有100资源、22图65任务保持。旧v1/MOD退派数据按已解析规则工作；本轮未实际开启MOD或读旧v1，不冒充兼容旅程新证据。
- 授艺不等于全五派实践完成；目前云隐/盘舷已实走。其他门派、活动失败差事分支、长路改造、关键分支完整回响、伙伴、三终章和独立发行仍待验收。
- 生产入口663.38KB/Phaser1374.54KB分块警告保留，构建不替代独立发行。日志原样保留，格式检查与原始输出空白问题另列。

格式检查：git diff --cached --check发现仅原始build.txt/build-verified.txt的Vite行366尾空格、focused-tests.txt的末尾空行；原始工具日志保留。生产代码/测试/Markdown/离线路线脚本专项格式检查通过，不把日志格式差异当实现失败或悄悄改写原始输出。
