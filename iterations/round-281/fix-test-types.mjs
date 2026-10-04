import fs from 'node:fs';
const p='tests/round281-release-candidate.test.ts';let s=fs.readFileSync(p,'utf8');s=s.replaceAll('files[0]','files[0]!').replaceAll('m.files[0]','m.files[0]!');fs.writeFileSync(p,s);
