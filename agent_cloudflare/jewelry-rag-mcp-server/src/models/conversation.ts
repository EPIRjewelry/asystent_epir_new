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

export class ConversationModel {
    private conversations: Map<string, Conversation>;

    constructor() {
        this.conversations = new Map();
    }

    createConversation(userId: string): Conversation {
        const id = this.generateId();
        const newConversation: Conversation = {
            id,
            userId,
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.conversations.set(id, newConversation);
        return newConversation;
    }

    addMessage(conversationId: string, sender: 'user' | 'bot', content: string): void {
        const conversation = this.conversations.get(conversationId);
        if (conversation) {
            conversation.messages.push({
                sender,
                content,
                timestamp: new Date(),
            });
            conversation.updatedAt = new Date();
        }
    }

    getConversation(conversationId: string): Conversation | undefined {
        return this.conversations.get(conversationId);
    }

    private generateId(): string {
        return Math.random().toString(36).substr(2, 9);
    }
}