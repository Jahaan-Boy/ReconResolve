import express, { type Application } from 'express';
import healthRouter from './routes/health';

export function buildApp(): Application {
    const app = express();

    app.use(express.json());

    // Register routes
    app.use(healthRouter);

    return app;
}