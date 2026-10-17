import { Pool, type QueryResult } from 'pg';
import { config } from '../config';
let pool: Pool | null = null;
/**
 * Returns the active connection pool. Throws if connectDB() has not been
 * called yet, so callers in request handlers always get a valid pool.
 */
export function getPool(): Pool {
    if (!pool) {
        throw new Error('Database pool is not initialised. Call connectDB() first.');
    }
    return pool;
}
/**
 * Convenience wrapper around pool.query so routes do not need to import Pool.
 */
export async function query<T extends object = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
): Promise<QueryResult<T>> {
    return getPool().query<T>(sql, values);
}
/**
 * Creates the PostgreSQL connection pool and verifies connectivity with a
 * lightweight probe query. Throws on failure so the server refuses to start.
 */
export async function connectDB(): Promise<void> {
    pool = new Pool({
        connectionString: config.databaseUrl,
        // Keep the pool small for this baseline; tune in later days.
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
    });
    // Probe: acquire one connection and run SELECT 1.
    let client;
    try {
        client = await pool.connect();
        await client.query('SELECT 1');
    } catch (err) {
        // Never include the connection string or password in the log.
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`[db] PostgreSQL connection failed: ${reason}`);
    } finally {
        client?.release();
    }
}
/**
 * Drains and destroys the connection pool. Should be called during graceful
 * shutdown after the HTTP server has stopped accepting new requests.
 */
export async function closeDB(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}