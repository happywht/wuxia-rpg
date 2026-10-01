import json,sys
from pathlib import Path
from collections import deque
name,sx,sy,tx,ty,period=sys.argv[1:];m=json.loads(Path('data/base/maps/'+name+'.json').read_text(encoding='utf-8'));blocked=set()
for folder,key in [('characters','npcs'),('battles','encounters')]:
 for p in Path('data/base/'+folder).glob('*.json'):
  for n in json.loads(p.read_text(encoding='utf-8')).get(key,[]):
   if n['mapResourceId']==m['id']:
    pos=next((x['position'] for x in n.get('schedule',[]) if x['periodId']==period),n['position']);blocked.add((pos['col'],pos['row']))
a=(int(sx),int(sy));b=(int(tx),int(ty));q=deque([a]);seen={a:None}
while q and b not in seen:
 x,y=q.popleft()
 for dx,dy,k in [(0,-1,'Up'),(1,0,'Right'),(0,1,'Down'),(-1,0,'Left')]:
  t=(x+dx,y+dy)
  if 0<=t[0]<m['columns'] and 0<=t[1]<m['rows'] and t not in seen and t not in blocked and not m['tileTypes'][m['grid'][t[1]][t[0]]]['solid']:seen[t]=((x,y),k);q.append(t)
if b not in seen:raise Exception('unreachable')
keys=[];t=b
while seen[t] is not None:t,k=seen[t];keys.append(k)
keys.reverse();r=[]
for k in keys:
 if r and r[-1][0]==k:r[-1][1]+=1
 else:r.append([k,1])
print(len(keys),r)
