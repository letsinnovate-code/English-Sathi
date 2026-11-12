"use client";

import { useEffect, useState } from "react";

interface AudioWaveformProps {
  stream: MediaStream | null;
  isRecording: boolean;
  isSpeaking: boolean;
}

const BAR_COUNT = 20;

export function AudioWaveform({ stream, isRecording, isSpeaking }: AudioWaveformProps) {
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0.15));

  useEffect(() => {
    if (!isRecording || !stream) {
      if (!isSpeaking) {
        setLevels(Array(BAR_COUNT).fill(0.14));
        return;
      }
      // Subtle animated wave while Sathi is speaking
      let tick = 0;
      const timer = setInterval(() => {
        tick += 0.45;
        setLevels(
          Array.from({ length: BAR_COUNT }, (_, i) =>
            0.2 + 0.5 * Math.abs(Math.sin(tick + i * 0.45)),
          ),
        );
      }, 80);
      return () => clearInterval(timer);
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) return;

    const audioCtx = new AudioCtx();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;

    const renderFrame = () => {
      analyser.getByteFrequencyData(dataArray);
      const next = Array.from({ length: BAR_COUNT }, (_, idx) => {
        const binIndex = Math.min(dataArray.length - 1, Math.floor((idx / BAR_COUNT) * dataArray.length));
        const normalized = (dataArray[binIndex] ?? 0) / 255;
        return Math.max(0.14, Math.min(1, normalized * 1.25));
      });
      setLevels(next);
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      void audioCtx.close().catch(() => {});
    };
  }, [stream, isRecording, isSpeaking]);

  return (
    <div
      className={`voice-waveform${isRecording ? " recording" : isSpeaking ? " speaking" : ""}`}
      aria-label="Audio activity visualizer"
    >
      {levels.map((level, idx) => (
        <span
          key={idx}
          className="voice-wave-bar"
          style={{ height: `${Math.round(level * 100)}%` }}
        />
      ))}
    </div>
  );
}

