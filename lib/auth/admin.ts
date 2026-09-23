// ADMIN_MAIL: comma-separated addresses; an entry starting with "@" covers a whole domain.
// Server side only: an address is never sent to the browser.
export function isAdmin(email: unknown) {
  if (typeof email !== "string") return false;
  const address = email.trim().toLowerCase();
  return (process.env.ADMIN_MAIL ?? "").split(",").map(entry => entry.trim().toLowerCase()).filter(Boolean)
    .some(entry => entry.startsWith("@") ? address.endsWith(entry) : address === entry);
}
