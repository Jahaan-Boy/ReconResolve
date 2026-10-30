import type { ExceptionSummary } from '@/services/api/types';
import { formatMinorUnits } from '@/lib/formatters';

/**
 * Escapes a cell value for standard CSV compatibility (RFC 4180).
 * Handles double quotes, commas, newlines, and prevents spreadsheet formula injection.
 */
export function escapeCsvCell(val: unknown): string {
    if (val === null || val === undefined) {
        return '';
    }

    let str = String(val);

    // Prevent spreadsheet formula injection for values starting with =, +, -, @, tab, or carriage return
    // Allow standard negative or signed currency amounts like "-$12.50" or "+$5.00"
    const isMathAmount = /^[+-]\$?\d/.test(str);
    if (/^[=+\-@\t\r]/.test(str) && !isMathAmount) {
        str = `'${str}`;
    }

    // If cell contains quotes, commas, carriage returns or newlines, escape internal quotes and wrap in quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}

/**
 * Extracts a descriptive explanation of the discrepancy break from exception details.
 */
export function extractDiscrepancyDetails(item: ExceptionSummary): string {
    const det = item.details as {
        evidence?: {
            expectedAmountMinor?: string;
            actualAmountMinor?: string;
            orderStatus?: string;
            currency?: string;
        };
        reasonCode?: string;
        candidateCount?: number;
        message?: string;
    } | null;

    if (item.type === 'AMOUNT_MISMATCH') {
        const exp = det?.evidence?.expectedAmountMinor;
        const act = det?.evidence?.actualAmountMinor;
        const curr = det?.evidence?.currency || 'USD';
        if (exp && act) {
            try {
                const diff = BigInt(act) - BigInt(exp);
                const formattedDiff = formatMinorUnits(diff < 0n ? (-diff).toString() : diff.toString(), curr);
                const expFmt = formatMinorUnits(exp, curr);
                const actFmt = formatMinorUnits(act, curr);
                const sign = diff > 0n ? '+' : '-';
                return `${sign}${formattedDiff} delta (Expected: ${expFmt}, Actual: ${actFmt})`;
            } catch {
                return det?.reasonCode || 'Amount Mismatch';
            }
        }
        return det?.reasonCode || 'Amount Mismatch';
    }

    if (item.type === 'STATUS_DISCREPANCY') {
        const orderStatus = det?.evidence?.orderStatus || 'Conflict';
        return `Status Conflict: Order is ${orderStatus} but payment was captured`;
    }

    if (item.type === 'MISSING_PROVIDER_COUNTERPART') {
        return 'Missing Provider Transaction: Order exists but payment capture not found';
    }

    if (item.type === 'MISSING_MERCHANT_COUNTERPART') {
        return 'Missing Merchant Order: Payment captured without corresponding order';
    }

    if (item.type === 'AMBIGUOUS_MATCH') {
        const count = det?.candidateCount ?? 'Multiple';
        return `Ambiguous Match: ${count} candidate orders match criteria (refused to guess)`;
    }

    return det?.reasonCode || det?.message || 'Reconciliation discrepancy break';
}

/**
 * Formats a list of ExceptionSummary records into an RFC 4180 CSV string.
 */
export function formatExceptionsToCsv(items: ExceptionSummary[]): string {
    const headers = [
        'Exception ID',
        'Status',
        'Type',
        'Discrepancy Details',
        'Provider Txn ID',
        'Merchant Order ID',
        'Version',
        'Created At',
        'Resolved At',
        'Resolution Note',
    ];

    const rows = items.map((item) => [
        item.id,
        item.status,
        item.type,
        extractDiscrepancyDetails(item),
        item.providerTransactionId || '',
        item.merchantOrderId || '',
        String(item.version),
        item.createdAt || '',
        item.resolvedAt || '',
        item.resolutionNote || '',
    ]);

    const headerLine = headers.map(escapeCsvCell).join(',');
    const rowLines = rows.map((row) => row.map(escapeCsvCell).join(','));

    return [headerLine, ...rowLines].join('\r\n');
}

/**
 * Triggers a browser file download of the filtered exceptions as a CSV file.
 * Includes UTF-8 BOM so Microsoft Excel renders symbols and character encodings correctly.
 */
export function exportExceptionsToCsv(
    items: ExceptionSummary[],
    merchantSlug = 'default',
): void {
    if (items.length === 0) {
        return;
    }

    const csvData = formatExceptionsToCsv(items);
    // Add UTF-8 BOM (\uFEFF) for Excel compatibility
    const blob = new Blob(['\uFEFF' + csvData], {
        type: 'text/csv;charset=utf-8;',
    });

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const cleanSlug = merchantSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'merchant';
    const filename = `recon-exceptions-${cleanSlug}-${dateStr}.csv`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Defer revoking the object URL to allow browser download initiation
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}
