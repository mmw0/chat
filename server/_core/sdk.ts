import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = {
  openId: string;
  name: string;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

class NativeSessionService {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async createSessionToken(openId: string, options: { expiresInMs?: number; name?: string } = {}): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    return new SignJWT({ openId, name: options.name || openId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(Math.floor(issuedAt / 1000))
      .setExpirationTime(Math.floor((issuedAt + expiresInMs) / 1000))
      .sign(this.getSessionSecret());
  }

  async verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.getSessionSecret(), { algorithms: ["HS256"] });
      const { openId, name } = payload as Record<string, unknown>;
      return isNonEmptyString(openId) && isNonEmptyString(name) ? { openId, name } : null;
    } catch {
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    let token = cookies.get(COOKIE_NAME);
    if (!token) {
      const authorization = req.headers.authorization;
      if (typeof authorization === "string" && authorization.startsWith("Bearer ")) token = authorization.slice(7);
    }
    const session = await this.verifySession(token);
    if (!session) throw ForbiddenError("Invalid session cookie");

    const user = await db.getUserByOpenId(session.openId);
    if (!user || !user.passwordHash) throw ForbiddenError("User not found");
    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    return user;
  }
}

export type AuthenticatedUser = User;
export const sdk = new NativeSessionService();
