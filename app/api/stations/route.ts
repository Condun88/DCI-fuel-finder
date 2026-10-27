import { NextResponse } from "next/server";
import { fetchLiveStations, snapshotStations } from "@/lib/stations";

// Rebuilt at most once a day (Vercel incremental regeneration), so e-route is
// asked for data roughly once a day however many drivers open the map.
export const revalidate = 86400;

export async function GET() {
  try {
    const data = await fetchLiveStations();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Live station refresh failed, serving saved copy:", err);
    return NextResponse.json({ ...snapshotStations(), error: "live-refresh-failed" });
  }
}
