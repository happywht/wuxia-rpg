# Round176 验证

## 自动验证

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/round75-region-event-approach.test.ts`（变更前） | 9项中2项失败，确认解析器忽略事件级半径、云岭远距线索不出现 |
| `npx vitest run tests/round75-region-event-approach.test.ts`（变更后） | 10/10通过 |
| `npm run validate:data` | 通过，manifest与100个基础资源Schema校验 |
| `npm run typecheck` | `tsc --noEmit`通过 |
| `npm run build` | 通过：171个测试文件/1493项通过，数据/MOD/类型/文档审计通过，Vite打包通过；存在大于500KB的Phaser chunk提示 |
| `npm run audit:round-173-six-region-evidence` | 通过：6区、17条可追溯证据、1条来源勘误；缺口仍明确保留 |
| `git diff --check` | 通过；仅Git提示工作树中LF文件将按core.autocrlf转换CRLF |

## 正常UI手测

从第一栏正常读档，照雪关78格至雁回崖入口、南归栈道112格至出口、45分钟过关进入云岭；再走40格到云岭主路(63,42)，正常HUD显示东9格断索桥线索。未按E，未写存档。详见`playtest.md`。
