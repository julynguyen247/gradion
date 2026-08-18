import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { currentUser, validationError } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";
import { identitySchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return NextResponse.json({ user: currentUser(request) });
}

export async function POST(request: NextRequest) {
  try {
    const identity = identitySchema.parse(await request.json());
    const session = getRuntime().sessions.createIdentity(identity.name, identity.email);
    const response = NextResponse.json({ user: session.user });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    return errorResponse(validationError(error));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    getRuntime().sessions.deleteSession(token);
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
