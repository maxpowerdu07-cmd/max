// Shim of the claude.ai artifact `window.storage` API, backed by localStorage.
// "shared" data is only shared across tabs of the same browser.
if (!window.storage) {
  const k = (key, shared) => (shared ? 'shared:' : 'private:') + key;
  window.storage = {
    async get(key, shared = false) {
      const value = localStorage.getItem(k(key, shared));
      return value === null ? null : { key, value, shared };
    },
    async set(key, value, shared = false) {
      localStorage.setItem(k(key, shared), value);
      return { key, value, shared };
    },
    async delete(key, shared = false) {
      localStorage.removeItem(k(key, shared));
      return { key, deleted: true, shared };
    },
    async list(prefix = '', shared = false) {
      const p = k(prefix, shared);
      const keys = Object.keys(localStorage).filter((x) => x.startsWith(p)).map((x) => x.slice(p.length - prefix.length));
      return { keys, prefix, shared };
    },
  };
}
