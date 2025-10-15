import { Vectorize } from '@cloudflare/vectorize';
import { getEmbedding } from './embedding';
import { Cache } from './cache';

const vectorize = new Vectorize();
const cache = new Cache();

export async function addVector(key: string, text: string): Promise<void> {
    const embedding = await getEmbedding(text);
    await vectorize.add(key, embedding);
}

export async function queryVector(key: string): Promise<any> {
    const cachedResult = await cache.get(key);
    if (cachedResult) {
        return cachedResult;
    }
    const result = await vectorize.query(key);
    await cache.set(key, result);
    return result;
}

export async function deleteVector(key: string): Promise<void> {
    await vectorize.delete(key);
}

export async function rebuildIndex(): Promise<void> {
    await vectorize.rebuild();
}