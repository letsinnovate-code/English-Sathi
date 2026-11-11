"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({ email: "", password: "" });
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError("");
    setLoading(true);
    try {
      const session = await login(form);
      router.push(session.onboardingRequired ? "/onboarding" : "/dashboard");
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <div>
          <h1 className="page-title">Welcome back</h1>
          <p className="page-subtitle">Sign in to <span className="brand">English Sathi</span></p>
        </div>

        {apiError && <div className="alert alert-error" style={{ marginTop: "1rem" }}>{apiError}</div>}

        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="input"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="input"
              placeholder="Your password"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing in…</> : "Sign In"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          No account yet? <Link href="/register">Create one free</Link>
        </p>

        <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--primary-light)", borderRadius: "var(--radius)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          <strong>Demo:</strong> student@englishsathi.com / Student@123!
        </div>
      </div>
    </div>
  );
}

