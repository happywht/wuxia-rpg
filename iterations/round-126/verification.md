# Round126 验证记录

## 命令与范围

- node scripts/generate-round126-coastal-service.mjs：两个合法地形落点的双向服务；对白先更新渡口文件、校正金云帆稳定ID后更新青帆文件。生成器纯函数幂等由正式测试覆盖，旧52关口不变。
- npm run typecheck：首跑测试写法 parsed.worldMap/参数次序错误exit2，修正fixture使用parsed.data及input-first，typecheck-final.txt exit0。
- focused-tests.txt：fetch fixture忘写JSON Content-Type，8项beforeAll跳过；focused-tests-final.txt只对白90分钟与90世界分钟断言不符。修正断言，无生产放宽。
- regressions.txt：5文件65测试exit0，涵盖新增资格/Schema/装配缺引用隔离、54关口、22图65任务、所有时段NPC与战斗占位、直航与未解锁三段陆路、M/R与路径资格、生成幂等/三个无效果说明；Scene Host资格缺失与确认前撤销、旧余额/落点/位置拒绝。
- build.txt exit1：新增关口使旧52计数/五个渡口标牌/全部出口默认开放/旧对白选项计数失败；精确更新54/六标牌，保留地形、投影、资源与旧选项签名检查，新增锁定出口断言。
- full-tests-final.txt exit1：122文件中121通过、1033/1034通过，仅文档状态还按125审计；未视为最终通过。
- build-verified.txt exit1：玩法1033通过，仅架构首页截至125不符当前126。架构摘要同步后 docs-audit.txt exit0。
- build-final.txt：122文件1034测试通过（124.39秒），随后R34地图文档缺新关口ID而exit1。补表首轮map-audit.txt缺地图ID/坐标格式，按准确mapResourceId与(col, row)修正；map-audit-final.txt exit0。
- build-complete.txt：最终完整构建exit0（build-complete-exit.txt为0）；包含数据静态Schema、默认MOD检查、tsc、全测试、R34/R48文档审计和Vite。静态Schema不能替代运行装配；新增装配测试是独立证据。
- git diff --check：当前已跟踪代码/文档无格式问题，原始命令日志按原样保留。

## 真实操作

详见playtest.md与15张以上截图：第三档正常取消、双向付费、护网点实际回访、最大字号M/R/E/祝九弦说明、标准字号恢复及19:59:29第三栏正常保存读回。银531→501→471；生命188/263与内力101/163不变。60成功格+180航程世界分钟；不把格数换成人类时间。前两栏保持。

## 未覆盖及总目标

未解锁、资格撤销、余额不足、到达占位拒绝为正式自动/Host证据，未手测。白鹭洲/金云帆说明只自动验证，祝九弦正常阅读。此轮没有独立旧v1文件迁移、真实MOD/空坏资料浏览器流程或发行包验证；未新增战斗/分支奖励，不能冒充三章/五派/伙伴/终章。Goal active，M2–M5未通过；分块警告与后续地区优化仍待处理。Claude429至21:15:39无本轮调用、无新增usage/cost或缓存节省声明。

## 范围与格式复核

semantic-scope.txt：对照提交前HEAD，移除新班船/新指引后，世界及两个对白文件与原资料语义完全相等；round30的更多diff行是JSON排版。静态审查脚本初跑git输出超过默认1MiB缓冲区（ENOBUFS），提高到32MiB后完成，不读取运行态。source-format.txt排除原始txt日志后exit0；staged-diff-check.txt exit2只有日志末尾空行，按原样保留日志，不声称全文件格式零警告。

## 最终结果

最终 npm run build exit0：122文件1034测试（123.13秒）、100资源/默认MOD静态Schema、tsc、R34/R48文档审计及Vite通过；入口664.78KB/Phaser1374.54KB分块警告保留，独立发行未验收。证据iterations/round-126/build-complete.txt。
原始日志保持，包括先前失败与最终通过；最终成功门槛是build-complete.txt，不是build.txt/build-verified.txt/build-final.txt。第三19:59:29正常读回已完成，goal未关闭。
