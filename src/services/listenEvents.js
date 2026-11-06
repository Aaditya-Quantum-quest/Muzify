const listeners = new Set();

export function subscribeListenChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyListenChanged() {
  for (const cb of listeners) {
    try {
      cb();
    } catch (error) {
      console.warn("listen changed listener threw", error);
    }
  }
}
