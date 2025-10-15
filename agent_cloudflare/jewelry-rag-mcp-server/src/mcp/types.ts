export interface JsonRpcRequest<T> {
    jsonrpc: string;
    method: string;
    params: T;
    id: string | number;
}

export interface JsonRpcResponse<T> {
    jsonrpc: string;
    result?: T;
    error?: JsonRpcError;
    id: string | number;
}

export interface JsonRpcError {
    code: number;
    message: string;
    data?: any;
}

export interface Knowledge {
    id: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Conversation {
    id: string;
    userId: string;
    messages: Message[];
    createdAt: Date;
    updatedAt: Date;
}

export interface Message {
    sender: 'user' | 'bot';
    content: string;
    timestamp: Date;
}

export interface User {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
}

export interface SystemPrompt {
    id: string;
    prompt: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CacheStats {
    hitCount: number;
    missCount: number;
    hitRatio: number;
}