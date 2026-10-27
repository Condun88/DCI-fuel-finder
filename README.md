# DCI Fuel Finder

A phone-friendly map of fuel stations in Northern Ireland and the Republic of Ireland where a DCI card has **no premium charge**. Drivers tap **Find nearest no-premium station**, allow location, and get the 5 closest stations with distances and a Google Maps **Directions** button.

- **Cards covered:** DCI One / Radius One, DCI, DCI Main Route. Drivers pick their card once and the phone remembers it.
- **What "no premium" means:** the station is listed as **Core** for that card in Radius e-route. **Non-Core** stations are treated as premium. They're hidden by default and can be shown from Filters.
- **Filters:** region (All Ireland, Northern Ireland, Republic), HGV access, AdBlue, open 24 hours.
- **Login:** one shared username and password. A phone stays signed in for 90 days.
- **Add to home screen:** works like an app icon on iPhone and Android.

## How the station data stays current

`/api/stations` pulls the DCI station lists from Radius e-route (`api.erouteonline.com`), the data behind the public e-route station finder. Vercel caches the result for 24 hours, so e-route is asked roughly once a day however many drivers use the map.

If e-route can't be reached or returns something unexpected (fewer than 1,000 sites), the app serves the saved copy in `data/snapshot.json` (pulled 26 Oct 2026). Drivers then see a banner saying the list is from that date. Once live updates are working, the Filters panel shows the date of the last update.

**Check after first deploy:** sign in, open `https://<your-app>/api/stations` and look at `"source"`. `"live"` means the daily refresh is working. `"snapshot"` means it fell back to the saved copy; check the Vercel function logs for "Live station refresh failed". The e-route API is unofficial and undocumented, so Radius could change or block it without warning. The saved copy keeps the app working if that happens.

## Setup

### 1. Put the code on GitHub (GitHub Desktop)

1. On github.com, create a new **private**, empty repository, e.g. `dci-fuel-finder`. Don't add a README.
2. In GitHub Desktop: **File → Clone repository** and pick the new repo.
3. Unzip this project and drag its contents into the cloned folder.
4. Commit (e.g. "Initial DCI Fuel Finder") and **Push origin**.

### 2. Deploy on Vercel

1. In Vercel, click **Add New → Project** and import the GitHub repo. The defaults are fine; it's detected as Next.js.
2. Before deploying, add these **Environment Variables** for Production and Preview:

| Name | What to put |
|---|---|
| `APP_USERNAME` | Shared username for drivers, e.g. `dci` (not case-sensitive) |
| `APP_PASSWORD` | Shared password: long, not reused anywhere else |
| `SESSION_SECRET` | Random string of at least 32 characters. Generate one with `openssl rand -hex 32` or a password manager. |

3. Deploy. Until all three are set, nobody can sign in. The app stays locked rather than open.

To **change the password**, update `APP_PASSWORD` and redeploy. To **sign everyone out** (e.g. the password leaked), also change `SESSION_SECRET`.

### 3. Share with card holders

Send drivers the URL, username and password through separate channels where possible. On the phone:

- **iPhone (Safari):** open the link, sign in, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the link, sign in, tap ⋮, then **Add to Home screen** (or **Install app**).

The first time they tap **Find nearest**, the phone asks for location permission. They need to allow it.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in real values (this file is git-ignored)
npm run dev
```

## Project layout

| Path | What it does |
|---|---|
| `middleware.ts` | Login gate. Everything except `/login` and its API needs a valid signed session cookie. |
| `lib/auth.ts` | Signs and verifies session cookies (HMAC-SHA256) and compares credentials in constant time. |
| `app/api/login`, `app/api/logout` | Sign in and sign out. |
| `app/api/stations/route.ts` | Station data, refreshed daily, with the saved copy as fallback. |
| `lib/stations.ts` | Pulls from e-route and converts to a compact format. Directory numbers: 60 = DCI, 61 = DCI One / Radius One, 62 = DCI Main Route. |
| `lib/cards.ts` | Card list, Core/Non-Core to no-premium/premium rule, and distance calculation. |
| `components/FuelMap.tsx` | Map, filters and Find nearest. |
| `data/snapshot.json` | Saved copy of the station list. |

## Notes and limits

- **Distances are straight-line**, not driving distance. The Directions button gives the real route in Google Maps.
- **Location needs HTTPS.** Vercel provides it, so it works on the deployed site and on `localhost`, but not over plain http.
- **Base map:** OpenStreetMap's public tiles, with attribution. They're fine for light internal use. If usage grows a lot, switch to a paid tile provider in `components/FuelMap.tsx`.
- **DCI Pump Saver** isn't included, because e-route doesn't mark its stations as Core or Non-Core.
- **Search engines:** the site is marked `noindex`.
