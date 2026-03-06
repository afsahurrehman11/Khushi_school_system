/**
 * API Configuration
 * 
 * Uses environment variables:
 * - Development: Uses .env file (VITE_API_URL)
 * - Production: Uses .env.production file (VITE_API_URL)
 * 
 * No auto-detection or fallback logic - always uses the configured URL.
 */
export const config: { API_BASE_URL: string } = {
    // Prefer a runtime config from Electron (exposed via preload) if present.
    // This allows the EXE to be shipped with a small JSON file to override the API URL
    // without needing to rebuild the frontend bundle.
    API_BASE_URL:
      // runtimeConfig exposed by `electron/preload.ts` when running packaged Electron
      (typeof window !== 'undefined' && (window as any).runtimeConfig && (window as any).runtimeConfig.API_BASE_URL)
      // Vite injected at build time
      || import.meta.env.VITE_API_URL
      // Development/local fallback
      || 'http://localhost:8000/api'
};

// Single clear log at startup showing which backend is being used
const mode = import.meta.env.DEV ? 'DEVELOPMENT' : 'PRODUCTION';
console.log(
    `%c[BACKEND] ${mode} mode - API: ${config.API_BASE_URL}`,
    `color: ${import.meta.env.DEV ? 'cyan' : 'lime'}; font-weight: bold; font-size: 14px; padding: 4px;`
);