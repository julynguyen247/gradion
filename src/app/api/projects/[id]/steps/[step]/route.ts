import { NextRequest } from "next/server";
import { AppError, errorResponse } from "@/lib/server/errors";
import { requireUser, validationError } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";
import { parseStepSlug } from "@/lib/server/types";
import { styleSchema } from "@/lib/server/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; step: string }> },
) {
  try {
    const user = requireUser(request);
    const { id, step: slug } = await context.params;
    const step = parseStepSlug(slug);
    if (!step) throw new AppError("UNKNOWN_STEP", "Unknown pipeline step.", 404);
    const options = step === "STYLE"
      ? styleSchema.parse(await request.json().catch(() => ({})))
      : {};
    const result = await getRuntime().pipeline().runStep(user.id, id, step, options);
    return Response.json(result, { status: result.alreadyRunning ? 202 : 200 });
  } catch (error) {
    return errorResponse(validationError(error));
  }
}
