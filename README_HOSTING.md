# ZAK POS — Hosting Ready

This package runs the POS web UI and the Node.js license API from the same HTTPS domain.

## Deploy
1. Upload this folder to a Node.js host or push it to GitHub.
2. Run `npm install`.
3. Start with `npm start`.
4. Set the environment variables from `.env.example` in the hosting dashboard.
5. Open the generated HTTPS URL. The frontend already uses the same domain for `/api/...`.

## Important
Automatic Easypaisa activation is NOT enabled merely by hosting this package. Real activation requires your approved Easypaisa merchant credentials and the current official transaction verification/webhook integration. Never put payment secrets in `public/`.

The included `/api/admin/verify-payment` endpoint is protected by `ZAK_ADMIN_SECRET` and should only be called after genuine server-side payment verification.
