import { LRUCache } from 'lru-cache';

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};

export function createSalesResponseCache({ ttl = 30000, maxSize = 32 * 1024 * 1024, maxEntrySize = 4 * 1024 * 1024 } = {}) {
  const cache = new LRUCache({ max: 200, maxSize, ttl, sizeCalculation: entry => entry.size });
  const revisions = new Map();
  return {
    invalidate(tenant) {
      revisions.set(tenant, (revisions.get(tenant) || 0) + 1);
      for (const [key, entry] of cache.entries()) if (entry.tenant === tenant) cache.delete(key);
    },
    middleware(req, res, next) {
      if (req.method !== 'GET' || !req.user || !['laska', 'olgatorg'].includes(req.salesTenant)) return next();
      const tenant = req.salesTenant;
      const revision = revisions.get(tenant) || 0;
      const key = JSON.stringify(stable([tenant, revision, req.user, req.path, req.query]));
      res.set('Cache-Control', 'private, no-store');
      res.vary('Authorization');
      res.vary('x-tenant-id');
      const hit = cache.get(key);
      if (hit) {
        res.set('X-Sales-Cache', 'HIT');
        return res.type('application/json').send(hit.body);
      }
      res.set('X-Sales-Cache', 'MISS');
      const sendJson = res.json.bind(res);
      res.json = body => {
        if (res.statusCode === 200 && body?.success !== false && (revisions.get(tenant) || 0) === revision) {
          const serialized = JSON.stringify(body);
          const size = Buffer.byteLength(serialized) + serialized.length * 2 + key.length * 2;
          if (size <= maxEntrySize && size <= maxSize) cache.set(key, { body: serialized, tenant, size });
        }
        return sendJson(body);
      };
      return next();
    },
  };
}

export const salesResponseCache = createSalesResponseCache();
