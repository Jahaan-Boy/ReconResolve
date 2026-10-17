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
function parseNodeEnv(raw: string): NodeEnv {
    if (!(SUPPORTED_ENVS as readonly string[]).includes(raw)) {
        throw new Error(
            `NODE_ENV must be one of [${SUPPORTED_ENVS.join(', ')}] (received: "${raw}")`,
        );
    }
    return raw as NodeEnv;
}
function loadConfig() {
    try {
        const nodeEnvRaw = requireNonEmpty('NODE_ENV');
        const hostRaw = requireNonEmpty('HOST');
        const portRaw = requireNonEmpty('PORT');
        requireNonEmpty('DATABASE_URL');
        return {
            nodeEnv: parseNodeEnv(nodeEnvRaw),
            host: hostRaw,
            port: parsePort(portRaw),
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
