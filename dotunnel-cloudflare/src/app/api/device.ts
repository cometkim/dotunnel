import {
  createDeviceCode,
  pollDeviceCode,
  revokeCliTokenByToken,
  validateCliToken,
} from "#app/auth/device-flow.ts";

// =============================================================================
// JSON Response Helpers
// =============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(
  error: string,
  description: string,
  status = 400,
): Response {
  return jsonResponse({ error, error_description: description }, status);
}

// =============================================================================
// POST /_api/device/code - Request device code
// =============================================================================

export async function handleDeviceCodeRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("invalid_request", "Method not allowed", 405);
  }

  const contentType = request.headers.get("Content-Type") || "";

  let clientId: string | undefined;
  let scope: string | undefined;

  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as {
        client_id?: string;
        scope?: string;
      };
      clientId = body.client_id;
      scope = body.scope;
    } catch {
      return errorResponse("invalid_request", "Invalid JSON body");
    }
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    clientId = params.get("client_id") || undefined;
    scope = params.get("scope") || undefined;
  } else {
    return errorResponse(
      "invalid_request",
      "Content-Type must be application/json or application/x-www-form-urlencoded",
    );
  }

  if (!clientId) {
    return errorResponse("invalid_request", "client_id is required");
  }

  try {
    // Extract base URL from request
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    const response = await createDeviceCode(clientId, baseUrl, scope);
    return jsonResponse(response);
  } catch (err) {
    console.error("Device code creation failed:", err);
    return errorResponse("server_error", "Failed to create device code", 500);
  }
}

// =============================================================================
// POST /_api/device/token - Poll for token
// =============================================================================

export async function handleDeviceTokenRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("invalid_request", "Method not allowed", 405);
  }

  const contentType = request.headers.get("Content-Type") || "";

  let grantType: string | undefined;
  let deviceCode: string | undefined;
  let clientId: string | undefined;

  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as {
        grant_type?: string;
        device_code?: string;
        client_id?: string;
      };
      grantType = body.grant_type;
      deviceCode = body.device_code;
      clientId = body.client_id;
    } catch {
      return errorResponse("invalid_request", "Invalid JSON body");
    }
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    grantType = params.get("grant_type") || undefined;
    deviceCode = params.get("device_code") || undefined;
    clientId = params.get("client_id") || undefined;
  } else {
    return errorResponse(
      "invalid_request",
      "Content-Type must be application/json or application/x-www-form-urlencoded",
    );
  }

  if (grantType !== "urn:ietf:params:oauth:grant-type:device_code") {
    return errorResponse(
      "unsupported_grant_type",
      "grant_type must be urn:ietf:params:oauth:grant-type:device_code",
    );
  }

  if (!deviceCode) {
    return errorResponse("invalid_request", "device_code is required");
  }

  if (!clientId) {
    return errorResponse("invalid_request", "client_id is required");
  }

  try {
    const result = await pollDeviceCode(deviceCode, clientId);

    if ("error" in result) {
      // Map error to appropriate HTTP status
      const status =
        result.error === "authorization_pending" || result.error === "slow_down"
          ? 400
          : 400;
      return jsonResponse(result, status);
    }

    return jsonResponse(result);
  } catch (err) {
    console.error("Token polling failed:", err);
    return errorResponse("server_error", "Failed to poll for token", 500);
  }
}

// =============================================================================
// GET /_api/user - Get current user info (for CLI)
// =============================================================================

export async function handleUserInfoRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("invalid_request", "Method not allowed", 405);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(
      "invalid_token",
      "Missing or invalid Authorization header",
      401,
    );
  }

  const token = authHeader.slice(7);
  const user = await validateCliToken(token);

  if (!user) {
    return errorResponse("invalid_token", "Invalid or expired token", 401);
  }

  return jsonResponse({
    id: user.publicId,
    name: user.name,
    email: user.email,
    email_verified: user.emailVerified,
    image: user.image,
  });
}

// =============================================================================
// POST /_api/logout - Revoke CLI token
// =============================================================================

export async function handleCliLogoutRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("invalid_request", "Method not allowed", 405);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(
      "invalid_token",
      "Missing or invalid Authorization header",
      401,
    );
  }

  const token = authHeader.slice(7);
  const revoked = await revokeCliTokenByToken(token);

  if (!revoked) {
    return errorResponse(
      "invalid_token",
      "Token not found or already revoked",
      400,
    );
  }

  return jsonResponse({ success: true });
}
