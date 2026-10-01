import {describe,it,expect} from 'vitest';
import {combatLayoutMetrics} from '../src/game/combat-layout';
describe('Round124 combat vertical budgets',()=>{
 it.each([.8,1,1.2,1.4,1.6])('resource bars and log do not overlap at scale %s',scale=>{const font=Math.round(11*scale),m=combatLayoutMetrics(font,Math.round(13*scale)),textHeight=Math.ceil(font*1.3);expect(m.resourceStride).toBeGreaterThanOrEqual(textHeight+3+12);expect(m.logOffset).toBeGreaterThanOrEqual(24+30+m.resourceStride+textHeight+3+12+12);expect(m.actionRowHeight).toBeGreaterThanOrEqual(Math.ceil(Math.round(13*scale)*1.3)+4);});
});
