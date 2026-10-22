import { Router, type Request, type Response, type NextFunction } from 'express';
import express from 'express';
import { getDB } from '../db/postgres';
import { PayPalTokenManager } from '../providers/paypal/token-manager';
import {
    PayPalWebhookVerifier,
    WebhookVerifierUnavailableError,
    type WebhookVerifier,
} from '../providers/paypal/webhook-verifier';
import { PayPalWebhookEnvelopeSchema } from '../services/paypal-webhook/envelope-schema';
import {
    ingestWebhookEvent,
    resolveWebhookConnection,
    type WebhookIngressDb,
} from '../services/paypal-webhook/webhook-ingress.service';

export interface WebhookRouterDeps {
    getDb?: () => WebhookIngressDb;
    verifier?: WebhookVerifier;
    resolveConnection?: typeof resolveWebhookConnection;
    ingestEvent?: typeof ingestWebhookEvent;
}

const REQUIRED_HEADERS = [
    'paypal-auth-algo',
    'paypal-cert-url',
    'paypal-transmission-id',
    'paypal-transmission-sig',
    'paypal-transmission-time',
] as const;

function getDefaultVerifier(): WebhookVerifier {
    const clientId = process.env.PAYPAL_CLIENT_ID || '';
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
    const tokenManager = new PayPalTokenManager({
        clientId,
        clientSecret,
        httpRequest: async (url, options) => {
            const resp = await fetch(url, {
                method: options.method,
                headers: options.headers,
                body: options.body,
                signal: options.signal,
            });
            const headers: Record<string, string> = {};
            resp.headers.forEach((v, k) => {
                headers[k.toLowerCase()] = v;
            });
            return {
                status: resp.status,
                headers,
                json: () => resp.json() as Promise<unknown>,
            };
        },
    });

    return new PayPalWebhookVerifier({ tokenManager });
}

export function createPayPalWebhookRouter(deps: WebhookRouterDeps = {}): Router {
    const router = Router();
    const getDbFn = deps.getDb ?? (() => getDB());
    const verifier = deps.verifier ?? getDefaultVerifier();
    const resolveConn = deps.resolveConnection ?? resolveWebhookConnection;
    const ingest = deps.ingestEvent ?? ingestWebhookEvent;

    // Route-specific raw-body parser limited to 1MB. Must run before global JSON parsing.
    router.post(
        '/:providerConnectionId',
        express.raw({ type: 'application/json', limit: '1mb' }),
        async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            const startedAt = Date.now();
            const { providerConnectionId } = req.params;

            try {
                // 1. Verify content-type and presence of raw body buffer
                if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
                    res.status(400).json({
                        error: 'INVALID_REQUEST_BODY',
                        message: 'Request body must be non-empty application/json',
                    });
                    return;
                }

                // 2. Parse JSON from preserved raw buffer
                let parsedBody: Record<string, unknown>;
                try {
                    const rawString = req.body.toString('utf8');
                    const parsed = JSON.parse(rawString);
                    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                        res.status(400).json({
                            error: 'INVALID_JSON',
                            message: 'Request body must be a JSON object',
                        });
                        return;
                    }
                    parsedBody = parsed as Record<string, unknown>;
                } catch {
                    res.status(400).json({
                        error: 'INVALID_JSON',
                        message: 'Request body must be valid JSON',
                    });
                    return;
                }

                // 3. Validate required transmission headers
                const missingHeader = REQUIRED_HEADERS.find((h) => {
                    const val = req.headers[h];
                    return typeof val !== 'string' || val.trim() === '';
                });

                if (missingHeader) {
                    res.status(400).json({
                        error: 'MISSING_REQUIRED_HEADERS',
                        message: `Missing or invalid required header: ${missingHeader}`,
                    });
                    return;
                }

                const authAlgo = req.headers['paypal-auth-algo'] as string;
                const certUrl = req.headers['paypal-cert-url'] as string;
                const transmissionId = req.headers['paypal-transmission-id'] as string;
                const transmissionSig = req.headers['paypal-transmission-sig'] as string;
                const transmissionTime = req.headers['paypal-transmission-time'] as string;

                // 4. Resolve provider connection from trusted database state
                let db: WebhookIngressDb;
                try {
                    db = getDbFn();
                } catch {
                    res.status(503).json({
                        error: 'DATABASE_UNAVAILABLE',
                        message: 'Database service is currently unavailable; retry later',
                    });
                    return;
                }

                const connection = await resolveConn(db as any, providerConnectionId!);
                if (!connection) {
                    res.status(404).json({
                        error: 'CONNECTION_NOT_FOUND',
                        message: 'No active PayPal webhook connection configured for this endpoint',
                    });
                    return;
                }

                // 5. Verify signature using PayPal's verify-webhook-signature API
                try {
                    const result = await verifier.verify({
                        authAlgo,
                        certUrl,
                        transmissionId,
                        transmissionSig,
                        transmissionTime,
                        webhookId: connection.webhookId,
                        webhookEvent: parsedBody,
                    });

                    if (!result.verified) {
                        res.status(400).json({
                            error: 'INVALID_SIGNATURE',
                            message: 'PayPal webhook signature verification failed',
                        });
                        return;
                    }
                } catch (error) {
                    if (error instanceof WebhookVerifierUnavailableError) {
                        res.status(503).json({
                            error: 'VERIFIER_UNAVAILABLE',
                            message: 'Signature verifier temporarily unavailable; retry later',
                        });
                        return;
                    }
                    res.status(503).json({
                        error: 'VERIFIER_UNAVAILABLE',
                        message: 'Signature verifier service failed; retry later',
                    });
                    return;
                }

                // 6. Validate event envelope schema
                const envelopeResult = PayPalWebhookEnvelopeSchema.safeParse(parsedBody);
                if (!envelopeResult.success) {
                    res.status(400).json({
                        error: 'INVALID_EVENT_ENVELOPE',
                        message: 'Webhook event envelope is missing required fields (id, event_type)',
                    });
                    return;
                }
                const envelope = envelopeResult.data;

                // 7. Atomically persist WebhookEvent and OutboxEvent
                let transmissionDate: Date | null = null;
                const parsedDate = new Date(transmissionTime);
                if (!isNaN(parsedDate.getTime())) {
                    transmissionDate = parsedDate;
                }

                try {
                    const persistResult = await ingest(db, {
                        connection,
                        providerEventId: envelope.id,
                        eventType: envelope.event_type,
                        resourceType: envelope.resource_type ?? null,
                        transmissionId,
                        transmissionTime: transmissionDate,
                        payload: parsedBody,
                    });

                    if (persistResult.outcome === 'duplicate') {
                        res.status(200).json({
                            status: 'duplicate',
                            message: 'Webhook event already recorded',
                            eventId: envelope.id,
                        });
                        return;
                    }

                    res.status(200).json({
                        status: 'accepted',
                        message: 'Webhook event durably recorded',
                        eventId: envelope.id,
                    });
                    return;
                } catch (error) {
                    res.status(503).json({
                        error: 'PERSISTENCE_FAILED',
                        message: 'Failed to record webhook event durably; retry later',
                    });
                    return;
                }
            } catch (err) {
                next(err);
            }
        },
    );

    // Route-specific error handler for raw-body size limit (413)
    router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
        if (err && (err.status === 413 || err.type === 'entity.too.large')) {
            res.status(413).json({
                error: 'PAYLOAD_TOO_LARGE',
                message: 'Webhook payload exceeds maximum size limit (1MB)',
            });
            return;
        }
        next(err);
    });

    return router;
}

export default createPayPalWebhookRouter;