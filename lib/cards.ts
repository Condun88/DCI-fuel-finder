// Shared definitions: which DCI card maps to which column in a StationRow,
// and what counts as "no premium". Import these rather than redefining them.

export const CARDS = [
  { key: "dciOne", label: "DCI One / Radius One", col: 11 },
  { key: "dci", label: "DCI", col: 10 },
  { key: "mainRoute", label: "DCI Main Route", col: 12 },
] as const;

export type CardKey = (typeof CARDS)[number]["key"];

/** "ok" = no premium charge (Core site); "premium" = Non-Core site; null = card not accepted there. */
export function siteStatus(network: string): "ok" | "premium" | null {
  if (network === "CORE") return "ok";
  if (network === "NON-CORE") return "premium";
  return null;
}

/** Straight-line distance in km (haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
