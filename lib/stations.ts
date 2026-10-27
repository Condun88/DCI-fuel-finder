import snapshot from "@/data/snapshot.json";

/**
 * One station, as a compact tuple to keep the payload small:
 * [id, name, brand, lat, lng, address, town, county, postcode, region,
 *  networkDCI, networkDCIOne, networkMainRoute, facilities, hours]
 * region: "NI" | "IE". network: "CORE" (no premium) | "NON-CORE" (premium) | "-" / "" (not on that card).
 */
export type StationRow = [
  number, string, string, number, number, string, string, string, string | null,
  "NI" | "IE", string, string, string, string, string,
];

export type StationData = {
  asOf: string; // ISO date the data was pulled
  source: "live" | "snapshot";
  sites: StationRow[];
};

// e-route directory numbers for each DCI card (from the e-route cards list).
const DIRECTORIES = { dci: 60, dciOne: 61, mainRoute: 62 } as const;
const API = "https://api.erouteonline.com/v1/fuel/sites/";

type ERouteSite = {
  number: number;
  name: string;
  latitude: number;
  longitude: number;
  address_line_1: string | null;
  address_line_2: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  opening_time_1: string | null;
  opening_time_2: string | null;
  opening_time_3: string | null;
  site_brand: { name: string } | null;
  country: { iso_3166: string };
  facilities: { name: string }[];
  site_links: { network: { code: string } | null; directory: { number: number } }[];
};

async function fetchDirectory(dir: number): Promise<ERouteSite[]> {
  const res = await fetch(`${API}?limit=10000&directory=${dir}`, {
    headers: { Accept: "application/json", "User-Agent": "Bathshack-DCI-Fuel-Finder/1.0" },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`e-route returned ${res.status} for directory ${dir}`);
  const json = (await res.json()) as { results?: ERouteSite[] };
  if (!Array.isArray(json.results)) throw new Error("Unexpected e-route response");
  return json.results;
}

// Island of Ireland only: e-route lists a couple of DCI sites in Great Britain.
function onIsland(lat: number, lng: number) {
  return lat > 51.3 && lat < 55.5 && lng > -10.8 && lng < -5.3;
}

export async function fetchLiveStations(): Promise<StationData> {
  const lists = await Promise.all(Object.values(DIRECTORIES).map(fetchDirectory));
  const byId = new Map<number, ERouteSite>();
  for (const list of lists) for (const s of list) byId.set(s.number, s);

  const net = (s: ERouteSite, dir: number) => {
    const link = s.site_links.find((l) => l.directory?.number === dir);
    if (!link) return "";
    return link.network?.code ?? "-";
  };

  const sites: StationRow[] = [];
  for (const s of byId.values()) {
    const iso = s.country?.iso_3166;
    if (iso !== "IE" && iso !== "GB") continue;
    if (typeof s.latitude !== "number" || typeof s.longitude !== "number") continue;
    if (!onIsland(s.latitude, s.longitude)) continue;
    sites.push([
      s.number,
      s.name ?? "",
      s.site_brand?.name ?? "",
      Number(s.latitude.toFixed(5)),
      Number(s.longitude.toFixed(5)),
      [s.address_line_1, s.address_line_2].filter(Boolean).join(", "),
      s.town ?? "",
      s.county ?? "",
      s.postcode ?? null,
      iso === "GB" ? "NI" : "IE",
      net(s, DIRECTORIES.dci),
      net(s, DIRECTORIES.dciOne),
      net(s, DIRECTORIES.mainRoute),
      (s.facilities ?? []).map((f) => f.name).join("|"),
      [s.opening_time_1, s.opening_time_2, s.opening_time_3].filter(Boolean).join("; "),
    ]);
  }

  // Sanity check: a near-empty pull means something changed upstream; don't trust it.
  if (sites.length < 1000) throw new Error(`Only ${sites.length} sites returned; expected ~1,900`);

  return { asOf: new Date().toISOString(), source: "live", sites };
}

export function snapshotStations(): StationData {
  return {
    asOf: (snapshot as { asOf: string }).asOf,
    source: "snapshot",
    sites: (snapshot as unknown as { sites: StationRow[] }).sites,
  };
}
