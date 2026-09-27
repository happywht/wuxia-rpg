/**
 * Round 38 unit tests for the typed event bus: subscription bookkeeping,
 * unsubscribe/off identity semantics, `once` reentrancy and the snapshot
 * iteration contract of `emit`. Pure engine behaviour — no Phaser, no DOM.
 */

import { describe, expect, it } from 'vitest';

import { EventBus } from '../src/engine/event-bus';

interface TestEvents {
  ping: string;
  count: number;
}

function createBus(): EventBus<TestEvents> {
  return new EventBus<TestEvents>();
}

describe('EventBus on/off/unsubscribe', () => {
  it('delivers the emitted payload to every on() subscriber', () => {
    const bus = createBus();
    const pingSeen: string[] = [];
    const countSeen: number[] = [];
    bus.on('ping', (payload) => pingSeen.push(payload));
    bus.on('count', (payload) => countSeen.push(payload));

    bus.emit('ping', 'hello');
    bus.emit('count', 42);

    expect(pingSeen).toEqual(['hello']);
    expect(countSeen).toEqual([42]);
  });

  it('emitting an event without subscribers is a no-op', () => {
    const bus = createBus();
    expect(() => bus.emit('ping', 'nobody')).not.toThrow();
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('the unsubscribe function removes exactly its registration and is idempotent', () => {
    const bus = createBus();
    const seen: string[] = [];
    const unsubscribe = bus.on('ping', (payload) => seen.push(payload));
    expect(bus.listenerCount('ping')).toBe(1);

    unsubscribe();
    expect(bus.listenerCount('ping')).toBe(0);
    unsubscribe(); // A second call must stay harmless.
    expect(bus.listenerCount('ping')).toBe(0);

    bus.emit('ping', 'ignored');
    expect(seen).toEqual([]);
  });

  it('off() removes registrations by listener identity, one per call', () => {
    const bus = createBus();
    const seen: string[] = [];
    const listener = (payload: string): void => {
      seen.push(payload);
    };
    bus.on('ping', listener);
    bus.on('ping', listener);
    expect(bus.listenerCount('ping')).toBe(2);

    bus.off('ping', listener);
    expect(bus.listenerCount('ping')).toBe(1);

    bus.emit('ping', 'once');
    expect(seen).toEqual(['once']);
  });

  it('off() with an unknown listener and on a silent channel is harmless', () => {
    const bus = createBus();
    bus.on('ping', () => undefined);
    expect(() => {
      bus.off('ping', () => undefined);
      bus.off('count', () => undefined);
    }).not.toThrow();
    expect(bus.listenerCount('ping')).toBe(1);
  });

  it('clear(channel) empties one channel while clear() empties everything', () => {
    const bus = createBus();
    bus.on('ping', () => undefined);
    bus.on('count', () => undefined);

    bus.clear('ping');
    expect(bus.listenerCount('ping')).toBe(0);
    expect(bus.listenerCount('count')).toBe(1);

    bus.clear();
    expect(bus.listenerCount('count')).toBe(0);
  });
});

describe('EventBus once', () => {
  it('delivers exactly one emission and then unsubscribes itself', () => {
    const bus = createBus();
    const seen: string[] = [];
    bus.once('ping', (payload) => seen.push(payload));
    expect(bus.listenerCount('ping')).toBe(1);

    bus.emit('ping', 'only');
    bus.emit('ping', 'never');

    expect(seen).toEqual(['only']);
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('never re-fires when the once listener re-emits its own event from inside itself', () => {
    const bus = createBus();
    let onceCalls = 0;
    const lateSeen: string[] = [];
    bus.once('ping', (payload) => {
      onceCalls += 1;
      // Subscribing and re-emitting from inside a once handler: the once
      // registration was removed before the listener body runs, so the
      // re-entrant emission must reach the fresh subscriber but not itself.
      bus.on('ping', (reentrant) => lateSeen.push(reentrant));
      bus.emit('ping', payload + '-again');
    });

    bus.emit('ping', 'first');
    bus.emit('ping', 'second');

    expect(onceCalls).toBe(1);
    expect(lateSeen).toEqual(['first-again', 'second']);
  });

  it('off() also cancels a pending once registration via the original listener', () => {
    const bus = createBus();
    const seen: string[] = [];
    const listener = (payload: string): void => {
      seen.push(payload);
    };
    bus.once('ping', listener);
    bus.off('ping', listener);
    expect(bus.listenerCount('ping')).toBe(0);

    bus.emit('ping', 'cancelled');
    expect(seen).toEqual([]);
  });
});

describe('EventBus emit snapshot semantics', () => {
  it('a listener subscribed during delivery does not receive the in-flight emission', () => {
    const bus = createBus();
    const lateSeen: number[] = [];
    bus.on('count', (payload) => {
      if (payload === 0) {
        bus.on('count', (later) => lateSeen.push(later));
      }
    });

    bus.emit('count', 0);
    expect(lateSeen).toEqual([]);

    bus.emit('count', 1);
    expect(lateSeen).toEqual([1]);
  });
});
