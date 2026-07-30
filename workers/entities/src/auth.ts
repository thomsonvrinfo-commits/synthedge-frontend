import type { Env } from "@synthedge/shared";
import {
  extractBearerToken,
  verifyAccessToken,
} from "@synthedge/shared";

export async function requireUser(
  request: Request,
  env: Env
) {
  const token = extractBearerToken(request);

  if (!token) {
    return null;
  }

  const result = await verifyAccessToken(
    token,
    env.JWT_SECRET
  );

  if (!result.valid || !result.payload) {
    return null;
  }

  return {
    id: result.payload.sub,
    role: result.payload.role,
  };
}