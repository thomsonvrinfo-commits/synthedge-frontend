// /uploads — R2-backed file storage for trade screenshots (Milestone 3).
// See @synthedge/shared/uploads.ts for the key-naming/URL-building
// conventions and the documented public-read tradeoff.
import type { Env } from "@synthedge/shared";
import { jsonError, ulid, ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES, buildUploadKey, buildUploadUrl } from "@synthedge/shared";

interface AuthedUser {
  id: string;
  role: string;
}

function requireBucket(env: Env): Response | null {
  if (!env.BUCKET) {
    return jsonError("Uploads are not configured for this environment (missing R2 binding)", 503);
  }
  return null;
}

// -- POST /uploads ------------------------------------------------------
export async function postUpload(request: Request, env: Env, user: AuthedUser): Promise<Response> {
  const bucketError = requireBucket(env);
  if (bucketError) return bucketError;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Expected multipart/form-data with a 'file' field", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return jsonError("A 'file' field is required", 400);
  }

  const mimeType = file.type || "";
  if (!ALLOWED_UPLOAD_MIME_TYPES[mimeType]) {
    return jsonError(
      `Unsupported file type '${mimeType || "unknown"}'. Allowed: ${Object.keys(ALLOWED_UPLOAD_MIME_TYPES).join(", ")}`,
      415
    );
  }

  if (file.size === 0) return jsonError("File is empty", 400);
  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit`, 413);
  }

  const key = buildUploadKey(user.id, ulid(), mimeType);
  const bytes = await file.arrayBuffer();

  await env.BUCKET!.put(key, bytes, {
    httpMetadata: { contentType: mimeType },
  });

  const origin = new URL(request.url).origin;
  return Response.json({ file_url: buildUploadUrl(origin, key) }, { status: 201 });
}

// -- GET /uploads/:key ----------------------------------------------------
// Deliberately public (no requireUser) — see @synthedge/shared/uploads.ts.
// `key` here is everything after "/uploads/", i.e. "{userId}/{id}.{ext}".
export async function getUpload(env: Env, key: string): Promise<Response> {
  const bucketError = requireBucket(env);
  if (bucketError) return bucketError;

  if (!key || key.includes("..")) return jsonError("Not found", 404);

  const object = await env.BUCKET!.get(key);
  if (!object) return jsonError("Not found", 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Access-Control-Allow-Origin", "*");

  return new Response(object.body, { headers });
}
