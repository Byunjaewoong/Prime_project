"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Mic, Square } from "lucide-react";
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
  }, []);

  const drawSpectrum = useCallback((analyser: AnalyserNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const spectrum = new Uint8Array(analyser.frequencyBinCount);
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
      const left = 2;
      const right = 2;
      const top = 8;
      const bottom = 2;
      const graphWidth = Math.max(1, viewWidth - left - right);
      const graphHeight = Math.max(1, viewHeight - top - bottom);
      const baseline = top + graphHeight * 0.82;

      analyser.getByteFrequencyData(spectrum);
      context.clearRect(0, 0, viewWidth, viewHeight);

      const logMin = Math.log10(MIN_FREQUENCY);
      const logRange = Math.log10(MAX_FREQUENCY) - logMin;
      const sampleRate = analyser.context.sampleRate;
      const binWidth = sampleRate / analyser.fftSize;
      const columns = Math.max(240, Math.floor(graphWidth));

      context.beginPath();
      for (let column = 0; column <= columns; column += 1) {
        const progress = column / columns;
        const frequency = 10 ** (logMin + progress * logRange);
        const bin = Math.min(spectrum.length - 1, Math.max(0, Math.round(frequency / binWidth)));
        const amplitude = spectrum[bin] / 255;
        const x = left + progress * graphWidth;
        const y = baseline - amplitude * graphHeight * 0.76;
        if (column === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = "#050505";
      context.lineWidth = 1.35;
      context.lineJoin = "round";
      context.stroke();

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
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
      drawSpectrum(analyser);

      stream.getTracks().forEach((track) => {
        track.addEventListener("ended", stop, { once: true });
      });
    } catch {
      stopMediaStream(stream);
      setInputKind("idle");
    } finally {
      setIsStarting(false);
    }
  }, [drawSpectrum, isStarting, stop]);

  useEffect(() => stop, [stop]);

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/works/laboratory" aria-label="Back to laboratory">
        <ArrowLeft aria-hidden="true" size={19} strokeWidth={1.4} />
      </Link>

      <section className={styles.stage} aria-label="Real-time frequency spectrum">
        <div className={styles.visualization}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            aria-label="Real-time audio frequency spectrum with frequency on the horizontal axis and amplitude on the vertical axis"
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
    </main>
  );
}
