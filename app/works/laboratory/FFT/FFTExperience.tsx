"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./fft.module.css";

type InputKind = "idle" | "system" | "microphone";

const FFT_SIZE = 4096;
const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || window.matchMedia("(pointer: coarse)").matches;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function FFTExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const [inputKind, setInputKind] = useState<InputKind>("idle");
  const [message, setMessage] = useState("Select listen to begin");
  const [isStarting, setIsStarting] = useState(false);

  const stop = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    setInputKind("idle");
    setMessage("Select listen to begin");
  }, []);

  const drawSpectrum = useCallback((analyser: AnalyserNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    const frequencyLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const viewWidth = bounds.width;
      const viewHeight = bounds.height;
      const left = 48;
      const right = 14;
      const top = 14;
      const bottom = 34;
      const graphWidth = Math.max(1, viewWidth - left - right);
      const graphHeight = Math.max(1, viewHeight - top - bottom);

      analyser.getByteFrequencyData(spectrum);
      context.clearRect(0, 0, viewWidth, viewHeight);

      context.strokeStyle = "rgba(230, 236, 242, 0.08)";
      context.fillStyle = "rgba(230, 236, 242, 0.38)";
      context.font = "10px var(--font-courier), monospace";
      context.lineWidth = 1;

      for (let level = 0; level <= 4; level += 1) {
        const y = top + graphHeight * (level / 4);
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(left + graphWidth, y);
        context.stroke();
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.fillText(`${Math.round(100 - level * 25)}`, left - 10, y);
      }

      const logMin = Math.log10(MIN_FREQUENCY);
      const logRange = Math.log10(MAX_FREQUENCY) - logMin;
      for (const frequency of frequencyLabels) {
        const x = left + ((Math.log10(frequency) - logMin) / logRange) * graphWidth;
        context.beginPath();
        context.moveTo(x, top);
        context.lineTo(x, top + graphHeight);
        context.stroke();
        context.textAlign = frequency === MIN_FREQUENCY
          ? "left"
          : frequency === MAX_FREQUENCY ? "right" : "center";
        context.textBaseline = "top";
        context.fillText(frequency >= 1000 ? `${frequency / 1000}k` : `${frequency}`, x, top + graphHeight + 12);
      }

      const sampleRate = analyser.context.sampleRate;
      const binWidth = sampleRate / analyser.fftSize;
      const columns = Math.max(240, Math.floor(graphWidth));

      context.beginPath();
      context.moveTo(left, top + graphHeight);
      for (let column = 0; column <= columns; column += 1) {
        const progress = column / columns;
        const frequency = 10 ** (logMin + progress * logRange);
        const bin = Math.min(spectrum.length - 1, Math.max(0, Math.round(frequency / binWidth)));
        const amplitude = spectrum[bin] / 255;
        const x = left + progress * graphWidth;
        const y = top + graphHeight * (1 - amplitude);
        context.lineTo(x, y);
      }
      context.lineTo(left + graphWidth, top + graphHeight);
      context.closePath();

      const fill = context.createLinearGradient(0, top, 0, top + graphHeight);
      fill.addColorStop(0, "rgba(139, 219, 255, 0.46)");
      fill.addColorStop(1, "rgba(139, 219, 255, 0.015)");
      context.fillStyle = fill;
      context.fill();

      context.beginPath();
      for (let column = 0; column <= columns; column += 1) {
        const progress = column / columns;
        const frequency = 10 ** (logMin + progress * logRange);
        const bin = Math.min(spectrum.length - 1, Math.max(0, Math.round(frequency / binWidth)));
        const amplitude = spectrum[bin] / 255;
        const x = left + progress * graphWidth;
        const y = top + graphHeight * (1 - amplitude);
        if (column === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = "#a9e6ff";
      context.lineWidth = 1.5;
      context.shadowColor = "rgba(123, 215, 255, 0.5)";
      context.shadowBlur = 8;
      context.stroke();
      context.shadowBlur = 0;

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
  }, []);

  const start = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    setMessage("Requesting audio access…");

    let stream: MediaStream | null = null;
    let nextInput: InputKind = "microphone";

    try {
      const canRequestSystemAudio = !isMobileDevice()
        && typeof navigator.mediaDevices?.getDisplayMedia === "function";

      if (canRequestSystemAudio) {
        try {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
          if (displayStream.getAudioTracks().length > 0) {
            stream = displayStream;
            nextInput = "system";
          } else {
            stopMediaStream(displayStream);
          }
        } catch {
          // A declined or unsupported display-audio request falls back to the microphone.
        }
      }

      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        nextInput = "microphone";
      }

      const audioContext = new AudioContext();
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.78;
      analyser.minDecibels = -96;
      analyser.maxDecibels = -18;
      source.connect(analyser);

      streamRef.current = stream;
      contextRef.current = audioContext;
      setInputKind(nextInput);
      setMessage(nextInput === "system" ? "System audio" : "Microphone fallback");
      drawSpectrum(analyser);

      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", stop, { once: true });
      });
    } catch {
      stopMediaStream(stream);
      setInputKind("idle");
      setMessage("Audio permission is required");
    } finally {
      setIsStarting(false);
    }
  }, [drawSpectrum, isStarting, stop]);

  useEffect(() => stop, [stop]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} href="/works/laboratory" aria-label="Back to laboratory">
          ← Laboratory
        </Link>
        <div className={styles.identity}>
          <span className={styles.index}>07</span>
          <span>FFT</span>
        </div>
      </header>

      <section className={styles.stage} aria-labelledby="fft-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>REAL-TIME SPECTRUM</p>
          <h1 id="fft-title">Frequency / Amplitude</h1>
          <p className={styles.description}>
            Live audio translated into the frequency domain.
          </p>
        </div>

        <div className={styles.visualization}>
          <span className={styles.yLabel}>AMPLITUDE</span>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            aria-label="Real-time audio frequency spectrum with frequency on the horizontal axis and amplitude on the vertical axis"
          />
          <span className={styles.xLabel}>FREQUENCY · HZ</span>
        </div>

        <div className={styles.controls}>
          <div className={styles.status} aria-live="polite">
            <span className={`${styles.signal} ${inputKind !== "idle" ? styles.active : ""}`} />
            <span>{message}</span>
          </div>
          {inputKind === "idle" ? (
            <button className={styles.button} type="button" onClick={start} disabled={isStarting}>
              {isStarting ? "CONNECTING" : "LISTEN"}
            </button>
          ) : (
            <button className={styles.button} type="button" onClick={stop}>
              STOP
            </button>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>20 Hz</span>
        <span>FFT 4096</span>
        <span>20 kHz</span>
      </footer>
    </main>
  );
}
