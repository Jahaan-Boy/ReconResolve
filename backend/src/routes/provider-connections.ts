import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDB } from '../db/postgres';
import {
    authenticate,
    resolveMerchantContext,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import { ProviderConnectionError } from '../services/provider-connection/errors';
import {
    createProviderConnectionService,
    type ProviderConnectionService,
} from '../services/provider-connection/provider-connection.service';
import { sanitizeErrorMessage } from '../services/outbox/error-sanitizer';
import { importPayPalTransactions } from '../services/paypal-import/import-paypal-transactions';
import { resolvePayPalConnection } from '../services/paypal-import/connection-resolver';
import { createPayPalSource } from '../services/paypal-import/paypal-source';
import { PayPalAdapter } from '../providers/paypal/adapter';
import { createProviderTransactionStore } from '../repositories/provider-transaction.repository';
import { ingestWebhookEvent } from '../services/paypal-webhook/webhook-ingress.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProviderConnectionRouterDeps {
    service?: ProviderConnectionService;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
}

const ListQuerySchema = z.object({
    provider: z.enum(['PAYPAL']).optional(),
    status: z.enum(['ACTIVE', 'DISABLED', 'NEEDS_REAUTH']).optional(),
    cursor: z.string().regex(UUID_REGEX, 'Invalid UUID cursor').optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function createProviderConnectionRouter(deps: ProviderConnectionRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });
    const service = deps.service ?? createProviderConnectionService();

    // Server-enforced authentication and tenant context isolation
    const authGuard = deps.authGuard ?? authenticate(deps.authDeps);
    const merchantGuard = deps.merchantGuard ?? resolveMerchantContext(deps.authDeps);

    router.use(authGuard);
    router.use(merchantGuard);

    function handleRouteError(res: Response, err: unknown): void {
        if (err instanceof z.ZodError) {
            res.status(400).json({
                error: 'VALIDATION_FAILED',
                message: 'Invalid request input',
                details: err.flatten(),
            });
            return;
        }

        if (err instanceof ProviderConnectionError) {
            res.status(err.statusCode).json({
                error: err.code,
                message: err.message,
                details: err.details,
            });
            return;
        }

        console.error('[ProviderConnectionRouter] Unexpected error:', sanitizeErrorMessage(err));
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal error occurred',
        });
    }

    function validateUuidParam(paramName: string, value: string): void {
        if (!UUID_REGEX.test(value)) {
            throw ProviderConnectionError.validationFailed(`Invalid ${paramName} parameter: must be a valid UUID`);
        }
    }

    // 1. List connections
    router.get('/', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId } = req.params;
            validateUuidParam('merchantId', merchantId);

            const filter = ListQuerySchema.parse(req.query);
            const result = await service.listConnections(merchantId, filter);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 2. Connection detail
    router.get('/:connectionId', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, connectionId } = req.params;
            validateUuidParam('merchantId', merchantId);
            validateUuidParam('connectionId', connectionId);

            const detail = await service.getConnection(merchantId, connectionId);
            res.status(200).json(detail);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 3. Trigger manual sync from PayPal Transaction Search API
    const handleSync = async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId } = req.params;
            validateUuidParam('merchantId', merchantId);

            const prisma = getDB();
            const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
            if (!merchant) {
                res.status(404).json({ error: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
                return;
            }

            const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim();
            const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
            if (!clientId || !clientSecret) {
                res.status(400).json({
                    error: 'PAYPAL_CONFIG_MISSING',
                    message: 'PayPal credentials missing in server environment (.env)',
                });
                return;
            }

            const now = new Date();
            const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const startDate = req.body?.from || defaultFrom.toISOString();
            const endDate = req.body?.to || now.toISOString();

            const summary = await importPayPalTransactions(
                {
                    resolveConnection: (slug) => resolvePayPalConnection(prisma, slug),
                    source: createPayPalSource(new PayPalAdapter({ clientId, clientSecret })),
                    store: createProviderTransactionStore(prisma),
                },
                {
                    merchantSlug: merchant.slug,
                    startDate,
                    endDate,
                },
            );

            res.status(200).json({
                status: 'success',
                summary,
            });
        } catch (err) {
            handleRouteError(res, err);
        }
    };

    router.post('/sync', handleSync);
    router.post('/:connectionId/sync', handleSync);

    // Simulate incoming PayPal Webhook Event for testing/demo
    router.post('/simulate-webhook', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId } = req.params;
            const prisma = getDB();

            const connection = await prisma.providerConnection.findFirst({
                where: { merchantId, provider: 'PAYPAL', status: 'ACTIVE' },
                select: { id: true, merchantId: true, provider: true, status: true, webhookId: true },
            });

            if (!connection) {
                res.status(404).json({
                    error: 'CONNECTION_NOT_FOUND',
                    message: 'No active PayPal connection found for this merchant. Connect PayPal first.',
                });
                return;
            }

            const now = new Date();
            const eventId = `WH-SIM-${Date.now()}-${randomUUID().slice(0, 6)}`;
            const captureId = `CAP-${Date.now()}`;
            const amountValue = req.body?.amount ? String(req.body.amount) : '57.00';

            const payload = {
                id: eventId,
                create_time: now.toISOString(),
                resource_type: 'capture',
                event_type: 'PAYMENT.CAPTURE.COMPLETED',
                summary: `Payment completed for $ ${amountValue} USD`,
                resource: {
                    id: captureId,
                    status: 'COMPLETED',
                    amount: {
                        currency_code: 'USD',
                        value: amountValue,
                    },
                    seller_receivable_breakdown: {
                        gross_amount: { currency_code: 'USD', value: amountValue },
                        paypal_fee: { currency_code: 'USD', value: '2.48' },
                        net_amount: { currency_code: 'USD', value: (parseFloat(amountValue) - 2.48).toFixed(2) },
                    },
                    custom_id: randomUUID(),
                    supplementary_data: {
                        related_ids: {
                            order_id: `ORD-${Date.now()}`,
                        },
                    },
                },
                event_version: '1.0',
                resource_version: '2.0',
            };

            const result = await ingestWebhookEvent(prisma as any, {
                connection: {
                    id: connection.id,
                    merchantId: connection.merchantId,
                    webhookId: connection.webhookId || 'WH-DEFAULT',
                    status: connection.status,
                    provider: connection.provider,
                },
                providerEventId: eventId,
                eventType: 'PAYMENT.CAPTURE.COMPLETED',
                resourceType: 'capture',
                transmissionId: randomUUID(),
                transmissionTime: now,
                payload,
            });

            res.status(200).json({
                status: 'success',
                outcome: result.outcome,
                webhookEventId: result.webhookEventId,
                eventId,
            });
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    return router;
}
