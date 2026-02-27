export const config: { API_BASE_URL: string } = {
    API_BASE_URL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000/api" : "https://khushi-solutions-3f944a9b5e3b.herokuapp.com/api")
};

// Log initial configuration
const backendType = import.meta.env.DEV ? "local backend (development)" : "production backend on Heroku";
console.log(`%c[CONFIG] Using ${backendType}: ${config.API_BASE_URL}`, 'color: cyan');