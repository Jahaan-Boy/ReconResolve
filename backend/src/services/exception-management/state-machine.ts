import { ExceptionManagementError } from './errors';
import type { ExceptionAction, ExceptionStatus } from './types';

export interface TransitionPlan {
    fromStatus: ExceptionStatus;
    toStatus: ExceptionStatus;
    action: ExceptionAction;
    reason: string | null;
    resolvedAt: Date | null;
    resolutionNote: string | null;
}

const ALLOWED_TRANSITIONS: Record<ExceptionAction, Record<ExceptionStatus, ExceptionStatus | null>> = {
    RESOLVE: {
        OPEN: 'RESOLVED',
        INVESTIGATING: 'RESOLVED',
        RESOLVED: null,
        DISMISSED: null,
    },
    REOPEN: {
        OPEN: null,
        INVESTIGATING: 'OPEN',
        RESOLVED: 'OPEN',
        DISMISSED: 'OPEN',
    },
    DISMISS: {
        OPEN: 'DISMISSED',
        INVESTIGATING: 'DISMISSED',
        RESOLVED: null,
        DISMISSED: null,
    },
    INVESTIGATE: {
        OPEN: 'INVESTIGATING',
        INVESTIGATING: null,
        RESOLVED: null,
        DISMISSED: null,
    },
};

const MIN_NOTE_LENGTH = 10;
const MAX_NOTE_LENGTH = 1000;

export function sanitizeNote(note: string, fieldName = 'note'): string {
    const trimmed = note.trim();
    if (trimmed.length < MIN_NOTE_LENGTH) {
        throw ExceptionManagementError.validationFailed(
            `${fieldName} must be at least ${MIN_NOTE_LENGTH} characters of meaningful text`,
        );
    }
    if (trimmed.length > MAX_NOTE_LENGTH) {
        throw ExceptionManagementError.validationFailed(
            `${fieldName} exceeds maximum length of ${MAX_NOTE_LENGTH} characters`,
        );
    }
    return trimmed;
}

export function validateAndPlanTransition(
    currentStatus: ExceptionStatus,
    action: ExceptionAction,
    inputNote?: string,
    now: Date = new Date(),
): TransitionPlan {
    const targetStatus = ALLOWED_TRANSITIONS[action]?.[currentStatus];

    if (!targetStatus) {
        throw ExceptionManagementError.invalidTransition(
            currentStatus,
            action === 'RESOLVE'
                ? 'RESOLVED'
                : action === 'REOPEN'
                  ? 'OPEN'
                  : action === 'DISMISS'
                    ? 'DISMISSED'
                    : 'INVESTIGATING',
            action,
            `Cannot ${action.toLowerCase()} exception in status ${currentStatus}`,
        );
    }

    let reason: string | null = null;
    let resolutionNote: string | null = null;
    let resolvedAt: Date | null = null;

    switch (action) {
        case 'RESOLVE': {
            if (!inputNote) {
                throw ExceptionManagementError.validationFailed('Resolution note is required to resolve an exception');
            }
            const sanitized = sanitizeNote(inputNote, 'resolutionNote');
            reason = sanitized;
            resolutionNote = sanitized;
            resolvedAt = now;
            break;
        }

        case 'REOPEN': {
            if (!inputNote) {
                throw ExceptionManagementError.validationFailed('Reopen reason is required to reopen an exception');
            }
            const sanitized = sanitizeNote(inputNote, 'reopenReason');
            reason = sanitized;
            resolutionNote = null;
            resolvedAt = null; // Spec requirement: clear resolvedAt only on a permitted reopen
            break;
        }

        case 'DISMISS': {
            if (!inputNote) {
                throw ExceptionManagementError.validationFailed('Dismiss reason is required to dismiss an exception');
            }
            const sanitized = sanitizeNote(inputNote, 'dismissReason');
            reason = sanitized;
            resolutionNote = sanitized;
            resolvedAt = now;
            break;
        }

        case 'INVESTIGATE': {
            if (inputNote && inputNote.trim().length > 0) {
                reason = sanitizeNote(inputNote, 'note');
            }
            resolvedAt = null;
            resolutionNote = null;
            break;
        }
    }

    return {
        fromStatus: currentStatus,
        toStatus: targetStatus,
        action,
        reason,
        resolvedAt,
        resolutionNote,
    };
}
