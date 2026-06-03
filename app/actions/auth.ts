"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  authenticate,
  createSessionCookie,
  destroySession,
  hashPassword,
} from "@/lib/auth";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const SignUpSchema = z.object({
  email: z.string().email("Enter a valid email"),
  name: z.string().min(2, "Name is too short").max(60),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  intent: z.enum(["consumer", "provider", "both"]).default("both"),
});

const SignInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function signUpAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = SignUpSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    intent: formData.get("intent") ?? "both",
  });
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "An account with that email already exists." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const wantsProvider = parsed.data.intent !== "consumer";
  const wantsConsumer = parsed.data.intent !== "provider";

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash,
      consumerProfile: wantsConsumer ? { joinedAs: "consumer" } : undefined,
      providerProfile: wantsProvider
        ? { businessName: parsed.data.name, story: "", verified: false }
        : undefined,
    },
  });

  await createSessionCookie({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
  });

  // Provider-only signups land on the provider dashboard; everyone else gets
  // the consumer side as their default home.
  const next = parsed.data.intent === "provider" ? "/dashboard/provider" : "/dashboard/consumer";
  return { ok: true, data: { id: user.id, next } };
}

export async function signInAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrors(parsed.error) };
  }
  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    return { ok: false, error: "Invalid email or password." };
  }
  await createSessionCookie(user);
  return { ok: true, data: { id: user.id } };
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
