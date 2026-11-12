"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import type {
  LessonDetailDTO,
  StarterLessonSummaryDTO,
  VoiceFeedbackItemDTO,
  VoiceQuotaSummaryDTO,
  VoiceSessionDTO,
  WsQuotaUpdatePayload,
  WsSessionEndedPayload,
  WsSessionErrorPayload,
  WsSessionReadyPayload,
  WsTurnResultPayload,
} from "@english-sathi/shared-types";
import { useAuth } from "@/context/auth-context";
import {
  ApiError,
  apiCreateVoiceSession,
  apiEndVoiceSession,
  apiGetLesson,
  apiGetVoiceQuota,
  apiGetVoiceSession,
  apiListLessons,
  apiListVoiceSessions,
  ensureAccessToken,
  getApiBaseUrl,
} from "@/lib/api";
import {
  blobToBase64,
  cancelTutorSpeech,
  isSpeechRecognitionSupported,
  pickSupportedAudioMime,
  speakTutorText,
  startLiveCaptions,
  type LiveCaptionsController,
} from "@/lib/voice-speech";
import { AudioWaveform } from "@/components/voice/AudioWaveform";
import { TranscriptPanel, type TranscriptEntry } from "@/components/voice/TranscriptPanel";

type StudioMode = "setup" | "live" | "summary";
type MicPermission = "prompt" | "granted" | "denied" | "unsupported";

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function PracticeStudioInner() {
  const { state } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonParam = searchParams.get("lesson");

  // ── Setup state ──
  const [mode, setMode] = useState<StudioMode>("setup");
  const [lessons, setLessons] = useState<StarterLessonSummaryDTO[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<LessonDetailDTO | null>(null);
  const [useFreeTalk, setUseFreeTalk] = useState(false);
  const [customScenario, setCustomScenario] = useState("Daily English Conversation");
  const [quota, setQuota] = useState<VoiceQuotaSummaryDTO | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermission>("prompt");
  const [setupLoading, setSetupLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const [error, setError] = useState("");
  const [conflictSessionId, setConflictSessionId] = useState<string | null>(null);

  // ── Live session state ──
  const [session, setSession] = useState<VoiceSessionDTO | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [liveCaption, setLiveCaption] = useState("");
  const [textInput, setTextInput] = useState("");
  const [endedSummary, setEndedSummary] = useState<WsSessionEndedPayload | null>(null);

  // ── Refs for async WS / MediaRecorder callbacks ──
  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<VoiceSessionDTO | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const captionsRef = useRef<LiveCaptionsController | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartMsRef = useRef<number>(0);
  const liveCaptionRef = useRef<string>("");
  const pendingUserEntryIdRef = useRef<string | null>(null);
  const autoSpeakRef = useRef<boolean>(true);

  const profile = state.status === "authenticated" ? state.session.profile : null;
  const speakingSpeed = profile?.speakingSpeed ?? "NORMAL";

  // ── Auth guard ──
  useEffect(() => {
    if (state.status === "unauthenticated") {
      router.replace("/login");
    } else if (state.status === "authenticated" && state.session.onboardingRequired) {
      router.replace("/onboarding");
    }
  }, [state, router]);

  // ── Load initial quota & lessons ──
  useEffect(() => {
    if (state.status !== "authenticated") return;
    let cancelled = false;

    async function loadSetup() {
      setSetupLoading(true);
      setError("");
      try {
        const [quotaRes, lessonsRes] = await Promise.all([
          apiGetVoiceQuota(),
          apiListLessons({ pageSize: 20 }),
        ]);
        if (cancelled) return;
        setQuota(quotaRes);
        setLessons(lessonsRes.data);

        if (lessonParam) {
          const detail = await apiGetLesson(lessonParam);
          if (!cancelled) {
            setSelectedLesson(detail);
            setUseFreeTalk(false);
          }
        } else if (lessonsRes.data.length > 0) {
          const firstDetail = await apiGetLesson(lessonsRes.data[0].slug);
          if (!cancelled) {
            setSelectedLesson(firstDetail);
            setUseFreeTalk(false);
          }
        } else {
          setUseFreeTalk(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load voice practice setup.");
        }
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    }

    void loadSetup();
    return () => {
      cancelled = true;
    };
  }, [state.status, lessonParam]);

  // ── Cleanup media, TTS & socket on unmount ──
  const stopMediaResources = useCallback(() => {
    captionsRef.current?.stop();
    captionsRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore already stopped
      }
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setActiveStream(null);
    setIsRecording(false);
  }, []);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsSocketConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      cancelTutorSpeech();
      stopMediaResources();
      disconnectSocket();
    };
  }, [stopMediaResources, disconnectSocket]);

  // ── Heartbeat + 1s quota countdown during live session ──
  useEffect(() => {
    if (mode !== "live" || !session) return;

    const countdown = setInterval(() => {
      setQuota((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessionSeconds: prev.sessionSeconds + 1,
          remainingSecondsToday: Math.max(0, prev.remainingSecondsToday - 1),
        };
      });
    }, 1000);

    const heartbeat = setInterval(() => {
      if (socketRef.current?.connected && sessionRef.current) {
        socketRef.current.emit("session:heartbeat", { sessionId: sessionRef.current.id });
      }
    }, 20000);

    return () => {
      clearInterval(countdown);
      clearInterval(heartbeat);
    };
  }, [mode, session]);

  // ── Microphone test helper ──
  async function handleEnableMicrophone() {
    setError("");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicPermission("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
      setError("Microphone access was denied. You can still practice using the text box.");
    }
  }

  // ── Speak AI turn helper ──
  const speakReply = useCallback(
    (reply: string, followUp?: string) => {
      if (!autoSpeakRef.current) return;
      const fullText = followUp ? `${reply} ${followUp}` : reply;
      speakTutorText(fullText, speakingSpeed, {
        onStart: () => {
          setIsAiSpeaking(true);
          setIsInterrupted(false);
        },
        onEnd: () => {
          setIsAiSpeaking(false);
        },
      });
    },
    [speakingSpeed],
  );

  // ── Connect WebSocket & bind event handlers ──
  const connectVoiceSocket = useCallback(
    async (targetSession: VoiceSessionDTO, initialEntries: TranscriptEntry[]) => {
      disconnectSocket();
      const token = await ensureAccessToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      sessionRef.current = targetSession;
      setSession(targetSession);
      setEntries(initialEntries);
      setEndedSummary(null);
      setMode("live");

      const socket = io(`${getApiBaseUrl()}/voice`, {
        auth: { token },
        transports: ["websocket", "polling"],
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        setIsSocketConnected(true);
        socket.emit("session:join", { sessionId: targetSession.id });
      });

      socket.on("disconnect", () => {
        setIsSocketConnected(false);
      });

      socket.on("session:ready", (payload: WsSessionReadyPayload) => {
        sessionRef.current = payload.session;
        setSession(payload.session);
        setQuota(payload.quota);

        setEntries((prev) => {
          if (prev.length > 0) return prev;
          return [
            {
              id: `msg-open-${payload.openingGreeting.messageSequence}`,
              role: "ASSISTANT",
              content: payload.openingGreeting.reply,
              encouragement: payload.openingGreeting.encouragement,
              followUpQuestion: payload.openingGreeting.followUpQuestion,
              createdAt: new Date().toISOString(),
            },
          ];
        });

        // Speak greeting only on fresh join
        if (initialEntries.length <= 1) {
          speakReply(payload.openingGreeting.reply, payload.openingGreeting.followUpQuestion);
        }
      });

      socket.on("turn:result", (payload: WsTurnResultPayload) => {
        setIsThinking(false);

        setEntries((prev) => {
          const pendingId = pendingUserEntryIdRef.current;
          pendingUserEntryIdRef.current = null;

          const updated = pendingId && payload.userTranscript
            ? prev.map((e) =>
                e.id === pendingId ? { ...e, content: payload.userTranscript ?? e.content } : e,
              )
            : prev;

          return [
            ...updated,
            {
              id: `msg-ai-${payload.messageSequence}-${Date.now()}`,
              role: "ASSISTANT",
              content: payload.reply,
              encouragement: payload.encouragement,
              followUpQuestion: payload.followUpQuestion,
              feedback: payload.feedback,
              score: payload.score,
              createdAt: new Date().toISOString(),
            },
          ];
        });

        setQuota(payload.quota);
        speakReply(payload.reply, payload.followUpQuestion);
      });

      socket.on("quota:update", (payload: WsQuotaUpdatePayload) => {
        setQuota(payload.quota);
      });

      socket.on("session:ended", (payload: WsSessionEndedPayload) => {
        cancelTutorSpeech();
        stopMediaResources();
        disconnectSocket();
        setIsAiSpeaking(false);
        setIsThinking(false);
        setEndedSummary(payload);
        setMode("summary");
      });

      socket.on("session:error", (payload: WsSessionErrorPayload) => {
        setIsThinking(false);
        setError(payload.message || "Voice session error occurred.");
      });
    },
    [disconnectSocket, router, speakReply, stopMediaResources],
  );

  // ── Start / Resume Session ──
  async function handleSelectLesson(slug: string) {
    setUseFreeTalk(false);
    setError("");
    try {
      const detail = await apiGetLesson(slug);
      setSelectedLesson(detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load lesson details.");
    }
  }

  async function handleStartSession() {
    setError("");
    setConflictSessionId(null);
    setStartingSession(true);
    try {
      const dto = useFreeTalk
        ? {
            scenario: customScenario.trim() || "Daily English Conversation",
            level: profile?.proficiencyLevel !== "UNKNOWN" ? profile?.proficiencyLevel : undefined,
          }
        : {
            lessonId: selectedLesson?.id,
            scenario: selectedLesson?.title,
            level: selectedLesson?.level,
          };

      const created = await apiCreateVoiceSession(dto);
      setQuota(created.quota);

      const initialGreeting: TranscriptEntry = {
        id: `msg-open-${created.openingGreeting.messageSequence}`,
        role: "ASSISTANT",
        content: created.openingGreeting.reply,
        encouragement: created.openingGreeting.encouragement,
        followUpQuestion: created.openingGreeting.followUpQuestion,
        createdAt: new Date().toISOString(),
      };

      await connectVoiceSocket(created.session, [initialGreeting]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const detailsObj =
          err.details && typeof err.details === "object"
            ? (err.details as Record<string, unknown>)
            : null;
        let existingId =
          typeof detailsObj?.["activeSessionId"] === "string"
            ? detailsObj["activeSessionId"]
            : null;

        if (!existingId) {
          const all = await apiListVoiceSessions().catch(() => []);
          const open = all.find((s) =>
            ["CREATED", "CONNECTING", "ACTIVE", "INTERRUPTED"].includes(s.status),
          );
          existingId = open?.id ?? null;
        }
        setConflictSessionId(existingId);
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not start voice session.");
      }
    } finally {
      setStartingSession(false);
    }
  }

  async function handleResumeConflictSession() {
    if (!conflictSessionId) return;
    setError("");
    setStartingSession(true);
    try {
      const detail = await apiGetVoiceSession(conflictSessionId);
      const restoredEntries: TranscriptEntry[] = detail.messages
        .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
        .map((m) => ({
          id: m.id,
          role: m.role === "USER" ? "USER" : "ASSISTANT",
          content: m.content,
          createdAt: m.createdAt,
        }));
      setConflictSessionId(null);
      await connectVoiceSocket(detail, restoredEntries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resume active session.");
    } finally {
      setStartingSession(false);
    }
  }

  async function handleEndConflictAndRestart() {
    if (!conflictSessionId) return;
    setError("");
    setStartingSession(true);
    try {
      await apiEndVoiceSession(conflictSessionId, "user_ended");
      setConflictSessionId(null);
      await handleStartSession();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to close previous session.");
      setStartingSession(false);
    }
  }

  // ── Live Recording & Interruption ──
  const handleInterrupt = useCallback(() => {
    cancelTutorSpeech();
    setIsAiSpeaking(false);
    setIsInterrupted(true);
    if (socketRef.current?.connected && sessionRef.current) {
      socketRef.current.emit("session:interrupt", { sessionId: sessionRef.current.id });
    }
  }, []);

  async function handleStartRecording() {
    if (!sessionRef.current || !socketRef.current?.connected || isThinking) return;
    setError("");

    if (isAiSpeaking) {
      handleInterrupt();
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicPermission("unsupported");
      setError("Microphone recording is not supported in this browser. Use the text box below.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission("granted");
      mediaStreamRef.current = stream;
      setActiveStream(stream);

      const mimeType = pickSupportedAudioMime();
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      liveCaptionRef.current = "";
      setLiveCaption("");
      recStartMsRef.current = Date.now();

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        captionsRef.current?.stop();
        captionsRef.current = null;
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        setActiveStream(null);
        setIsRecording(false);

        const activeSession = sessionRef.current;
        const socket = socketRef.current;
        if (!activeSession || !socket?.connected) return;

        const durationSeconds = Math.max(
          0.5,
          Number(((Date.now() - recStartMsRef.current) / 1000).toFixed(1)),
        );
        const capturedText = liveCaptionRef.current.trim();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (blob.size < 200 && !capturedText) {
          return;
        }

        // In fallback mode, send browser transcript if captured so grammar checks analyze spoken words.
        if (activeSession.provider === "sathi-fallback" && capturedText.length > 0) {
          const entryId = `msg-user-${Date.now()}`;
          setEntries((prev) => [
            ...prev,
            {
              id: entryId,
              role: "USER",
              content: capturedText,
              createdAt: new Date().toISOString(),
            },
          ]);
          setIsThinking(true);
          socket.emit("turn:text", {
            sessionId: activeSession.id,
            text: capturedText,
            audioDurationSeconds: durationSeconds,
          });
          setLiveCaption("");
          return;
        }

        try {
          const audioBase64 = await blobToBase64(blob);
          const entryId = `msg-user-${Date.now()}`;
          pendingUserEntryIdRef.current = entryId;
          setEntries((prev) => [
            ...prev,
            {
              id: entryId,
              role: "USER",
              content: capturedText || "🎙️ Voice response sent…",
              createdAt: new Date().toISOString(),
            },
          ]);
          setIsThinking(true);
          socket.emit("turn:audio", {
            sessionId: activeSession.id,
            audioBase64,
            mimeType,
            durationSeconds,
          });
          setLiveCaption("");
        } catch {
          setError("Failed to encode recorded audio. Please try again.");
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setIsInterrupted(false);

      if (isSpeechRecognitionSupported()) {
        captionsRef.current = startLiveCaptions({
          onTranscriptUpdate: (text) => {
            liveCaptionRef.current = text;
            setLiveCaption(text);
          },
        });
      }
    } catch {
      setMicPermission("denied");
      setError("Could not access microphone. Please allow mic permission or use the text input.");
    }
  }

  function handleStopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function handleSendTextTurn(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = textInput.trim();
    if (!trimmed || !sessionRef.current || !socketRef.current?.connected || isThinking) return;

    if (isAiSpeaking) {
      handleInterrupt();
    }

    setError("");
    setTextInput("");
    setEntries((prev) => [
      ...prev,
      {
        id: `msg-user-${Date.now()}`,
        role: "USER",
        content: trimmed,
        createdAt: new Date().toISOString(),
      },
    ]);
    setIsThinking(true);
    socketRef.current.emit("turn:text", {
      sessionId: sessionRef.current.id,
      text: trimmed,
      audioDurationSeconds: 0,
    });
  }

  async function handleEndSession() {
    const activeSession = sessionRef.current;
    if (!activeSession) return;
    cancelTutorSpeech();
    stopMediaResources();

    if (socketRef.current?.connected) {
      socketRef.current.emit("session:end", {
        sessionId: activeSession.id,
        reason: "user_ended",
      });
      return;
    }

    try {
      const ended = await apiEndVoiceSession(activeSession.id, "user_ended");
      disconnectSocket();
      setEndedSummary(ended);
      setMode("summary");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to end session cleanly.");
    }
  }

  // ── Summary metrics ──
  const summaryStats = useMemo(() => {
    const userTurns = entries.filter((e) => e.role === "USER").length;
    const allFeedback: VoiceFeedbackItemDTO[] = entries.flatMap((e) => e.feedback ?? []);
    const scores = entries
      .map((e) => e.score)
      .filter((s): s is number => typeof s === "number");
    const avgScore =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return { userTurns, allFeedback, avgScore };
  }, [entries]);

  if (state.status === "loading" || (mode === "setup" && setupLoading)) {
    return (
      <div className="loading-screen">
        <span className="spinner" />
        <span>Loading Voice Studio…</span>
      </div>
    );
  }

  if (state.status === "unauthenticated" || state.session.onboardingRequired) {
    return null;
  }

  const statusPill = (() => {
    if (!isSocketConnected) return { cls: "", label: "Connecting…" };
    if (isRecording) return { cls: "recording", label: "Listening" };
    if (isThinking) return { cls: "", label: "Thinking…" };
    if (isAiSpeaking) return { cls: "speaking", label: "Sathi Speaking" };
    if (isInterrupted) return { cls: "interrupted", label: "Interrupted" };
    return { cls: "", label: "Ready" };
  })();

  return (
    <div className="practice-shell">
      {/* Top Bar */}
      <header className="practice-topbar">
        <div className="practice-topbar-left">
          <Link href="/dashboard" style={{ fontWeight: 600, fontSize: "0.9rem" }}>
            ← Dashboard
          </Link>
          <span style={{ color: "var(--border)" }}>|</span>
          <strong style={{ fontSize: "1rem" }}>
            {mode === "setup"
              ? "🎙️ Voice Practice Studio"
              : session?.scenario || "English Practice"}
          </strong>
          {mode === "live" && (
            <span className={`status-pill ${statusPill.cls}`}>{statusPill.label}</span>
          )}
        </div>

        <div className="practice-topbar-right">
          {quota && (
            <span className="quota-pill" title="Remaining daily speaking quota">
              ⏱️ {formatClock(quota.remainingSecondsToday)} left today
            </span>
          )}
          {mode === "live" && (
            <button type="button" className="btn btn-danger" style={{ padding: "0.45rem 0.9rem", fontSize: "0.85rem" }} onClick={handleEndSession}>
              End Session
            </button>
          )}
        </div>
      </header>

      <main className="practice-container">
        {error && (
          <div className="alert alert-error">
            <div>{error}</div>
            {conflictSessionId && (
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.65rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "auto", padding: "0.4rem 0.9rem", fontSize: "0.85rem" }}
                  onClick={handleResumeConflictSession}
                >
                  Resume Active Session
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "0.4rem 0.9rem", fontSize: "0.85rem" }}
                  onClick={handleEndConflictAndRestart}
                >
                  End Old & Start Fresh
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SETUP VIEW ── */}
        {mode === "setup" && (
          <div className="voice-setup-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div>
              <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Choose a Speaking Topic</h1>
              <p className="page-subtitle">
                Practice speaking naturally with Sathi. Corrections appear live in English and Hindi.
              </p>

              <div className="lesson-select-grid">
                {lessons.map((lesson) => {
                  const isSelected = !useFreeTalk && selectedLesson?.id === lesson.id;
                  return (
                    <button
                      key={lesson.id}
                      type="button"
                      className={`lesson-option${isSelected ? " selected" : ""}`}
                      onClick={() => handleSelectLesson(lesson.slug)}
                    >
                      <div className="lesson-badge">{lesson.level}</div>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{lesson.title}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        {lesson.category}
                      </div>
                    </button>
                  );
                })}

                <button
                  type="button"
                  className={`lesson-option${useFreeTalk ? " selected" : ""}`}
                  onClick={() => setUseFreeTalk(true)}
                >
                  <div className="lesson-badge">OPEN</div>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Free Conversation</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    Pick any custom topic
                  </div>
                </button>
              </div>
            </div>

            {useFreeTalk ? (
              <div className="field">
                <label htmlFor="customScenario">Your Conversation Topic</label>
                <input
                  id="customScenario"
                  className="input"
                  value={customScenario}
                  onChange={(e) => setCustomScenario(e.target.value)}
                  placeholder="e.g. Talking about my weekend plans"
                />
              </div>
            ) : (
              selectedLesson && (
                <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem" }}>
                  <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>
                    Lesson Guide: {selectedLesson.title}
                  </div>
                  {selectedLesson.content.objectives.length > 0 && (
                    <div style={{ marginBottom: "0.65rem" }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                        Objectives
                      </div>
                      <ul style={{ paddingLeft: "1.2rem", fontSize: "0.88rem", marginTop: "0.2rem" }}>
                        {selectedLesson.content.objectives.map((obj, idx) => (
                          <li key={idx}>{obj}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedLesson.content.keyPhrases.length > 0 && (
                    <div>
                      <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                        Helpful Phrases
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                        {selectedLesson.content.keyPhrases.map((phrase, idx) => (
                          <span key={idx} className="quota-pill" style={{ background: "#fff", color: "var(--text)" }}>
                            “{phrase}”
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-ghost" onClick={handleEnableMicrophone}>
                  {micPermission === "granted" ? "✓ Microphone Ready" : "🎤 Enable Microphone"}
                </button>
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {micPermission === "denied"
                    ? "Mic blocked — text fallback still works"
                    : micPermission === "unsupported"
                      ? "Audio recording unavailable — use text mode"
                      : "Or practice silently using text input anytime"}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "auto", padding: "0.75rem 1.75rem" }}
                disabled={startingSession || (quota !== null && quota.remainingSecondsToday <= 0)}
                onClick={handleStartSession}
              >
                {startingSession ? (
                  <><span className="spinner" style={{ width: 16, height: 16 }} /> Starting…</>
                ) : quota && quota.remainingSecondsToday <= 0 ? (
                  "Daily Quota Reached"
                ) : (
                  "Start Speaking Session →"
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── LIVE STUDIO VIEW ── */}
        {mode === "live" && (
          <>
            <TranscriptPanel
              entries={entries}
              speakingSpeed={speakingSpeed}
              isThinking={isThinking}
            />

            <div className="voice-controls-card">
              <AudioWaveform
                stream={activeStream}
                isRecording={isRecording}
                isSpeaking={isAiSpeaking}
              />

              {liveCaption && (
                <div className="alert alert-info" style={{ padding: "0.5rem 0.75rem" }}>
                  <strong>Hearing:</strong> {liveCaption}
                </div>
              )}

              <div className="voice-action-row">
                {!isRecording ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={!isSocketConnected || isThinking}
                    onClick={handleStartRecording}
                  >
                    🎙️ {isAiSpeaking ? "Interrupt & Speak" : "Start Speaking"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                    onClick={handleStopRecording}
                  >
                    ⏹️ Stop & Send Voice
                  </button>
                )}

                {isAiSpeaking && !isRecording && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleInterrupt}
                  >
                    ✋ Stop Audio
                  </button>
                )}
              </div>

              <form className="text-fallback-form" onSubmit={handleSendTextTurn}>
                <input
                  className="input"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Or type your reply in English…"
                  disabled={!isSocketConnected || isThinking || isRecording}
                />
                <button
                  type="submit"
                  className="btn btn-ghost"
                  disabled={!textInput.trim() || !isSocketConnected || isThinking || isRecording}
                >
                  Send
                </button>
              </form>
            </div>
          </>
        )}

        {/* ── END-OF-SESSION SUMMARY VIEW ── */}
        {mode === "summary" && (
          <div className="voice-setup-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div>
              <div className="lesson-badge">Session Complete</div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Great practice today! 🎉</h1>
              <p className="page-subtitle">
                {endedSummary?.reason === "quota_exceeded"
                  ? "You reached today's daily speaking limit — great consistency!"
                  : "Here is a summary of your speaking session."}
              </p>
            </div>

            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Duration</div>
                <div className="stat-value">{formatClock(endedSummary?.durationSeconds ?? 0)}</div>
                <div className="stat-sub">Speaking time logged</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Your Turns</div>
                <div className="stat-value">{summaryStats.userTurns}</div>
                <div className="stat-sub">Responses practiced</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Avg Score</div>
                <div className="stat-value">
                  {summaryStats.avgScore !== null ? `${summaryStats.avgScore}` : "—"}
                </div>
                <div className="stat-sub">Turn clarity & grammar</div>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>
                📝 Corrections & Tips ({summaryStats.allFeedback.length})
              </h2>
              {summaryStats.allFeedback.length === 0 ? (
                <div className="alert alert-success">
                  No major errors flagged in this session. Keep speaking smoothly!
                </div>
              ) : (
                <div className="feedback-list">
                  {summaryStats.allFeedback.map((item, idx) => (
                    <div key={idx} className="feedback-card">
                      <span className="feedback-badge">{item.category.replace("_", " ")}</span>
                      <div className="feedback-diff">
                        <span className="feedback-original">{item.original}</span>
                        <span>→</span>
                        <span className="feedback-suggestion">{item.suggestion}</span>
                      </div>
                      <p className="feedback-explanation">{item.explanation}</p>
                      {item.hindiExplanation && (
                        <p className="feedback-hindi">💡 {item.hindiExplanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "auto" }}
                onClick={() => {
                  setSession(null);
                  setEntries([]);
                  setEndedSummary(null);
                  setMode("setup");
                  void apiGetVoiceQuota().then(setQuota).catch(() => {});
                }}
              >
                Practice Again
              </button>
              <Link href="/dashboard">
                <button type="button" className="btn btn-ghost">
                  Back to Dashboard
                </button>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className="loading-screen">
          <span className="spinner" />
          <span>Loading Voice Studio…</span>
        </div>
      }
    >
      <PracticeStudioInner />
    </Suspense>
  );
}

