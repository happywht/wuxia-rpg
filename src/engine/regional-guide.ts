import type { EndingGateData } from './ending-system';
import type { PlacedNpc } from './npc-placement';
import type { AssembledShop, ItemRecordData, ShopStockRuntime } from './item-system';
import type { WorldMapAssembly } from './world-map';
import type { NavigationDestinationCell } from './world-navigation-guidance';
import { findWorldTravelRoute } from './world-travel';
import { transitionAccessReason } from './transition-access';
import { selectVisibleWorldLandmarks } from './world-map';
import { LANDMARK_DESTINATION_PREFIX } from './world-navigation';

export const REGION_GUIDE_PREFIX = 'region-guide:';
export type RegionGuideCategory = 'supply' | 'people' | 'quest' | 'exit' | 'landmark' | 'overview';
export interface RegionGuideEntry { id: string; category: RegionGuideCategory; title: string; detail: string; destinationId: string | null }
export interface RegionalGuideInput {
  worldMap: WorldMapAssembly;
  currentMapResourceId: string;
  /** Optional assembled terminal gate; navigation never selects an ending. */
  endingGate?: EndingGateData;
  baseNpcs: readonly PlacedNpc[];
  periodNpcs?: readonly PlacedNpc[];
  currentMapNpcs?: readonly PlacedNpc[];
  /** Real follower placement; overrides its original home only when actually present. */
  follower?: { npc: PlacedNpc; col: number; row: number; mapResourceId: string };
  activeFollowerNpcId?: string;
  shops: ReadonlyMap<string, AssembledShop>;
  items: ReadonlyMap<string, ItemRecordData>;
  shopStocks: ReadonlyMap<string, ShopStockRuntime>;
  knownKnowledgeNodeIds: ReadonlySet<string>;
  /** Optional live player silver; when present the guide quotes the real balance instead of a disclaimer. */
  liveCurrency?: number;
  /** Optional declared per-gate travel minutes (calendar actionCosts); walking steps are excluded. */
  travelMinutes?: number;
}
export const REGION_ROLE_LABELS = { hub: '枢纽', investigation: '调查', challenge: '挑战', transit: '过境' } as const;
/** Live NPC cell for one stable id: follower placement wins, then current-map, period and base records. */
export function resolveRegionGuideNpc(input: RegionalGuideInput, id: string): PlacedNpc | undefined {
  const follower = input.follower;
  if (follower?.npc.record.id === id) return { ...follower.npc, col: follower.col, row: follower.row,
    record: { ...follower.npc.record, mapResourceId: follower.mapResourceId } };
  if (input.activeFollowerNpcId === id) return undefined;
  return input.currentMapNpcs?.find(n=>n.record.id===id) ?? input.periodNpcs?.find(n=>n.record.id===id) ?? input.baseNpcs.find(n=>n.record.id===id);
}
/** Resolve stable selectors from live assembled data; never stores coordinates in saves. */
export function resolveRegionalGuideDestination(input: RegionalGuideInput, selector: string): NavigationDestinationCell | null {
  if (!selector.startsWith(REGION_GUIDE_PREFIX)) return null;
  const token = selector.slice(REGION_GUIDE_PREFIX.length);
  if (token.startsWith('ending:')) {
    const gate = input.endingGate;
    if (!gate || token !== 'ending:' + gate.id || !input.worldMap.regions.some(region => region.mapResourceId === gate.mapResourceId) || !findWorldTravelRoute(input.worldMap, input.currentMapResourceId, gate.mapResourceId, input.knownKnowledgeNodeIds)) return null;
    return { mapResourceId: gate.mapResourceId, ...gate.position, name: gate.name, approachRadius: 1, arrivalAction: 'ending' };
  }
  if (token.startsWith('npc:')) {
    const npc=resolveRegionGuideNpc(input,token.slice(4)); if (!npc) return null;
    return { mapResourceId: npc.record.mapResourceId, col:npc.col,row:npc.row,name:npc.record.name,approachRadius:1,
      arrivalAction:input.follower?.npc.record.id === npc.record.id ? 'companion' : npc.record.shopId !== null && input.shops.get(npc.record.shopId)?.record.npcId === npc.record.id ? 'shop' : 'talk' };
  }
  if (token.startsWith('gate:')) {
    const gate=input.worldMap.transitions.find(g=>g.id===token.slice(5));if(!gate || transitionAccessReason(gate,input.knownKnowledgeNodeIds)!==null)return null;
    return {...gate.from,name:gate.name,approachRadius:1,arrivalAction:'travel'};
  }
  return null;
}
/** Shelf details reflect current run stock, not the base JSON after purchases. */
export function buildRegionalGuideEntries(input: RegionalGuideInput): RegionGuideEntry[] {
  const result:RegionGuideEntry[]=[];
  const supplies:{entry:RegionGuideEntry;legs:number}[]=[];
  for(const shop of input.shops.values()) {
    const npc=resolveRegionGuideNpc(input,shop.record.npcId);if(!npc||npc.record.shopId!==shop.record.id)continue;
    const route=findWorldTravelRoute(input.worldMap,input.currentMapResourceId,npc.record.mapResourceId,input.knownKnowledgeNodeIds);if(!route)continue;
    const medicines=shop.stock.flatMap(stock=>{
      const item=input.items.get(stock.itemId);const remaining=input.shopStocks.get(shop.record.id)?.get(stock.itemId) ?? stock.quantity;
      if(!item?.consumable || (item.consumable.healthRestore<=0&&item.consumable.qiRestore<=0) || remaining===0)return [];
      return [`${item.name} ${item.buyPrice}两${remaining===-1?'常备':`余${remaining}`}（命+${item.consumable.healthRestore}/气+${item.consumable.qiRestore}）`];
    });
    if(!medicines.length)continue;
    const region=route.regionNames.at(-1)!;
    // Gate minutes come from the route leg count times the calendar's declared
    // per-gate cost; transition records themselves carry no minutes field.
    const gateText=input.travelMinutes!==undefined&&route.legs.length>0
      ?`（关口行程约 ${route.legs.reduce((sum, leg) => sum + (leg.transition.travelMinutes ?? input.travelMinutes!), 0)} 分钟，不含步行）`:'';
    const budgetText=input.liveCurrency===undefined
      ?'价格不代表已有银两；有限库存可耗尽。'
      :`现有银两 ${input.liveCurrency}；有限库存可耗尽。`;
    supplies.push({legs:route.legs.length,entry:{id:'supply:'+shop.record.id,category:'supply',title:shop.record.name,
      detail:`${region} · ${route.legs.length===0?'本地':`跨${route.legs.length}处关口${gateText}`} · ${npc.record.name} (${npc.col},${npc.row})\n${medicines.join('\n')}\n${budgetText}`,destinationId:REGION_GUIDE_PREFIX+'npc:'+npc.record.id}});
  }
  const locals=supplies.filter(s=>s.legs===0);const offered=locals.length?locals:supplies.sort((a,b)=>a.legs-b.legs||a.entry.id.localeCompare(b.entry.id)).filter((s,_i,array)=>s.legs===array[0]?.legs);
  result.push(...offered.map(s=>s.entry));
  const ids=new Set(input.baseNpcs.map(n=>n.record.id));
  for(const id of ids){const npc=resolveRegionGuideNpc(input,id);if(!npc||npc.record.mapResourceId!==input.currentMapResourceId)continue;result.push({id:'people:'+id,category:'people',title:npc.record.name,
    detail:`当前 (${npc.col},${npc.row}) · ${input.follower?.npc.record.id===id?'真实同行位置':'位置随当前时段重算'}。F交谈${npc.record.shopId?'；E商铺':npc.record.questGiver?'；E查看差事名录':''}。`,destinationId:REGION_GUIDE_PREFIX+'npc:'+id});}
  for(const gate of input.worldMap.transitions.filter(g=>g.from.mapResourceId===input.currentMapResourceId)) {
    const destination=input.worldMap.regions.find(r=>r.mapResourceId===gate.to.mapResourceId)?.name??gate.to.mapResourceId;
    const minutes = gate.travelMinutes ?? input.travelMinutes;
    const travelText=minutes===undefined?'':`过此关口按日程需 ${minutes} 分钟（不含步行）。`;
    const fareText=(gate.fare ?? 0)>0?`费用 ${gate.fare} 银两，按E先确认；也可继续步行。`:'';
    const accessReason=transitionAccessReason(gate,input.knownKnowledgeNodeIds);
    result.push({id:'exit:'+gate.id,category:'exit',title:gate.name,detail:`(${gate.from.col},${gate.from.row}) → ${destination}。走到旁边按E；这里不会自动通过或传送。${travelText}${fareText}${accessReason===null?'':'\n尚未开通：'+accessReason}`,destinationId:accessReason===null?REGION_GUIDE_PREFIX+'gate:'+gate.id:null});
  }
  for(const landmark of selectVisibleWorldLandmarks(input.worldMap.landmarks,input.knownKnowledgeNodeIds).filter(l=>l.mapResourceId===input.currentMapResourceId))result.push({id:'landmark:'+landmark.id,category:'landmark',title:landmark.name,detail:`已知地标 (${landmark.col},${landmark.row})；导航只带路，调查仍按实际事件条件。`,destinationId:LANDMARK_DESTINATION_PREFIX+landmark.id});
  const endingGate = input.endingGate;
  if (endingGate) {
    const region = input.worldMap.regions.find(entry => entry.mapResourceId === endingGate.mapResourceId);
    const route = region ? findWorldTravelRoute(input.worldMap, input.currentMapResourceId, endingGate.mapResourceId, input.knownKnowledgeNodeIds) : null;
    result.push({ id: 'ending:' + endingGate.id, category: 'landmark', title: endingGate.name + ' · 终章入口',
      detail: `${region?.name ?? '入口地区资料缺失'} (${endingGate.position.col},${endingGate.position.row})。${route ? `跨 ${route.legs.length} 处关口（不含步行）；到邻格按E查看终章。` : '当前没有可达路线。'}导航只带路，不自动结束旅程，也不代表结局条件已满足。已有师门时请先核对所选结局要求。`,
      destinationId: route ? REGION_GUIDE_PREFIX + 'ending:' + endingGate.id : null });
  }
  return result;
}
