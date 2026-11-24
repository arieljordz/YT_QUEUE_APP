// Vercel serverless function: the admin password and admin sign-in.
//   POST { action: "status" }                          -> { configured, signedIn, usesFlagsPassword }
//   POST { action: "setup", password }                 -> first time only; signs in
//   POST { action: "login", password }                 -> signs in (sets the HttpOnly admin cookie)
//   POST { action: "change", password, newPassword }   -> signs out every other admin device
//   POST { action: "logout" }
import {
  ADMIN_COOKIE,
  adminCookie,
  adminStatus,
  changeAdminPassword,
  getAdminCollections,
  loginAdmin,
  logoutAdmin,
  setupAdmin,
} from "./_admin.js";
import { clientIp, readCookie } from "./_session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const cols = await getAdminCollections();
    const token = readCookie(req, ADMIN_COOKIE);
    const { action, password, newPassword } = req.body ?? {};
    const ip = clientIp(req);

    let result;
    if (action === "status") result = { status: 200, body: await adminStatus(cols, token) };
    else if (action === "setup") result = await setupAdmin(cols, { password, ip });
    else if (action === "login") result = await loginAdmin(cols, { password, ip });
    else if (action === "change") result = await changeAdminPassword(cols, { token, password, newPassword, ip });
    else if (action === "logout") {
      await logoutAdmin(cols, token);
      res.setHeader("Set-Cookie", adminCookie("", 0));
      return res.status(200).json({ signedIn: false });
    } else return res.status(400).json({ error: "Unknown action" });

    if (result.token) res.setHeader("Set-Cookie", adminCookie(result.token));
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("admin request failed", error);
    return res.status(500).json({ error: "Could not reach the database" });
  }
}
