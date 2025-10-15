import { VectorStore } from './vectorstore';
import { EmbeddingService } from './embedding';
import { CacheService } from './cache';
import { Product } from '../models/product';

export class SearchService {
    private vectorStore: VectorStore;
    private embeddingService: EmbeddingService;
    private cacheService: CacheService;

    constructor() {
        this.vectorStore = new VectorStore();
        this.embeddingService = new EmbeddingService();
        this.cacheService = new CacheService();
    }

    async searchProducts(query: string): Promise<Product[]> {
        const cachedResults = await this.cacheService.getCachedResults(query);
        if (cachedResults) {
            return cachedResults;
        }

        const embedding = await this.embeddingService.generateEmbedding(query);
        const results = await this.vectorStore.query(embedding);

        await this.cacheService.cacheResults(query, results);
        return results;
    }
}