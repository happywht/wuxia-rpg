# Round164 验证

- 专项 npx vitest run tests/round164-combat-followup.test.ts tests/round124-combat-recovery.test.ts：2文件10测试通过。
- 初稿测试误用不存在的playerAct/playerFlee及动作artId，按实际playerUse(action.art.id)/flee修正。focused-first-failed.txt、focused-second-failed.txt保留，不将失败记录抹去。
- npm test：163文件1451测试，97.68秒，通过。
- npm run build：静态100资源及默认/MOD Schema、tsc、163文件1451测试97.04秒、文档审计与Vite通过；exit-codes.txt tests=0 build=0，调用会话84734已实际退出0。构建并不是独立发行验收，入口709.87KB/Phaser1374.54KB大分块提示保留。
- 通用结算投影胜利/撤退/战败/未结束测试；真实战斗复查新版胜利页面。撤退/战败本轮没有新的实际UI旅程，不声称实走。
- 正常第一栏战斗/捐药/购药/拜师/三武学保存，第二空第三有限终章保持；实际读取证据见playtest.md与截图。
- 只将目标当前说明前移到Round164，保留全部验收与active；尚缺公开三章终章、大陆援药完整云岭后果、六区剩余优化、当前兼容授权独立发行整体验收。

文档更新后再运行 audit:round-34 与 audit:round-48-docs，均exit0；git diff --check通过。

暂存完整证据后diff检查发现工具日志尾部空行/Vite行末空白及测试尾部空行，统一清理纯格式后再检查通过；保留全部失败及构建诊断文本。
