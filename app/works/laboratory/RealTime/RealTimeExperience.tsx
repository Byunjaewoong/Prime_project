"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FlaskConical, Home, Mic, Square } from "lucide-react";
import styles from "./realtime.module.css";

type InputKind = "idle" | "system" | "microphone";
type CaptureFocusController = {
  setFocusBehavior: (behavior: "no-focus-change") => void;
};

const ANALYSER_SIZE = 4096;
const HISTORY_SECONDS = 1;

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || window.matchMedia("(pointer: coarse)").matches;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function RealTimeExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const [inputKind, setInputKind] = useState<InputKind>("idle");
  const [isStarting, setIsStarting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
  }, []);

  const drawWaveform = useCallback((analyser: AnalyserNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const samples = new Float32Array(analyser.fftSize);
    const sampleRate = analyser.context.sampleRate;
    const history = new Float32Array(Math.max(1, Math.round(sampleRate * HISTORY_SECONDS)));
    let writeIndex = 0;
    let storedSamples = 0;
    let previousTime = performance.now();
    let firstFrame = true;

    const appendLatestSamples = (count: number) => {
      const start = samples.length - count;
      for (let index = start; index < samples.length; index += 1) {
        history[writeIndex] = samples[index];
        writeIndex = (writeIndex + 1) % history.length;
      }
      storedSamples = Math.min(history.length, storedSamples + count);
    };

    const historySample = (logicalIndex: number) => {
      const missingPrefix = history.length - storedSamples;
      if (logicalIndex < missingPrefix) return 0;
      if (storedSamples < history.length) return history[logicalIndex - missingPrefix];
      return history[(writeIndex + logicalIndex) % history.length];
    };

    const draw = (now: number) => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      analyser.getFloatTimeDomainData(samples);
      const elapsed = Math.min(0.1, Math.max(0, (now - previousTime) / 1000));
      const newSampleCount = firstFrame
        ? Math.min(samples.length, history.length)
        : Math.min(samples.length, Math.max(1, Math.round(elapsed * sampleRate)));
      appendLatestSamples(newSampleCount);
      firstFrame = false;
      previousTime = now;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const viewWidth = bounds.width;
      const viewHeight = bounds.height;
      const left = 2;
      const right = 2;
      const top = 8;
      const bottom = 8;
      const graphWidth = Math.max(1, viewWidth - left - right);
      const graphHeight = Math.max(1, viewHeight - top - bottom);
      const centerY = top + graphHeight / 2;
      const amplitudeHeight = graphHeight * 0.46;
      const columns = Math.max(1, Math.floor(graphWidth));

      context.clearRect(0, 0, viewWidth, viewHeight);
      context.beginPath();
      for (let column = 0; column < columns; column += 1) {
        const firstSample = Math.floor(column / columns * history.length);
        const lastSample = Math.max(firstSample + 1, Math.floor((column + 1) / columns * history.length));
        let minimum = 1;
        let maximum = -1;
        for (let index = firstSample; index < lastSample; index += 1) {
          const amplitude = historySample(index);
          minimum = Math.min(minimum, amplitude);
          maximum = Math.max(maximum, amplitude);
        }
        const x = left + (column + 0.5) / columns * graphWidth;
        context.moveTo(x, centerY - maximum * amplitudeHeight);
        context.lineTo(x, centerY - minimum * amplitudeHeight);
      }
      context.strokeStyle = "#050505";
      context.lineWidth = 1.15;
      context.stroke();

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);
  }, []);

  const start = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    let stream: MediaStream | null = null;
    let nextInput: InputKind = "microphone";

    try {
      const canRequestSystemAudio = !isMobileDevice()
        && typeof navigator.mediaDevices?.getDisplayMedia === "function";
      if (canRequestSystemAudio) {
        try {
          const Controller = (window as typeof window & {
            CaptureController?: new () => CaptureFocusController;
          }).CaptureController;
          const controller = Controller && "setFocusBehavior" in Controller.prototype
            ? new Controller()
            : undefined;
          // Keep Real Time focused when another tab is selected for audio capture.
          controller?.setFocusBehavior("no-focus-change");
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
            ...(controller ? { controller } : {}),
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
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        nextInput = "microphone";
      }

      const audioContext = new AudioContext();
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = ANALYSER_SIZE;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      streamRef.current = stream;
      contextRef.current = audioContext;
      setInputKind(nextInput);
      drawWaveform(analyser);
      stream.getTracks().forEach((track) => track.addEventListener("ended", stop, { once: true }));
    } catch {
      stopMediaStream(stream);
      setInputKind("idle");
    } finally {
      setIsStarting(false);
    }
  }, [drawWaveform, isStarting, stop]);

  useEffect(() => stop, [stop]);

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/works/laboratory" aria-label="Back to laboratory">
        <ArrowLeft aria-hidden="true" size={19} strokeWidth={1.4} />
      </Link>

      <section className={styles.stage} aria-label="Real-time audio waveform">
        <div className={styles.visualization}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            aria-label="Real-time audio waveform with past samples on the left, the current sample on the right, and amplitude on the vertical axis"
          />
        </div>

        <button
          className={`${styles.button} ${inputKind !== "idle" ? styles.active : ""}`}
          type="button"
          onClick={inputKind === "idle" ? start : stop}
          disabled={isStarting}
          aria-label={inputKind === "idle" ? "Start listening" : "Stop listening"}
          title={inputKind === "idle" ? "Start listening" : "Stop listening"}
        >
          {inputKind === "idle"
            ? <Mic aria-hidden="true" size={23} strokeWidth={1.5} />
            : <Square aria-hidden="true" size={17} strokeWidth={1.5} />}
        </button>
      </section>

      <div className={styles.menuRoot}>
        {menuOpen && (
          <div className={styles.menu} onClick={(event) => event.stopPropagation()}>
            <div className={styles.menuHeader}>
              <span>REAL TIME</span>
              <div className={styles.menuLinks}>
                <Link href="/" aria-label="Home"><Home aria-hidden="true" size={16} /></Link>
                <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical aria-hidden="true" size={16} /></Link>
              </div>
            </div>
            <section className={styles.menuSection}>
              <h2>Time domain</h2>
              <div className={styles.signalDetails}>
                <span>Window <b>{HISTORY_SECONDS.toFixed(1)} s</b></span>
                <span>Direction <b>Past → Now</b></span>
                <span>Amplitude <b>−1 → +1</b></span>
              </div>
            </section>
          </div>
        )}
        <button
          type="button"
          className={`${styles.menuButton} ${menuOpen ? styles.menuButtonActive : ""}`}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          M
        </button>
      </div>
    </main>
  );
}
