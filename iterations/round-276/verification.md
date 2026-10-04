# Round276 验证

- node scripts/apply-round276.mjs：两资源先完整预检再写，幂等验证；CLI坏第二资源不先写第一资源、漂移/重复拒写/EOL/cwd独立回归通过。
- npx tsc --noEmit：退出0，typecheck.txt；首次未用import保留typecheck-first.txt。
- npx vitest run tests/round276-cloud-challenge.test.ts tests/round274-ferry-choice.test.ts tests/round275-cloud-arrival.test.ts tests/round107-enemy-behavior.test.ts tests/round74-cloud-ridge.test.ts --reporter=dot：5文件66测试通过（focused-first.txt）；实际开战前等级成长与真实两策略补充后276/177两文件18测试通过（focused-final.txt）。
- npm run build：最终退出0（build-release.txt），100资源Schema/MOD/TypeScript/193文件1713测试/两文档审计/Vite175模块通过；main724.45KB与Phaser1374.54KB体积警告保留。首次build-first.txt因Round177旧文本句断言失败（1711项/1失败）；保留完整失败记录，仅更新现行对白对应断言，不删除状态/顺序/清桥非修索断言。
- 文档更新后npm run audit:round-34与npm run audit:round-48-docs，结果见docs-audit-final.txt。
- 实际双QA从C0正常Continue、124格调查/挑战/用药/有限采购/当地回报、空槽三保存→reload→标题Continue→B/F/E读回→F8原始导出，详见playtest与branch-comparison及截图。原Download=disk=Git index、git diff --cached --check提交前执行。

本轮只验收P1本地C1，完整候选全程/时长/道路密度与已记录导航问题仍待。保护无关Round144日志和旧未跟踪文件，不关闭整体Goal。
