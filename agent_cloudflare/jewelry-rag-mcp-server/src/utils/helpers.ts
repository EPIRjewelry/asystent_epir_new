export function parseJsonBody(request: Request): Promise<any> {
    return request.json().catch(() => {
        throw new Error("Invalid JSON body");
    });
}

export function createResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

export function handleError(error: Error): Response {
    return createResponse({ error: error.message }, 500);
}

export function isValidRequestBody(body: any, requiredFields: string[]): boolean {
    return requiredFields.every(field => field in body);
}