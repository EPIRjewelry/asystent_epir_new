import { fetch } from 'undici';

const AI_SERVICE_URL = 'https://api.example.com/embeddings'; // Replace with actual AI service URL

export async function generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(AI_SERVICE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        throw new Error(`Error generating embedding: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding; // Adjust based on actual response structure
}

export async function batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
    const responses = await Promise.all(texts.map(text => generateEmbedding(text)));
    return responses;
}