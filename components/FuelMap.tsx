"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { StationData, StationRow } from "@/lib/stations";
import { CARDS, CardKey, distanceKm, siteStatus } from "@/lib/cards";

type Region = "ALL" | "NI" | "IE";
type Nearest = { row: StationRow; km: number };
type GeoState =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "error"; message: string }
  | { kind: "done"; lat: number; lng: number; accuracy: number; list: Nearest[] };

const IRELAND: L.LatLngBoundsExpression = [[51.4, -10.6], [55.45, -5.4]];
const NEAREST_COUNT = 5;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
const directionsUrl = (r: StationRow) => `https://www.google.com/maps/dir/?api=1&destination=${r[3]},${r[4]}`;
const fmtDist = (km: number) => {
  const mi = km * 0.621371;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi · ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
};
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* private mode etc. */ }
}

function popupHtml(r: StationRow, status: "ok" | "premium", km?: number) {
  const addr = [r[5], r[6], r[7]].filter(Boolean).map((x) => titleCase(String(x))).concat(r[8] ? [r[8]] : []).join(", ");
  const fac = r[13] ? r[13].split("|").join(" · ") : "";
  return `<div class="pp"><h3>${esc(titleCase(r[1]))}</h3>
    <div class="b">${esc(r[2] || "Independent")} · ${r[9] === "NI" ? "Northern Ireland" : "Republic of Ireland"}${km != null ? " · " + esc(fmtDist(km)) : ""}</div>
    <span class="tag ${status === "ok" ? "ok" : "p"}">${status === "ok" ? "No premium charge" : "Premium site: surcharge applies"}</span>
    <div>${esc(addr)}</div>
    ${r[14] ? `<div class="m">${esc(r[14])}</div>` : ""}
    ${fac ? `<div class="m">${esc(fac)}</div>` : ""}
    <a class="go" href="${directionsUrl(r)}" target="_blank" rel="noopener">Directions</a></div>`;
}

