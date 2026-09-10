import { createHash } from "node:crypto";

const TOKEN_URL = "https://oauth.iracing.com/oauth2/token";
const DATA_BASE = "https://members-ng.iracing.com";

const required = (name: string): string => {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
};

/**
 * iRacing requires both client_secret and password to be SHA-256 hashed before
 * sending. Each is hashed with its corresponding identifier as salt, then Base64.
 */
function maskSecret(secret: string, identifier: string): string {
  return createHash("sha256")
    .update(`${secret}${identifier.trim().toLowerCase()}`, "utf8")
    .digest("base64");
}

/**
 * The @iracing-data/oauth-client only supports authorization-code flow (browser).
 * For CI / build-time use we perform iRacing's Password Limited grant directly.
 */
export async function authenticate(): Promise<string> {
  console.log("Authenticating with iRacing...");

  const clientId = required("IRACING_CLIENT_ID");
  const username = required("IRACING_USERNAME");

  const body = new URLSearchParams({
    grant_type: "password_limited",
    client_id: clientId,
    client_secret: maskSecret(required("IRACING_CLIENT_SECRET"), clientId),
    username,
    password: maskSecret(required("IRACING_PASSWORD"), username),
    scope: "iracing.auth",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Authentication failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string };
  console.log("Authenticated successfully.");
  return json.access_token;
}

/**
 * Fetch a /data endpoint. The iRacing API answers with `{ link, expires }` and
 * the real payload lives behind that (signed, short-lived) link.
 */
export async function fetchData<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { link?: string };
  if (!body.link) return body as T;

  const linked = await fetch(body.link);
  if (!linked.ok) throw new Error(`Failed to fetch data link for ${path}: ${linked.status}`);
  return linked.json() as Promise<T>;
}
