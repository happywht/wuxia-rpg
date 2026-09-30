# 主代理复核事项（实现完成后核验）

以下来自实现过程中的中间版本读取，不是最终缺陷结论；已在 Claude 定向修正与最终验证后逐项复核。

## 复核结论（2026-10-01 终态）

1. **回程地名** ✔ 已改正：叶庭舟（map.round-01-grid）目标/文案为"回镇里向叶庭舟复命"，石北（map.round-10-mist-ferry）为"回雾雨渡口向石北复命"；云隐/寒山/盘舷与实际放置相符。round103 测试含 NPC mapResourceId 与末目标 text 全表回归。
2. **heal/显示名** ✔ 五师傅提示统一"养是疗伤回复生命、要耗内力却不补内力"，无"回气"；force 全部写"力道"。测试 `not.toContain('回气养伤')`、`not.toContain('臂力')` 锁定。
3. **听雨证据边界** ✔ 全部文案改为旧索孔/刻痕观察练习（event.r74-cloud-inscription 用途），初核结论（索环回弹）保留且 echo 明示两件事互不作证；负向断言禁止"听山中/山中回声/证明剑鸣"措辞。
4. **柳听澜双角色** ✔ patch 按配置×角色驱动，dlg.liu-tinglan-mentor 同时含 r103-tingyu-field-brief 与寒山五节点（测试显式断言）；核询阶段 active 回应（field-brief）与师傅 active 提示（next）均已接线。
5. **证明来源/备药/门槛** ✔ r103 证明唯一来源=完整任务奖励；v1 completed 经 capture→parse→plan→restore 真链恢复后不获证明、全事实 reconcile 不重复发奖。云隐备药按 grid-scene 的 reconcileQuestFacts 用当前持有量结算——已备 2 份在井见闻后即结算，不需再购买、不扣物品（Claude 中间报告的"需第三次购买"有误，已纠正并按真实 helper 重写测试）。授艺仍走 martialArtEligible 全门槛。
6. **格式保护终态** ✔ 无占位/死代码/重复导出；文本手术保持 CRLF 与人工混合格式（diff 563+/11-，11 行为五任务受管替换）；脚本受管同步机制使文案纠错原地生效且重跑字节稳定（幂等测试 SHA-256）。
7. **浏览器旅程** 维持未验证结论：本轮全部为引擎/数据层证据，不宣称五派键盘实走。

## 最终验证（详见 verification.md）

typecheck/validate-data/inspect-mods/audit-round-34/audit-round-48-docs/vitest（77 文件 541 测试）/vite build/git diff --check 全部 exit 0（audit-round-34 在修正 docs/QUESTS.md 五行审计 token 后通过）。Claude误用语义检查路径；主代理按真实iterations/round-103/路径复跑通过（unrelated-semantics.txt）。总体 goal 保持 active。
