const npcId = 'char.gu-yechen';
const oldText = '顾兄，上回带的话，掌柜的已经收到了。';
const newText = '顾兄，先前应下的话我还记着。往后可愿同路？';
const allyText = '顾夜尘把刀归鞘，抱拳道：「肯应下这句承诺，我记你的信义。旧账还没结清，不能说掌柜已经收到了；路上若愿互相照应，便来邀我。没当面告诉我的决定，我不会替你判断。」';
const invite = { text: '顾兄，我们再结伴走一程。', nextNodeId: 'companion-joined', conditions: [{ kind: 'npcRelationship', npcId, minValue: 15 }], effects: [{ kind: 'recruitCompanion', companionId: 'companion.gu-yechen' }] };

/** Pure localized migration; rejects unknown trust protocol before changing it. */
export function applyCompanionTrust(raw) {
  const set = JSON.parse(raw);
  const owners = set.conversations.filter(c => c.id === 'dlg.gu-yechen-roadside');
  if (owners.length !== 1) throw Error('Gu conversation ownership drift');
  const original = owners[0];
  const c = structuredClone(original);
  if (c.startNodeId !== 'greet') throw Error('Conversation root drift');
  const greet = c.nodes.find(n => n.id === 'greet');
  const promise = c.nodes.find(n => n.id === 'search').options.find(o => o.nextNodeId === 'deliver');
  const trust = c.nodes.find(n => n.id === 'blade').options.find(o => o.nextNodeId === 'ally');
  const ally = c.nodes.find(n => n.id === 'ally');
  const applied = trust?.text === newText;
  if (trust?.text !== oldText && !applied) throw Error('Trust text drift');
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(Object.keys(trust).sort(), ['conditions','effects','nextNodeId','text'])) throw Error('Trust option protocol drift');
  if (!same(Object.keys(promise).sort(), applied ? ['conditions','effects','nextNodeId','text'] : ['effects','nextNodeId','text'])) throw Error('Promise option protocol drift');
  if (!same(trust.effects, [{ kind:'adjustRelationship', npcId, delta:5 }, { kind:'adjustRenown', delta:2 }])) throw Error('Trust effects drift');
  if (!same(trust.conditions, [{ kind:'npcRelationship', npcId, minValue:10, ...(applied ? { maxValue:14 } : {}) }])) throw Error('Trust conditions drift');
  if (!same(promise.effects, [{ kind:'adjustRelationship', delta:10 }])) throw Error('Promise effects drift');
  if (!same(promise.conditions, applied ? [{kind:'npcRelationship',npcId,maxValue:9}] : undefined)) throw Error('Promise conditions drift');
  const invitations = greet.options.filter(o => o.text === invite.text || o.nextNodeId === invite.nextNodeId);
  if (applied) {
    if (ally.text !== allyText || invitations.length !== 1 || !same(invitations[0], invite)) throw Error('Invitation drift');
    return raw;
  }
  if (invitations.length !== 0) throw Error('Half applied invitation');
  trust.text = newText;
  trust.conditions[0].maxValue = 14;
  promise.conditions = [{kind:'npcRelationship',npcId,maxValue:9}];
  ally.text = allyText;
  const tail = greet.options.findIndex(o => o.nextNodeId === 'r129-gu-iron-route');
  if (tail < 0) throw Error('Managed tail absent');
  greet.options.splice(tail, 0, invite);
  const anchor = raw.indexOf('"id": "dlg.gu-yechen-roadside"');
  const start = raw.lastIndexOf('{', anchor);
  let depth=0, quoted=false, escaped=false, end=-1;
  for(let i=start;i<raw.length;i++) {
    const ch=raw[i];
    if(quoted){ if(escaped) escaped=false; else if(ch==='\\') escaped=true; else if(ch==='"') quoted=false; }
    else if(ch==='"') quoted=true;
    else if(ch==='{') depth++;
    else if(ch==='}' && --depth===0){end=i+1;break;}
  }
  if(end<0) throw Error('Conversation boundary absent');
  const eol=raw.includes('\r\n')?'\r\n':'\n';
  const serialized=JSON.stringify(c,null,2).replace(/\n/g,eol+'    ');
  const out=raw.slice(0,start)+serialized+raw.slice(end);
  JSON.parse(out);
  return out;
}
