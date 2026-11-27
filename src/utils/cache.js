const Redis = require('ioredis');
const config = require('../config');

// в тестах Redis не нужен: кэш отключён
let client = null;
if (config.env !== 'test' && config.redisUrl) {
  client = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  client.on('error', () => {}); // падение Redis не должно ронять приложение
  client.connect().catch(() => {});
}

const ready = () => client && client.status === 'ready';

// cached(ключ, секунды, функция) возвращает { value, cached }
async function cached(key, ttl, loader) {
  if (ready()) {
    try {
      const hit = await client.get(key);
      if (hit) return { value: JSON.parse(hit), cached: true };
    } catch {}
  }
  const value = await loader();
  if (ready()) {
    try {
      await client.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {}
  }
  return { value, cached: false };
}

module.exports = { cached };