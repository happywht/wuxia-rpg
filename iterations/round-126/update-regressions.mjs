import fs from 'node:fs';
for(const file of fs.readdirSync('tests').filter(f=>f.endsWith('.test.ts'))) {
 const path='tests/'+file, input=fs.readFileSync(path,'utf8');
 const output=input.replace(/(expect\([^\n;]*\.transitions\)\.toHaveLength\()52(\))/g,'$154$2');
 if(output!==input)fs.writeFileSync(path,output);
}
let p='tests/round109-transition-markers.test.ts',s=fs.readFileSync(p,'utf8');
s=s.replace('expect(projections.length).toBe(5)','expect(projections.length).toBe(6)').replaceAll('5 * 6','6 * 6').replaceAll('5 * 2','6 * 2').replaceAll('5 * 8','6 * 8').replaceAll('toHaveLength(10); // two posts','toHaveLength(12); // two posts').replaceAll('toHaveLength(5); // lintels','toHaveLength(6); // lintels').replaceAll('toHaveLength(5); // E-glyph','toHaveLength(6); // E-glyph').replaceAll('expect(labels).toHaveLength(5)','expect(labels).toHaveLength(6)').replaceAll('expect(eKeys).toHaveLength(5)','expect(eKeys).toHaveLength(6)');
fs.writeFileSync(p,s);
p='tests/round59-regional-dialogue.test.ts';s=fs.readFileSync(p,'utf8').replace("'dlg.bai-luzhou-ferry-master': 21,","'dlg.bai-luzhou-ferry-master': 22,").replace("'dlg.zhu-jiuxian-mentor': 23,","'dlg.zhu-jiuxian-mentor': 24,");fs.writeFileSync(p,s);
p='tests/round106-regional-guide.test.ts';s=fs.readFileSync(p,'utf8').replace("import {findWorldTravelRoute}","import {transitionAccessReason} from '../src/engine/transition-access';\nimport {findWorldTravelRoute}").replace(".filter(e=>e.category==='supply'||e.category==='exit').map", ".filter(e=>(e.category==='supply'||e.category==='exit')&&e.destinationId!==null).map").replace("expect(target).toMatchObject({...gate.from,arrivalAction:'travel',approachRadius:1});","if(transitionAccessReason(gate,i.knownKnowledgeNodeIds)!==null){expect(target).toBeNull();expect(entries.find(e=>e.id==='exit:'+gate.id)!.detail).toContain('尚未开通');continue;}expect(target).toMatchObject({...gate.from,arrivalAction:'travel',approachRadius:1});");fs.writeFileSync(p,s);
