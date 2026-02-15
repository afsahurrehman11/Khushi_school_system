const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:8000" : "https://khushi-school-system.onrender.com");

export default API_BASE_URL;