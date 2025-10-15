import { Request, Response } from 'cloudflare-worker-types';
import { getSystemPrompt, updateSystemPrompt } from '../services/promptService';

export const handleGetPrompt = async (request: Request): Promise<Response> => {
    try {
        const prompt = await getSystemPrompt();
        return new Response(JSON.stringify({ prompt }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to retrieve prompt' }), { status: 500 });
    }
};

export const handleUpdatePrompt = async (request: Request): Promise<Response> => {
    try {
        const { newPrompt } = await request.json();
        await updateSystemPrompt(newPrompt);
        return new Response(JSON.stringify({ message: 'Prompt updated successfully' }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to update prompt' }), { status: 500 });
    }
};