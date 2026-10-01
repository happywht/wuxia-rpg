import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { parseDialogueSet, type DialogueData } from '../src/engine/dialogue-graph';
import { assembleDialogueReferences, dialogueChoiceForConfirmation, getVisibleOptions, isConditionMet, type DialogueRuntimeContext } from '../src/engine/dialogue-runtime';
const read = (p: string) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const schema = read('data/schema/dialogue-set.schema.json');
const validate = new Ajv({allErrors:true}).compile(schema);
const make = (condition: unknown) => ({conversations:[{id:'dlg.weather-test',startNodeId:'greet',nodes:[{id:'greet',text:'交谈',options:[{text:'天候',nextNodeId:'done',conditions:[condition]}]},{id:'done',text:'回应'}]}]});
const ctx = (weatherId?:string) => ({weatherId} as DialogueRuntimeContext);
const source = read('data/base/dialogues/round-93-snow-pine-valley-conversations.json');
const parsed = parseDialogueSet(source);
if (!parsed.ok) throw Error(parsed.errors.join('\n'));
const talk = parsed.set.conversations.find(c=>c.id==='dlg.r93-liu-xunjing-rounds')!;
const weatherIds = new Set<string>(read('data/base/worldview/climate.json').weathers.map((w:{id:string})=>w.id));
const weatherOptions = talk.nodes.find(n=>n.id==='greet')!.options!.filter(o=>o.nextNodeId.startsWith('r141-weather-'));
const refInput = (conversation:DialogueData, ids?:ReadonlySet<string>) => ({conversations:new Map([[conversation.id,conversation]]),quests:new Map(),items:new Map(),placedNpcIds:new Set<string>(),knowledgeNodeIds:new Set<string>(),factionIds:new Set<string>(),martialArtIds:new Set<string>(),timeOfDayPeriodIds:new Set<string>(),weatherIds:ids});
describe('Round141 weather protocol',()=>{
 it('does not execute another option shifted into the displayed index',()=>{
  const node={id:'greet',text:'交谈',options:[{text:'晴',nextNodeId:'clear',conditions:[{kind:'weather' as const,weatherId:'weather.clear'}]},{text:'雪',nextNodeId:'snow',conditions:[{kind:'weather' as const,weatherId:'weather.snow'}]}]};
  expect(dialogueChoiceForConfirmation(node,ctx('weather.clear'),0,0)?.index).toBe(0);
  expect(dialogueChoiceForConfirmation(node,ctx('weather.snow'),0,0)).toBeUndefined();
  expect(dialogueChoiceForConfirmation(node,ctx('weather.snow'),0,1)?.index).toBe(1);
 });
 it('schema and defensive parser accept a closed valid condition',()=>{const wire=make({kind:'weather',weatherId:'weather.clear'});expect(validate(wire)).toBe(true);expect(parseDialogueSet(wire).ok).toBe(true);});
 for(const condition of [{kind:'weather'}, {kind:'weather',weatherId:''},{kind:'weather',weatherId:3},{kind:'weather',weatherId:'weather.clear',unknown:true}]){
  it(`rejects ${JSON.stringify(condition)}`,()=>{expect(validate(make(condition))).toBe(false);const p=parseDialogueSet(make(condition));expect(!p.ok||p.set.conversations.length===0).toBe(true);});
 }
 it('requires exact current weather; missing legacy context is closed',()=>{const c={kind:'weather' as const,weatherId:'weather.clear'};expect(isConditionMet(c,ctx('weather.clear'))).toBe(true);for(const id of [undefined,'','weather.snow'])expect(isConditionMet(c,ctx(id))).toBe(false);});
 it('refilters weather when context changes, without applying effects',()=>{const node={id:'greet',text:'交谈',options:[{text:'晴',nextNodeId:'done',conditions:[{kind:'weather' as const,weatherId:'weather.clear'}],effects:[{kind:'adjustRenown' as const,delta:5}]}]};const c=ctx('weather.clear');expect(getVisibleOptions(node,c)).toHaveLength(1);c.weatherId='weather.snow';expect(getVisibleOptions(node,c)).toEqual([]);expect(c).toEqual({weatherId:'weather.snow'});});
 it('bad weather reference removes only its option; old unconditional survives',()=>{const c:DialogueData={id:'dlg.test',startNodeId:'greet',nodes:[{id:'greet',text:'交谈',options:[{text:'旧',nextNodeId:'done'},{text:'未知',nextNodeId:'done',conditions:[{kind:'weather',weatherId:'weather.missing'}]}]},{id:'done',text:'结束'}]};const r=assembleDialogueReferences(refInput(c,weatherIds));expect(r.warnings).toHaveLength(1);expect(r.conversations.get(c.id)!.nodes[0]!.options!.map(o=>o.text)).toEqual(['旧']);expect(c.nodes[0]!.options).toHaveLength(2);});
 it('known weather assembles, but absence of climate ids drops weather option',()=>{const p=parseDialogueSet(make({kind:'weather',weatherId:'weather.clear'}));if(!p.ok)throw Error('parse');const c=p.set.conversations[0]!;expect(assembleDialogueReferences(refInput(c,weatherIds)).warnings).toEqual([]);expect(assembleDialogueReferences(refInput(c)).warnings).toHaveLength(1);});
 it('shipped talk is schema valid and exactly one pure branch per declared weather',()=>{expect(validate(source)).toBe(true);expect(weatherOptions).toHaveLength(weatherIds.size);for(const id of weatherIds){const visible=getVisibleOptions({id:'weather',text:'巡路',options:weatherOptions},ctx(id));expect(visible).toHaveLength(1);expect(visible[0]!.option.effects).toBeUndefined();const target=talk.nodes.find(n=>n.id===visible[0]!.option.nextNodeId)!;expect(target.text).toContain('关口费用');}expect(getVisibleOptions({id:'weather',text:'巡路',options:weatherOptions},ctx())).toEqual([]);});
});
