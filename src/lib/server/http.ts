import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { SESSION_COOKIE } from "./auth";
import { AppError, unauthorized } from "./errors";
import { getRuntime } from "./runtime";
import type { UserDTO } from "./types";

export function currentUser(request: NextRequest): UserDTO | null {
  return getRuntime().sessions.getUser(request.cookies.get(SESSION_COOKIE)?.value);
}

export function requireUser(request: NextRequest): UserDTO {
  const user = currentUser(request);
  if (!user) throw unauthorized();
  return user;
}

export function validationError(error: unknown): unknown {
  if (error instanceof ZodError) {
    return new AppError(
      "VALIDATION_ERROR",
      error.issues[0]?.message ?? "Invalid request.",
      400,
    );
  }
  if (error instanceof SyntaxError) {
    return new AppError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
  return error;
}
