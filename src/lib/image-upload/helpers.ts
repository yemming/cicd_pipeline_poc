import "server-only";

export function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
}

export function buildStoragePath(
  entity: string,
  brandId: string,
  entityId: string,
  mime: string,
): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${entity}/${brandId}/${entityId}/${ts}-${rand}.${extFromMime(mime)}`;
}

export function extractStoragePath(publicUrl: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return publicUrl.slice(idx + marker.length);
}
