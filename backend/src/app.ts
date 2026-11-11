import express, { type Application } from 'express';
import healthRouter from './routes/health';
import { createPayPalWebhookRouter, type WebhookRouterDeps } from './routes/paypal-webhooks';
import { createExceptionRouter, type ExceptionRouterDeps } from './routes/exceptions';
import { createAuthRouter, type AuthRouterDeps } from './routes/auth';
import {
    createProviderConnectionRouter,
    type ProviderConnectionRouterDeps,
} from './routes/provider-connections';
import {
    createProviderTransactionRouter,
    type ProviderTransactionRouterDeps,
} from './routes/provider-transactions';
import {
    createMerchantOrderRouter,
    type MerchantOrderRouterDeps,
} from './routes/merchant-orders';
import {
    createReconciliationRunRouter,
    type ReconciliationRunRouterDeps,
} from './routes/runs';
import {
    createDashboardRouter,
    type DashboardRouterDeps,
} from './routes/dashboard';
import {
    createOperationsRouter,
    type OperationsRouterDeps,
} from './routes/operations';
import {
    createIntelligenceRouter,
    type IntelligenceRouterDeps,
} from './routes/intelligence';
import {
    createCopilotRouter,
    type CopilotRouterDeps,
} from './routes/copilot';
import { sanitizeErrorMessage } from './services/outbox/error-sanitizer';

export interface AppDeps extends WebhookRouterDeps {
    exceptionRouterDeps?: ExceptionRouterDeps;
    authRouterDeps?: AuthRouterDeps;
    providerConnectionRouterDeps?: ProviderConnectionRouterDeps;
    providerTransactionRouterDeps?: ProviderTransactionRouterDeps;
    merchantOrderRouterDeps?: MerchantOrderRouterDeps;
    runRouterDeps?: ReconciliationRunRouterDeps;
    dashboardRouterDeps?: DashboardRouterDeps;
    operationsRouterDeps?: OperationsRouterDeps;
    intelligenceRouterDeps?: IntelligenceRouterDeps;
    copilotRouterDeps?: CopilotRouterDeps;
}

export function buildApp(deps?: AppDeps): Application {
    const app = express();

    // 1. Standard security response headers and CORS handling
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '0');

        const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN || '*';
        const origin = req.headers.origin;
        if (origin && (allowedOrigin === '*' || allowedOrigin === origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID, Idempotency-Key');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }

        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }

        next();
    });

    // 2. Webhook router mounted BEFORE global express.json() to capture raw request bytes
    const paypalWebhookRouter = createPayPalWebhookRouter(deps);
    app.use('/webhooks/paypal', paypalWebhookRouter);
    app.use('/api/webhooks/paypal', paypalWebhookRouter);

    // 3. Global JSON parser for ordinary application endpoints with explicit 1MB bounded limit
    app.use(express.json({ limit: '1mb' }));
    app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (err && (err.type === 'entity.too.large' || err.status === 413)) {
            res.status(413).json({
                error: 'PAYLOAD_TOO_LARGE',
                message: 'Request payload exceeds the 1MB size limit',
            });
            return;
        }
        if (err instanceof SyntaxError && 'body' in err) {
            res.status(400).json({
                error: 'INVALID_JSON',
                message: 'Malformed JSON payload in request body',
            });
            return;
        }
        next(err);
    });

    // 4. Application routes
    app.use(healthRouter);
    app.use('/api/auth', createAuthRouter(deps?.authRouterDeps));
    app.use('/api/merchants/:merchantId/exceptions', createExceptionRouter(deps?.exceptionRouterDeps));
    app.use('/api/merchants/:merchantId/connections', createProviderConnectionRouter(deps?.providerConnectionRouterDeps));
    app.use('/api/merchants/:merchantId/transactions', createProviderTransactionRouter(deps?.providerTransactionRouterDeps));
    app.use('/api/merchants/:merchantId/orders', createMerchantOrderRouter(deps?.merchantOrderRouterDeps));
    app.use('/api/merchants/:merchantId/runs', createReconciliationRunRouter(deps?.runRouterDeps));
    app.use('/api/merchants/:merchantId/dashboard', createDashboardRouter(deps?.dashboardRouterDeps));
    app.use('/api/merchants/:merchantId/operations', createOperationsRouter(deps?.operationsRouterDeps));
    app.use('/api/merchants/:merchantId/intelligence', createIntelligenceRouter(deps?.intelligenceRouterDeps));
    app.use('/api/merchants/:merchantId/copilot', createCopilotRouter(deps?.copilotRouterDeps));

    // 5. Unmatched route JSON 404 handler (prevents default HTML leakage)
    app.use((_req, res) => {
        res.status(404).json({
            error: 'NOT_FOUND',
            message: 'Endpoint not found',
        });
    });

    // 6. Centralized fail-safe error handler (prevents stack traces & secrets leakage)
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        console.error('[UnhandledAppError]:', sanitizeErrorMessage(err));
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal error occurred',
        });
    });

    return app;
}
