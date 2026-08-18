import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";

export class ProjectFiles {
  constructor(private readonly root: string) {}

  private projectDirectory(userId: string, projectId: string): string {
    return path.join(this.root, "users", userId, "projects", projectId);
  }

  async saveBook(userId: string, projectId: string, text: string): Promise<string> {
    const directory = this.projectDirectory(userId, projectId);
    await fs.mkdir(directory, { recursive: true });
    const destination = path.join(directory, "book.txt");
    await fs.writeFile(destination, text, { encoding: "utf8", flag: "wx" });
    return destination;
  }

  async saveImage(
    userId: string,
    projectId: string,
    kind: "portraits" | "illustrations",
    assetId: string,
    data: Uint8Array,
    mimeType: string,
  ): Promise<string> {
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const directory = path.join(this.projectDirectory(userId, projectId), kind);
    await fs.mkdir(directory, { recursive: true });
    const destination = path.join(
      /* turbopackIgnore: true */ directory,
      `${assetId}.${extension}`,
    );
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporary, data, { flag: "wx" });
    await fs.rename(temporary, destination);
    return destination;
  }

  async readBook(filePath: string): Promise<string> {
    return fs.readFile(this.assertInsideRoot(filePath), "utf8");
  }

  async readAsset(filePath: string): Promise<Uint8Array> {
    return fs.readFile(this.assertInsideRoot(filePath));
  }

  private assertInsideRoot(filePath: string): string {
    const root = path.resolve(this.root);
    const resolved = path.resolve(filePath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new AppError("INVALID_ASSET_PATH", "Asset path is invalid.", 500);
    }
    return resolved;
  }
}
