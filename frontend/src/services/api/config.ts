/**
 * Global API base URL configuration for ReconResolve Frontend.
 * Reads VITE_API_URL if provided at build time (e.g. for Render deployment),
 * defaulting to empty string '' for same-origin proxy (e.g. local Vite / Nginx).
 */
export const API_BASE_URL: string = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || ''
).trim().replace(/\/+$/, '');
