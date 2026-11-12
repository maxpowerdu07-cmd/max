// Shim of the claude.ai `window.storage` API. Uses localStorage when the browser allows it,
// otherwise an in-memory map (private windows, sandboxed previews). "shared" data is only
// shared across tabs of the same browser.
if (!window.storage) {
  const mem = new Map();
  const ls = {
    get(k) { try { const v = localStorage.getItem(k); return v === null ? (mem.has(k) ? mem.get(k) : null) : v; } catch (e) { return mem.has(k) ? mem.get(k) : null; } },
    set(k, v) { mem.set(k, v); try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { mem.delete(k); try { localStorage.removeItem(k); } catch (e) {} },
    keys() { let ks = []; try { ks = Object.keys(localStorage); } catch (e) {} return [...new Set([...ks, ...mem.keys()])]; },
  };
  const k = (key, shared) => (shared ? 'shared:' : 'private:') + key;
  window.storage = {
    async get(key, shared = false) { const value = ls.get(k(key, shared)); return value === null ? null : { key, value, shared }; },
    async set(key, value, shared = false) { ls.set(k(key, shared), value); return { key, value, shared }; },
    async delete(key, shared = false) { ls.del(k(key, shared)); return { key, deleted: true, shared }; },
    async list(prefix = '', shared = false) {
      const p = k(prefix, shared);
      const keys = ls.keys().filter((x) => x.startsWith(p)).map((x) => x.slice(p.length - prefix.length));
      return { keys, prefix, shared };
    },
  };
}
