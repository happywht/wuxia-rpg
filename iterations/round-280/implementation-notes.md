# Round280 实现与验证记录

计划先行，当前仅调整两处既有对白；地图、任务条件/效果、战斗奖励与存档协议均不变。R276 canonical 作者接受原版、已核验Round279前版及当前版，任意漂移和重复仍拒绝。

首次作者幂等因源文本与目标相同同时计数为1而误拒绝，已在当前文本唯一时直接幂等返回。保留 focused-first.txt 失败记录。

第二次回归发现R177要求的明确操作顺序短语遗漏；恢复“先核断口、再清拦路客”后，4文件34测试通过，详见focused-corrected.txt。新4测试单独通过return-contract.txt。

完整build已启动，当前过程句柄88473，日志build-candidate.txt；未取得最终退出码前不声称通过。下一步构建通过后冻结候选，再从Round279槽三正常走云岭C1，不使用旧候选C1代验。

完整npm run build实际退出0：198文件1789测试/102资源及全部检查、Vite通过。两侧C1完成正常保存、标题Continue和F8原样导出，冻结272文件未变。下载字节匹配，详见playtest/evidence-integrity。
文档更新后重新运行 audit:round-48-docs 与 audit:round-34，均退出0；git index与两原始导出逐字节匹配。
