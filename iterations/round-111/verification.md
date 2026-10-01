# Round 111 验证

基线 `691a4fb`。计划先于代码。真实键盘记录见 `playtest.md`，结算来源见 `reward-console.txt`。本轮独立提交后在 DEVLOG/最终回复列提交号，不提前伪造。

## 修复与主代理复核

正常盐道返铁嶂后，玩家持续不可见，一步北后仍消失，地图/HUD/碰撞/镜头正常。不是 Round110 深度更新可以覆盖的故障。

安装的 Phaser 4.2.1：exclusive Container.removeHandler 将子对象 addToDisplayList；DisplayList.addChildCallback 通过 scene.sys.events 发 ADDED_TO_SCENE；GridScene 的 HUD pinScreenObject 将其 scrollFactor 设为 0。新世界层接回对象没有恢复因子，相机虽跟随，角色仍画在原世界像素的屏幕位置而落在视口之外。

通用 detach/adopt helper 在移出/接回时恢复世界 scrollFactor=1，保留旧层销毁与角色复用语义；落点立即刷新目的地区角色 idle frame。未硬编码人名、地区、任务或剧情。主代理阅读修改和真实 Phaser 路径，复核根因与实际连续三次关口、正常动画一步。局部岩石/帐篷遮挡另列遗留，不称本轮全部遮挡已修复。

复用本地 Claude Code 已有同一旅程会话，默认模型与既有权限，约14分钟返回；原始 JSON 输出留本机不纳入提交。主代理没有按委托“全部已验证”的措辞作整体完成判定。

## 自动验证

主代理专项命令：

```powershell
npx vitest run tests/round111-actor-transition-visibility.test.ts tests/grid-map-renderer.test.ts tests/round110-reduced-motion-depth.test.ts tests/round51-map-art.test.ts tests/round52-map-camera.test.ts tests/round78-actor-depth.test.ts
```

结果：6文件30测试通过，exit0，见 `focused-tests.txt`。新增6项，直接使用真实 GameObject/Container/DisplayList/Camera；最小浏览器全局仅支撑模块加载，没有完整 Game/DOM/WebGL 光栅化，普通/减少动态的字段模拟不能替代实际移动。最后源码调用点断言是辅助守护。

完整 `npm run build`：exit0，101文件832测试通过（82.03秒），100资源Schema、MOD检查0问题、typecheck、R34/R48文档审计、Vite生产构建通过，见 `build.txt`。原有大分块提示仍在，未修改警告门槛。`git diff --quiet 691a4fb -- data/base data/schema` exit0，资料数量与 schema 未改；实际兼容、空坏资料、授权及独立发行包仍在大目标验收内。

## 实际证据边界

正常第三档从盐道继续，完成铁嶂碎岭清道、云岭云阶辨刻/断索悬桥、两处选择当前路线的跨区回应、三地刻痕对照和大陆阶段结案；保存返回菜单读回，章末显示“已记下”，资源相同。前两原档不动，未内部传送、注入状态或直接改存档。

只覆盖公开更簿+自留药品一路；另一组完整跨区回响、北境与海路、成长制作和三个新结局尚未通过。M2–M5 未通过，总 goal active。
