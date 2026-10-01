# Round130 验证

- 定向：`npm test -- tests/round130-hanshan-practice-brief.test.ts tests/round129-iron-practice-brief.test.ts tests/round59-regional-dialogue.test.ts`：3文件40测试exit0（1.57秒，含R129换行回归），focused-tests.txt。严格对象漂移、LF/CRLF、固定基线字节对照、R103/R107/R127/R128/R129重放、坏第二文件不写有效第一文件均覆盖。
- `node scripts/apply-round130.mjs`：两文件already applied delta0，解析/数量/语义通过。新增两个无效果入口及叶节点，tracked差异只16行插入，未广域改写旧对白。
- 正常实走、结算与读回：playtest.md及截图，未注入资源。最大字号柳2页/沈1页、Q5页/J3页已观察；最终标准字号存读见末段。
- 委托退出1/429，主代理完成修复及验证。usage/cost仅按返回JSON外部登记，无缓存节省推断。
- 完整build结果见下段；独立发行未验收。全产品goal active。


最终 `npm run build` exit0：130文件1109测试通过（89.83秒）；100资源Schema/默认MOD静态检查/tsc/R34与R48审计/Vite通过。入口666.91KB、Phaser1374.54KB分块警告保留，独立发行尚未验收。最终第三栏00:42:15正常保存/主菜单读回，江南44,37/青阳14日06:53，380银171命72气膏1/寒山15善恶5江湖0，标准字号恢复、临时960×540视口已重置，前两栏不变。

首轮build类型检查发现新增测试未用形参与R107作者模块无声明，已修正；下一次全量1失败/1108通过（88.73秒），为R129测试把Windows检出CRLF误认为漂移；保留build-crlf-failure.txt，测试先规范化为LF并独立构造CRLF后定向40项与最终全量1109项均通过。既有作者转换协议未改。
