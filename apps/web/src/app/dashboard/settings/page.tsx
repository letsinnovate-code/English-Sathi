"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { apiUpdateProfile } from "@/lib/api";
import { ApiError } from "@/lib/api";

const GOALS = [
  { value: "DAILY_CONVERSATION", label: "Daily Conversation" },
  { value: "JOB_INTERVIEW", label: "Job Interviews" },
  { value: "BUSINESS_ENGLISH", label: "Business English" },
  { value: "TRAVEL", label: "Travel English" },
  { value: "ACADEMIC", label: "Academic English" },
  { value: "CONFIDENCE", label: "Build Confidence" },
] as const;

const SPEEDS = [
  { value: "SLOW", label: "Slow" },
  { value: "NORMAL", label: "Normal" },
  { value: "FAST", label: "Fast" },
] as const;

export default function SettingsPage() {
  const { state, refresh } = useAuth();
  const profile = state.status === "authenticated" ? state.session.profile : null;

  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [dailyGoal, setDailyGoal] = useState(profile?.dailyGoalMinutes ?? 15);
  const [speed, setSpeed] = useState(profile?.speakingSpeed ?? "NORMAL");
  const [goals, setGoals] = useState<string[]>(profile?.learningGoals ?? []);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setDailyGoal(profile.dailyGoalMinutes);
      setSpeed(profile.speakingSpeed);
      setGoals(profile.learningGoals);
    }
  }, [profile]);

  function toggleGoal(g: string) {
    setGoals((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!displayName.trim() || displayName.trim().length < 2) { setError("Name must be at least 2 characters"); return; }
    setLoading(true);
    try {
      await apiUpdateProfile({
        displayName: displayName.trim(),
        dailyGoalMinutes: dailyGoal,
        speakingSpeed: speed as never,
        learningGoals: goals.length > 0 ? goals as never : undefined,
      });
      await refresh();
      setSuccess("Settings saved successfully!");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!profile) return <div className="loading-screen"><span className="spinner" /></div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Settings</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>Update your learning preferences</p>

      {success && <div className="alert alert-success" style={{ marginBottom: "1rem" }}>{success}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div className="settings-section">
          <h3>Profile</h3>
          <div className="field">
            <label>Display Name</label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>
        </div>

        <div className="settings-section">
          <h3>Learning Preferences</h3>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label>Daily speaking goal: <strong>{dailyGoal} minutes</strong></label>
            <input
              type="range" min={5} max={120} step={5}
              value={dailyGoal}
              onChange={(e) => setDailyGoal(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--primary)" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              <span>5 min</span><span>120 min</span>
            </div>
          </div>

          <div className="field" style={{ marginBottom: "1rem" }}>
            <label>AI speaking speed</label>
            <div className="choice-grid">
              {SPEEDS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`choice-pill${speed === value ? " selected" : ""}`}
                  onClick={() => setSpeed(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Learning goals</label>
            <div className="choice-grid">
              {GOALS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`choice-pill${goals.includes(value) ? " selected" : ""}`}
                  onClick={() => toggleGoal(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Account</h3>
          <div className="field">
            <label>Email</label>
            <input className="input" value={state.status === "authenticated" ? state.session.user.email : ""} disabled style={{ background: "var(--bg)", color: "var(--text-muted)" }} />
            <span className="field-hint">Email cannot be changed.</span>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving…</> : "Save Changes"}
        </button>
      </form>
    </div>
  );
}

