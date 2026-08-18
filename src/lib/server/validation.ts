import { z } from "zod";

export const identitySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254),
});

export const styleSchema = z.object({
  style: z.string().trim().max(1_000).optional(),
});

export const MAX_BOOK_BYTES = 2 * 1024 * 1024;

export function validateProjectInput(titleValue: FormDataEntryValue | null, text: string) {
  const title = z.string().trim().min(1, "Title is required.").max(200).parse(titleValue);
  const normalizedText = text.replace(/^\uFEFF/, "").trim();
  if (!normalizedText) throw new z.ZodError([{ code: "custom", path: ["text"], message: "Book text is required.", input: text }]);
  if (Buffer.byteLength(normalizedText, "utf8") > MAX_BOOK_BYTES) {
    throw new z.ZodError([{ code: "custom", path: ["text"], message: "Book text must be 2 MB or smaller.", input: text }]);
  }
  return { title, text: normalizedText };
}
