import fs from 'node:fs';
for(const file of ['.github/workflows/quality-gates.yml','.github/workflows/deploy-pages.yml']){
 const before=fs.readFileSync(file,'utf8');
 const after=before.replace('uses: actions/checkout@v7','uses: actions/checkout@v7\n        with:\n          # Historical migration regressions compare immutable prior commits.\n          fetch-depth: 0');
 fs.writeFileSync(file,after);
}
fs.appendFileSync('docs/RELEASE.md','\n## Round281：锁定源码与干净复现\n\n完整回归包含历史迁移保护，构建需完整Git历史；裸源码归档及默认浅克隆不能代替干净Git checkout。CI两工作流设置fetch-depth: 0。先git clone、checkout完整候选SHA、npm ci；设置GITHUB_SHA为同一SHA后执行npm run package:release。打包成功后将tgz解包到独立目录，执行 `node scripts/verify-release-candidate.mjs <package目录> <完整候选SHA>`，独立核对来源SHA、全部文件字节数与哈希、额外文件及关键运行文件。不能信任仅显示版本号的包；本地默认sourceCommit=null的便捷包不满足锁定候选验收。\n\n本轮先验证2280b58候选；自动校验通过仍须HTTP独立实启和正常存读，完整旅程未验不得宣布稳定发行。\n');
fs.appendFileSync('iterations/round-281/plan.md','\n## 复现方案修正\n\n第一次裸Git归档完整打包失败（11测试文件、30测试失败；7项历史SHA访问无.git，另有作者漂移错误，原日志保留）。发现多项测试依赖不可变历史版本，改为全历史干净Git克隆锁定2280b58，未复制未跟踪文件或放宽历史断言。两CI checkout补fetch-depth: 0以满足现有测试合同。\n');
