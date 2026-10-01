import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const base='e70bd9ca65aec53f284cd10a62093fec1d387bb5';
const previous=p=>JSON.parse(execFileSync('git',['show',`${base}:${p}`],{encoding:'utf8',maxBuffer:4*1024*1024}));
const current=p=>JSON.parse(readFileSync(p,'utf8'));
const unchangedMaps=[];
for(const name of readdirSync('data/base/maps').filter(p=>p.endsWith('.json')&&p!=='round-74-cloud-ridge.json')){
  const path=`data/base/maps/${name}`;assert.deepEqual(current(path),previous(path));unchangedMaps.push(name);
}
const worldPath='data/base/world/world-map.json',world=current(worldPath),oldWorld=previous(worldPath);
const guide=world.regionGuides.find(g=>g.mapResourceId==='map.round-74-cloud-ridge');
const advice=guide.advice;guide.advice=oldWorld.regionGuides.find(g=>g.mapResourceId===guide.mapResourceId).advice;
assert.deepEqual(world,oldWorld);
const npcPath='data/base/characters/round-74-cloud-ridge-npcs.json',npcs=current(npcPath),oldNpcs=previous(npcPath);
delete npcs.npcs.find(n=>n.id==='char.r74-shen-yuji').shopId;assert.deepEqual(npcs,oldNpcs);
const shopPath='data/base/shops/round-06-shops.json',shops=current(shopPath),oldShops=previous(shopPath);
assert.deepEqual(shops.shops.filter(s=>s.id!=='shop.r112-cloud-waystation'),oldShops.shops);
assert.deepEqual(current('data/base/manifest.json'),previous('data/base/manifest.json'));
const report={baseline:base,unchangedMaps,worldExceptCloudAdviceUnchanged:true,npcExceptShopBindingUnchanged:true,existingShopsUnchanged:true,manifestUnchanged:true,advice};
writeFileSync('iterations/round-112/preserved-content.json',JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${unchangedMaps.length} non-Cloud maps; whole world except Cloud advice (atlas/gates/events/regions included); NPC schedule/anchor/dialogue; existing shops; manifest.`);
