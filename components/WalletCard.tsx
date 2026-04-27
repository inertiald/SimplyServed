"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Wallet } from "lucide-react";
import { fundWalletAction } from "@/app/actions/wallet";
import type { ActionResult } from "@/app/actions/auth";

export interface WalletCardEntry {
  id: string;
  kind: string;
  amount: number;
  memo: string | null;
  createdAt: string | Date;
}

const KIND_LABEL: Record<string, string> = {
  TOPUP: "Top-up",
  HOLD: "Held in escrow",
  RELEASE: "Payout received",
  FEE: "Platform fee",
  REFUND: "Refunded",
  ADJUSTMENT: "Adjustment",
};

export function WalletCard({
  consumerBalance,
  providerBalance,
  recent,
  showProvider = false,
}: {
  consumerBalance: number;
  providerBalance: number;
  recent: WalletCardEntry[];
  showProvider?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    fundWalletAction,
    undefined,
  );

  return (
    <section className="ss-card p-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-white">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/30 to-teal-500/30 text-emerald-200">
            <Wallet size={14} />
          </span>
          <span className="font-semibold">Wallet</span>
          <span className="ss-chip text-[10px]">demo</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ss-btn-ghost text-xs"
        >
          <Plus size={12} /> Add funds
        </button>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Balance label="Spend" amount={consumerBalance} accent="text-white" />
        {showProvider && (
          <Balance label="Earnings" amount={providerBalance} accent="text-emerald-300" />
        )}
      </div>

      {open && (
        <form action={action} className="mt-4 flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="wallet-amount" className="ss-label">
              Add funds (USD)
            </label>
            <input
              id="wallet-amount"
              name="amount"
              type="number"
              min={1}
              max={10000}
              step="0.01"
              defaultValue={50}
              required
              className="ss-input"
            />
          </div>
          <button type="submit" disabled={pending} className="ss-btn-primary">
            {pending && <Loader2 size={14} className="animate-spin" />}
            Top up
          </button>
        </form>
      )}

      {state && !state.ok && (
        <p className="mt-2 text-sm text-rose-300">{state.error}</p>
      )}

      {recent.length > 0 && (
        <ul className="mt-4 divide-y divide-white/5 border-t border-white/5">
          {recent.map((e) => {
            const positive = e.amount >= 0;
            return (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate text-white/80">
                    {e.memo ?? KIND_LABEL[e.kind] ?? e.kind}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-white/40">
                    {KIND_LABEL[e.kind] ?? e.kind} ·{" "}
                    {new Date(e.createdAt).toLocaleString()}
                  </div>
                </div>
                <div
                  className={
                    positive
                      ? "font-semibold text-emerald-300"
                      : "font-semibold text-rose-300"
                  }
                >
                  {positive ? "+" : "−"}${Math.abs(e.amount).toFixed(2)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Balance({
  label,
  amount,
  accent,
}: {
  label: string;
  amount: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/50">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-semibold ${accent}`}>
        ${amount.toFixed(2)}
      </div>
    </div>
  );
}
