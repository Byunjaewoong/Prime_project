import { useCallback, useEffect, useRef, useState } from "react";
import { bandEnergy, BEAT_FFT_SIZE, createOnsetState, updateOnset } from "@/app/lib/audioBeatDetection";
import type { RefObject } from "react";
import type { App as EmergenceApp } from "./core/App";

export type AtomBeat = "kick" | "snare" | "hiHat";
export type AtomBeatParameter = "repel" | "forceFactor" | "friction" | "particleSize";
export type AtomBeatAction = "off" | "matrix" | "palette" | AtomBeatParameter;
export type AtomBeatPreset = 0 | 1 | 2;

export const ATOM_BEAT_RANGES: Record<AtomBeatParameter, {
  label: string; min: number; max: number; step: number; decimals: number;
}> = {
  repel: { label: "repel force", min: 0.01, max: 12, step: 0.01, decimals: 2 },
  forceFactor: { label: "force multiplier", min: 0.01, max: 2, step: 0.01, decimals: 2 },
  friction: { label: "friction", min: 0, max: 1, step: 0.01, decimals: 2 },
  particleSize: { label: "particle size", min: 0.1, max: 6, step: 0.1, decimals: 1 },
};

type BeatAssignment = { action: AtomBeatAction; targets: Record<AtomBeatParameter, number> };
type BeatAssignments = Record<AtomBeat, BeatAssignment>;
type ActivePulse = { startedAt: number; target: number };
type CaptureFocusController = { setFocusBehavior: (behavior: "no-focus-change") => void };

const BEATS: AtomBeat[] = ["kick", "snare", "hiHat"];
const PARAMETERS = Object.keys(ATOM_BEAT_RANGES) as AtomBeatParameter[];
const PULSE_DURATION = 420;

function initialAssignments(): BeatAssignments {
  const targets = { repel: 2, forceFactor: 1.2, friction: 1, particleSize: 4 };
  return {
    kick: { action: "matrix", targets: { ...targets } },
    snare: { action: "friction", targets: { ...targets } },
    hiHat: { action: "palette", targets: { ...targets } },
  };
}

function presetAssignments(preset: AtomBeatPreset): BeatAssignments {
  const assignments = initialAssignments();
  if (preset !== 0) assignments.snare.action = "forceFactor";
  if (preset === 2) {
    assignments.hiHat.action = "repel";
    assignments.hiHat.targets.repel = 12;
  }
  return assignments;
}

function isNumericAction(action: AtomBeatAction): action is AtomBeatParameter {
  return action in ATOM_BEAT_RANGES;
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || window.matchMedia("(pointer: coarse)").matches;
}

