export interface User {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
}

export class UserModel {
    private users: User[] = [];

    constructor() {}

    createUser(name: string, email: string): User {
        const newUser: User = {
            id: this.generateId(),
            name,
            email,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.users.push(newUser);
        return newUser;
    }

    getUserById(id: string): User | undefined {
        return this.users.find(user => user.id === id);
    }

    updateUser(id: string, updatedData: Partial<Omit<User, 'id' | 'createdAt'>>): User | undefined {
        const user = this.getUserById(id);
        if (user) {
            Object.assign(user, updatedData, { updatedAt: new Date() });
            return user;
        }
        return undefined;
    }

    deleteUser(id: string): boolean {
        const index = this.users.findIndex(user => user.id === id);
        if (index !== -1) {
            this.users.splice(index, 1);
            return true;
        }
        return false;
    }

    private generateId(): string {
        return Math.random().toString(36).substr(2, 9);
    }
}