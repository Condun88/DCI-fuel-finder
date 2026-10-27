"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so the map only renders in the browser.
const FuelMap = dynamic(() => import("@/components/FuelMap"), {
  ssr: false,
  loading: () => <div className="status">Loading map…</div>,
});

export default function Home() {
  return <FuelMap />;
}
