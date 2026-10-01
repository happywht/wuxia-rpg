/**
 * Round 111: 地图过渡后玩家 actor 持续隐形 —— 真实 Phaser 源码级生命周期回归。
 *
 * 根因（每一步都在 Phaser 4.2.1 源码中验证）：
 * 1. exclusive `Container.remove(child)`（Container.removeHandler）把子对象
 *    re-queue 回场景 DisplayList（GameObject.addToDisplayList）。
 * 2. DisplayList.addChildCallback 在 scene.sys.events 上 emit ADDED_TO_SCENE
 *    （DisplayList 构造里 `this.events = scene.sys.events`，二者同一 emitter）。
 * 3. GridScene 的 pinScreenObject 监听该事件，把一切对象 setScrollFactor(0)
 *    钉到 HUD 屏幕平面 —— 包括这个只是被"暂时移出"的世界 actor。
 * 4. 重新 add 进新世界层走 removeFromDisplayList，不再触发该事件，
 *    scrollFactor 0 就此残留；Phaser 4 容器渲染按
 *    child.scrollFactor × container.scrollFactor 合成（ContainerWebGLRenderer），
 *    相机滚动后 actor 画在原始屏幕坐标（视口外）—— 地图、NPC、HUD、碰撞与
 *    镜头全部正常，唯独玩家不可见。
 *
 * 本文件直接加载 Phaser 4.2.1 的真实 GameObject/Container/DisplayList/Camera
 * 源码模块（无需完整 Game/DOM），断言修复 helper（detach/adopt）在真实语义下
 * 保持 actor 的世界坐标平面；旧的"裸 remove + 裸 add"路径被证明会把 actor 钉在
 * 屏幕平面；修复路径另有世界坐标与所有权断言，根因复现用例保留旧路径。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// ── Minimal globals so Phaser's module-scope device checks evaluate ──────────
// (Same idea as phaser/tests/setup.js, trimmed to what the class-only require
// chain reads. No DOM, no browser, no Game boot.)
(globalThis as any).self = globalThis;
(globalThis as any).window = globalThis; // Phaser's device checks read window.*; self-reference like phaser/tests/setup.js.
global.Image = function (): object {
  return { width: 32, height: 32, addEventListener () {}, removeEventListener () {} };
} as unknown as typeof Image;
global.HTMLCanvasElement = global.HTMLCanvasElement ?? class MockCanvas {};
// Node's built-in navigator is a read-only getter without appVersion; Phaser's
// device checks need the richer shape, so redefine it when possible.
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node', appVersion: 'node', maxTouchPoints: 0 },
    configurable: true,
    writable: true,
  });
} catch {
  // A locked-down navigator keeps its own userAgent — good enough for boot.
}
if (!global.document) {
  const mock2d = new Proxy({}, {
    get: (_target: Record<string, unknown>, key: string | symbol) => {
      if (key === 'canvas') return {};
      if (key === 'getImageData' || key === 'createImageData') {
        return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      }
      if (key === 'measureText') return (text: unknown) => ({ width: String(text).length * 8 });
      return typeof key === 'string' ? () => {} : undefined;
    },
    set: () => true,
  });
  global.document = {
    createElement: () => ({ getContext: () => mock2d, style: {}, width: 0, height: 0 }),
    documentElement: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Document;
}

// ── Load the real Phaser 4.2.1 class sources by absolute path ────────────────
const root = fileURLToPath(new URL('../', import.meta.url));
const phaserSrc = (relative: string): string => join(root, 'node_modules', 'phaser', 'src', relative);
const nodeRequire = createRequire(import.meta.url);
const EventEmitter3 = nodeRequire(join(root, 'node_modules', 'eventemitter3')) as { new (): { on(e: string, f: (a: any) => void): void; emit(e: string, ...args: any[]): boolean } };
const PhaserGameObject = nodeRequire(phaserSrc('gameobjects/GameObject.js'));
const PhaserContainer = nodeRequire(phaserSrc('gameobjects/container/Container.js'));
const PhaserDisplayList = nodeRequire(phaserSrc('gameobjects/DisplayList.js'));
const PhaserCamera = nodeRequire(phaserSrc('cameras/2d/Camera.js'));
const SceneEvents = nodeRequire(phaserSrc('scene/events/index.js')) as Record<string, string>;
const ScrollFactorMixin = nodeRequire(phaserSrc('gameobjects/components/ScrollFactor.js')) as Record<string, unknown>;

import { adoptGridMapWorldActor, detachGridMapWorldActor } from '../src/engine/grid-map-renderer';

/* eslint-disable @typescript-eslint/no-explicit-any -- Phaser's CJS class sources arrive untyped here. */
type Any = Record<string, any>;
interface ActorLike { scrollFactorX: number; scrollFactorY: number; setScrollFactor (x: number, y?: number): unknown; parentContainer: Any | null; displayList: Any | null; x: number; y: number; depth: number; }

