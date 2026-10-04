// P1 route and arrival story stays in data authoring, never the engine.
export const guidePatches = [
  {
    "id": "map.round-10-mist-ferry",
    "before": "药路先问容素青：清点苍崖根×3，生肌散另耗寒珠草×2、根×1和18银；问方、炼成后可先巡岸，伤后用药再复核。药队封箱另交无极丹×1并专门约时。若考虑修桥，另备铁砂×3、韧皮×2（56银），渡口无料铺。渡口无药铺，缺料回镇找姜百味；缺急救药先查R补给页。公所续差事，Q核目标、F问话。",
    "after": "药路先问容素青：清点苍崖根×3，生肌散另耗寒珠草×2、根×1和18银；问方、炼成后可先巡岸，伤后用药再复核。药队封箱另交无极丹×1并专门约时。若考虑修桥，另备铁砂×3、韧皮×2（56银），渡口无料铺。渡口无药铺，缺料回镇找姜百味；缺急救药先查R补给页。公所续差事，Q核目标、F问话。药队一事定下后，上山去核云阶旧索的方向：R出区选雾岬北口，到铁嶂后选断云北隘，再到云岭客舍问沈雨霁。此路没有直达传送；铁嶂调查可顺路记下，不必全做才过境。云隐药路余香另指西陲苦井，不把它当云岭必修。",
    "later": ["药路先问容素青：清点苍崖根×3，生肌散另耗寒珠草×2、根×1和18银。修桥另备铁砂×3、韧皮×2（56银），渡口无料铺；封箱另交无极丹×1并约时。渡口无药铺，缺药回镇找姜百味，R补给页可查；Q核目标、F问话。上北岸可步行，也可芦岸登船点北侧(0,3)旁按E乘驿舟：8银/20分钟，只到北岸，铁嶂两关仍自过，水尺见闻乘舟略过。到铁嶂选断云北隘，再到云岭客舍问沈雨霁；此路没有直达传送。云隐药路余香另指西陲苦井。"]
  },
  {
    "id": "map.round-62-iron-ridge",
    "before": "分开核界石与更簿，再定署名取舍；西道接盐道，断云北隘接云岭。此地无药铺，跨区补给会显示关口数，不等于旅程分钟。",
    "after": "分开核界石与更簿，再定署名取舍；西道接盐道，断云北隘接云岭。此地无药铺，跨区补给会显示关口数，不等于旅程分钟。若从渡口专程上云岭，R出区选断云北隘；无需先绕烽台或西陲。界石、更簿关系到残篇三地对照，可留后程调查。云岭客舍沈雨霁有有限药匣，到达后先听云阶与断索的本地目标。"
  },
  {
    "id": "map.round-74-cloud-ridge",
    "before": "先看刻痕再过断索、问沈雨霁；三地对照后选北台或青帆埠。客舍备药匣由沈雨霁售少量伤药，E交易、Q差事、F交谈，售完本程不补货；循石路接调查点与北台，缺货可东去青帆埠，回关仍可原路走。",
    "after": "先看刻痕再过断索、问沈雨霁；三地对照后选北台或青帆埠。客舍备药匣由沈雨霁售少量伤药，E交易、Q差事、F交谈，售完本程不补货；循石路接调查点与北台，缺货可东去青帆埠，回关仍可原路走。初到客舍先核渡口来路，再接云阶辨刻；刻痕确认后才接断索清桥。两件本地事可先完成，不必为残篇三地对照立即回渡口；清桥只是清退拦路客，不等于修好断索。"
  }
];
export const eventPatches = [
  {
    "id": "event.r62-ridge-arrival",
    "after": "越过雾岬北口，山风从黑石关门间穿过。旧牌把驿镇与上山路分列：去云岭可在R出区选断云北隘；更簿、界石留作另一趟调查，不必先绕遍驿镇。",
    "before": "越过雾岬北口，山风从黑石关门间穿过。驿路旧牌已裂，却还指向铁嶂北面的岩关驿镇。"
  },
  {
    "id": "event.r74-cloud-arrival",
    "after": "穿过断云北隘，松涛声从云层下传来。南侧旧牌指向山腰客舍：循石路找沈雨霁，先听云阶刻痕与断索的难处。客舍有有限药匣；带来的出发药可在伤后用，不需仅为问路回渡口。",
    "before": "穿过断云南隘，松涛声从云层下传来。路边残存的旧牌写着「断云栈道」，山腰似乎还有一间客舍。"
  }
];
export const arrivalNodes = [
  {
    "id": "r275-escort-arrival",
    "text": "沈雨霁读了渡籍口信：「你先护药队过雾桥，带来的回春膏就留给伤后；B里敷药，看的是实际恢复。来云岭先接云阶辨刻，到西侧石阶核第三道刻痕，再谈断索拦路客。残篇三地对照另需铁嶂更簿与青岩井壁，不用今天为这份口信折返渡口。」"
  },
  {
    "id": "r275-repair-arrival",
    "text": "沈雨霁翻过渡籍口信：「你实交铁砂韧皮、等了两日，又清开桥头，渡口才记通渡。清心丸可在气短时调息；B核实际恢复，满气别浪费。这里先接云阶辨刻，核西侧石阶再处理断索。清退拦路客也不等于修索，三地对照可留后程，不必仅为听回报折返渡口。」"
  }
];
export const arrivalOptions = [
  {
    "text": "渡口药队及时过桥，我带着伤药上山。",
    "nextNodeId": "r275-escort-arrival",
    "conditions": [
      {
        "kind": "questStatus",
        "questId": "quest.r31-guard-the-caravan",
        "status": "completed"
      }
    ]
  },
  {
    "text": "渡口已实料修桥并清了桥头，我来核山路。",
    "nextNodeId": "r275-repair-arrival",
    "conditions": [
      {
        "kind": "questStatus",
        "questId": "quest.r31-pier-toll-clearing",
        "status": "completed"
      }
    ]
  }
];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function unique(array,predicate){const found=array.filter(predicate);if(found.length!==1)throw Error('受管条目不唯一，请人工复核');return found[0];}
function replaceToken(raw,before,after){const oldCount=raw.split(before).length-1,newCount=raw.split(after).length-1;if(newCount===1&&oldCount===0)return raw;if(oldCount!==1||newCount!==0)throw Error('文本已漂移或重复，请人工复核');return raw.replace(before,after);}
export function repairWorldRaw(raw){let next=raw;const doc=JSON.parse(raw);for(const p of guidePatches){const guide=unique(doc.regionGuides,g=>g.mapResourceId===p.id);
// Round 278 rewrote the ferry advice to fit the paid shore boat; `later`
// chains that approved wording so an R275 replay neither reverts it nor
// refuses (same convention as the R263→R104 navigationNpcId carry-over).
if(![p.before,p.after,...(p.later??[])].includes(guide.advice))throw Error('指南已漂移，请人工复核');if(guide.advice===p.before)next=replaceToken(next,JSON.stringify(p.before),JSON.stringify(p.after));}for(const p of eventPatches){const event=unique(doc.events,e=>e.id===p.id);if(![p.before,p.after].includes(event.text))throw Error('入境已漂移，请人工复核');next=replaceToken(next,JSON.stringify(p.before),JSON.stringify(p.after));}JSON.parse(next);return next;}
export function repairRegionSourceRaw(raw){let next=raw;for(const p of guidePatches){if(p.before.includes("'")||p.after.includes("'"))throw Error('不支持的作者引号');
// Round 278 链：源内已是 later 串时跳过（同 repairWorldRaw 的 later 约定）。
const forms=[p.before,p.after,...(p.later??[])];const counts=forms.map(s=>next.split("'"+s+"'").length-1);if(counts.reduce((a,b)=>a+b,0)!==1)throw Error("作者指南已漂移或重复，请人工复核");if(counts.slice(2).some(c=>c===1))continue;next=replaceToken(next,"'"+p.before+"'","'"+p.after+"'");}return next;}
export function repairArrivalRaw(raw){const doc=JSON.parse(raw);const conversation=unique(doc.conversations,c=>c.id==='dlg.r74-shen-yuji-cloud-ridge');const greet=unique(conversation.nodes,n=>n.id===conversation.startNodeId);const touchedNodes=conversation.nodes.filter(n=>arrivalNodes.some(w=>w.id===n.id)),touchedOptions=greet.options.filter(o=>arrivalOptions.some(w=>w.nextNodeId===o.nextNodeId));if(same(touchedNodes,arrivalNodes)&&same(touchedOptions,arrivalOptions))return raw;if(touchedNodes.length||touchedOptions.length)throw Error('到达回响已漂移或重复，请人工复核');conversation.nodes.push(...structuredClone(arrivalNodes));greet.options.push(...structuredClone(arrivalOptions));const eol=raw.includes('\r\n')?'\r\n':'\n';return(JSON.stringify(doc,null,2)+'\n').replace(/\n/g,eol);}
