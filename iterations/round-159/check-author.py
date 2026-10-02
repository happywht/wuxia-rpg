from pathlib import Path
import tempfile,shutil,subprocess,json
root=Path.cwd()
with tempfile.TemporaryDirectory(prefix='wuxia-r159-author-') as name:
 target=Path(name).resolve()
 assert target.parent==Path(tempfile.gettempdir()).resolve()
 for directory in ['scripts','data/base']:
  shutil.copytree(root/directory,target/directory)
 (target/'iterations/round-97').mkdir(parents=True)
 shutil.copy2(root/'iterations/round-97/round96-atlas-baseline.json',target/'iterations/round-97/round96-atlas-baseline.json')
 paths=['data/base/shops/round-06-shops.json','data/base/characters/round-97-lanxin-reef-npcs.json']
 before={p:(root/p).read_bytes() for p in paths}
 for i in range(2):
  result=subprocess.run(['node','scripts/generate-round97-lanxin-isle.mjs'],cwd=target,capture_output=True,text=True,encoding='utf-8')
  if result.returncode:raise RuntimeError(result.stderr)
  for p in paths:assert (target/p).read_bytes()==before[p],p
  print('PASS regeneration',i+1,'shared shops and sea NPC byte stability')
 print('Only introduced authoring outputs verified; not a full historical story regeneration audit.')
