import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {applyCloudRouteRefinement,CLOUD_SHOP,CLOUD_SUPPLY_TEXT} from './lib/round112-cloud-routes.mjs';
import {regionGuides} from './lib/round106-region-content.mjs';
const read=p=>JSON.parse(readFileSync(resolve(p),'utf8'));
const write=(p,value)=>{
  const raw=readFileSync(resolve(p),'utf8'),nl=raw.includes('\r\n')?'\r\n':'\n';
  let text=JSON.stringify(value,null,2)+'\n';
  if(p==='data/base/shops/round-06-shops.json')
    text=text.replace(/\{\n          "itemId": ("[^"]+"),\n          "quantity": (-?\d+)\n        \}/g,'{ "itemId": $1, "quantity": $2 }');
  writeFileSync(resolve(p),text.replace(/\n/g,nl));
};
const mapPath='data/base/maps/round-74-cloud-ridge.json';
write(mapPath,applyCloudRouteRefinement(read(mapPath)));
const shopPath='data/base/shops/round-06-shops.json',shops=read(shopPath);
shops.shops=shops.shops.filter(s=>s.id!==CLOUD_SHOP.id);shops.shops.push(structuredClone(CLOUD_SHOP));write(shopPath,shops);
const npcPath='data/base/characters/round-74-cloud-ridge-npcs.json',npcs=read(npcPath);
npcs.npcs.find(n=>n.id===CLOUD_SHOP.npcId).shopId=CLOUD_SHOP.id;write(npcPath,npcs);
const dialoguePath='data/base/dialogues/round-74-cloud-ridge-conversations.json',dialogues=read(dialoguePath),d=dialogues.conversations.find(d=>d.id==='dlg.r74-shen-yuji-cloud-ridge');
if(!d)throw Error('Existing Cloud dialogue missing');
const greet=d.nodes.find(n=>n.id===d.startNodeId);
const supplyOption={text:'北行补给与石路怎么安排？',nextNodeId:'r112-supplies'};
const optionIndices=greet.options.flatMap((o,i)=>o.nextNodeId==='r112-supplies'?[i]:[]);
const nodeIndices=d.nodes.flatMap((n,i)=>n.id==='r112-supplies'?[i]:[]);
if(optionIndices.length>1||nodeIndices.length>1)throw Error('Existing Cloud supply entry duplicated');
// Preserve historical ordering when a later author appends another layer.
if(optionIndices.length)greet.options[optionIndices[0]]=supplyOption;else greet.options.push(supplyOption);
const supplyNode={id:'r112-supplies',text:CLOUD_SUPPLY_TEXT};
if(nodeIndices.length)d.nodes[nodeIndices[0]]=supplyNode;else d.nodes.push(supplyNode);
write(dialoguePath,dialogues);
const worldPath='data/base/world/world-map.json',world=read(worldPath),guide=world.regionGuides.find(g=>g.mapResourceId==='map.round-74-cloud-ridge');
guide.advice=regionGuides.find(g=>g.mapResourceId===guide.mapResourceId).advice;write(worldPath,world);
console.log('Round112: refined existing Cloud floor/path channels, limited paid shop and authored guide; all anchors retained.');
