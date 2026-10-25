export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type MembershipRole = 'OWNER' | 'ADMIN' | 'ANALYST' | 'VIEWER';

export interface AuthenticatedUser {
    id: string;
    email: string;
    fullName: string;
    status: UserStatus;
}

export interface AuthorizedMerchant {
    id: string;
    name: string;
    slug: string;
    status: string;
    role: MembershipRole;
}

export interface AuthRequestContext {
    user: AuthenticatedUser;
    merchant: AuthorizedMerchant;
    membership: {
        role: MembershipRole;
    };
    session: {
        id: string;
        expiresAt: Date;
    };
}

declare global {
    namespace Express {
        interface Request {
            auth?: AuthRequestContext;
            authenticatedUser?: AuthenticatedUser;
            sessionToken?: string;
        }
    }
}
