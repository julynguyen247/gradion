import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SqliteDatabase } from "./database";
import type { UserDTO } from "./types";

export const SESSION_COOKIE = "gradion_session";

interface UserRow {
  id: string;
  name: string;
  email: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class SessionStore {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly ttlMs: number,
  ) {}

  createIdentity(name: string, email: string): { user: UserDTO; token: string; expiresAt: Date } {
    const now = Date.now();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    const upsert = this.database.transaction(() => {
      const existing = this.database
        .prepare("SELECT id, name, email FROM users WHERE email = ?")
        .get(normalizedEmail) as UserRow | undefined;

      const user: UserRow = existing
        ? { ...existing, name: normalizedName }
        : { id: randomUUID(), name: normalizedName, email: normalizedEmail };

      if (existing) {
        this.database
          .prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?")
          .run(normalizedName, now, user.id);
      } else {
        this.database
          .prepare(
            "INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          )
          .run(user.id, user.email, user.name, now, now);
      }

      const token = randomBytes(32).toString("base64url");
      const expiresAt = now + this.ttlMs;
      this.database
        .prepare(
          "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(hashToken(token), user.id, expiresAt, now);

      return { user, token, expiresAt: new Date(expiresAt) };
    });

    return upsert();
  }

  getUser(token: string | undefined): UserDTO | null {
    if (!token) return null;
    const now = Date.now();
    const row = this.database
      .prepare(
        `SELECT users.id, users.name, users.email
         FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      )
      .get(hashToken(token), now) as UserRow | undefined;
    return row ?? null;
  }

  deleteSession(token: string | undefined): void {
    if (!token) return;
    this.database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }
}
