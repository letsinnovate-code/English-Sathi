"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { apiCompleteOnboarding } from "@/lib/api";
import { ApiError } from "@/lib/api";

const GOALS = [
  { value: "DAILY_CONVERSATION", label: "Daily Conversation" },
  { value: "JOB_INTERVIEW", label: "Job Interviews" },
  { value: "BUSINESS_ENGLISH", label: "Business English" },
  { value: "TRAVEL", label: "Travel English" },
  { value: "ACADEMIC", label: "Academic English" },
  { value: "CONFIDENCE", label: "Build Confidence" },
] as const;

const LEVELS = [
  { value: "UNKNOWN", label: "Not sure yet" },
  { value: "A1", label: "A1 – Complete Beginner" },
  { value: "A2", label: "A2 – Elementary" },
  { value: "B1", label: "B1 – Intermediate" },
  { value: "B2", label: "B2 – Upper Intermediate" },
  { value: "C1", label: "C1 – Advanced" },
  { value: "C2", label: "C2 – Proficient" },
] as const;

const SPEEDS = [
  { value: "SLOW", label: "Slow" },
  { value: "NORMAL", label: "Normal" },
  { value: "FAST", label: "Fast" },
] as const;

type Step = "goals" | "level" | "preferences" | "done";
const STEP_ORDER: Step[] = ["goals", "level", "preferences", "done"];

export default function OnboardingPage() {
  const { state, refresh } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("goals");
  const [goals, setGoals] = useState<string[]>([]);
  const [level, setLevel] = useState("UNKNOWN");
  const [dailyGoal, setDailyGoal] = useState(15);
  const [speed, setSpeed] = useState("NORMAL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (state.status === "unauthenticated") {
      router.replace("/login");
    }
  }, [state.status, router]);

  if (state.status === "loading") {
    return <div className="loading-screen"><span className="spinner" /><span>Loading…</span></div>;
  }
  if (state.status === "unauthenticated") {
    return null;
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const displayName = state.session.profile.displayName || state.session.user.email.split("@")[0];

  function toggleGoal(g: string) {
    setGoals((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  }

  function next() {
    setError("");
    if (step === "goals" && goals.length === 0) { setError("Select at least one learning goal"); return; }
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
  }

  async function handleFinish() {
    // Re-narrow inside the closure — render-time guards don't satisfy TS here
    if (state.status !== "authenticated") return;
    const session = state.session;
    setError("");
    setLoading(true);
    try {
      await apiCompleteOnboarding({
        displayName: session.profile.displayName || displayName,
        nativeLanguage: "hi",
        explanationLanguage: "hi",
        proficiencyLevel: level as never,
        learningGoals: goals as never,
        dailyGoalMinutes: dailyGoal,
        speakingSpeed: speed as never,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
      });
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-center" style={{ background: "linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%)" }}>
      <div className="card" style={{ maxWidth: 520 }}>
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div className="brand" style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>English Sathi</div>
          <h1 className="page-title" style={{ fontSize: "1.5rem" }}>
            {step === "goals" && `Welcome, ${displayName}! 🎉`}
            {step === "level" && "What's your current level?"}
            {step === "preferences" && "Set your daily goal"}
            {step === "done" && "All set!"}
          </h1>
          <p className="page-subtitle">
            {step === "goals" && "What do you want to achieve with English?"}
            {step === "level" && "Be honest — Sathi will adapt to you"}
            {step === "preferences" && "Customise your practice session"}
            {step === "done" && ""}
          </p>
        </div>

        {/* Step dots */}
        <div className="steps">
          {STEP_ORDER.slice(0, 3).map((s, i) => (
            <div
              key={s}
              className={`step-dot ${i < stepIndex ? "done" : i === stepIndex ? "active" : ""}`}
            />
          ))}
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: "1rem" }}>{error}</div>}

        {/* Step content */}
        {step === "goals" && (
          <div>
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
        )}

        {step === "level" && (
          <div className="field">
            <label htmlFor="level">Select your level</label>
            <select id="level" className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        )}

        {step === "preferences" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="field">
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
            <div className="field">
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
          </div>
        )}

        {/* CTA */}
        <div style={{ marginTop: "2rem", display: "flex", gap: "0.75rem" }}>
          {stepIndex > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => setStep(STEP_ORDER[stepIndex - 1])}
            >
              Back
            </button>
          )}
          {step !== "preferences" ? (
            <button type="button" className="btn btn-primary" style={{ flex: 2 }} onClick={next}>
              Continue →
            </button>
          ) : (
            <button type="button" className="btn btn-primary" style={{ flex: 2 }} onClick={handleFinish} disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving…</> : "Start Learning 🚀"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
