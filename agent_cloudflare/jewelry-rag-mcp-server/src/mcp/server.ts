import { Router } from 'itty-router';
import { insertKnowledge, deleteKnowledge, rebuildIndex, queryConversations, getConversationTranscript, archiveOldConversations, getAiGatewayLogs, checkCacheHitRatio, updateSystemPrompt, getSystemPrompt, listBindings } from './handlers/tools';
import { handleResourceRequest } from './handlers/resources';
import { handlePromptRequest } from './handlers/prompts';

const router = Router();

router.post('/mcp/tools/insertKnowledge', insertKnowledge);
router.post('/mcp/tools/deleteKnowledge', deleteKnowledge);
router.post('/mcp/tools/rebuildIndex', rebuildIndex);
router.post('/mcp/tools/queryConversations', queryConversations);
router.post('/mcp/tools/getConversationTranscript', getConversationTranscript);
router.post('/mcp/tools/archiveOldConversations', archiveOldConversations);
router.get('/mcp/tools/getAiGatewayLogs', getAiGatewayLogs);
router.get('/mcp/tools/checkCacheHitRatio', checkCacheHitRatio);
router.post('/mcp/tools/updateSystemPrompt', updateSystemPrompt);
router.get('/mcp/tools/getSystemPrompt', getSystemPrompt);
router.get('/mcp/tools/listBindings', listBindings);

router.post('/mcp/resources', handleResourceRequest);
router.post('/mcp/prompts', handlePromptRequest);

router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  fetch: (request: Request) => router.handle(request),
};