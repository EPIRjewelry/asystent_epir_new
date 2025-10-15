export function validateString(value: any, fieldName: string): boolean {
    if (typeof value !== 'string' || value.trim() === '') {
        console.error(`${fieldName} must be a non-empty string.`);
        return false;
    }
    return true;
}

export function validateNumber(value: any, fieldName: string): boolean {
    if (typeof value !== 'number' || isNaN(value)) {
        console.error(`${fieldName} must be a valid number.`);
        return false;
    }
    return true;
}

export function validateEmail(value: any): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof value !== 'string' || !emailRegex.test(value)) {
        console.error(`Invalid email format.`);
        return false;
    }
    return true;
}

export function validateRequiredFields(data: Record<string, any>, requiredFields: string[]): boolean {
    for (const field of requiredFields) {
        if (!data.hasOwnProperty(field) || !data[field]) {
            console.error(`Missing required field: ${field}`);
            return false;
        }
    }
    return true;
}