const JSON_HEADERS = { "Content-Type": "application/json" };

export function authorizePublicHook(request: Request) {
  const expected = process.env.CRON_HOOK_SECRET;
  if (!expected) {
    return new Response(JSON.stringify({ error: "CRON_HOOK_SECRET missing" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const authorization = request.headers.get("authorization");
  const token =
    bearerToken(authorization) ?? request.headers.get("x-api-key") ?? request.headers.get("apikey");

  if (token !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  return null;
}

function bearerToken(value: string | null) {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
