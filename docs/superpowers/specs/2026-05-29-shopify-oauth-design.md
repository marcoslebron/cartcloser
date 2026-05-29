# Shopify OAuth Flow — Design Spec

**Date:** 2026-05-29
**Status:** Approved
**Scope:** Backend only — enables merchants to install CartCloser on their Shopify store via full OAuth, stores the access token, and auto-registers the abandoned checkout webhook.

---

## Problem

`shopifyAccessToken` is set to `''` on every merchant registration and never populated. Without it, HMAC webhook validation fails and CartCloser cannot receive real Shopify events.

---

## Approach: Dedicated `ShopifyModule`

A new `ShopifyModule` with two public routes, isolated from the existing `AuthModule` (JWT/password auth). No new npm dependencies — uses native `fetch` (Node 18+) and `crypto`.

---

## OAuth Flow

```
Merchant browser          CartCloser backend              Shopify
      │                          │                           │
      │  GET /shopify/install    │                           │
      │  ?shop=store.myshopify   │                           │
      │─────────────────────────►│                           │
      │                          │ generate nonce, store TTL │
      │                          │ build Shopify OAuth URL   │
      │◄─────────────────────────│                           │
      │  302 → Shopify auth page │                           │
      │─────────────────────────────────────────────────────►│
      │                          │                           │ merchant clicks Allow
      │◄─────────────────────────────────────────────────────│
      │  GET /shopify/callback   │                           │
      │  ?code=xxx&shop=xxx      │                           │
      │  &state=xxx&hmac=xxx     │                           │
      │─────────────────────────►│                           │
      │                          │ validate state + HMAC     │
      │                          │─────────────────────────►│
      │                          │  POST /oauth/access_token │
      │                          │◄─────────────────────────│
      │                          │  { access_token }         │
      │                          │                           │
      │                          │ upsert merchant in DB     │
      │                          │ register checkout webhook │
      │◄─────────────────────────│                           │
      │  302 → FRONTEND_URL/     │                           │
      │  install/success         │                           │
```

---

## Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/shopify/install` | Public | Starts OAuth — redirects to Shopify |
| GET | `/shopify/callback` | Public | Handles Shopify redirect, completes install |

### `GET /shopify/install?shop=mystore.myshopify.com`

1. Validates `shop` param matches `*.myshopify.com` pattern
2. Generates a cryptographically random nonce (state)
3. Stores nonce in in-memory `Map` with 10-minute expiry
4. Redirects to:
   ```
   https://{shop}/admin/oauth/authorize
     ?client_id={SHOPIFY_API_KEY}
     &scope=read_checkouts,read_customers
     &redirect_uri={APP_URL}/shopify/callback
     &state={nonce}
   ```

### `GET /shopify/callback?code=&shop=&state=&hmac=`

1. **Validate state** — nonce must exist in Map and not be expired; delete after use (replay protection)
2. **Validate HMAC** — remove `hmac` from params, sort remaining keys, HMAC-SHA256 with `SHOPIFY_API_SECRET`, compare
3. **Exchange code** — `POST https://{shop}/admin/oauth/access_token` with `client_id`, `client_secret`, `code`
4. **Upsert merchant** — find by `shopifyStoreName`:
   - **Existing merchant:** update `shopifyAccessToken` in place, issue a new JWT for the linked User
   - **New merchant:** create `Merchant` + `User` (email = `{shop}`, random password hash — merchant sets password via a reset flow later), issue JWT
5. **Register webhook** — `POST https://{shop}/admin/api/2024-01/webhooks.json` with topic `checkouts/create`, address `{APP_URL}/webhooks/shopify/{merchantId}`
6. **Redirect** — `302` to `{FRONTEND_URL}/install/success?token={jwt}&merchantId={merchantId}`

---

## Files

### New
- `src/shopify/shopify.service.ts` — nonce store, Shopify API calls (token exchange, webhook registration)
- `src/shopify/shopify.controller.ts` — `install` + `callback` handlers, redirect responses
- `src/shopify/shopify.module.ts` — wires controller + service, imports `MerchantsModule`

### Modified
- `src/app.module.ts` — imports `ShopifyModule`
- `backend/.env.example` — add `APP_URL` variable

---

## Environment Variables

| Variable | Example | Notes |
|----------|---------|-------|
| `SHOPIFY_API_KEY` | `abc123` | From Shopify Partner Dashboard |
| `SHOPIFY_API_SECRET` | `secret` | Used for HMAC and token exchange |
| `APP_URL` | `https://api.cartcloser.com` | Public URL of this backend (callback base) |
| `FRONTEND_URL` | `http://localhost:3001` | Already in app |

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Missing/invalid `shop` param | `400 Bad Request` |
| Invalid state nonce | `400 Bad Request` |
| Invalid HMAC | `403 Forbidden` |
| Shopify token exchange fails | `502 Bad Gateway` |
| Webhook registration fails | Log error, don't block — merchant is still installed |

---

## Constraints & Notes

- **State nonce storage:** In-memory `Map` — fine for a single container. When scaling horizontally, swap to Redis (already in docker-compose, not yet wired).
- **Re-install:** If merchant with same `shopifyStoreName` exists, update their `shopifyAccessToken` in place. No duplicate merchants created.
- **Webhook deduplication:** Shopify silently ignores duplicate webhook registrations for the same topic + address.
- **Shopify API version:** `2024-01` (stable). Pin the version; don't use `unstable`.
- **Scopes:** `read_checkouts,read_customers` — minimum required for abandoned cart recovery. Can expand later without re-OAuth if within the original scope set.
