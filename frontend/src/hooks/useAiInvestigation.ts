import { useCallback, useEffect, useRef, useState } from 'react';
import { adaptiveApiClient } from '@/services/api/api-client';
import { ApiClientError, type InvestigationRecord } from '@/services/api/types';

export type InvestigationPanelStatus =
    | 'idle'
    | 'loading'
    | 'success'
    | 'insufficient_evidence'
    | 'error'
    | 'stale';

export interface UseAiInvestigationOptions {
    merchantId: string;
    exceptionId: string | null;
    exceptionVersion?: number;
    exceptionUpdatedAt?: string;
}

export interface UseAiInvestigationResult {
    status: InvestigationPanelStatus;
    investigation: InvestigationRecord | null;
    error: { code: string; message: string; details?: unknown } | null;
    isStale: boolean;
    triggerInvestigation: () => Promise<void>;
    clear: () => void;
}

export function useAiInvestigation({
    merchantId,
    exceptionId,
    exceptionVersion,
    exceptionUpdatedAt,
}: UseAiInvestigationOptions): UseAiInvestigationResult {
    const [status, setStatus] = useState<InvestigationPanelStatus>('idle');
    const [investigation, setInvestigation] = useState<InvestigationRecord | null>(null);
    const [error, setError] = useState<{ code: string; message: string; details?: unknown } | null>(null);
    const [isStale, setIsStale] = useState<boolean>(false);

    const [prevContext, setPrevContext] = useState({ merchantId, exceptionId });
    if (prevContext.merchantId !== merchantId || prevContext.exceptionId !== exceptionId) {
        setPrevContext({ merchantId, exceptionId });
        setInvestigation(null);
        setError(null);
        setIsStale(false);
        setStatus(!exceptionId || !merchantId ? 'idle' : 'loading');
    }

    // Generation/Request tracking to prevent race conditions across exception/merchant changes
    const requestIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Load existing investigation when merchant or exception changes
    useEffect(() => {
        // Abort in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        const currentReqId = ++requestIdRef.current;

        if (!exceptionId || !merchantId) {
            return;
        }

        // Check for latest existing investigation in database/store
        const controller = new AbortController();
        abortControllerRef.current = controller;

        adaptiveApiClient
            .getLatestAiInvestigation(merchantId, exceptionId, controller.signal)
            .then((existing) => {
                if (currentReqId !== requestIdRef.current) return;
                if (existing) {
                    setInvestigation(existing);
                    if (existing.status === 'INSUFFICIENT_EVIDENCE') {
                        setStatus('insufficient_evidence');
                    } else if (existing.status === 'FAILED') {
                        setStatus('error');
                        setError({
                            code: existing.errorCategory || 'FAILED',
                            message: existing.result.summary || 'Investigation reported a failure status',
                        });
                    } else {
                        // Check staleness against exception updated time
                        const isOutdated =
                            Boolean(exceptionUpdatedAt && new Date(existing.createdAt) < new Date(exceptionUpdatedAt)) ||
                            Boolean(exceptionVersion && existing.result.facts.length > 0 && exceptionVersion > 1);

                        setIsStale(isOutdated);
                        setStatus(isOutdated ? 'stale' : 'success');
                    }
                } else {
                    setStatus('idle');
                }
            })
            .catch((err: unknown) => {
                if (currentReqId !== requestIdRef.current) return;
                // If 404 or not found, simply remain idle
                if (err instanceof ApiClientError && err.statusCode === 404) {
                    setStatus('idle');
                } else if (err instanceof DOMException && err.name === 'AbortError') {
                    // Aborted safely
                } else {
                    // Background load failed, default to idle
                    setStatus('idle');
                }
            });

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [merchantId, exceptionId, exceptionVersion, exceptionUpdatedAt]);

    // Explicit user-triggered investigation
    const triggerInvestigation = useCallback(async () => {
        if (!merchantId || !exceptionId) return;

        // Abort prior request if any
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const currentReqId = ++requestIdRef.current;
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setStatus('loading');
        setError(null);

        const idempotencyKey = `inv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        try {
            const record = await adaptiveApiClient.triggerAiInvestigation(
                merchantId,
                exceptionId,
                { idempotencyKey },
                controller.signal,
            );

            if (currentReqId !== requestIdRef.current) return;

            setInvestigation(record);
            setIsStale(false);

            if (record.status === 'INSUFFICIENT_EVIDENCE') {
                setStatus('insufficient_evidence');
            } else if (record.status === 'FAILED') {
                setStatus('error');
                setError({
                    code: record.errorCategory || 'FAILED',
                    message: record.result.summary || 'Investigation reported a failure status',
                });
            } else {
                setStatus('success');
            }
        } catch (err: unknown) {
            if (currentReqId !== requestIdRef.current) return;
            if (err instanceof DOMException && err.name === 'AbortError') return;

            let code = 'INVESTIGATION_FAILED';
            let message = 'Failed to generate investigation';
            let details: unknown = undefined;

            if (err instanceof ApiClientError) {
                code = err.code;
                message = err.message;
                details = err.details;
            } else if (err instanceof Error) {
                message = err.message;
            }

            setError({ code, message, details });
            setStatus('error');
        }
    }, [merchantId, exceptionId]);

    const clear = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setStatus('idle');
        setInvestigation(null);
        setError(null);
        setIsStale(false);
    }, []);

    return {
        status,
        investigation,
        error,
        isStale,
        triggerInvestigation,
        clear,
    };
}
