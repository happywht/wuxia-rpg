import {execFileSync} from 'node:child_process';
execFileSync('git',['diff','--quiet','287ac2e431a8cd01a141e1fb301020ad44a820a1','--','data/base','data/schema']);
console.log('PASS: Round108基线全部基础资料与Schema保持，22地图/50关口及稳定剧情资源未改变。');
