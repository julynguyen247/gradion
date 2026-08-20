import { NextRequest } from "next/server";
import { AppError, errorResponse } from "@/lib/server/errors";
import { requireUser, validationError } from "@/lib/server/http";
import { getRuntime } from "@/lib/server/runtime";
import { MAX_BOOK_BYTES, validateProjectInput } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request);
    return Response.json({ projects: getRuntime().projects.list(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireUser(request);
    const formData = await request.formData();
    const pasted = typeof formData.get("text") === "string" ? String(formData.get("text")) : "";
    const uploaded = formData.get("file");
    const hasFile = uploaded instanceof File && uploaded.size > 0;
    if (pasted.trim() && hasFile) {
      throw new AppError("AMBIGUOUS_BOOK_SOURCE", "Use either pasted text or a .txt file, not both.", 400);
    }

    let text = pasted;
    if (hasFile) {
      if (!uploaded.name.toLowerCase().endsWith(".txt")) {
        throw new AppError("INVALID_FILE_TYPE", "Book upload must be a .txt file.", 400);
      }
      if (uploaded.type && uploaded.type.toLowerCase() !== "text/plain") {
        throw new AppError("INVALID_FILE_TYPE", "Book upload must be plain text.", 400);
      }
      if (uploaded.size > MAX_BOOK_BYTES) {
        throw new AppError("BOOK_TOO_LARGE", "Book text must be 2 MB or smaller.", 413);
      }
      text = await uploaded.text();
    }

    const input = validateProjectInput(formData.get("title"), text);
    const project = await getRuntime().projects.create(user.id, input.title, input.text);
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return errorResponse(validationError(error));
  }
}
