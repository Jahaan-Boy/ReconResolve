export interface OutboxLogEntry {
    readonly level: 'info' | 'warn' | 'error';
    readonly workerId: string;
    readonly event: string;
    readonly outboxId?: string;
    readonly aggregateId?: string;
    readonly eventType?: string;
    readonly attempt?: number;
    readonly durationMs?: number;
    readonly outcome?: 'processed' | 'ignored' | 'retry_scheduled' | 'terminal_failure';
    readonly error?: string;
    readonly nextAttemptAt?: string;
    readonly batchSize?: number;
}

export interface OutboxLogger {
    info(entry: Omit<OutboxLogEntry, 'level'>): void;
    warn(entry: Omit<OutboxLogEntry, 'level'>): void;
    error(entry: Omit<OutboxLogEntry, 'level'>): void;
}

export class JsonOutboxLogger implements OutboxLogger {
    info(entry: Omit<OutboxLogEntry, 'level'>): void {
        console.log(JSON.stringify({ level: 'info', timestamp: new Date().toISOString(), ...entry }));
    }

    warn(entry: Omit<OutboxLogEntry, 'level'>): void {
        console.warn(JSON.stringify({ level: 'warn', timestamp: new Date().toISOString(), ...entry }));
    }

    error(entry: Omit<OutboxLogEntry, 'level'>): void {
        console.error(JSON.stringify({ level: 'error', timestamp: new Date().toISOString(), ...entry }));
    }
}
