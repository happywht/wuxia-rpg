import {relays,relayWaitingDirections} from './round105-people-content.mjs';
export function applyRelayWaitingDirections(source){
 const set=JSON.parse(source);let result=source;
 for(const relay of relays){
  const c=set.conversations.find(c=>c.id===relay.sourceDialogueId);if(!c)continue;
  const node=c.nodes.find(n=>n.id===`r105-${relay.key}-waiting`);
  if(!node)throw new Error(`Missing waiting ${relay.key}`);
  const before=JSON.stringify(node.text),after=JSON.stringify(relayWaitingDirections[relay.key]);
  if(before===after)continue;
  if(result.split(before).length!==2)throw new Error(`Ambiguous waiting ${relay.key}`);
  result=result.replace(before,after);
 }
 return result;
}
