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
    API_BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
};

// Single clear log at startup showing which backend is being used
const mode = import.meta.env.DEV ? 'DEVELOPMENT' : 'PRODUCTION';
console.log(
    `%c[BACKEND] ${mode} mode - API: ${config.API_BASE_URL}`,
    `color: ${import.meta.env.DEV ? 'cyan' : 'lime'}; font-weight: bold; font-size: 14px; padding: 4px;`
);