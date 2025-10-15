import { Knowledge, Conversation, Log } from '../types';
import { vectorStoreService } from '../../services/vectorstore';
import { cacheService } from '../../services/cache';
import { embeddingService } from '../../services/embedding';

export async function insertKnowledge(knowledge: Knowledge): Promise<void> {
    await vectorStoreService.insert(knowledge);
}

export async function deleteKnowledge(id: string): Promise<void> {
    await vectorStoreService.delete(id);
}

export async function rebuildIndex(): Promise<void> {
    await vectorStoreService.rebuild();
}

export async function queryConversations(userId: string): Promise<Conversation[]> {
    return await cacheService.getConversations(userId);
}

export async function getConversationTranscript(conversationId: string): Promise<string> {
    return await cacheService.getTranscript(conversationId);
}

export async function archiveOldConversations(thresholdDate: Date): Promise<void> {
    await cacheService.archiveOld(thresholdDate);
}

export async function getAiGatewayLogs(): Promise<Log[]> {
    return await cacheService.getLogs();
}

export async function checkCacheHitRatio(): Promise<number> {
    return await cacheService.getHitRatio();
}

export async function updateSystemPrompt(newPrompt: string): Promise<void> {
    await cacheService.updatePrompt(newPrompt);
}

export async function getSystemPrompt(): Promise<string> {
    return await cacheService.getPrompt();
}

export async function listBindings(): Promise<string[]> {
    return await cacheService.listBindings();
}