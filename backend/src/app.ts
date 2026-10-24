import express, { type Application } from 'express';
import healthRouter from './routes/health';
import { createPayPalWebhookRouter, type WebhookRouterDeps } from './routes/paypal-webhooks';
import { createExceptionRouter, type ExceptionRouterDeps } from './routes/exceptions';

export interface AppDeps extends WebhookRouterDeps {
    exceptionRouterDeps?: ExceptionRouterDeps;
}

export function buildApp(deps?: AppDeps): Application {
    const app = express();

    // 1. Webhook router mounted BEFORE global express.json() to capture raw request bytes
    app.use('/webhooks/paypal', createPayPalWebhookRouter(deps));

    // 2. Global JSON parser for ordinary application endpoints
    app.use(express.json());

    // 3. Application routes
    app.use(healthRouter);
    app.use('/api/merchants/:merchantId/exceptions', createExceptionRouter(deps?.exceptionRouterDeps));

    return app;
}