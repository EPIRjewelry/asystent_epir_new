import { Cache } from 'cloudflare:cache';

const cache = new Cache('jewelry-rag-cache');

export async function getCachedValue(key: string): Promise<any> {
    const cachedValue = await cache.get(key);
    return cachedValue ? JSON.parse(cachedValue) : null;
}

export async function setCachedValue(key: string, value: any, ttl: number): Promise<void> {
    await cache.put(key, JSON.stringify(value), { expirationTtl: ttl });
}

export async function deleteCachedValue(key: string): Promise<void> {
    await cache.delete(key);
}

export async function clearCache(): Promise<void> {
    await cache.clear();
}