export function useAtomBeatAudio(appRef: RefObject<EmergenceApp | null>, isAtoms: boolean) {
  const [assignments, setAssignments] = useState<BeatAssignments>(initialAssignments);
  const assignmentsRef = useRef(assignments);
  const [inputKind, setInputKind] = useState<"idle" | "system" | "microphone">("idle");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const requestVersionRef = useRef(0);
  const baseRef = useRef<Partial<Record<AtomBeatParameter, number>>>({});
  const activeRef = useRef<Partial<Record<AtomBeatParameter, ActivePulse>>>({});

  const setAction = useCallback((beat: AtomBeat, action: AtomBeatAction) => {
    const next = { ...assignmentsRef.current, [beat]: { ...assignmentsRef.current[beat], action } };
    assignmentsRef.current = next;
    setAssignments(next);
  }, []);

  const setTarget = useCallback((beat: AtomBeat, key: AtomBeatParameter, rawValue: number) => {
    const range = ATOM_BEAT_RANGES[key];
    const value = Math.max(range.min, Math.min(range.max,
      Number((range.min + Math.round((rawValue - range.min) / range.step) * range.step).toFixed(5))));
    const next = {
      ...assignmentsRef.current,
      [beat]: {
        ...assignmentsRef.current[beat],
        targets: { ...assignmentsRef.current[beat].targets, [key]: value },
      },
    };
    assignmentsRef.current = next;
    setAssignments(next);
  }, []);

  const selectPreset = useCallback((preset: AtomBeatPreset) => {
    for (const key of PARAMETERS) {
      if (activeRef.current[key] && baseRef.current[key] !== undefined) {
        appRef.current?.setSimParam(key, baseRef.current[key]);
      }
    }
    activeRef.current = {};
    const next = presetAssignments(preset);
    assignmentsRef.current = next;
    setAssignments(next);
  }, [appRef]);

  const setBaseParameter = useCallback((key: AtomBeatParameter, value: number) => {
    baseRef.current[key] = value;
    if (!activeRef.current[key]) appRef.current?.setSimParam(key, value);
  }, [appRef]);

  const setParticleSetting = useCallback((key: "particles" | "colors", value: number) => {
    appRef.current?.setSimParam(key, value);
  }, [appRef]);

  const getDisplayParams = useCallback((params: Record<string, number> | null) => {
    if (!params) return null;
    const displayed = { ...params };
    for (const key of PARAMETERS) {
      if (activeRef.current[key] && baseRef.current[key] !== undefined) {
        displayed[key] = baseRef.current[key];
      }
    }
    return displayed;
  }, []);

  const stop = useCallback(() => {
    requestVersionRef.current += 1;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    stopTracks(streamRef.current);
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    for (const key of PARAMETERS) {
      if (activeRef.current[key] && baseRef.current[key] !== undefined) {
        appRef.current?.setSimParam(key, baseRef.current[key]);
      }
    }
    activeRef.current = {};
    setInputKind("idle");
    setStarting(false);
  }, [appRef]);

  const start = useCallback(async () => {
    if (starting || inputKind !== "idle" || !isAtoms) return;
    const requestVersion = ++requestVersionRef.current;
    setStarting(true);
    setError(null);
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let sourceKind: "system" | "microphone" = "microphone";

    try {
      if (!isMobileDevice() && typeof navigator.mediaDevices?.getDisplayMedia === "function") {
        try {
          const Controller = (window as typeof window & {
            CaptureController?: new () => CaptureFocusController;
          }).CaptureController;
          const controller = Controller && "setFocusBehavior" in Controller.prototype
            ? new Controller()
            : undefined;
          controller?.setFocusBehavior("no-focus-change");
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
            ...(controller ? { controller } : {}),
          });
          if (displayStream.getAudioTracks().length > 0) {
            stream = displayStream;
            sourceKind = "system";
          } else {
            stopTracks(displayStream);
          }
        } catch {
          // Use the microphone if tab audio was declined or unavailable.
        }
      }

      if (requestVersion !== requestVersionRef.current) {
        stopTracks(stream);
        return;
      }
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      }
      if (requestVersion !== requestVersionRef.current) {
        stopTracks(stream);
        return;
      }

      audioContext = new AudioContext();
      await audioContext.resume();
      if (requestVersion !== requestVersionRef.current) {
        stopTracks(stream);
        void audioContext.close();
        return;
      }
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = BEAT_FFT_SIZE;
      analyser.smoothingTimeConstant = 0.78;
      analyser.minDecibels = -96;
      analyser.maxDecibels = -18;
      source.connect(analyser);

      const params = appRef.current?.getSimParams();
      for (const key of PARAMETERS) {
        if (params?.[key] !== undefined) baseRef.current[key] = params[key];
      }
      streamRef.current = stream;
      contextRef.current = audioContext;
      setInputKind(sourceKind);

      const spectrum = new Uint8Array(analyser.frequencyBinCount);
      const onset = {
        kick: createOnsetState(),
        snare: createOnsetState(),
        hiHat: createOnsetState(),
      };
      const draw = (now: number) => {
        if (requestVersion !== requestVersionRef.current) return;
        analyser.getByteFrequencyData(spectrum);
        const binWidth = analyser.context.sampleRate / analyser.fftSize;
        const beats = {
          kick: updateOnset(onset.kick, bandEnergy(spectrum, binWidth, 40, 160), now, 0.035, 120, true),
          snare: updateOnset(onset.snare, bandEnergy(spectrum, binWidth, 180, 2800), now, 0.026, 100, true, 0.87),
          hiHat: updateOnset(onset.hiHat, bandEnergy(spectrum, binWidth, 5000, 15000), now, 0.018, 68, true, 0.92),
        };

        for (const beat of BEATS) {
          if (beats[beat] !== 1) continue;
          const { action, targets } = assignmentsRef.current[beat];
          if (action === "matrix") appRef.current?.randomiseParams();
          else if (action === "palette") appRef.current?.randomiseColors();
          else if (isNumericAction(action)) {
            if (!activeRef.current[action]) {
              baseRef.current[action] = appRef.current?.getSimParams()?.[action] ?? baseRef.current[action];
            }
            activeRef.current[action] = { startedAt: now, target: targets[action] };
          }
        }

        for (const key of PARAMETERS) {
          const pulse = activeRef.current[key];
          const base = baseRef.current[key];
          if (!pulse || base === undefined) continue;
          const progress = Math.min(1, (now - pulse.startedAt) / PULSE_DURATION);
          if (progress >= 1) {
            appRef.current?.setSimParam(key, base);
            delete activeRef.current[key];
          } else {
            const amount = (1 - progress) ** 2;
            appRef.current?.setSimParam(key, base + (pulse.target - base) * amount);
          }
        }
        frameRef.current = requestAnimationFrame(draw);
      };
      frameRef.current = requestAnimationFrame(draw);
      stream.getTracks().forEach((track) => track.addEventListener("ended", stop, { once: true }));
    } catch {
      stopTracks(stream);
      if (audioContext) void audioContext.close();
      if (requestVersion === requestVersionRef.current) {
        setError("Audio permission or input unavailable.");
        setInputKind("idle");
      }
    } finally {
      if (requestVersion === requestVersionRef.current) setStarting(false);
    }
  }, [appRef, inputKind, isAtoms, starting, stop]);

  useEffect(() => stop, [stop]);

  return { assignments, inputKind, starting, error, start, stop, setAction, setTarget, selectPreset, setBaseParameter, setParticleSetting, getDisplayParams };
}
