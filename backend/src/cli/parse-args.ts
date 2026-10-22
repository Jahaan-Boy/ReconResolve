import { parseArgs } from 'node:util';
import { validateDateRange } from '../providers/paypal/client';
import { PayPalError } from '../providers/paypal/errors';
import { ImportError } from '../services/paypal-import/errors';

export interface SyncArgs {
    merchantSlug: string;
    startDate: string;
    endDate: string;
}

const USAGE =
    'Usage: --merchant-slug <slug> --from <ISO-8601 with timezone> --to <ISO-8601 with timezone>';

/** PayPal Transaction Search history window (verify against the API reference). */
const HISTORY_YEARS = 3;

function invalid(message: string): ImportError {
    return new ImportError('PAYPAL_SYNC_INVALID_ARGS', `${message} ${USAGE}`);
}

function assertRealCalendarDate(flag: string, value: string): void {
    const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
    if (!match) throw invalid(`${flag} must be an ISO-8601 timestamp.`);

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
        probe.getUTCFullYear() !== year ||
        probe.getUTCMonth() !== month - 1 ||
        probe.getUTCDate() !== day
    ) {
        throw invalid(`${flag} is not a real calendar date.`);
    }
}

export function parseSyncArgs(argv: readonly string[], now: Date = new Date()): SyncArgs {
    let values: Record<string, string | undefined>;
    try {
        ({ values } = parseArgs({
            args: [...argv],
            options: {
                'merchant-slug': { type: 'string' },
                from: { type: 'string' },
                to: { type: 'string' },
            },
            strict: true,
            allowPositionals: false,
        }));
    } catch {
        throw invalid('Unknown or malformed arguments.');
    }

    const merchantSlug = values['merchant-slug']?.trim();
    if (!merchantSlug || merchantSlug.length > 128) {
        throw invalid('--merchant-slug is required (max 128 characters).');
    }

    const startDate = values.from;
    const endDate = values.to;
    if (!startDate || !endDate) throw invalid('--from and --to are required.');

    // Part 1 rules: explicit timezone, from < to, at most 31 days. Never clamps.
    try {
        validateDateRange({ startDate, endDate });
    } catch (error) {
        // Part 1 messages only echo the user's own input, so they are safe to show.
        if (error instanceof PayPalError) throw invalid(error.message);
        throw error;
    }

    assertRealCalendarDate('--from', startDate);
    assertRealCalendarDate('--to', endDate);

    const earliest = new Date(now.getTime());
    earliest.setUTCFullYear(earliest.getUTCFullYear() - HISTORY_YEARS);
    if (new Date(startDate) < earliest) {
        throw invalid(
            `--from is older than the Transaction Search history window (about ${HISTORY_YEARS} years).`,
        );
    }

    return { merchantSlug, startDate, endDate };
}