export default function FuelMap() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const youRef = useRef<L.LayerGroup | null>(null);
  const markerById = useRef(new Map<number, L.CircleMarker>());

  const [data, setData] = useState<(StationData & { error?: string }) | null>(null);
  const [loadError, setLoadError] = useState("");
  const [card, setCard] = useState<CardKey>("dciOne");
  const [region, setRegion] = useState<Region>("ALL");
  const [hgv, setHgv] = useState(false);
  const [adblue, setAdblue] = useState(false);
  const [open24, setOpen24] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [geo, setGeo] = useState<GeoState>({ kind: "idle" });

  // Restore per-phone preferences.
  useEffect(() => {
    setCard(readPref("card", CARDS.map((c) => c.key), "dciOne"));
    setRegion(readPref<Region>("region", ["ALL", "NI", "IE"], "ALL"));
  }, []);

  // Load station data.
  useEffect(() => {
    fetch("/api/stations")
      .then(async (res) => {
        if (res.status === 401) { window.location.replace("/login"); return; }
        if (!res.ok) throw new Error(String(res.status));
        setData(await res.json());
      })
      .catch(() => setLoadError("Couldn't load the station list. Check your signal and refresh the page."));
  }, []);

  // Create the map once.
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomSnap: 0.25, preferCanvas: true, minZoom: 6, maxZoom: 18 }).fitBounds(IRELAND);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · Stations: Radius e-route',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    youRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const col = CARDS.find((c) => c.key === card)!.col;

  // Apply filters.
  const visible = useMemo(() => {
    if (!data) return { ok: [] as StationRow[], premium: [] as StationRow[] };
    const ok: StationRow[] = [];
    const premium: StationRow[] = [];
    for (const r of data.sites) {
      const st = siteStatus(r[col]);
      if (!st) continue;
      if (region !== "ALL" && r[9] !== region) continue;
      if (hgv && !/(^|\|)HGV(\||$)/.test(r[13])) continue;
      if (adblue && !/adblue/i.test(r[13])) continue;
      if (open24 && !/24/.test(r[14])) continue;
      (st === "ok" ? ok : premium).push(r);
    }
    return { ok, premium };
  }, [data, col, region, hgv, adblue, open24]);

  // Draw markers.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markerById.current.clear();
    const okC = cssVar("--ok"), pC = cssVar("--prem"), ring = cssVar("--panel");
    if (showPremium) {
      for (const r of visible.premium) {
        const m = L.circleMarker([r[3], r[4]], { radius: 5, color: pC, weight: 2, fillColor: pC, fillOpacity: 0.12 });
        m.bindPopup(() => popupHtml(r, "premium"), { maxWidth: 280 });
        layer.addLayer(m);
      }
    }
    for (const r of visible.ok) {
      const m = L.circleMarker([r[3], r[4]], { radius: 6.5, color: ring, weight: 1.5, fillColor: okC, fillOpacity: 1 });
      m.bindPopup(() => popupHtml(r, "ok"), { maxWidth: 280 });
      layer.addLayer(m);
      markerById.current.set(r[0], m);
    }
  }, [visible, showPremium]);

  // Re-rank nearest when filters/card change after a location fix.
  useEffect(() => {
    setGeo((g) => (g.kind === "done" ? { ...g, list: rankNearest(g.lat, g.lng, visible.ok) } : g));
  }, [visible]);

  function rankNearest(lat: number, lng: number, rows: StationRow[]): Nearest[] {
    return rows
      .map((row) => ({ row, km: distanceKm(lat, lng, row[3], row[4]) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, NEAREST_COUNT);
  }

  function findNearest() {
    if (!("geolocation" in navigator)) {
      setGeo({ kind: "error", message: "This phone's browser can't share your location." });
      return;
    }
    setGeo({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const list = rankNearest(lat, lng, visible.ok);
        setGeo({ kind: "done", lat, lng, accuracy, list });
        const map = mapRef.current, you = youRef.current;
        if (!map || !you) return;
        you.clearLayers();
        const blue = cssVar("--you");
        if (accuracy < 2000) L.circle([lat, lng], { radius: accuracy, color: blue, weight: 1, fillOpacity: 0.08, interactive: false }).addTo(you);
        L.circleMarker([lat, lng], { radius: 8, color: "#fff", weight: 3, fillColor: blue, fillOpacity: 1 }).bindTooltip("You are here").addTo(you);
        const pts: L.LatLngExpression[] = [[lat, lng], ...list.map((n) => [n.row[3], n.row[4]] as L.LatLngExpression)];
        map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [30, 90], paddingBottomRight: [30, Math.round(window.innerHeight * 0.45)], maxZoom: 14 });
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Location is turned off for this site. Allow location for this page in your phone's browser settings, then try again."
            : err.code === err.TIMEOUT
              ? "Couldn't get a GPS fix in time. Move somewhere with a clearer view of the sky and try again."
              : "Couldn't find your location. Try again in a moment.";
        setGeo({ kind: "error", message });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  function focusStation(r: StationRow, km: number) {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([r[3], r[4]], 15, { duration: 0.6 });
    const m = markerById.current.get(r[0]);
    if (m) setTimeout(() => m.setPopupContent(popupHtml(r, "ok", km)).openPopup(), 650);
  }

  function clearNearest() {
    youRef.current?.clearLayers();
    setGeo({ kind: "idle" });
  }

  const asOf = data ? new Date(data.asOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <div className="app">
      <div id="map" ref={mapEl} aria-label="Map of DCI fuel stations" />

      <div className="topbar">
        <label className="card-pick">
          <span className="lbl">Card</span>
          <select
            id="card"
            value={card}
            onChange={(e) => { const v = e.target.value as CardKey; setCard(v); writePref("card", v); }}
          >
            {CARDS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <button className="icon-btn" aria-pressed={filtersOpen} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
          Filters
        </button>
      </div>

      {data?.source === "snapshot" && data.error && !filtersOpen && (
        <div className="banner" role="status">
          Live update from e-route failed. Showing the saved station list from {asOf}.
        </div>
      )}
      {loadError && <div className="banner" role="alert">{loadError}</div>}

      {filtersOpen && (
        <div className="filters" role="dialog" aria-label="Filters">
          <div>
            <h2>Region</h2>
            <div className="chips" style={{ marginTop: 6 }}>
              {(["ALL", "NI", "IE"] as Region[]).map((r) => (
                <button key={r} className="chip" aria-pressed={region === r}
                  onClick={() => { setRegion(r); writePref("region", r); }}>
                  {r === "ALL" ? "All Ireland" : r === "NI" ? "Northern Ireland" : "Republic"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2>Facilities</h2>
            <div className="chips" style={{ marginTop: 6 }}>
              <button className="chip" aria-pressed={hgv} onClick={() => setHgv(!hgv)}>HGV access</button>
              <button className="chip" aria-pressed={adblue} onClick={() => setAdblue(!adblue)}>AdBlue</button>
              <button className="chip" aria-pressed={open24} onClick={() => setOpen24(!open24)}>Open 24 hours</button>
            </div>
          </div>
          <label className="check">
            <input id="showPremium" type="checkbox" checked={showPremium} onChange={(e) => setShowPremium(e.target.checked)} />
            Also show premium sites (to avoid)
          </label>
          <div className="legend">
            <span><span className="dot" />No premium: {visible.ok.length.toLocaleString()}</span>
            <span><span className="dot p" />Premium: {visible.premium.length.toLocaleString()}</span>
          </div>
          <div className="meta">
            Stations from Radius e-route, updated {asOf || "…"}{data?.source === "snapshot" ? " (saved copy)" : ""}. A premium site is one e-route lists as Non-Core for your card. Distances are straight-line.
          </div>
          <div className="row">
            <form method="post" action="/api/logout"><button className="linkish" type="submit">Sign out</button></form>
            <button className="btn btn-primary" onClick={() => setFiltersOpen(false)} style={{ padding: "10px 16px" }}>Show map</button>
          </div>
        </div>
      )}

      <div className="sheet">
        {geo.kind === "done" ? (
          <div className="results">
            <div className="results-head">
              <div>
                <b>Nearest no-premium stations</b>
                <small>{CARDS.find((c) => c.key === card)!.label} · straight-line distance</small>
              </div>
              <button className="linkish" onClick={clearNearest}>Close</button>
            </div>
            {geo.list.length === 0 ? (
              <div className="status">No stations match your filters. Open Filters and clear some options.</div>
            ) : (
              <ol>
                {geo.list.map((n) => (
                  <li key={n.row[0]} className="res">
                    <button className="name" onClick={() => focusStation(n.row, n.km)}>
                      <span className="t">{titleCase(n.row[1])}</span>
                      <span className="s">{fmtDist(n.km)} · {n.row[2] || "Independent"} · {titleCase(n.row[6] || n.row[7])}</span>
                    </button>
                    <a className="go" href={directionsUrl(n.row)} target="_blank" rel="noopener">Directions</a>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <>
            {geo.kind === "error" && (
              <div className="results" role="alert" style={{ marginBottom: 8 }}>
                <div className="status">{geo.message}</div>
              </div>
            )}
            <button className="btn btn-primary find-btn" onClick={findNearest} disabled={geo.kind === "locating" || !data}>
              {geo.kind === "locating" ? "Finding your location…" : !data ? "Loading stations…" : "Find nearest no-premium station"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
