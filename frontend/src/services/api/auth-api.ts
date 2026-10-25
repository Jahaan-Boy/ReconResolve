export interface UserProfile {
    id: string;
    email: string;
    fullName: string;
    status?: string;
}

export interface PermittedMerchant {
    id: string;
    name: string;
    slug: string;
    role: string;
}

export interface AuthSessionData {
    user: UserProfile;
    token?: string;
    merchants: PermittedMerchant[];
    activeMerchant: PermittedMerchant | null;
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function subscribeUnauthorized(listener: UnauthorizedListener): () => void {
    unauthorizedListeners.add(listener);
    return () => unauthorizedListeners.delete(listener);
}

export function notifyUnauthorized(): void {
    unauthorizedListeners.forEach((l) => l());
}

export class AuthApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    async login(email: string, password: string): Promise<AuthSessionData> {
        const res = await fetch(`${this.baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            let errorMsg = 'Invalid email or password';
            try {
                const data = await res.json();
                errorMsg = data.message || errorMsg;
            } catch {
                // Ignore parse errors
            }
            throw new Error(errorMsg);
        }

        return (await res.json()) as AuthSessionData;
    }

    async fetchMe(): Promise<AuthSessionData | null> {
        try {
            const res = await fetch(`${this.baseUrl}/api/auth/me`, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
            });

            if (res.status === 401 || res.status === 403) {
                notifyUnauthorized();
                return null;
            }

            if (!res.ok) {
                return null;
            }

            return (await res.json()) as AuthSessionData;
        } catch {
            return null;
        }
    }

    async switchMerchant(merchantId: string): Promise<PermittedMerchant> {
        const res = await fetch(`${this.baseUrl}/api/auth/switch-merchant`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({ merchantId }),
        });

        if (!res.ok) {
            let msg = 'Failed to switch merchant context';
            try {
                const data = await res.json();
                msg = data.message || msg;
            } catch {
                // Ignore
            }
            throw new Error(msg);
        }

        const data = await res.json();
        return data.activeMerchant;
    }

    async logout(): Promise<void> {
        try {
            await fetch(`${this.baseUrl}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                },
                credentials: 'same-origin',
            });
        } finally {
            notifyUnauthorized();
        }
    }
}

export const authApiClient = new AuthApiClient();
