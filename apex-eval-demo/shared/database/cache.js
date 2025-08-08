// Cache manager with patterns for Redis-like operations
export class CacheManager {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    // Check TTL
    const ttl = this.ttls.get(key);
    if (ttl && Date.now() > ttl) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    
    const value = this.store.get(key);
    return value ? JSON.parse(JSON.stringify(value)) : null; // Deep clone
  }

  async set(key, value, ttlSeconds = 0) {
    this.store.set(key, value);
    
    if (ttlSeconds > 0) {
      this.ttls.set(key, Date.now() + (ttlSeconds * 1000));
    }
    
    return true;
  }

  async delete(key) {
    this.store.delete(key);
    this.ttls.delete(key);
    return true;
  }

  async increment(key, ttlSeconds = 0) {
    const current = await this.get(key) || 0;
    const newValue = current + 1;
    await this.set(key, newValue, ttlSeconds);
    return newValue;
  }

  async exists(key) {
    return this.store.has(key);
  }

  async flush() {
    this.store.clear();
    this.ttls.clear();
  }
}