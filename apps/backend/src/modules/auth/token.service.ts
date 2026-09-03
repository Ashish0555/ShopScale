import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedUser } from "./auth.types.js";

const accessTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["CUSTOMER", "ADMIN"]),
  type: z.literal("access"),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().uuid()
});

type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

export type TokenServiceOptions = {
  accessSecret: string;
  refreshSecret: string;
  accessTokenTtlSeconds?: number;
  refreshTokenTtlDays?: number;
};

export class JwtTokenService {
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlDays: number;

  constructor(private readonly options: TokenServiceOptions) {
    this.accessTokenTtlSeconds = options.accessTokenTtlSeconds ?? 15 * 60;
    this.refreshTokenTtlDays = options.refreshTokenTtlDays ?? 30;
  }

  get accessTokenExpiresInSeconds(): number {
    return this.accessTokenTtlSeconds;
  }

  signAccessToken(user: AuthenticatedUser): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: "access",
      iat: now,
      exp: now + this.accessTokenTtlSeconds,
      jti: randomUUID()
    };

    return this.sign(payload);
  }

  verifyAccessToken(token: string): AuthenticatedUser {
    const payload = this.verify(token);

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role
    };
  }

  generateRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt
    };
  }

  hashRefreshToken(token: string): string {
    return createHmac("sha256", this.options.refreshSecret).update(token).digest("base64url");
  }

  private sign(payload: AccessTokenPayload): string {
    const header = { alg: "HS256", typ: "JWT" };
    const encodedHeader = encodeJson(header);
    const encodedPayload = encodeJson(payload);
    const signature = this.signature(`${encodedHeader}.${encodedPayload}`);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private verify(token: string): AccessTokenPayload {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error("Malformed token");
    }

    const expectedSignature = Buffer.from(this.signature(`${encodedHeader}.${encodedPayload}`), "base64url");
    const actualSignature = Buffer.from(encodedSignature, "base64url");

    if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
      throw new Error("Invalid token signature");
    }

    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as unknown;
    const parsedHeader = z.object({ alg: z.literal("HS256"), typ: z.literal("JWT") }).safeParse(header);

    if (!parsedHeader.success) {
      throw new Error("Invalid token header");
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    const parsedPayload = accessTokenPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new Error("Invalid token payload");
    }

    if (parsedPayload.data.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error("Expired token");
    }

    return parsedPayload.data;
  }

  private signature(message: string): string {
    return createHmac("sha256", this.options.accessSecret).update(message).digest("base64url");
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