/** Boots the same ownership trio GridScene uses: scene events + display list + the scene-wide HUD pin. */
function bootScene (): { scene: Any; displayList: Any; pinned: unknown[]; makeActor: () => ActorLike } {
  const events = new EventEmitter3();
  const scene: Any = { sys: { events, queueDepthSort () {} } };
  const displayList = new PhaserDisplayList(scene);
  scene.sys.displayList = displayList;
  const pinned: unknown[] = [];
  // GridScene.create()'s pinScreenObject, verbatim semantics: everything the
  // display list announces lands on the HUD coordinate plane.
  events.on(SceneEvents.ADDED_TO_SCENE!, (gameObject: Any) => {
    if (typeof gameObject.setScrollFactor === 'function') gameObject.setScrollFactor(0);
    pinned.push(gameObject);
  });
  const makeActor = (): ActorLike => {
    const actor = new PhaserGameObject(scene, 'actor');
    Object.assign(actor, ScrollFactorMixin); // Real mixin source; the texture stack is out of scope here.
    actor.setScrollFactor(1);
    return actor as unknown as ActorLike;
  };
  return { scene, displayList, pinned, makeActor };
}

describe('Round111 actor visibility across map transitions (real Phaser sources)', () => {
  it('root cause: Container.remove re-queues the actor and the scene HUD pin claims it', () => {
    const { scene, makeActor, pinned } = bootScene();
    const actor = makeActor();
    expect(actor.scrollFactorX).toBe(1);
    const layer = new PhaserContainer(scene, 0, 0) as unknown as Any;
    layer.add(actor);
    expect(actor.parentContainer).toBe(layer);
    expect(actor.scrollFactorX).toBe(1); // Entering a container does not fire the pin.
    layer.remove(actor); // ← switchRegion's old plain remove.
    expect(actor.parentContainer).toBeNull();
    expect(pinned).toContain(actor); // Re-queued through the display list.
    expect(actor.scrollFactorX).toBe(0); // …and the scene-wide pin claimed it.
    const fresh = new PhaserContainer(scene, 0, 0) as unknown as Any;
    fresh.add(actor); // ← renderNpcs' old bare re-add.
    expect(actor.scrollFactorX).toBe(0); // The residue: invisible once the camera scrolls.
    expect(actor.parentContainer).toBe(fresh);
  });

  it('detach keeps the surviving actor on the world plane, adopt re-parents it cleanly', () => {
    const { scene, displayList, makeActor } = bootScene();
    const actor = makeActor();
    const oldLayer = new PhaserContainer(scene, 0, 0) as unknown as Any;
    oldLayer.add(actor);
    detachGridMapWorldActor(oldLayer as never, actor as never);
    expect(actor.scrollFactorX).toBe(1); // The detach pin did not stick.
    expect(actor.parentContainer).toBeNull();
    expect(displayList.exists(actor)).toBe(true); // Temporarily re-queued, as Phaser does.
    oldLayer.destroy(); // The old world layer dies with the old map.
    expect(oldLayer.list).not.toContain(actor);
    expect(actor.parentContainer).toBeNull(); // The detached actor survived.
    const newLayer = new PhaserContainer(scene, 0, 0) as unknown as Any;
    adoptGridMapWorldActor(newLayer as never, actor as never);
    expect(actor.parentContainer).toBe(newLayer);
    expect(actor.scrollFactorX).toBe(1);
    expect(displayList.exists(actor)).toBe(false); // Owned by the fresh world layer only.
  });

  it('two consecutive transitions keep the same reused actor on the world plane (normal and reduced motion)', () => {
    const { scene, makeActor } = bootScene();
    const actor = makeActor();
    const layers: Any[] = [];
    for (let hop = 0; hop < 2; hop += 1) {
      const layer = new PhaserContainer(scene, 0, 0) as unknown as Any;
      layer.setScrollFactor(1);
      layers.push(layer);
      if (hop === 0) layer.add(actor); else adoptGridMapWorldActor(layer as never, actor as never);
      // Normal-mode finishing move: depth + idle frame refresh touch neither factor…
      actor.depth = 4210.001 + hop;
      // Reduced-motion step: the position jumps straight to the arrival cell.
      actor.x = 53 * 16 + 8;
      actor.y = (89 + hop) * 16 + 8;
      detachGridMapWorldActor(layer as never, actor as never);
      layer.destroy();
      expect(actor.scrollFactorX).toBe(1); // Still on the world plane after every hop.
      expect(actor.scrollFactorY).toBe(1);
    }
    const destination = new PhaserContainer(scene, 0, 0) as unknown as Any;
    adoptGridMapWorldActor(destination as never, actor as never);
    expect(actor.parentContainer).toBe(destination);
    expect(actor.scrollFactorX).toBe(1);
    for (const layer of layers) expect(layer.list).not.toContain(actor); // Old layers disposed without the actor.
    expect(actor.x).toBe(53 * 16 + 8); // Arrival cell survived the double hop.
  });

  it('a recreated actor (fresh destination artwork state) adopts with the world factor', () => {
    const { scene, displayList, makeActor } = bootScene();
    const first = makeActor();
    const oldLayer = new PhaserContainer(scene, 0, 0) as unknown as Any;
    oldLayer.add(first);
    oldLayer.destroy(); // Full rebuild path: the old actor dies with its layer.
    const second = makeActor(); // createGridMapActor's semantics: created, pinned by the display list…
    displayList.add(second); // No skipCallback: the scene pin fires, as scene.add.image does.
    expect(second.scrollFactorX).toBe(0);
    second.setScrollFactor(1); // …and immediately normalized by the factory.
    expect(second.scrollFactorX).toBe(1);
    const layer = new PhaserContainer(scene, 0, 0) as unknown as Any;
    adoptGridMapWorldActor(layer as never, second as never);
    expect(second).not.toBe(first);
    expect(second.parentContainer).toBe(layer);
    expect(second.scrollFactorX).toBe(1);
    expect(displayList.exists(second)).toBe(false);
  });

  it('camera follow tracks the reused actor through a transition regardless of the pin', () => {
    const { scene, makeActor } = bootScene();
    const actor = makeActor();
    const camera = new PhaserCamera(0, 0, 960, 540);
    const oldLayer = new PhaserContainer(scene, 0, 0) as unknown as Any;
    oldLayer.add(actor);
    actor.x = 53 * 16 + 8; // Iron ridge arrival cell (53,90) in world pixels.
    actor.y = 90 * 16 + 8;
    camera.startFollow(actor, true, 1, 1);
    detachGridMapWorldActor(oldLayer as never, actor as never);
    oldLayer.destroy();
    actor.x = 53 * 16 + 8; // One reduced-motion step north: (53,89).
    actor.y = 89 * 16 + 8;
    const newLayer = new PhaserContainer(scene, 0, 0) as unknown as Any;
    adoptGridMapWorldActor(newLayer as never, actor as never);
    camera.preRender(); // Real follow math (data layer — independent of scroll factors).
    expect(Math.round(camera.scrollX)).toBe(Math.round(53 * 16 + 8 - 960 / 2)); // Camera followed the step north.
    expect(Math.round(camera.scrollY)).toBe(Math.round(89 * 16 + 8 - 540 / 2));
    expect(actor.scrollFactorX).toBe(1); // And the actor rides the world plane the camera scrolls.
    // With the old bug's factor of 0 the renderer would draw the actor at its
    // raw screen coordinates (ContainerWebGLRenderer multiplies child ×
    // container factors): the row-89 arrival stays stuck at world-pixel Y while
    // this deep-viewport camera has long scrolled past it.
    const screenX = actor.x - camera.scrollX * actor.scrollFactorX;
    const screenY = actor.y - camera.scrollY * actor.scrollFactorY;
    const buggyScreenY = actor.y - camera.scrollY * 0;
    expect(screenX).toBe(960 / 2); // Centred horizontally: visible.
    expect(screenY).toBe(540 / 2); // Centred vertically: visible.
    expect(buggyScreenY).toBe(89 * 16 + 8); // Pinned to the world pixel…
    expect(buggyScreenY).toBeGreaterThan(540); // …far below this scrolled viewport.
  });

  it('GridScene wires the transition through the fixed helpers (source-level guard)', () => {
    // Behaviour is proven above with real Phaser classes; this guard only pins
    // the two call sites so the bare remove/add cannot silently return.
    const source = readFileSync(join(root, 'src/game/grid-scene.ts'), 'utf8');
    expect(source).toContain('detachGridMapWorldActor(this.npcLayer, this.marker)');
    expect(source).toContain('adoptGridMapWorldActor(this.npcLayer, this.marker)');
    expect(source).not.toContain('this.npcLayer?.remove(this.marker)');
    expect(source).not.toContain('this.npcLayer.add(this.marker)');
    // The arrival refresh also repaints the destination atlas' idle frame.
    expect(source.match(/switchRegion[\s\S]*?updatePlayerActorFrame\(false\)/)).not.toBeNull();
  });
});
