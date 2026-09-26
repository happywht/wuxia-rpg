/**
 * Minimal framework-agnostic typed event bus.
 *
 * The engine uses this to report data-loading outcomes without depending on
 * Phaser or any scene lifecycle (see docs/ARCHITECTURE.md): subsystems emit,
 * scenes subscribe. Event names and payload types are fixed by a single type
 * argument, so `emit`/`on` stay fully type-checked at the call site.
 */

/** Returned by `on`/`once`; calling it removes exactly that registration. */
export type Unsubscribe = () => void;

/** A listener for one event; the payload type comes from the event map. */
export type EventListener<Payload> = (payload: Payload) => void;

/**
 * Internal storage erases the payload type. `(payload: never) => void` is
 * assignable from `(payload: P) => void` for every `P` (parameters are
 * contravariant and `never` is a subtype of everything), so no `any` leak.
 */
type AnyListener = EventListener<never>;

interface Registration {
  /** What actually runs on emit: the original listener or a once-wrapper. */
  handler: AnyListener;
  /** The caller-supplied listener; `off` matches registrations by identity. */
  original: AnyListener;
}

export class EventBus<Events extends Record<keyof Events, unknown>> {
  private readonly registrations = new Map<keyof Events, Set<Registration>>();

  /** Subscribes; returns an unsubscribe function for the same registration. */
  on<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): Unsubscribe {
    const erasedListener = listener as unknown as AnyListener;
    const registration = { handler: erasedListener, original: erasedListener };
    this.add(event, registration);
    return () => this.removeRegistration(event, registration);
  }

  /**
   * Subscribes for a single delivery. The registration is removed before the
   * listener runs, so a `once` listener never fires twice — not even when it
   * re-emits the same event from inside itself.
   */
  once<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): Unsubscribe {
    const registration: Registration = {
      handler: (payload: never) => {
        this.removeRegistration(event, registration);
        listener(payload as Events[K]);
      },
      original: listener as unknown as AnyListener,
    };
    this.add(event, registration);
    return () => this.removeRegistration(event, registration);
  }

  /** Removes one registration matching `(event, listener)`. Idempotent. */
  off<K extends keyof Events>(event: K, listener: EventListener<Events[K]>): void {
    this.removeOne(event, listener);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const listeners = this.registrations.get(event);
    if (listeners === undefined || listeners.size === 0) {
      return;
    }
    // Iterate over a copy: listeners may subscribe or unsubscribe while the
    // event is being delivered (once-handlers already do, via removeOne).
    for (const registration of [...listeners]) {
      registration.handler(payload as never);
    }
  }

  /** Clears one event channel, or every channel when called without one. */
  clear(event?: keyof Events): void {
    if (event === undefined) {
      this.registrations.clear();
    } else {
      this.registrations.delete(event);
    }
  }

  listenerCount(event: keyof Events): number {
    return this.registrations.get(event)?.size ?? 0;
  }

  private add(event: keyof Events, registration: Registration): void {
    let listeners = this.registrations.get(event);
    if (listeners === undefined) {
      listeners = new Set<Registration>();
      this.registrations.set(event, listeners);
    }
    listeners.add(registration);
  }

  private removeOne(event: keyof Events, listener: AnyListener): void {
    const listeners = this.registrations.get(event);
    if (listeners === undefined) {
      return;
    }
    for (const registration of listeners) {
      if (registration.original === listener) {
        listeners.delete(registration);
        return;
      }
    }
  }

  private removeRegistration(event: keyof Events, registration: Registration): void {
    const listeners = this.registrations.get(event);
    if (listeners === undefined) {
      return;
    }
    listeners.delete(registration);
    if (listeners.size === 0) {
      this.registrations.delete(event);
    }
  }
}
