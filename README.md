# EnKash UPI Backend — Node.js + Express

This is a **complete runnable demo backend**, not a working live EnKash processor and **not a Shopify Payments App**. Exact EnKash API endpoints/authentication/webhook signatures have not been provided and must not be guessed.

## Setup (Node.js 20+)

```powershell
npm install
Copy-Item .env.example .env
# Edit .env: set a long random DEMO_API_TOKEN
npm start
```

Test health: `http://localhost:3000/health`

Demo payment creation (PowerShell):

```powershell
$headers = @{ 'x-demo-token' = 'YOUR_DEMO_API_TOKEN' }
Invoke-RestMethod -Uri 'http://localhost:3000/api/payments' -Method POST -Headers $headers -ContentType 'application/json' -Body '{"amount": 99.50}'
```

Get status: `GET /api/payments/<reference>`; demo payments remain PENDING (no real payment occurs).

## Endpoints

- `GET /health` — server health
- `POST /api/payments` — demo-only create (header `x-demo-token`, body `{ "amount": 99.5 }`)
- `GET /api/payments/:reference` — status (add customer authentication before production)
- `POST /webhooks/enkash` — raw webhook receiver (disabled in demo)

## Before production

1. Obtain official merchant-specific EnKash Create Order, UPI Intent, Dynamic QR, transaction status and webhook signature documentation.
2. Implement and test `src/provider.js` with verified auth, endpoint paths, response fields and signature verification.
3. Implement authenticated, server-trusted Shopify order/payment-session validation. **Never use the browser-provided amount**.
4. Use the **approved Shopify Payments Apps route** for native Shopify Advanced checkout; merchant API keys alone do not authorize it.
5. Add authenticated customer order ownership checks, replay protection, webhook idempotency, reconciliation, audit logs, TLS, secret management, and payment failure/refund workflows.
6. Do not point EnKash webhooks at the Shopify homepage. Point to a deployed HTTPS `/webhooks/enkash` endpoint only after official signature verification is implemented.
7. Do not expose API or secret keys in frontend JavaScript.

## Important

`PAYMENT_MODE=live` does **not** enable real transactions: the live payment route intentionally rejects requests until trusted Shopify session verification and the provider adapter are implemented. This is a safety guard, not a missing installation step.
