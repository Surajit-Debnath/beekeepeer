# BEEKEEPER Frontend

Install and run from this directory:

```powershell
npm install
npm run dev
```

The frontend expects the backend at `http://127.0.0.1:5000/api`. Override it
with a Vite environment variable when needed:

```dotenv
VITE_API_URL=http://127.0.0.1:5000/api
```

The public verification route is `/verify/:batchId`. Authenticated role
pages use backend JWTs and never receive blockchain private keys.
