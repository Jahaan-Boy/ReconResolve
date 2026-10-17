// Must be the very first import so dotenv populates process.env before config
// reads any variables.
import './config'; // side-effect: validates env on load via loadConfig()
import http from 'http';
import { config } from './config';
import { buildApp } from './app';
import { connectDB, closeDB } from './db/postgres';

async function main(): Promise<void> {
    // ── 1. Connect to PostgreSQL ──────────────────────────────────────────────
    await connectDB();

    // ── 2. Build the Express application ─────────────────────────────────────
    const app = buildApp();
    const server = http.createServer(app);

    // ── 3. Graceful shutdown handlers ────────────────────────────────────────
    const shutdown = async (signal: string): Promise<void> => {
        console.log(`[shutdown] ${signal} received — closing server…`);
        server.close(async () => {
            try {
                await closeDB();
                console.log('[shutdown] Server and database pool closed cleanly. Exiting.');
                process.exit(0);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`[shutdown] Error closing database: ${message}`);
                process.exit(1);
            }
        });
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));

    // ── 4. Start listening ───────────────────────────────────────────────────
    server.listen(config.port, config.host, () => {
        console.log(`[startup] ReconResolve API is ready — http://${config.host}:${config.port}`);
    });
}

main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[startup] Fatal error: ${message}`);
    process.exit(1);
});