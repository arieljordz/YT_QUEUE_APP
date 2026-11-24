// The admin password (manages rooms, changes feature flags). The server keeps
// the admin session in an HttpOnly cookie; the password is never stored here.
async function post(body) {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

/** { configured, signedIn, usesFlagsPassword } */
export async function getAdminStatus() {
  const result = await post({ action: "status" });
  if (!result.ok) throw new Error(result.data.error ?? "Could not check the admin sign-in");
  return result.data;
}

export const setupAdmin = (password) => post({ action: "setup", password });
export const loginAdmin = (password) => post({ action: "login", password });
export const changeAdminPassword = (password, newPassword) => post({ action: "change", password, newPassword });
export const logoutAdmin = () => post({ action: "logout" }).catch(() => {});
