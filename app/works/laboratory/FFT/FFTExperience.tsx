"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FlaskConical, Home, Mic, Square } from "lucide-react";
import { bandEnergy, BEAT_FFT_SIZE, createOnsetState, updateOnset } from "@/app/lib/audioBeatDetection";
import styles from "./fft.module.css";

type InputKind = "idle" | "system" | "microphone";
type FrequencyScale = "log" | "linear";
type CaptureFocusController = {
  setFocusBehavior: (behavior: "no-focus-change") => void;
};

const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;
const BEAT_LABELS = ["KICK / BASS", "SNARE", "HI-HAT"] as const;

type MutedColor = {
  hue: number;
  saturation: number;
  lightness: number;
};

function peakAmplitude(spectrum: Uint8Array, binWidth: number, minimumFrequency: number, maximumFrequency: number) {
  const firstBin = Math.max(0, Math.floor(minimumFrequency / binWidth));
  const lastBin = Math.min(spectrum.length - 1, Math.max(firstBin, Math.ceil(maximumFrequency / binWidth)));
  let peak = 0;
  for (let bin = firstBin; bin <= lastBin; bin += 1) peak = Math.max(peak, spectrum[bin]);
  return peak / 255;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || window.matchMedia("(pointer: coarse)").matches;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function FFTExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beatCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const detectionRef = useRef({ kick: true, snare: true, hiHat: true });
  const frequencyScaleRef = useRef<FrequencyScale>("log");
  const onsetRef = useRef({ kick: createOnsetState(), snare: createOnsetState(), hiHat: createOnsetState() });
  const hiHatColorRef = useRef<MutedColor>({ hue: 205, saturation: 20, lightness: 42 });
  const [inputKind, setInputKind] = useState<InputKind>("idle");
  const [isStarting, setIsStarting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [kickEnabled, setKickEnabled] = useState(true);
  const [snareEnabled, setSnareEnabled] = useState(true);
  const [hiHatEnabled, setHiHatEnabled] = useState(true);
  const [frequencyScale, setFrequencyScale] = useState<FrequencyScale>("log");

  const setDetection = useCallback((kind: "kick" | "snare" | "hiHat", enabled: boolean) => {
    detectionRef.current[kind] = enabled;
    if (kind === "kick") setKickEnabled(enabled);
    else if (kind === "snare") setSnareEnabled(enabled);
    else setHiHatEnabled(enabled);
  }, []);

  const selectFrequencyScale = useCallback((scale: FrequencyScale) => {
    frequencyScaleRef.current = scale;
    setFrequencyScale(scale);
  }, []);

  const drawBeatRings = useCallback((pulses: readonly number[], now: number) => {
    const canvas = beatCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);

    const radius = Math.min(34, Math.max(18, bounds.width * 0.065));
    const centerY = Math.max(radius + 7, bounds.height * 0.12);
    for (let index = 0; index < 3; index += 1) {
      const pulse = pulses[index] ?? 0;
      const centerX = bounds.width * (index + 1) / 4;
      const ringRadius = radius + pulse * 6;
      context.beginPath();
      for (let point = 0; point <= 96; point += 1) {
        const angle = point / 96 * Math.PI * 2;
        const vibration = pulse * (
          Math.sin(angle * (11 + index * 3) + now * 0.028) * 1.5
          + Math.sin(angle * (19 + index * 2) - now * 0.019) * 0.7
        );
        const x = centerX + Math.cos(angle) * (ringRadius + vibration);
        const y = centerY + Math.sin(angle) * (ringRadius + vibration);
        if (point === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = `rgba(5, 5, 5, ${0.36 + pulse * 0.62})`;
      context.lineWidth = 1.1 + pulse * 0.35;
      context.stroke();
      context.fillStyle = `rgba(5, 5, 5, ${0.42 + pulse * 0.4})`;
      context.font = "10px monospace";
      context.textAlign = "center";
      context.fillText(BEAT_LABELS[index], centerX, centerY + radius + 23);
    }
  }, []);

  const stop = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    onsetRef.current = { kick: createOnsetState(), snare: createOnsetState(), hiHat: createOnsetState() };
    drawBeatRings([0, 0, 0], 0);
    setInputKind("idle");
  }, [drawBeatRings]);

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
      const maximumUsefulColumns = Math.max(1, Math.floor((MAX_FREQUENCY - MIN_FREQUENCY) / binWidth));
      const columns = Math.max(1, Math.min(Math.max(160, Math.floor(graphWidth)), maximumUsefulColumns));
      const now = performance.now();
      const kickPulse = updateOnset(
        onsetRef.current.kick,
        bandEnergy(spectrum, binWidth, 40, 160),
        now,
        0.035,
        120,
        detectionRef.current.kick,
      );
      const snarePulse = updateOnset(
        onsetRef.current.snare,
        bandEnergy(spectrum, binWidth, 180, 2800),
        now,
        0.026,
        100,
        detectionRef.current.snare,
        0.87,
      );
      const hiHatPulse = updateOnset(
        onsetRef.current.hiHat,
        bandEnergy(spectrum, binWidth, 5000, 15000),
        now,
        0.018,
        68,
        detectionRef.current.hiHat,
        0.92,
      );

      if (hiHatPulse === 1) {
        hiHatColorRef.current = {
          hue: Math.floor(Math.random() * 360),
          saturation: 16 + Math.random() * 14,
          lightness: 34 + Math.random() * 12,
        };
      }

      context.beginPath();
      for (let column = 0; column <= columns; column += 1) {
        const progress = column / columns;
        const linearScale = frequencyScaleRef.current === "linear";
        const frequency = linearScale
          ? MIN_FREQUENCY + progress * (MAX_FREQUENCY - MIN_FREQUENCY)
          : 10 ** (logMin + progress * logRange);
        const amplitude = linearScale
          ? peakAmplitude(
            spectrum,
            binWidth,
            MIN_FREQUENCY + Math.max(0, column - 0.5) / columns * (MAX_FREQUENCY - MIN_FREQUENCY),
            MIN_FREQUENCY + Math.min(columns, column + 0.5) / columns * (MAX_FREQUENCY - MIN_FREQUENCY),
          )
          : spectrum[Math.min(spectrum.length - 1, Math.max(0, Math.round(frequency / binWidth)))] / 255;
        const x = left + progress * graphWidth;
        const y = baseline - amplitude * graphHeight * 0.76;
        if (column === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      const hiHatColor = hiHatColorRef.current;
      context.strokeStyle = hiHatPulse > 0.01
        ? `hsl(${hiHatColor.hue} ${hiHatColor.saturation * hiHatPulse}% ${2 + (hiHatColor.lightness - 2) * hiHatPulse}%)`
        : "#050505";
      context.lineWidth = 1.35 + kickPulse * 3.4;
      context.lineJoin = "round";
      context.stroke();
      drawBeatRings([kickPulse, snarePulse, hiHatPulse], now);

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
  }, [drawBeatRings]);

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
          // Decide before opening the picker so Chrome keeps FFT in front when sharing starts.
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
      analyser.fftSize = BEAT_FFT_SIZE;
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

  useEffect(() => {
    drawBeatRings([0, 0, 0], 0);
    const observer = new ResizeObserver(() => {
      if (animationRef.current === null) drawBeatRings([0, 0, 0], 0);
    });
    if (beatCanvasRef.current) observer.observe(beatCanvasRef.current);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [drawBeatRings, stop]);

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
          <canvas
            ref={beatCanvasRef}
            className={styles.beatCanvas}
            aria-label="Kick and bass, snare, and hi-hat beat indicators"
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
              <span>FFT</span>
              <div className={styles.menuLinks}>
                <Link href="/" aria-label="Home"><Home aria-hidden="true" size={16} /></Link>
                <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical aria-hidden="true" size={16} /></Link>
              </div>
            </div>
            <section className={styles.menuSection}>
              <h2>Frequency scale</h2>
              <div className={styles.scaleOptions} role="group" aria-label="Frequency axis scale">
                {(["log", "linear"] as const).map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    className={`${styles.scaleOption} ${frequencyScale === scale ? styles.scaleOptionActive : ""}`}
                    onClick={() => selectFrequencyScale(scale)}
                    aria-pressed={frequencyScale === scale}
                  >
                    {scale === "log" ? "Log" : "Linear"}
                  </button>
                ))}
              </div>
            </section>
            <section className={styles.menuSection}>
              <h2>Beat detection</h2>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setDetection("kick", !kickEnabled)}
                aria-pressed={kickEnabled}
              >
                <span>Kick / Bass</span>
                <span className={`${styles.switch} ${kickEnabled ? styles.switchOn : ""}`} aria-hidden="true"><i /></span>
              </button>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setDetection("snare", !snareEnabled)}
                aria-pressed={snareEnabled}
              >
                <span>Snare</span>
                <span className={`${styles.switch} ${snareEnabled ? styles.switchOn : ""}`} aria-hidden="true"><i /></span>
              </button>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setDetection("hiHat", !hiHatEnabled)}
                aria-pressed={hiHatEnabled}
              >
                <span>Hi-hat</span>
                <span className={`${styles.switch} ${hiHatEnabled ? styles.switchOn : ""}`} aria-hidden="true"><i /></span>
              </button>
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
