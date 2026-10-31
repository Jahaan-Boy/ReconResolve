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

export interface AppDeps extends WebhookRouterDeps {
    exceptionRouterDeps?: ExceptionRouterDeps;
    authRouterDeps?: AuthRouterDeps;
    providerConnectionRouterDeps?: ProviderConnectionRouterDeps;
    providerTransactionRouterDeps?: ProviderTransactionRouterDeps;
    merchantOrderRouterDeps?: MerchantOrderRouterDeps;
    runRouterDeps?: ReconciliationRunRouterDeps;
    dashboardRouterDeps?: DashboardRouterDeps;
    operationsRouterDeps?: OperationsRouterDeps;
}

export function buildApp(deps?: AppDeps): Application {
    const app = express();

    // 1. Webhook router mounted BEFORE global express.json() to capture raw request bytes
    app.use('/webhooks/paypal', createPayPalWebhookRouter(deps));

    // 2. Global JSON parser for ordinary application endpoints with explicit 1MB bounded limit
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

    // 3. Application routes
    app.use(healthRouter);
    app.use('/api/auth', createAuthRouter(deps?.authRouterDeps));
    app.use('/api/merchants/:merchantId/exceptions', createExceptionRouter(deps?.exceptionRouterDeps));
    app.use('/api/merchants/:merchantId/connections', createProviderConnectionRouter(deps?.providerConnectionRouterDeps));
    app.use('/api/merchants/:merchantId/transactions', createProviderTransactionRouter(deps?.providerTransactionRouterDeps));
    app.use('/api/merchants/:merchantId/orders', createMerchantOrderRouter(deps?.merchantOrderRouterDeps));
    app.use('/api/merchants/:merchantId/runs', createReconciliationRunRouter(deps?.runRouterDeps));
    app.use('/api/merchants/:merchantId/dashboard', createDashboardRouter(deps?.dashboardRouterDeps));
    app.use('/api/merchants/:merchantId/operations', createOperationsRouter(deps?.operationsRouterDeps));

    return app;
}
