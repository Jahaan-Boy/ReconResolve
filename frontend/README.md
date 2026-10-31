# ReconResolve — Frontend Engineering Guide

> Modern, high-performance financial reconciliation workbench and operator console built with React 19, TypeScript, AG Grid Community, and Tailwind CSS 4.

---

## 1. Overview

The ReconResolve frontend provides fintech operations teams, reconciliation analysts, and financial managers with a rapid, human-in-the-loop exception workbench.

### Key Capabilities
- **Virtualized High-Performance Exception Queue:** Powered by **AG Grid Community 36**, providing 60fps virtualized scrolling, column sorting, clipboard copying, and keyboard triage across large financial discrepancy queues.
- **Side-by-Side Discrepancy Evidence:** Split-pane workbench displaying linked payment gateway records, internal merchant orders, mathematical deltas, and immutable audit logs.
- **AI Root-Cause Investigation Panel:** Grounded, citeable root-cause analyses powered by Google Gemini (`gemini-2.5-flash`), with interactive evidence pills (`ptxn:*`, `mord:*`, `run:*`), confidence indicators, and actionable remediation checklists.
- **Adaptive Dual-Mode API Client:** Connects to live Express/PostgreSQL backend (`http://localhost:3000`) and seamlessly falls back to high-fidelity offline mock data if the backend is unavailable or when operating in sandbox demo mode.
- **Optimistic Concurrency Control (OCC):** Form dialogs pass expected version tokens to prevent accidental overwrites (`409 Conflict` recovery).
- **Keyboard Shortcuts:** Fast hotkey navigation (`j`/`k` for row selection, `r` to resolve, `i` to investigate, `d` to dismiss, `Esc` to close modals).

---

## 2. Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **React 19.2** | Modern UI library utilizing modern state and concurrent primitives |
| **TypeScript 6.0** | End-to-end type safety for API contracts, domain entities, and component props |
| **AG Grid Community 36.2** | Enterprise-grade virtualized table with dark Quartz theme styling |
| **Tailwind CSS 4.3** | Utility-first CSS styling with customized dark fintech color palette |
| **Motion (`motion/react`)** | Fluid micro-interactions and modal transitions |
| **Lucide React 1.59** | Clean, accessible financial and operational iconography |
| **Vite 8.3** | Rapid local development and optimized production bundling |

---

## 3. Directory Structure

```text
frontend/src/
├── App.tsx                     # Client router ('landing' | 'console')
├── main.tsx                    # React application entry point
├── index.css                   # Global Tailwind CSS 4 & AG Grid theme styling
├── components/                 # Shared UI component primitives
│   ├── fintech/                # Financial badges, buttons, skeletons, and feedback states
│   └── ui/                     # Generic buttons, dialogs, inputs, and tabs
├── features/
│   ├── auth/                   # Authentication modal and session state
│   ├── console/                # Operator Console Workbench
│   │   ├── OperatorConsolePage.tsx    # Primary console layout & state coordinator
│   │   ├── ConsoleAppHeader.tsx       # Navigation bar, tenant switcher, user profile
│   │   ├── ExceptionQueue.tsx         # AG Grid Community virtualized queue
│   │   ├── ExceptionInspector.tsx     # Split-pane discrepancy detail & evidence view
│   │   ├── AIInvestigationPanel.tsx   # Grounded Gemini root-cause diagnosis panel
│   │   ├── ExceptionActionDialog.tsx  # FSM transition dialog with preset templates & OCC
│   │   ├── AuditTimeline.tsx          # Chronological operator action audit trail
│   │   ├── OrderIngestionDialog.tsx   # Manual and batch merchant order ingestion dialog
│   │   └── ReconciliationDialog.tsx   # Runs history and on-demand run trigger dialog
│   └── landing/                # Public marketing landing page & problem showcases
├── hooks/                      # Custom React hooks
│   ├── useAiInvestigation.ts          # AI investigation queries, mutations & staleness
│   └── useConsoleKeyboardShortcuts.ts # High-speed hotkey triage navigation
├── lib/                        # Client-side utility functions
│   ├── formatters.ts           # Currency minor units, timestamps, and ID truncation
│   └── csv-export.ts           # RFC-4180 compliant CSV export generator
└── services/api/               # Type-safe API client layer
    ├── api-client.ts           # Adaptive fetch client (live API <-> sandbox mock fallback)
    ├── exceptions-api.ts       # Exceptions endpoints (list, get, resolve, investigate)
    ├── orders-api.ts           # Merchant order ingestion & search endpoints
    ├── runs-api.ts             # Reconciliation run history & trigger endpoints
    └── mock-exceptions-api.ts  # Offline mock dataset for zero-backend demos
```

---

## 4. Key Components Deep Dive

### 1. `ExceptionQueue.tsx` (AG Grid Virtualized Queue)
- Configured with `AllCommunityModule` and `ag-theme-quartz`.
- Virtualizes rows so thousands of exceptions render without browser lag.
- Custom cell renderers:
  - `StatusBadge`: Visual pill for `OPEN`, `INVESTIGATING`, `RESOLVED`, `DISMISSED`.
  - `ExceptionTypeBadge`: Color-coded for `AMOUNT_MISMATCH`, `STATUS_DISCREPANCY`, `MISSING_MERCHANT_COUNTERPART`, etc.
  - `Variance / Summary`: Dynamically computes exact financial deltas from minor units.
  - Hoverable copy-to-clipboard buttons for transaction and order reference IDs.

### 2. `AIInvestigationPanel.tsx` (Grounded Root-Cause Intelligence)
- Renders automated root-cause hypotheses generated by Google Gemini (`@google/genai`).
- Displays interactive, copyable **Evidence Reference Pills**:
  - `ptxn:*` (Gateway Transaction)
  - `mord:*` (Internal Merchant Order)
  - `run:*` (Reconciliation Batch)
  - `exc:*` (Exception Discrepancy Snapshot)
- Displays confidence indicators (`High`, `Medium`, `Low`) and actionable remediation checklists.
- **Stale Detection:** Flags when an exception has been modified (version bumped) since the last AI diagnosis was generated.

### 3. `ExceptionActionDialog.tsx` (FSM Transitions with OCC)
- Enforces backend state machine transition rules (`RESOLVE`, `REOPEN`, `DISMISS`, `INVESTIGATE`).
- Enforces a minimum 10-character operational note requirement.
- Includes **Quick-Preset Templates**:
  - *"Manually verified via bank settlement report"*
  - *"Customer refunded through alternate support channel"*
  - *"Approved FX conversion variance within bounds"*
  - *"Duplicate test transaction created in staging"*
- Passes `expectedVersion` to guard against concurrent operator collisions (`409 Conflict`).

---

## 5. Keyboard Hotkey Navigation

For high-speed financial triage, the console includes keyboard shortcuts (disabled when typing in input fields):

| Key | Action |
| :--- | :--- |
| `j` / `ArrowDown` | Select next exception in the queue |
| `k` / `ArrowUp` | Select previous exception in the queue |
| `r` | Open **Resolve** action dialog for selected exception |
| `i` | Open **Investigate** action dialog for selected exception |
| `d` | Open **Dismiss** action dialog for selected exception |
| `Esc` | Close active dialog or clear selection |

---

## 6. Available Scripts

From `frontend/`:

```bash
# Start local Vite development server (http://localhost:5173)
npm run dev

# Run TypeScript type check and build production bundle
npm run build

# Preview production build locally
npm run preview

# Run ESLint checks
npm run lint
```
