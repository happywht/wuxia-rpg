import { describe, expect, it } from 'vitest';
import { paddedWorldCameraBounds } from '../src/game/world-camera-bounds';

describe('R109 world camera leaves edge cells outside the HUD bands', () => {
  it.each([[92,32],[138,39],[180,64]])('keeps first/last tile visible with %i/%i padding', (top,bottom) => {
    const viewWidth=960,viewHeight=540,mapSize=4800,tile=48;
    const bounds=paddedWorldCameraBounds(mapSize,mapSize,viewWidth,viewHeight,top,bottom);
    const minimumScroll=bounds.y;
    const maximumScroll=bounds.y+bounds.height-viewHeight;
    const firstCellCentre=tile/2-minimumScroll;
    const lastCellCentre=mapSize-tile/2-maximumScroll;
    expect(firstCellCentre-tile/2).toBe(top);
    expect(lastCellCentre+tile/2).toBe(viewHeight-bottom);
    expect(bounds.x).toBe(0);
    expect(bounds.width).toBe(mapSize);
  });
  it('keeps the existing fixed-camera bounds for small maps', () => {
    expect(paddedWorldCameraBounds(240,180,960,540,138,40)).toEqual({x:0,y:0,width:960,height:540});
  });
  it('clamps negative insets and supports horizontal scrolling maps', () => {
    expect(paddedWorldCameraBounds(1920,240,960,540,-5,-10)).toEqual({x:0,y:0,width:1920,height:540});
  });
});
