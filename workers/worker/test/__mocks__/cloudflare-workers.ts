// Mock for cloudflare:workers module (not available in Node.js/Vitest environment)

export class DurableObject {
  state: any;
  env: any;

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
  }

  fetch(request: Request): Response | Promise<Response> {
    throw new Error('DurableObject.fetch must be overridden in subclass');
  }
}

// Export other cloudflare:workers types as needed
export const WorkerEntrypoint = class {};
