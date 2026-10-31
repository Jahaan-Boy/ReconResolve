import type {
    CandidateOrder,
    MatchDecision,
    MatchingPolicyOptions,
    ReconciliationTransaction,
} from './types';

const DEFAULT_TIME_WINDOW_TOLERANCE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function evaluateMatch(
    transaction: ReconciliationTransaction,
    candidateOrders: CandidateOrder[],
    options: MatchingPolicyOptions = {},
): MatchDecision {
    const timeToleranceMs = options.timeWindowToleranceMs ?? DEFAULT_TIME_WINDOW_TOLERANCE_MS;

    // -------------------------------------------------------------------------
    // 1. Transaction Eligibility Filter
    // -------------------------------------------------------------------------
    if (transaction.type !== 'PAYMENT' && transaction.type !== 'CAPTURE') {
        return {
            kind: 'excluded',
            reasonCode: 'UNSUPPORTED_TRANSACTION_TYPE',
            details: `Transaction type "${transaction.type}" is excluded from order payment matching`,
        };
    }

    if (transaction.status !== 'CAPTURED' && transaction.status !== 'APPROVED') {
        return {
            kind: 'excluded',
            reasonCode: 'UNSUPPORTED_TRANSACTION_STATUS',
            details: `Transaction status "${transaction.status}" is not a settled/captured state`,
        };
    }

    if (transaction.amountMinor <= 0n) {
        return {
            kind: 'excluded',
            reasonCode: 'NON_POSITIVE_AMOUNT',
            details: `Transaction amount (${transaction.amountMinor.toString()}) must be positive`,
        };
    }

    // -------------------------------------------------------------------------
    // 2. Rule 1: Exact Provider Order Reference
    // -------------------------------------------------------------------------
    const providerOrderId = transaction.providerOrderId?.trim();
    if (providerOrderId && providerOrderId !== '') {
        const orderRefCandidates = candidateOrders.filter((order) => {
            if (order.externalOrderId === providerOrderId) return true;
            const meta = order.metadata;
            if (meta && typeof meta === 'object') {
                if (meta['providerOrderId'] === providerOrderId) return true;
                if (meta['paypalOrderId'] === providerOrderId) return true;
            }
            return false;
        });

        if (orderRefCandidates.length > 1) {
            return {
                kind: 'ambiguous',
                reasonCode: 'MULTIPLE_CANDIDATES',
                candidateOrderIds: orderRefCandidates.map((c) => c.id),
                evidence: {
                    rule: 'EXACT_PROVIDER_ORDER_REFERENCE',
                    candidateCount: orderRefCandidates.length,
                    providerOrderId,
                },
            };
        }

        if (orderRefCandidates.length === 1) {
            const candidate = orderRefCandidates[0]!;

            // Currency check
            if (candidate.currency.toUpperCase() !== transaction.currency.toUpperCase()) {
                return {
                    kind: 'discrepancy',
                    exceptionType: 'AMOUNT_MISMATCH',
                    orderId: candidate.id,
                    reasonCode: 'CURRENCY_MISMATCH',
                    evidence: {
                        expectedCurrency: candidate.currency,
                        actualCurrency: transaction.currency,
                        orderId: candidate.id,
                        rule: 'EXACT_PROVIDER_ORDER_REFERENCE',
                    },
                };
            }

            // Exact minor-unit amount check
            if (candidate.amountMinor !== transaction.amountMinor) {
                return {
                    kind: 'discrepancy',
                    exceptionType: 'AMOUNT_MISMATCH',
                    orderId: candidate.id,
                    reasonCode: 'AMOUNT_MISMATCH',
                    evidence: {
                        expectedAmountMinor: candidate.amountMinor.toString(),
                        actualAmountMinor: transaction.amountMinor.toString(),
                        orderId: candidate.id,
                        rule: 'EXACT_PROVIDER_ORDER_REFERENCE',
                    },
                };
            }

            // Order status compatibility check
            if (candidate.status === 'CANCELLED') {
                return {
                    kind: 'discrepancy',
                    exceptionType: 'STATUS_DISCREPANCY',
                    orderId: candidate.id,
                    reasonCode: 'ORDER_CANCELLED',
                    evidence: {
                        orderStatus: candidate.status,
                        orderId: candidate.id,
                        rule: 'EXACT_PROVIDER_ORDER_REFERENCE',
                    },
                };
            }

            return {
                kind: 'matched',
                ruleCode: 'EXACT_PROVIDER_ORDER_REFERENCE',
                orderId: candidate.id,
                evidence: {
                    matchedReference: providerOrderId,
                    referenceType: 'providerOrderId',
                    currency: transaction.currency,
                    amountMinor: transaction.amountMinor.toString(),
                },
            };
        }
    }

    // -------------------------------------------------------------------------
    // 3. Rule 2: Exact Transaction Reference on Order
    // -------------------------------------------------------------------------
    const providerTxnId = transaction.providerTxnId?.trim();
    if (providerTxnId && providerTxnId !== '') {
        const txnRefCandidates = candidateOrders.filter((order) => {
            const meta = order.metadata;
            if (meta && typeof meta === 'object') {
                if (meta['providerTxnId'] === providerTxnId) return true;
                if (meta['paypalTransactionId'] === providerTxnId) return true;
                if (meta['transactionId'] === providerTxnId) return true;
            }
            return false;
        });

        if (txnRefCandidates.length > 1) {
            return {
                kind: 'ambiguous',
                reasonCode: 'MULTIPLE_CANDIDATES',
                candidateOrderIds: txnRefCandidates.map((c) => c.id),
                evidence: {
                    rule: 'EXACT_TRANSACTION_REFERENCE',
                    candidateCount: txnRefCandidates.length,
                    providerTxnId,
                },
            };
        }

        if (txnRefCandidates.length === 1) {
            const candidate = txnRefCandidates[0]!;

            if (candidate.currency.toUpperCase() !== transaction.currency.toUpperCase()) {
                return {
                    kind: 'discrepancy',
                    exceptionType: 'AMOUNT_MISMATCH',
                    orderId: candidate.id,
                    reasonCode: 'CURRENCY_MISMATCH',
                    evidence: {
                        expectedCurrency: candidate.currency,
                        actualCurrency: transaction.currency,
                        orderId: candidate.id,
                        rule: 'EXACT_TRANSACTION_REFERENCE',
                    },
                };
            }

            if (candidate.amountMinor !== transaction.amountMinor) {
                return {
                    kind: 'discrepancy',
                    exceptionType: 'AMOUNT_MISMATCH',
                    orderId: candidate.id,
                    reasonCode: 'AMOUNT_MISMATCH',
                    evidence: {
                        expectedAmountMinor: candidate.amountMinor.toString(),
                        actualAmountMinor: transaction.amountMinor.toString(),
                        orderId: candidate.id,
                        rule: 'EXACT_TRANSACTION_REFERENCE',
                    },
                };
            }

            if (candidate.status === 'CANCELLED') {
                return {
                    kind: 'discrepancy',
                    exceptionType: 'STATUS_DISCREPANCY',
                    orderId: candidate.id,
                    reasonCode: 'ORDER_CANCELLED',
                    evidence: {
                        orderStatus: candidate.status,
                        orderId: candidate.id,
                        rule: 'EXACT_TRANSACTION_REFERENCE',
                    },
                };
            }

            return {
                kind: 'matched',
                ruleCode: 'EXACT_TRANSACTION_REFERENCE',
                orderId: candidate.id,
                evidence: {
                    matchedReference: providerTxnId,
                    referenceType: 'providerTxnId',
                    currency: transaction.currency,
                    amountMinor: transaction.amountMinor.toString(),
                },
            };
        }
    }

    // -------------------------------------------------------------------------
    // 4. Rule 3: Exact Amount + Currency within Narrow Time Window
    // -------------------------------------------------------------------------
    const txnTime = transaction.occurredAt.getTime();
    const txnCurrency = (transaction.currency || '').trim().toUpperCase();
    const amountTimeCandidates = candidateOrders.filter((order) => {
        if (order.status === 'CANCELLED') return false;
        if (order.amountMinor <= 0n) return false;
        const orderCurrency = (order.currency || '').trim().toUpperCase();
        if (!orderCurrency || !txnCurrency || orderCurrency !== txnCurrency) return false;
        if (order.amountMinor !== transaction.amountMinor) return false;

        const orderTime = order.orderedAt.getTime();
        return Math.abs(txnTime - orderTime) <= timeToleranceMs;
    });

    if (amountTimeCandidates.length > 1) {
        return {
            kind: 'ambiguous',
            reasonCode: 'MULTIPLE_CANDIDATES',
            candidateOrderIds: amountTimeCandidates.map((c) => c.id),
            evidence: {
                rule: 'EXACT_AMOUNT_CURRENCY_TIME_WINDOW',
                candidateCount: amountTimeCandidates.length,
                currency: transaction.currency,
                amountMinor: transaction.amountMinor.toString(),
                toleranceMs: timeToleranceMs,
            },
        };
    }

    if (amountTimeCandidates.length === 1) {
        const candidate = amountTimeCandidates[0]!;
        const timeDiffMs = Math.abs(txnTime - candidate.orderedAt.getTime());

        return {
            kind: 'matched',
            ruleCode: 'EXACT_AMOUNT_CURRENCY_TIME_WINDOW',
            orderId: candidate.id,
            evidence: {
                currency: transaction.currency,
                amountMinor: transaction.amountMinor.toString(),
                transactionOccurredAt: transaction.occurredAt.toISOString(),
                orderOrderedAt: candidate.orderedAt.toISOString(),
                timeDifferenceMs: timeDiffMs,
            },
        };
    }

    // -------------------------------------------------------------------------
    // 5. Fallback: Unmatched
    // -------------------------------------------------------------------------
    return {
        kind: 'unmatched',
        reasonCode: 'NO_CANDIDATE_ORDERS',
        evidence: {
            providerTxnId: transaction.providerTxnId,
            providerOrderId: transaction.providerOrderId ?? 'none',
            currency: transaction.currency,
            amountMinor: transaction.amountMinor.toString(),
            occurredAt: transaction.occurredAt.toISOString(),
        },
    };
}
