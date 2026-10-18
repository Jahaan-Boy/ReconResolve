const CURRENCY_EXPONENTS: Record<string, number> = {
    // Zero-decimal currencies
    BIF: 0,
    CLP: 0,
    DJF: 0,
    GNF: 0,
    ISK: 0,
    JPY: 0,
    KMF: 0,
    KRW: 0,
    PYG: 0,
    RWF: 0,
    UGX: 0,
    VND: 0,
    VUV: 0,
    XAF: 0,
    XOF: 0,
    XPF: 0,

    // Two-decimal currencies
    AED: 2,
    ARS: 2,
    AUD: 2,
    BRL: 2,
    CAD: 2,
    CHF: 2,
    CNY: 2,
    CZK: 2,
    DKK: 2,
    EUR: 2,
    GBP: 2,
    HKD: 2,
    HUF: 2,
    ILS: 2,
    INR: 2,
    MXN: 2,
    MYR: 2,
    NOK: 2,
    NZD: 2,
    PHP: 2,
    PLN: 2,
    RON: 2,
    RUB: 2,
    SEK: 2,
    SGD: 2,
    THB: 2,
    TRY: 2,
    TWD: 2,
    USD: 2,
    ZAR: 2,

    // Three-decimal currencies
    BHD: 3,
    IQD: 3,
    JOD: 3,
    KWD: 3,
    LYD: 3,
    OMR: 3,
    TND: 3,
};

export class MoneyConversionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MoneyConversionError';
    }
}

/**
 * Return the minor-unit exponent for a currency code.
 * @throws MoneyConversionError for unknown currencies.
 */
export function getCurrencyExponent(currencyCode: string): number {
    const upper = currencyCode.toUpperCase();
    const exponent = CURRENCY_EXPONENTS[upper];
    if (exponent === undefined) {
        throw new MoneyConversionError(
            `Unknown or unsupported currency code: ${currencyCode}`,
        );
    }
    return exponent;
}

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export function toMinorUnits(amount: string, currencyCode: string): bigint {
    if (typeof amount !== 'string' || amount.trim() === '') {
        throw new MoneyConversionError(
            `Amount must be a non-empty string, received: ${String(amount)}`,
        );
    }

    const trimmed = amount.trim();

    if (!DECIMAL_PATTERN.test(trimmed)) {
        throw new MoneyConversionError(
            `Malformed decimal amount: "${trimmed}"`,
        );
    }

    const exponent = getCurrencyExponent(currencyCode);

    const negative = trimmed.startsWith('-');
    const unsigned = negative ? trimmed.slice(1) : trimmed;

    let intPart: string;
    let fracPart: string;

    const dotIndex = unsigned.indexOf('.');
    if (dotIndex === -1) {
        intPart = unsigned;
        fracPart = '';
    } else {
        intPart = unsigned.slice(0, dotIndex);
        fracPart = unsigned.slice(dotIndex + 1);
    }

    if (fracPart.length > exponent) {
        throw new MoneyConversionError(
            `Precision ${fracPart.length} exceeds currency ${currencyCode.toUpperCase()} exponent ${exponent}: "${trimmed}"`,
        );
    }

    const paddedFrac = fracPart.padEnd(exponent, '0');
    const combined = intPart + paddedFrac;
    const cleaned = combined.replace(/^0+/, '') || '0';

    const result = BigInt(cleaned);
    return negative ? -result : result;
}