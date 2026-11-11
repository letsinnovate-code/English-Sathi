"use client";

import { useEffect, useState } from "react";
import { apiGetDashboard } from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { DashboardSummaryDTO } from "@english-sathi/shared-types";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummaryDTO | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGetDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="loading-screen"><span className="spinner" /><span>Loading…</span></div>;

  const { profile, dailyGoal, subscription, recommendedLessons } = data;

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
        Good day, {profile.displayName}! 👋
      </h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
        Level: <strong>{profile.proficiencyLevel}</strong> · Daily goal: <strong>{profile.dailyGoalMinutes} min</strong>
      </p>

      {/* Daily goal card */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>📅 Today&apos;s Goal</h2>
        <div className="stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
            <span className="stat-label">Speaking Practice</span>
            <span style={{ fontWeight: 700, color: "var(--primary)" }}>{dailyGoal.progressPercent}%</span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${dailyGoal.progressPercent}%` }} />
          </div>
          <div className="stat-sub" style={{ marginTop: "0.4rem" }}>
            {dailyGoal.completedMinutesToday} / {dailyGoal.targetMinutes} minutes completed today
          </div>
        </div>
      </section>

      {/* Stat cards */}
      <section style={{ marginBottom: "2rem" }}>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Today&apos;s Plan</div>
            <div className="stat-value">{subscription?.planName ?? "—"}</div>
            <div className="stat-sub">
              {subscription
                ? `${Math.floor(subscription.remainingVoiceSecondsToday / 60)} min remaining`
                : "No active subscription"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Proficiency</div>
            <div className="stat-value">{profile.proficiencyLevel}</div>
            <div className="stat-sub">CEFR aligned level</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Daily Target</div>
            <div className="stat-value">{profile.dailyGoalMinutes}<span style={{ fontSize: "1rem", fontWeight: 400 }}> min</span></div>
            <div className="stat-sub">Speaking practice per day</div>
          </div>
        </div>
      </section>

      {/* Recommended lessons */}
      <section>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>📚 Start Practicing</h2>
        {recommendedLessons.length === 0 ? (
          <div className="alert alert-info">No lessons available for your current level yet. Check back soon!</div>
        ) : (
          <div className="lesson-grid">
            {recommendedLessons.map((lesson) => (
              <div key={lesson.id} className="lesson-card">
                <div className="lesson-badge">{lesson.level}</div>
                <div className="lesson-title">{lesson.title}</div>
                {lesson.description && <div className="lesson-desc">{lesson.description}</div>}
                <div className="lesson-category">📂 {lesson.category}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

