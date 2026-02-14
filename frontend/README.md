# CMS Frontend

React + Electron frontend for the CMS system.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. For development:
   ```bash
   npm run dev
   ```

3. For Electron build:
   ```bash
   npm run build
   npm run electron
   ```

## API Configuration

The frontend uses `src/config.js` to determine the API base URL:
- Development: `http://localhost:8000`
- Production: `https://your-app-name.onrender.com`

Update the production URL in `src/config.js` after deploying the backend.