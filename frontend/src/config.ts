export const config = {
    API_BASE_URL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000/api" : "https://khushi-school-system.onrender.com/api")
};