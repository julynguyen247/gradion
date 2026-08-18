import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    return Response.json({ project: await getRuntime().projects.getDetail(user.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
