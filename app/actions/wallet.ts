"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { fundWallet, WalletError } from "@/lib/wallet";
import type { ActionResult } from "./auth";

const FundSchema = z.object({
  amount: z.coerce.number().positive().max(10_000),
});

/**
 * Demo top-up. In production this would create a Stripe PaymentIntent and only
 * credit the wallet on `payment_intent.succeeded` webhook.
 */
export async function fundWalletAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = FundSchema.safeParse({ amount: formData.get("amount") });
  if (!parsed.success) {
    return { ok: false, error: "Enter an amount between $1 and $10,000." };
  }
  try {
    const balance = await fundWallet(user.id, parsed.data.amount);
    revalidatePath("/dashboard/consumer");
    revalidatePath("/dashboard/provider");
    return { ok: true, data: { balance } };
  } catch (err) {
    if (err instanceof WalletError) return { ok: false, error: err.message };
    throw err;
  }
}
