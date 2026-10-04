import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { regionInspectionConversation } from '../src/game/region-inspection';
import { DialogueSession, parseDialogueSet } from '../src/engine/dialogue-graph';
import { parseGridMap } from '../src/engine/grid-map';
import { applyCloudForkSignArt, SIGN_LAYER_ID, SIGN_TILESET, repairCloudSignArtRaw } from '../scripts/lib/round279-sign-art.mjs';
import { FORK_SIGN_EVENT } from '../scripts/lib/round279-road-exchange.mjs';
import type { WorldMapData } from '../src/engine/world-map';
const read = (p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const map = JSON.parse(read('data/base/maps/round-74-cloud-ridge.json'));
const world:WorldMapData = JSON.parse(read('data/base/world/world-map.json'));

describe('R279 persistent inspection and licensed nonblocking sign',()=>{
  it('creates a valid terminal read-only conversation with all original text',()=>{
    const conversation=regionInspectionConversation(FORK_SIGN_EVENT);
    expect(parseDialogueSet({conversations:[conversation]}).ok).toBe(true);
    const session=new DialogueSession(conversation);
    expect(session.currentNode.text).toBe(FORK_SIGN_EVENT.text);
    expect(conversation.nodes).toEqual([{id:'read',text:FORK_SIGN_EVENT.text}]);
  });
  it('keeps automatic/interaction rewards outside the read panel and handles MOD Unicode',()=>{
    const text='MOD 中文🏔️\n'.repeat(500);
    const conversation=regionInspectionConversation({...FORK_SIGN_EVENT,id:'mod.custom',text});
    expect(conversation.nodes[0]!.text).toBe(text);
    expect(conversation.nodes[0]!.options).toBeUndefined();
    expect(conversation.nodes[0]!.confirmEffects).toBeUndefined();
    const settled=regionInspectionConversation(FORK_SIGN_EVENT,'正文 + 已获得见闻');
    expect(settled.nodes[0]!.text).toBe('正文 + 已获得见闻');
    expect(settled.nodes[0]!.options).toBeUndefined();
  });
  it('scene settles inspection once before opening its ordinary paged keyboard owner',()=>{
    const source=read('src/game/grid-scene.ts');
    const start=source.indexOf('if (shouldPreferRegionalEventInteraction');
    const block=source.slice(start,source.indexOf('if (target !== null)',start));
    expect(block.indexOf('this.presentRegionEvents')).toBeLessThan(block.indexOf('this.dialoguePanel?.open'));
    expect(block).toContain('regionInspectionConversation(mapEvent!.event, this.regionNotice ?? mapEvent!.event.text)');
    expect(source).toContain('(this.dialoguePanel !== null && this.dialoguePanel.isOpen)');
  });
  it('adds only one pixel frame and preserves grid, tile types, old layers and old tilesets',()=>{
    const before=structuredClone(map);
    before.art.layers=before.art.layers.filter((x:{id:string})=>x.id!==SIGN_LAYER_ID);
    before.art.tilesets=before.art.tilesets.filter((x:{id:string})=>x.id!==SIGN_TILESET.id);
    const original=structuredClone(before), next=applyCloudForkSignArt(before,world);
    expect(before).toEqual(original);
    expect(next.grid).toEqual(before.grid); expect(next.tileTypes).toEqual(before.tileTypes);
    expect(next.art!.layers.filter(x=>x.id!==SIGN_LAYER_ID)).toEqual(before.art.layers);
    expect(next.art!.tilesets.filter(x=>x.id!==SIGN_TILESET.id)).toEqual(before.art.tilesets);
    const layer=next.art!.layers.find(x=>x.id===SIGN_LAYER_ID)!;
    expect(layer.cells[59]![50]).toBe(85);
    expect(layer.cells.flat().filter(Boolean)).toEqual([85]);
    expect(parseGridMap(next).ok).toBe(true);
    expect(next).toEqual(map);
  });
  it('is idempotent and preserves LF/CRLF style',()=>{
    expect(applyCloudForkSignArt(map,world)).toEqual(map);
    const raw=read('data/base/maps/round-74-cloud-ridge.json');
    expect(repairCloudSignArtRaw(raw,world)).toBe(raw);
    const crlf=raw.replace(/\r?\n/g,'\r\n');
    expect(repairCloudSignArtRaw(crlf,world)).toBe(crlf);
  });
  it('refuses altered or duplicate sign layers, tilesets and landmarks',()=>{
    const drift=structuredClone(map); drift.art.layers.find((x:{id:string})=>x.id===SIGN_LAYER_ID).cells[59][50]=86;
    expect(()=>applyCloudForkSignArt(drift,world)).toThrow('图层漂移');
    const duplicate=structuredClone(map); duplicate.art.tilesets.push(SIGN_TILESET);
    expect(()=>applyCloudForkSignArt(duplicate,world)).toThrow('图集漂移');
    const dupWorld=structuredClone(world);dupWorld.landmarks.push(world.landmarks.find(x=>x.id==='landmark.r279-cloud-fork-sign')!);
    expect(()=>applyCloudForkSignArt(map,dupWorld)).toThrow('地标重复');
  });
  it('refuses moved or blocked sign cells, never alters inputs',()=>{
    const moved=structuredClone(world); moved.landmarks.find(x=>x.id==='landmark.r279-cloud-fork-sign')!.col=49;
    expect(()=>applyCloudForkSignArt(map,moved)).toThrow('坐标漂移');
    const blocked=structuredClone(map); blocked.grid[59]=blocked.grid[59].slice(0,50)+'#'+blocked.grid[59].slice(51);
    const original=structuredClone(blocked);
    expect(()=>applyCloudForkSignArt(blocked,world)).toThrow('不可通行');
    expect(blocked).toEqual(original);
  });
  it('legacy world has no added art and sign source/CC0 license is locally shipped',()=>{
    const old=structuredClone(world); old.landmarks=old.landmarks.filter(x=>x.id!=='landmark.r279-cloud-fork-sign');
    expect(applyCloudForkSignArt(map,old)).toBe(map);
    const png=readFileSync(new URL('../data/'+SIGN_TILESET.image,import.meta.url));
    expect([...png.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
    expect(png.readUInt32BE(16)).toBe(192); expect(png.readUInt32BE(20)).toBe(176);
    expect(84).toBeLessThan(SIGN_TILESET.tileCount);
    expect(read('data/assets/kenney/tiny-town/License.txt')).toContain('CC0');
  });
});
