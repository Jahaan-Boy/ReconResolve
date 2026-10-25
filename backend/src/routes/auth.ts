import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { getDB } from '../db/postgres';
import type { PrismaClient } from '../generated/prisma';
import { hashPassword, verifyPassword } from '../auth/password';
import {
    createSessionService,
    DEFAULT_SESSION_TTL_MS,
    type SessionService,
} from '../auth/session.service';
import {
    authenticate,
    COOKIE_NAME,
    extractSessionToken,
    UUID_REGEX,
} from '../auth/middleware';

export interface AuthRouterDeps {
    getDb?: () => PrismaClient;
    sessionService?: SessionService;
}

const LoginSchema = z.object({
    email: z.string().email('Invalid email address').max(255),
    password: z.string().min(1, 'Password is required').max(255),
});

const SwitchMerchantSchema = z.object({
    merchantId: z.string().regex(UUID_REGEX, 'Invalid merchant ID format'),
});

// In-memory sliding rate limiter for login brute-force prevention
interface RateLimitBucket {
    attempts: number;
    resetAt: number;
}
const loginRateLimitMap = new Map<string, RateLimitBucket>();
const MAX_LOGIN_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkLoginRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = loginRateLimitMap.get(ip);
    if (!entry || entry.resetAt < now) {
        loginRateLimitMap.set(ip, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (entry.attempts >= MAX_LOGIN_ATTEMPTS) {
        return false;
    }
    entry.attempts += 1;
    return true;
}

// Dummy hash for constant-time mitigation when email does not exist
const DUMMY_HASH =
    'scrypt$N=16384,r=8,p=1$00000000000000000000000000000000$00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

export function createAuthRouter(deps: AuthRouterDeps = {}): Router {
    const router = Router();
    const dbProvider = deps.getDb ?? getDB;
    const sessionService = deps.sessionService ?? createSessionService({ getDb: deps.getDb });
    const authGuard = authenticate({ sessionService, getDb: deps.getDb });

    // 1. POST /login
    router.post('/login', async (req: Request, res: Response): Promise<void> => {
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        if (!checkLoginRateLimit(clientIp)) {
            res.status(429).json({
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many login attempts. Please try again in a few minutes.',
            });
            return;
        }

        try {
            const body = LoginSchema.parse(req.body);
            const normalizedEmail = body.email.trim().toLowerCase();

            const db = dbProvider();
            const user = await db.user.findUnique({
                where: { email: normalizedEmail },
            });

            if (!user) {
                // Constant-time execution to prevent timing-based user enumeration
                await verifyPassword(body.password, DUMMY_HASH);
                res.status(401).json({
                    error: 'INVALID_CREDENTIALS',
                    message: 'Invalid email or password',
                });
                return;
            }

            const passwordValid = await verifyPassword(body.password, user.passwordHash);
            if (!passwordValid) {
                res.status(401).json({
                    error: 'INVALID_CREDENTIALS',
                    message: 'Invalid email or password',
                });
                return;
            }

            if (user.status !== 'ACTIVE') {
                res.status(403).json({
                    error: 'USER_DISABLED',
                    message: 'Access denied: account has been suspended',
                });
                return;
            }

            // Create server-managed session with SHA-256 token hash
            const { rawToken, session } = await sessionService.createSession(user.id);

            // Set HttpOnly, SameSite=Lax cookie
            res.cookie(COOKIE_NAME, rawToken, {
                httpOnly: true,
                secure: config.nodeEnv === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: DEFAULT_SESSION_TTL_MS,
            });

            // Fetch user's permitted merchant memberships
            const memberships = await db.merchantMembership.findMany({
                where: { userId: user.id },
                include: { merchant: true },
                orderBy: { createdAt: 'asc' },
            });

            const merchants = memberships
                .filter((m) => m.merchant.status === 'ACTIVE')
                .map((m) => ({
                    id: m.merchant.id,
                    name: m.merchant.name,
                    slug: m.merchant.slug,
                    role: m.role,
                }));

            const activeMerchant = merchants[0] || null;

            // Safe privacy-conscious response: never return password hashes or raw session hashes
            res.status(200).json({
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                },
                token: rawToken,
                merchants,
                activeMerchant,
            });
        } catch (err) {
            if (err instanceof z.ZodError) {
                res.status(400).json({
                    error: 'VALIDATION_FAILED',
                    message: 'Invalid login payload',
                    details: err.flatten(),
                });
                return;
            }

            console.error('[AuthRouter] Unexpected error in login:', err);
            res.status(500).json({
                error: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected internal error occurred',
            });
        }
    });

    // 2. GET /me
    router.get('/me', authGuard, async (req: Request, res: Response): Promise<void> => {
        try {
            const db = dbProvider();
            const user = req.authenticatedUser!;

            const memberships = await db.merchantMembership.findMany({
                where: { userId: user.id },
                include: { merchant: true },
                orderBy: { createdAt: 'asc' },
            });

            const merchants = memberships
                .filter((m) => m.merchant.status === 'ACTIVE')
                .map((m) => ({
                    id: m.merchant.id,
                    name: m.merchant.name,
                    slug: m.merchant.slug,
                    role: m.role,
                }));

            const requestedMerchantId = req.headers['x-merchant-id'] as string | undefined;
            const activeMerchant =
                (requestedMerchantId && merchants.find((m) => m.id === requestedMerchantId)) ||
                merchants[0] ||
                null;

            res.status(200).json({
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    status: user.status,
                },
                merchants,
                activeMerchant,
            });
        } catch (err) {
            console.error('[AuthRouter] Unexpected error in /me:', err);
            res.status(500).json({
                error: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to retrieve current user session',
            });
        }
    });

    // 3. POST /switch-merchant
    router.post('/switch-merchant', authGuard, async (req: Request, res: Response): Promise<void> => {
        try {
            const body = SwitchMerchantSchema.parse(req.body);
            const db = dbProvider();
            const user = req.authenticatedUser!;

            const membership = await db.merchantMembership.findUnique({
                where: {
                    userId_merchantId: {
                        userId: user.id,
                        merchantId: body.merchantId,
                    },
                },
                include: { merchant: true },
            });

            if (!membership || membership.merchant.status === 'SUSPENDED') {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Merchant not found or access denied',
                });
                return;
            }

            res.status(200).json({
                activeMerchant: {
                    id: membership.merchant.id,
                    name: membership.merchant.name,
                    slug: membership.merchant.slug,
                    role: membership.role,
                },
            });
        } catch (err) {
            if (err instanceof z.ZodError) {
                res.status(400).json({
                    error: 'VALIDATION_FAILED',
                    message: 'Invalid payload for merchant switch',
                    details: err.flatten(),
                });
                return;
            }
            res.status(500).json({
                error: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to switch merchant context',
            });
        }
    });

    // 4. POST /logout
    router.post('/logout', async (req: Request, res: Response): Promise<void> => {
        try {
            const token = extractSessionToken(req);
            if (token) {
                await sessionService.revokeSession(token);
            }

            res.clearCookie(COOKIE_NAME, {
                httpOnly: true,
                secure: config.nodeEnv === 'production',
                sameSite: 'lax',
                path: '/',
            });

            res.status(200).json({
                success: true,
                message: 'Logged out successfully',
            });
        } catch (err) {
            console.error('[AuthRouter] Unexpected error in logout:', err);
            res.status(500).json({
                error: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to log out cleanly',
            });
        }
    });

    return router;
}
