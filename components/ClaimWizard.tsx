"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { startClaimAction, submitVerificationAction } from "@/app/actions/claims";
import type { ActionResult } from "@/app/actions/auth";

type Method = "EMAIL_DOMAIN" | "PHONE_OTP" | "DOC_UPLOAD";

export interface ClaimWizardProps {
  profileId: string;
  profileSlug: string;
  hasWebsite: boolean;
  hasPhone: boolean;
  userEmailMatchesDomain: boolean;
}

export function ClaimWizard(props: ClaimWizardProps) {
  const router = useRouter();
  const [method, setMethod] = useState<Method | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);

  const [startState, startAction, startPending] = useActionState<
    ActionResult | undefined,
    FormData
  >(async (_prev, fd) => {
    const result = await startClaimAction(_prev, fd);
    if (result.ok) {
      setClaimId((result.data as { claimId: string }).claimId);
    }
    return result;
  }, undefined);

  const [submitState, submitAction, submitPending] = useActionState<
    ActionResult | undefined,
    FormData
  >(async (_prev, fd) => {
    const result = await submitVerificationAction(_prev, fd);
    if (result.ok) {
      router.push(`/businesses/${props.profileSlug}`);
      router.refresh();
    }
    return result;
  }, undefined);

  return (
    <div className="flex flex-col gap-4">
      <section className="ss-card p-5">
        <h2 id="claim-method-heading" className="text-base font-semibold text-white">1. Pick a verification method</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm" role="radiogroup" aria-labelledby="claim-method-heading">
          <MethodOption
            id="EMAIL_DOMAIN"
            label="Email at the business domain"
            disabled={!props.hasWebsite || !props.userEmailMatchesDomain}
            help={
              !props.hasWebsite
                ? "No website on record."
                : !props.userEmailMatchesDomain
                ? "Sign in with a matching email."
                : "We'll send a code to your account email."
            }
            selected={method === "EMAIL_DOMAIN"}
            onSelect={() => setMethod("EMAIL_DOMAIN")}
          />
          <MethodOption
            id="PHONE_OTP"
            label="Phone call / SMS to the business number"
            disabled={!props.hasPhone}
            help={
              props.hasPhone ? "We'll send a code to the listed phone." : "No phone on record."
            }
            selected={method === "PHONE_OTP"}
            onSelect={() => setMethod("PHONE_OTP")}
          />
          <MethodOption
            id="DOC_UPLOAD"
            label="Upload a business license"
            help="Reviewed manually within 1 business day."
            selected={method === "DOC_UPLOAD"}
            onSelect={() => setMethod("DOC_UPLOAD")}
          />
        </div>
      </section>

      {method && !claimId && (
        <form action={startAction} className="ss-card flex flex-col gap-3 p-5">
          <input type="hidden" name="profileId" value={props.profileId} />
          <input type="hidden" name="method" value={method} />
          <h2 className="text-base font-semibold text-white">2. Start verification</h2>
          <p className="text-xs text-white/60">
            We&apos;ll generate a one-time code (or queue your upload for admin
            review). Codes expire in 15 minutes.
          </p>
          {startState && !startState.ok && (
            <p role="alert" className="text-sm text-rose-300">{startState.error}</p>
          )}
          <button type="submit" disabled={startPending} className="ss-btn-primary">
            {startPending && <Loader2 size={14} className="animate-spin" />}
            Send code
          </button>
        </form>
      )}

      {claimId && method !== "DOC_UPLOAD" && (
        <form action={submitAction} className="ss-card flex flex-col gap-3 p-5">
          <input type="hidden" name="claimId" value={claimId} />
          <h2 className="text-base font-semibold text-white">3. Enter the code</h2>
          <label className="ss-label" htmlFor="claim-otp">Verification code</label>
          <input
            id="claim-otp"
            name="code"
            inputMode="numeric"
            placeholder="6-digit code"
            className="ss-input"
            autoComplete="one-time-code"
            required
            aria-invalid={Boolean(submitState && !submitState.ok)}
            aria-describedby={submitState && !submitState.ok ? "claim-submit-error" : undefined}
          />
          {submitState && !submitState.ok && (
            <p id="claim-submit-error" role="alert" className="text-sm text-rose-300">{submitState.error}</p>
          )}
          <button type="submit" disabled={submitPending} className="ss-btn-primary">
            {submitPending && <Loader2 size={14} className="animate-spin" />}
            Verify &amp; claim
          </button>
        </form>
      )}

      {claimId && method === "DOC_UPLOAD" && (
        <form action={submitAction} className="ss-card flex flex-col gap-3 p-5">
          <input type="hidden" name="claimId" value={claimId} />
          <h2 className="text-base font-semibold text-white">3. Upload your document</h2>
          <p className="text-xs text-white/60">
            Paste a URL to a publicly-accessible document (business license,
            utility bill, EIN letter). An admin will review.
          </p>
          <label className="ss-label" htmlFor="claim-doc-url">Document URL</label>
          <input
            id="claim-doc-url"
            name="docUrl"
            type="url"
            placeholder="https://…"
            className="ss-input"
            required
            aria-invalid={Boolean(submitState && !submitState.ok)}
            aria-describedby={submitState && !submitState.ok ? "claim-submit-error" : undefined}
          />
          {submitState && !submitState.ok && (
            <p id="claim-submit-error" role="alert" className="text-sm text-rose-300">{submitState.error}</p>
          )}
          <button type="submit" disabled={submitPending} className="ss-btn-primary">
            {submitPending && <Loader2 size={14} className="animate-spin" />}
            Submit for review
          </button>
        </form>
      )}
    </div>
  );
}

function MethodOption({
  label,
  help,
  selected,
  disabled,
  onSelect,
}: {
  id: Method;
  label: string;
  help?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
        selected
          ? "border-indigo-400 bg-indigo-500/10 text-white"
          : "border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.06]"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span className="font-medium">{label}</span>
      {help && <span className="text-xs text-white/50">{help}</span>}
    </button>
  );
}
