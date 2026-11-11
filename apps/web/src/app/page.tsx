"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import Link from "next/link";

export default function HomePage() {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "authenticated") {
      if (state.session.onboardingRequired) {
        router.replace("/onboarding");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [state, router]);

  if (state.status === "loading") {
    return (
      <div className="loading-screen">
        <span className="spinner" />
        <span>Loading…</span>
      </div>
    );
  }

  return (
    <div className="page-center" style={{ background: "linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%)" }}>
      <div style={{ textAlign: "center", maxWidth: 560, padding: "2rem 1rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🗣️</div>
        <h1 style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>
          <span className="brand">English Sathi</span>
        </h1>
        <p style={{ fontSize: "1.15rem", color: "var(--text-muted)", marginBottom: "2.5rem" }}>
          Your personal AI-powered spoken English tutor — available 24/7, in Hindi and English.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/register">
            <button className="btn btn-primary" style={{ width: "auto", padding: "0.75rem 2rem" }}>
              Get Started Free
            </button>
          </Link>
          <Link href="/login">
            <button className="btn btn-ghost" style={{ padding: "0.75rem 2rem" }}>
              Sign In
            </button>
          </Link>
        </div>
        <div style={{ marginTop: "3rem", display: "flex", gap: "2rem", justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { icon: "🎙️", label: "Voice Conversations" },
            { icon: "🤖", label: "AI Grammar Feedback" },
            { icon: "📊", label: "Progress Tracking" },
          ].map(({ icon, label }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2rem" }}>{icon}</div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
