import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

const COOKIE_NAME = "ss_session";
const SESSION_DAYS = 30;

function getSecret(): Uint8Array {
  const raw =
    process.env.AUTH_SECRET ??
    "dev-only-insecure-secret-change-me-in-production-please-aaaaaaaa";
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET environment variable is required in production");
  }
  return new TextEncoder().encode(raw);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
}

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionCookie(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
  } satisfies JwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const p = payload as unknown as JwtPayload;
    if (!p.sub) return null;
    return {
      id: p.sub,
      email: p.email,
      name: p.name,
      role: p.role,
      avatarUrl: p.avatarUrl,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function authenticate(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
  };
}
