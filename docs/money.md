# Money flow

[← Back to README](../README.md) · [Architecture](./architecture.md) · [Configuration](./configuration.md)

## MVP wallet/ledger escrow flow

```
Consumer tops up wallet  ──► consumer balance ↑
Provider responds + schedules
Consumer CONFIRMs        ──► HOLD: consumer balance ↓ (escrow)
Provider COMMENCED → STARTED → DELIVERED
Consumer COMPLETEs       ──► RELEASE: provider balance ↑ (base)
                              FEE:     platform takes 7.5%
Anyone CANCELs/DROPs
  before COMPLETE        ──► REFUND: consumer balance ↑
```

## Core modules

- `lib/payments.ts` keeps **pure fee math** (`calculateFees`) so client components can render quotes safely.
- `lib/wallet.ts` is **server-only** and applies actual wallet + ledger side effects.

`lib/wallet.ts` exposes:

- `fundWallet(userId, amount)` — demo top-up (`TOPUP`) with amount validation.
- `holdForRequest({ requestId, consumerId, total })` — decrements consumer balance and writes `HOLD`.
- `releaseToProvider({ requestId, consumerId, providerId, base, platformFee })` — credits provider (`RELEASE`) and books platform fee (`FEE`).
- `refundConsumer({ requestId, consumerId })` — writes `REFUND` and returns held funds.

## Idempotency and safety

All money movements are mirrored as append-only `LedgerEntry` rows. The `(requestId, kind)` unique index
makes payment side effects idempotent: double-clicking Confirm/Complete cannot double-charge or double-pay.

## Fee policy

`PLATFORM_FEE_BPS = 750` (7.5%).

- `base = hourlyRate * max(hours, 1)`
- `platformFee = base * 7.5%`
- `total = base + platformFee`

All values are rounded to 2 decimals.

## Stripe readiness

The abstraction is intentionally swap-friendly. Replacing the bodies of
`holdForRequest`, `releaseToProvider`, `refundConsumer`, and `fundWallet` with
Stripe PaymentIntents/Transfers/Refund calls can be done without changing
callers across the app.

## Related docs

- System overview: [Architecture](./architecture.md)
- Runtime and env setup: [Configuration](./configuration.md)
- Local dev flow: [Development](./development.md)
