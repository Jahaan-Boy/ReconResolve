import 'dotenv/config';
const SUPPORTED_ENVS = ['development', 'test', 'production'] as const;
type NodeEnv = (typeof SUPPORTED_ENVS)[number];
function requireNonEmpty(key: string): string {
    const value = process.env[key];
    if (!value || value.trim() === '') {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value.trim();
}
function parsePort(raw: string): number {
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(
            `PORT must be a valid integer between 1 and 65535 (received: "${raw}")`,
        );
    }
    return port;
}
function parseNodeEnv(raw?: string): NodeEnv {
    if (!raw || raw.trim() === '') {
        return 'production';
    }
    const val = raw.trim();
    if (!(SUPPORTED_ENVS as readonly string[]).includes(val)) {
        throw new Error(
            `NODE_ENV must be one of [${SUPPORTED_ENVS.join(', ')}] (received: "${val}")`,
        );
    }
    return val as NodeEnv;
}
function parseSessionTtlHours(raw?: string): number {
    if (!raw || raw.trim() === '') {
        return 168; // default 7 days (168 hours)
    }
    const hours = Number(raw.trim());
    if (!Number.isInteger(hours) || hours < 1 || hours > 8760) {
        throw new Error(
            `SESSION_TTL_HOURS must be a valid integer between 1 and 8760 (received: "${raw}")`,
        );
    }
    return hours;
}
function loadConfig() {
    try {
        const nodeEnv = parseNodeEnv(process.env['NODE_ENV']);
        const host = process.env['HOST']?.trim() || '0.0.0.0';
        const port = parsePort(process.env['PORT']?.trim() || '3000');
        requireNonEmpty('DATABASE_URL');
        const sessionTtlHours = parseSessionTtlHours(process.env['SESSION_TTL_HOURS']);
        return {
            nodeEnv,
            host,
            port,
            sessionTtlHours,
            sessionTtlMs: sessionTtlHours * 60 * 60 * 1000,
            get databaseUrl(): string {
                return process.env['DATABASE_URL'] as string;
            },
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`[config] ${message}`);
    }
}
export const config = loadConfig();
