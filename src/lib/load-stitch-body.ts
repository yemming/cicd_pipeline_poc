import { promises as fs } from "fs";
import path from "path";

/**
 * Server-side loader for Stitch body HTML. Returns null if the file is missing,
 * so the calling page can render a graceful fallback instead of crashing.
 *
 * `dir` 是 public/ 下的子資料夾名（例：'stitch' / 'parts-stitch'）。
 */
export async function loadStitchBody(
  screenId: string,
  dir: string = "stitch",
): Promise<string | null> {
  const filePath = path.join(process.cwd(), "public", dir, `${screenId}.body.html`);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}
