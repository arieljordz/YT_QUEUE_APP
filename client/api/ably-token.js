// Vercel serverless function: hands a device a short-lived Ably token that can
// only use ONE channel, derived from the user's sync code. The Ably API key
// (ABLY_API_KEY env var) never leaves the server.
import { createHash } from "node:crypto";
import * as Ably from "ably";

/* global process */

const MIN_CODE_LENGTH = 8;
const TOKEN_TTL_MS = 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const code = req.headers["x-sync-code"];
  if (typeof code !== "string" || code.length < MIN_CODE_LENGTH) {
    return res.status(401).json({ error: "Missing or too short sync code" });
  }
  if (!process.env.ABLY_API_KEY) {
    return res.status(500).json({ error: "ABLY_API_KEY is not configured" });
  }

  // Only a hash of the code is used, so the code itself is never shared.
  const channel = `queue-${createHash("sha256").update(code).digest("hex").slice(0, 32)}`;

  try {
    const rest = new Ably.Rest({ key: process.env.ABLY_API_KEY });
    const tokenRequest = await rest.auth.createTokenRequest({
      capability: { [channel]: ["publish", "subscribe"] },
      ttl: TOKEN_TTL_MS,
    });
    return res.status(200).json({ channel, tokenRequest });
  } catch (error) {
    console.error("ably token failed", error);
    return res.status(500).json({ error: "Could not create a token" });
  }
}
