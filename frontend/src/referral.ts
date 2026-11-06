/** Remember an invite code from ?ref= (on any page) so it survives until sign-up. Per-browser convenience only. */
export function captureRef() {
  try { const r = new URLSearchParams(location.search).get("ref"); if (r && /^[0-9a-f]{10}$/.test(r)) localStorage.setItem("cu_ref", r); } catch { /* storage blocked */ }
}
export function getRef(): string | undefined {
  try { return localStorage.getItem("cu_ref") ?? undefined; } catch { return undefined; }
}
