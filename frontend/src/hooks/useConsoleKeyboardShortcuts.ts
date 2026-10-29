import { useEffect } from 'react';
import type { ExceptionAction } from '@/services/api/types';

interface UseConsoleKeyboardShortcutsOptions {
    enabled?: boolean;
    hasOpenModal: boolean;
    itemsCount: number;
    selectedIndex: number;
    onSelectIndex: (index: number) => void;
    onTriggerAction: (action: ExceptionAction) => void;
    onCloseModal?: () => void;
}

/**
 * Keyboard hotkey navigation for high-speed exception triage in Operator Console.
 * - j / ArrowDown: Select next exception in queue
 * - k / ArrowUp: Select previous exception in queue
 * - r: Trigger Resolve action dialog
 * - i: Trigger Investigate action dialog
 * - d: Trigger Dismiss action dialog
 * - Esc: Close active modal dialog
 *
 * Suppressed when focus is inside text inputs, textareas, or active modal dialogs.
 */
export function useConsoleKeyboardShortcuts({
    enabled = true,
    hasOpenModal,
    itemsCount,
    selectedIndex,
    onSelectIndex,
    onTriggerAction,
    onCloseModal,
}: UseConsoleKeyboardShortcutsOptions) {
    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Guard: suppress hotkeys when user is actively typing in form inputs
            const target = e.target as HTMLElement | null;
            const isTyping =
                target?.tagName === 'INPUT' ||
                target?.tagName === 'TEXTAREA' ||
                target?.tagName === 'SELECT' ||
                Boolean(target?.isContentEditable);

            if (isTyping) {
                if (e.key === 'Escape') {
                    target?.blur();
                }
                return;
            }

            // If a modal is open, delegate Escape to close it
            if (hasOpenModal) {
                if (e.key === 'Escape' && onCloseModal) {
                    e.preventDefault();
                    onCloseModal();
                }
                return;
            }

            // j or ArrowDown -> Next item in queue
            if (e.key === 'j' || e.key === 'ArrowDown') {
                if (itemsCount > 0) {
                    e.preventDefault();
                    const nextIndex = selectedIndex >= 0 && selectedIndex < itemsCount - 1 ? selectedIndex + 1 : 0;
                    onSelectIndex(nextIndex);
                }
                return;
            }

            // k or ArrowUp -> Previous item in queue
            if (e.key === 'k' || e.key === 'ArrowUp') {
                if (itemsCount > 0) {
                    e.preventDefault();
                    const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : itemsCount - 1;
                    onSelectIndex(prevIndex);
                }
                return;
            }

            // Operational action triggers for currently selected item
            if (selectedIndex >= 0 && itemsCount > 0) {
                if (e.key === 'r') {
                    e.preventDefault();
                    onTriggerAction('RESOLVE');
                    return;
                }
                if (e.key === 'i') {
                    e.preventDefault();
                    onTriggerAction('INVESTIGATE');
                    return;
                }
                if (e.key === 'd') {
                    e.preventDefault();
                    onTriggerAction('DISMISS');
                    return;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        enabled,
        hasOpenModal,
        itemsCount,
        selectedIndex,
        onSelectIndex,
        onTriggerAction,
        onCloseModal,
    ]);
}

