"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        window.location.replace("/");
        return;
      }
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't sign in. Try again.");
    } catch {
      setError("No connection. Check your signal and try again.");
    }
    setBusy(false);
  }

  return (
    <main className="login-wrap">
      <form className="login" onSubmit={submit}>
        <h1>DCI Fuel Finder</h1>
        <p>Find the nearest fuel station where your DCI card has no premium charge.</p>
        <label>
          Username
          <input id="username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="err" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
