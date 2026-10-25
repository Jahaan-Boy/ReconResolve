import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getDB } from '../db/postgres';
import type { PrismaClient } from '../generated/prisma';
import { createSessionService, type SessionService } from './session.service';
import type { AuthenticatedUser, AuthRequestContext, MembershipRole } from './types';

export const COOKIE_NAME = 'reconresolve_session';
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthMiddlewareDeps {
    sessionService?: SessionService;
    getDb?: () => PrismaClient;
}

/**
 * Safely parses cookie header without external dependencies
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
    if (!cookieHeader || typeof cookieHeader !== 'string') {
        return {};
    }
    const cookies: Record<string, string> = {};
    for (const pair of cookieHeader.split(';')) {
        const idx = pair.indexOf('=');
        if (idx > 0) {
            const key = pair.substring(0, idx).trim();
            const val = pair.substring(idx + 1).trim();
            try {
                cookies[key] = decodeURIComponent(val);
            } catch {
                cookies[key] = val;
            }
        }
    }
    return cookies;
}

/**
 * Extracts session token from HttpOnly cookie or Authorization: Bearer header
 */
export function extractSessionToken(req: Request): string | null {
    // 1. Check cookies (either pre-parsed by express or raw header)
    const cookies = (req as any).cookies || parseCookies(req.headers.cookie);
    if (cookies[COOKIE_NAME]) {
        const val = cookies[COOKIE_NAME].trim();
        if (val.length > 0) return val;
    }

    // 2. Check Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        if (token.length > 0) return token;
    }

    return null;
}

/**
 * Middleware: Verifies authenticated user identity from session token.
 * Rejects unauthenticated (401) or disabled (403) users.
 */
export function authenticate(deps: AuthMiddlewareDeps = {}): RequestHandler {
    const sessionService = deps.sessionService ?? createSessionService({ getDb: deps.getDb });

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const token = extractSessionToken(req);
            if (!token) {
                res.status(401).json({
                    error: 'UNAUTHORIZED',
                    message: 'Authentication required: missing or invalid credentials',
                });
                return;
            }

            const validation = await sessionService.validateSession(token);
            if (!validation) {
                res.status(401).json({
                    error: 'UNAUTHORIZED',
                    message: 'Authentication failed: session is invalid, expired, or revoked',
                });
                return;
            }

            if (validation.isUserDisabled) {
                res.status(403).json({
                    error: 'USER_DISABLED',
                    message: 'Access denied: user account is suspended',
                });
                return;
            }

            req.authenticatedUser = {
                id: validation.user.id,
                email: validation.user.email,
                fullName: validation.user.fullName,
                status: validation.user.status,
            };
            req.sessionToken = token;
            (req as any).sessionId = validation.session.id;
            (req as any).sessionExpiresAt = validation.session.expiresAt;

            next();
        } catch (err) {
            console.error('[AuthMiddleware] Error during session validation:', err);
            res.status(500).json({
                error: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to verify authentication',
            });
        }
    };
}

/**
 * Middleware: Resolves and enforces active merchant context for the request.
 * Confirms membership in the target merchant; returns 404 for unassociated or suspended merchants.
 */
export function resolveMerchantContext(deps: AuthMiddlewareDeps = {}): RequestHandler {
    const dbProvider = deps.getDb ?? getDB;

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.authenticatedUser) {
                res.status(401).json({
                    error: 'UNAUTHORIZED',
                    message: 'Authentication required before resolving merchant context',
                });
                return;
            }

            // Extract target merchant ID from route param :merchantId or header x-merchant-id
            const targetMerchantId = (req.params.merchantId || req.headers['x-merchant-id']) as string | undefined;

            if (!targetMerchantId || typeof targetMerchantId !== 'string' || targetMerchantId.trim().length === 0) {
                res.status(400).json({
                    error: 'MERCHANT_CONTEXT_REQUIRED',
                    message: 'A target merchant context must be specified in the URL or x-merchant-id header',
                });
                return;
            }

            const cleanMerchantId = targetMerchantId.trim();
            if (!UUID_REGEX.test(cleanMerchantId)) {
                res.status(400).json({
                    error: 'INVALID_MERCHANT_ID',
                    message: 'Target merchant ID must be a valid UUID',
                });
                return;
            }

            const db = dbProvider();
            const membership = await db.merchantMembership.findUnique({
                where: {
                    userId_merchantId: {
                        userId: req.authenticatedUser.id,
                        merchantId: cleanMerchantId,
                    },
                },
                include: {
                    merchant: true,
                },
            });

            // If user has no membership or merchant is suspended, return 404 to prevent merchant existence leakage
            if (!membership || membership.merchant.status === 'SUSPENDED') {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Merchant not found or access denied',
                });
                return;
            }

            req.auth = {
                user: req.authenticatedUser,
                merchant: {
                    id: membership.merchant.id,
                    name: membership.merchant.name,
                    slug: membership.merchant.slug,
                    status: membership.merchant.status,
                    role: membership.role as MembershipRole,
                },
                membership: {
                    role: membership.role as MembershipRole,
                },
                session: {
                    id: (req as any).sessionId || '',
                    expiresAt: (req as any).sessionExpiresAt || new Date(),
                },
            };

            next();
        } catch (err) {
            console.error('[AuthMiddleware] Error resolving merchant context:', err);
            res.status(500).json({
                error: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to resolve merchant context',
            });
        }
    };
}

/**
 * Middleware: Role-based authorization guard.
 * Asserts that the authenticated user holds one of the required roles for the active merchant.
 */
export function requireRole(allowedRoles: MembershipRole[]): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.auth) {
            res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'Authentication and merchant context required',
            });
            return;
        }

        const currentRole = req.auth.membership.role;
        if (!allowedRoles.includes(currentRole)) {
            res.status(403).json({
                error: 'FORBIDDEN',
                message: `Insufficient permissions: role ${currentRole} is not authorized for this action`,
            });
            return;
        }

        next();
    };
}
