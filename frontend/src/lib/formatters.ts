/**
 * Financial and operational formatting utilities for ReconResolve.
 * Ensures exact currency conversion from BigInt minor units to human-readable strings.
 */

const CURRENCY_DECIMALS: Record<string, number> = {
    USD: 2,
    EUR: 2,
    GBP: 2,
    CAD: 2,
    AUD: 2,
    JPY: 0,
    KRW: 0,
    BHD: 3,
    KWD: 3,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CAD: 'CA$',
    AUD: 'A$',
    JPY: '¥',
};

/**
 * Converts minor units (cents) to a formatted currency string without floating-point drift.
 * @param amountMinor - Numeric minor unit string or number (e.g. "12000")
 * @param currency - ISO 4217 currency code (e.g. "USD")
 */
export function formatMinorUnits(amountMinor: string | number | null | undefined, currency = 'USD'): string {
    if (amountMinor === null || amountMinor === undefined || amountMinor === '') {
        return '—';
    }

    const cleanStr = String(amountMinor).trim();
    if (!/^-?\d+$/.test(cleanStr)) {
        return '—';
    }

    const isNegative = cleanStr.startsWith('-');
    const absStr = isNegative ? cleanStr.slice(1) : cleanStr;
    const decimals = CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
    const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] || `${currency.toUpperCase()} `;

    if (decimals === 0) {
        const formatted = absStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return `${isNegative ? '-' : ''}${symbol}${formatted}`;
    }

    const padded = absStr.padStart(decimals + 1, '0');
    const wholePart = padded.slice(0, padded.length - decimals);
    const fractionPart = padded.slice(padded.length - decimals);

    const formattedWhole = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${isNegative ? '-' : ''}${symbol}${formattedWhole}.${fractionPart}`;
}

/**
 * Calculates and formats the signed difference between two minor unit amounts.
 * @param expectedMinor - Expected amount (e.g. Merchant Order)
 * @param actualMinor - Actual captured amount (e.g. Provider Capture)
 * @param currency - Currency code
 */
export function formatMinorDifference(
    expectedMinor: string | number | null | undefined,
    actualMinor: string | number | null | undefined,
    currency = 'USD',
): { formatted: string; delta: number; isMismatch: boolean; isPositive: boolean } {
    if (!expectedMinor || !actualMinor) {
        return { formatted: '—', delta: 0, isMismatch: false, isPositive: false };
    }

    try {
        const exp = BigInt(expectedMinor);
        const act = BigInt(actualMinor);
        const diff = act - exp;

        if (diff === 0n) {
            return { formatted: '$0.00', delta: 0, isMismatch: false, isPositive: false };
        }

        const isPositive = diff > 0n;
        const absDiff = diff < 0n ? -diff : diff;
        const formattedAbs = formatMinorUnits(absDiff.toString(), currency);
        const sign = isPositive ? '+' : '-';

        return {
            formatted: `${sign}${formattedAbs}`,
            delta: Number(diff),
            isMismatch: true,
            isPositive,
        };
    } catch {
        return { formatted: '—', delta: 0, isMismatch: false, isPositive: false };
    }
}

/**
 * Formats ISO timestamps into human-readable tabular dates.
 */
export function formatTimestamp(isoString: string | null | undefined): string {
    if (!isoString) return '—';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '—';
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }).format(date);
    } catch {
        return '—';
    }
}

/**
 * Formats a short timestamp for compact table views.
 */
export function formatShortDate(isoString: string | null | undefined): string {
    if (!isoString) return '—';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '—';
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(date);
    } catch {
        return '—';
    }
}

/**
 * Truncates UUID or ID string for display with safe ellipsis.
 */
export function truncateId(id: string | null | undefined, start = 8, end = 4): string {
    if (!id) return '—';
    if (id.length <= start + end) return id;
    return `${id.slice(0, start)}…${id.slice(-end)}`;
}
