"use client";

import { useEffect, useState } from "react";

interface AudioWaveformProps {
  stream: MediaStream | null;
  isRecording: boolean;
  isSpeaking: boolean;
  onLevelSample?: (normalizedPeak: number) => void;
}

const BAR_COUNT = 20;

export function AudioWaveform({ stream, isRecording, isSpeaking, onLevelSample }: AudioWaveformProps) {
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
    analyser.fftSize = 128;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const freqArray = new Uint8Array(analyser.frequencyBinCount);
    const timeArray = new Uint8Array(analyser.fftSize);
    let rafId = 0;

    const renderFrame = () => {
      analyser.getByteFrequencyData(freqArray);
      analyser.getByteTimeDomainData(timeArray);

      let maxDeviation = 0;
      for (let i = 0; i < timeArray.length; i++) {
        const deviation = Math.abs((timeArray[i] ?? 128) - 128) / 128;
        if (deviation > maxDeviation) maxDeviation = deviation;
      }
      onLevelSample?.(maxDeviation);

      const next = Array.from({ length: BAR_COUNT }, (_, idx) => {
        const binIndex = Math.min(freqArray.length - 1, Math.floor((idx / BAR_COUNT) * freqArray.length));
        const normalized = (freqArray[binIndex] ?? 0) / 255;
        return Math.max(0.14, Math.min(1, Math.max(normalized * 1.25, maxDeviation * 1.5)));
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
  }, [stream, isRecording, isSpeaking, onLevelSample]);

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

