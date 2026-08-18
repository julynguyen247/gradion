import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; assetId: string }> },
) {
  try {
    const user = requireUser(request);
    const { id, assetId } = await context.params;
    const runtimeState = getRuntime();
    const asset = runtimeState.projects.getAsset(user.id, id, assetId);
    const body = await runtimeState.projects.readAsset(asset.path);
    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
