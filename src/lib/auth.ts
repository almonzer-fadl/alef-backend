/**
 * Authentication Utilities
 *
 * Handles JWT token creation/verification and password hashing.
 * Uses bcryptjs for passwords (12 rounds) and jsonwebtoken for JWTs.
 *
 * Token strategy: Single long-lived token (30 days) for simplicity.
 * In production, this should be split into:
 *   - Short-lived access token (15 min)
 *   - Long-lived refresh token (30 days, stored in DB, rotatable)
 *
 * TODO: Implement refresh token rotation for better security.
 */

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "alef-dev-secret-change-in-prod";
const TOKEN_EXPIRY = "30d";

/** Hash a plaintext password. Uses 12 salt rounds (good balance of speed + security). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Compare a plaintext password against a bcrypt hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Create a signed JWT containing the user's ID. */
export function createToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/** Verify and decode a JWT. Returns null if invalid or expired. */
export function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
  } catch {
    return null;
  }
}
