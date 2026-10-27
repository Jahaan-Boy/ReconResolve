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

export interface AppDeps extends WebhookRouterDeps {
    exceptionRouterDeps?: ExceptionRouterDeps;
    authRouterDeps?: AuthRouterDeps;
    providerConnectionRouterDeps?: ProviderConnectionRouterDeps;
    providerTransactionRouterDeps?: ProviderTransactionRouterDeps;
}

export function buildApp(deps?: AppDeps): Application {
    const app = express();

    // 1. Webhook router mounted BEFORE global express.json() to capture raw request bytes
    app.use('/webhooks/paypal', createPayPalWebhookRouter(deps));

    // 2. Global JSON parser for ordinary application endpoints
    app.use(express.json());

    // 3. Application routes
    app.use(healthRouter);
    app.use('/api/auth', createAuthRouter(deps?.authRouterDeps));
    app.use('/api/merchants/:merchantId/exceptions', createExceptionRouter(deps?.exceptionRouterDeps));
    app.use('/api/merchants/:merchantId/connections', createProviderConnectionRouter(deps?.providerConnectionRouterDeps));
    app.use('/api/merchants/:merchantId/transactions', createProviderTransactionRouter(deps?.providerTransactionRouterDeps));

    return app;
}
