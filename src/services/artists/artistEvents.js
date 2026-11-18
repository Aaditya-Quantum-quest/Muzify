// src/services/artists/artistEvents.js
//
// Tiny change emitter so the Artists list and open profiles can re-query
// after a background scan/import finishes, without polling or a
// subscription library. artistSync re-exports these so existing importers
// keep working while this file is the canonical home.

const listeners = new Set();

/** Subscribe to artist-table changes. Returns an unsubscribe function. */
export function subscribeArtistsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Backwards-compatible alias used by the existing hooks. */
export const onArtistsChanged = subscribeArtistsChanged;

/** Fire once after any artist-table mutation. Safe to call off-thread. */
export function notifyArtistsChanged() {
  for (const cb of listeners) {
    try {
      cb();
    } catch (e) {
      console.warn("artists changed listener threw", e);
    }
  }
}