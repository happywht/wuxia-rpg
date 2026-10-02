import sys,json
from pathlib import Path
from collections import deque
m=json.loads(Path('data/base/maps/'+sys.argv[1]+'.json').read_text(encoding='utf-8'))
start=tuple(map(int,sys.argv[2].split(',')));goal=tuple(map(int,sys.argv[3].split(',')))
blocked=set(tuple(map(int,a.split(','))) for a in sys.argv[4:]);q=deque([start]);prev={start:None}
while q:
 c,r=q.popleft()
 if(c,r)==goal:break
 for n in [(c,r+1),(c+1,r),(c,r-1),(c-1,r)]:
  x,y=n
  if 0<=x<m['columns'] and 0<=y<m['rows'] and not m['tileTypes'][m['grid'][y][x]]['solid'] and n not in prev and n not in blocked:prev[n]=(c,r);q.append(n)
a=[];p=goal
while prev[p] is not None:
 o=prev[p];a.append('Right' if p[0]>o[0] else 'Left' if p[0]<o[0] else 'Down' if p[1]>o[1] else 'Up');p=o
a.reverse();groups=[]
for k in a:
 if groups and groups[-1][0]==k:groups[-1][1]+=1
 else:groups.append([k,1])
print(groups,len(a))
