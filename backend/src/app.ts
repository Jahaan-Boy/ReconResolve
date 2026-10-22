import express, { type Application } from 'express';
import healthRouter from './routes/health';
import { createPayPalWebhookRouter, type WebhookRouterDeps } from './routes/paypal-webhooks';

export function buildApp(deps?: WebhookRouterDeps): Application {
    const app = express();

    // 1. Webhook router mounted BEFORE global express.json() to capture raw request bytes
    app.use('/webhooks/paypal', createPayPalWebhookRouter(deps));

    // 2. Global JSON parser for ordinary application endpoints
    app.use(express.json());

    // 3. Application routes
    app.use(healthRouter);

    return app;
}