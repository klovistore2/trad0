// Every public address is built from the deployment origin: a sitemap or an alternate link with
// the wrong host is worse than none. Falls back to localhost so a local build still works.
export const siteUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");

export const absolute = (path: string) => new URL(path, `${siteUrl()}/`).toString();
