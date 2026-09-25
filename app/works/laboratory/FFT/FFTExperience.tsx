"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FlaskConical, Home, Mic, Square } from "lucide-react";
import styles from "./fft.module.css";

type InputKind = "idle" | "system" | "microphone";

const FFT_SIZE = 4096;
const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 20000;

type OnsetState = {
  previousEnergy: number;
  averageFlux: number;
  cooldownUntil: number;
  pulse: number;
};

type MutedColor = {
  hue: number;
  saturation: number;
  lightness: number;
};

type SketchStroke = {
  id: string;
  group: "head" | "hair" | "ear" | "jaw" | "neck" | "shoulder" | "detail";
  d: string;
  width?: number;
  opacity?: number;
};

const FACE_TOP = 150;
const FACE_BOTTOM = 790;
const FACE_PROFILE: Array<[number, number]> = [
  [150, 285], [205, 250], [270, 218], [335, 202], [395, 185],
  [450, 157], [495, 135], [530, 92], [555, 82], [575, 126],
  [598, 148], [620, 137], [648, 158], [690, 170], [740, 176], [790, 190],
];

const SKETCH_STROKES: SketchStroke[] = [
  { id: "crown-main", group: "head", width: 1.8, d: "M285 150 C390 112 548 94 665 112 C736 137 806 203 846 282" },
  { id: "crown-overdraw-a", group: "hair", opacity: 0.72, d: "M314 141 C426 103 566 99 660 108 C727 126 789 190 833 257" },
  { id: "crown-overdraw-b", group: "hair", opacity: 0.62, d: "M355 126 C478 100 594 99 682 121 C731 149 780 197 817 239" },
  { id: "crown-short", group: "hair", opacity: 0.58, d: "M405 119 C501 91 613 96 690 125" },
  { id: "temple-slash-a", group: "hair", d: "M282 150 L236 224 L222 258" },
  { id: "temple-slash-b", group: "hair", opacity: 0.68, d: "M298 145 L248 207 L224 247" },
  { id: "skull-main", group: "head", width: 1.8, d: "M665 112 C754 145 825 225 861 322 C898 423 874 540 818 632 C786 685 747 724 700 752" },
  { id: "skull-overdraw-a", group: "hair", opacity: 0.72, d: "M682 104 C766 164 830 232 865 327 C891 398 889 469 868 528" },
  { id: "skull-overdraw-b", group: "hair", opacity: 0.56, d: "M706 125 C783 194 835 260 856 338" },
  { id: "back-long", group: "hair", opacity: 0.76, d: "M843 265 C868 335 887 421 891 505 C891 532 884 555 874 572" },
  { id: "back-short-a", group: "hair", d: "M857 339 C878 393 883 447 881 489" },
  { id: "back-short-b", group: "hair", opacity: 0.58, d: "M864 372 C876 415 879 452 875 480" },
  { id: "nape-main", group: "hair", width: 1.8, d: "M818 632 C783 684 744 727 700 752" },
  { id: "nape-accent-a", group: "hair", opacity: 0.72, d: "M824 607 C794 662 755 708 714 739" },
  { id: "nape-accent-b", group: "hair", opacity: 0.58, d: "M835 616 C805 680 766 716 731 743" },
  { id: "nape-accent-c", group: "hair", opacity: 0.52, d: "M802 656 C780 698 747 727 718 748" },
  { id: "ear-rim", group: "ear", width: 1.55, d: "M455 522 C505 496 548 518 561 570 C573 622 546 681 501 704 C466 720 431 697 424 663 C418 640 431 620 445 610" },
  { id: "ear-inner-a", group: "ear", d: "M458 558 C483 548 508 570 514 597 C520 624 503 657 480 664 C462 670 447 653 454 636 C459 624 469 619 476 607" },
  { id: "ear-inner-b", group: "ear", opacity: 0.72, d: "M478 575 C496 589 500 610 492 628 C486 643 474 653 465 660" },
  { id: "ear-inner-c", group: "detail", opacity: 0.62, d: "M459 633 C447 645 444 659 451 671" },
  { id: "ear-back", group: "ear", opacity: 0.68, d: "M528 535 C553 566 558 612 542 649 C530 678 511 699 486 709" },
  { id: "jaw-main", group: "jaw", width: 1.8, d: "M190 790 C255 800 333 809 406 816 C433 790 448 750 454 699" },
  { id: "jaw-overdraw-a", group: "jaw", opacity: 0.68, d: "M192 781 C260 798 334 803 397 810 C424 784 440 747 447 706" },
  { id: "jaw-overdraw-b", group: "jaw", opacity: 0.5, d: "M229 799 C291 808 345 816 402 821" },
  { id: "neck-front", group: "neck", width: 1.6, d: "M406 816 C401 868 420 906 451 939 C469 965 470 1007 454 1048" },
  { id: "neck-front-a", group: "neck", opacity: 0.66, d: "M392 822 C399 859 409 885 434 914" },
  { id: "neck-front-b", group: "neck", opacity: 0.5, d: "M446 702 C442 748 440 781 444 813" },
  { id: "neck-back", group: "neck", width: 1.7, d: "M700 752 C704 804 712 858 741 906 C780 969 820 1007 849 1037" },
  { id: "neck-back-a", group: "neck", opacity: 0.68, d: "M716 743 C711 801 729 865 760 915 C789 961 823 994 862 1022" },
  { id: "neck-back-b", group: "neck", opacity: 0.54, d: "M729 775 C734 829 752 871 778 910" },
  { id: "shoulder-front", group: "shoulder", width: 1.65, d: "M454 1048 C441 1091 418 1128 389 1158" },
  { id: "shoulder-front-a", group: "shoulder", opacity: 0.68, d: "M469 1050 C455 1097 431 1136 405 1163" },
  { id: "shoulder-top", group: "shoulder", width: 1.8, d: "M389 1158 C429 1182 464 1201 500 1216 C615 1185 720 1168 844 1120" },
  { id: "shoulder-overdraw-a", group: "shoulder", opacity: 0.68, d: "M405 1149 C443 1177 471 1191 505 1205" },
  { id: "shoulder-overdraw-b", group: "shoulder", opacity: 0.6, d: "M585 1193 C673 1172 753 1157 827 1130" },
  { id: "shoulder-overdraw-c", group: "shoulder", opacity: 0.5, d: "M611 1185 C684 1168 750 1156 805 1138" },
  { id: "collar-a", group: "detail", opacity: 0.68, d: "M420 1014 L466 1028" },
  { id: "collar-b", group: "detail", opacity: 0.54, d: "M434 1022 L480 1040" },
  { id: "back-mark-a", group: "detail", opacity: 0.58, d: "M784 938 L792 935" },
  { id: "back-mark-b", group: "detail", opacity: 0.52, d: "M793 968 L798 965" },
];

function profileXAt(y: number) {
  for (let index = 1; index < FACE_PROFILE.length; index += 1) {
    const previous = FACE_PROFILE[index - 1];
    const next = FACE_PROFILE[index];
    if (y <= next[0]) {
      const progress = (y - previous[0]) / (next[0] - previous[0]);
      return previous[1] + (next[1] - previous[1]) * progress;
    }
  }
  return FACE_PROFILE[FACE_PROFILE.length - 1][1];
}

function createFacePath(spectrum?: Uint8Array, binWidth?: number) {
  const points = 112;
  const logMinimum = Math.log10(MIN_FREQUENCY);
  const logMaximum = Math.log10(MAX_FREQUENCY);
  let path = "";

  for (let index = 0; index < points; index += 1) {
    const progress = index / (points - 1);
    const y = FACE_TOP + (FACE_BOTTOM - FACE_TOP) * progress;
    const frequency = 10 ** (logMaximum - progress * (logMaximum - logMinimum));
    const bin = spectrum && binWidth
      ? Math.min(spectrum.length - 1, Math.max(0, Math.round(frequency / binWidth)))
      : 0;
    const amplitude = spectrum ? spectrum[bin] / 255 : 0;
    const endpointEnvelope = Math.sin(Math.PI * progress) ** 0.32;
    const displacement = amplitude * 155 * endpointEnvelope;
    const x = Math.max(24, profileXAt(y) - displacement);
    path += `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
  }

  return path.trim();
}

const IDLE_FACE_PATH = createFacePath();

function createOnsetState(): OnsetState {
  return { previousEnergy: 0, averageFlux: 0, cooldownUntil: 0, pulse: 0 };
}

function bandEnergy(
  spectrum: Uint8Array,
  binWidth: number,
  minimumFrequency: number,
  maximumFrequency: number,
) {
  const firstBin = Math.max(1, Math.floor(minimumFrequency / binWidth));
  const lastBin = Math.min(spectrum.length - 1, Math.ceil(maximumFrequency / binWidth));
  let energy = 0;
  let samples = 0;

  for (let bin = firstBin; bin <= lastBin; bin += 1) {
    const amplitude = spectrum[bin] / 255;
    energy += amplitude * amplitude;
    samples += 1;
  }

  return samples > 0 ? Math.sqrt(energy / samples) : 0;
}

function updateOnset(
  state: OnsetState,
  energy: number,
  now: number,
  threshold: number,
  cooldown: number,
  enabled: boolean,
  decay = 0.84,
) {
  const flux = Math.max(0, energy - state.previousEnergy);
  state.averageFlux = state.averageFlux * 0.94 + flux * 0.06;
  const adaptiveThreshold = Math.max(threshold, state.averageFlux * 2.35);

  if (enabled && energy > 0.08 && flux > adaptiveThreshold && now >= state.cooldownUntil) {
    state.pulse = 1;
    state.cooldownUntil = now + cooldown;
  } else {
    state.pulse *= decay;
  }

  if (!enabled) state.pulse = 0;
  state.previousEnergy = energy;
  return state.pulse;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || window.matchMedia("(pointer: coarse)").matches;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function FFTExperience() {
  const spectrumPathRef = useRef<SVGPathElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const detectionRef = useRef({ kick: true, hiHat: true });
  const onsetRef = useRef({ kick: createOnsetState(), hiHat: createOnsetState() });
  const hiHatColorRef = useRef<MutedColor>({ hue: 205, saturation: 20, lightness: 42 });
  const [inputKind, setInputKind] = useState<InputKind>("idle");
  const [isStarting, setIsStarting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [kickEnabled, setKickEnabled] = useState(true);
  const [hiHatEnabled, setHiHatEnabled] = useState(true);

  const setDetection = useCallback((kind: "kick" | "hiHat", enabled: boolean) => {
    detectionRef.current[kind] = enabled;
    if (kind === "kick") setKickEnabled(enabled);
    else setHiHatEnabled(enabled);
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
    onsetRef.current = { kick: createOnsetState(), hiHat: createOnsetState() };
    spectrumPathRef.current?.setAttribute("d", IDLE_FACE_PATH);
    spectrumPathRef.current?.setAttribute("stroke", "#050505");
    spectrumPathRef.current?.setAttribute("stroke-width", "1.8");
    setInputKind("idle");
  }, []);

  const drawSpectrum = useCallback((analyser: AnalyserNode) => {
    const spectrumPath = spectrumPathRef.current;
    if (!spectrumPath) return;

    const spectrum = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(spectrum);
      const sampleRate = analyser.context.sampleRate;
      const binWidth = sampleRate / analyser.fftSize;
      const now = performance.now();
      const kickPulse = updateOnset(
        onsetRef.current.kick,
        bandEnergy(spectrum, binWidth, 40, 160),
        now,
        0.035,
        120,
        detectionRef.current.kick,
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

      const hiHatColor = hiHatColorRef.current;
      const stroke = hiHatPulse > 0.01
        ? `hsl(${hiHatColor.hue} ${hiHatColor.saturation * hiHatPulse}% ${2 + (hiHatColor.lightness - 2) * hiHatPulse}%)`
        : "#050505";
      spectrumPath.setAttribute("d", createFacePath(spectrum, binWidth));
      spectrumPath.setAttribute("stroke", stroke);
      spectrumPath.setAttribute("stroke-width", `${1.8 + kickPulse * 4.2}`);

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

      <section className={styles.stage} aria-label="A profile portrait drawn with a real-time frequency spectrum">
        <div className={styles.visualization}>
          <svg
            className={styles.portrait}
            viewBox="0 0 1000 1230"
            role="img"
            aria-label="A vector profile portrait whose face contour responds to the audio frequency spectrum"
          >
            <g className={styles.sketch}>
              {SKETCH_STROKES.map((stroke) => (
                <path
                  key={stroke.id}
                  d={stroke.d}
                  data-stroke-id={stroke.id}
                  data-stroke-group={stroke.group}
                  opacity={stroke.opacity ?? 0.86}
                  strokeWidth={stroke.width ?? 1.25}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
            <path
              ref={spectrumPathRef}
              className={styles.spectrumFace}
              d={IDLE_FACE_PATH}
              data-stroke-group="spectrum-face"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
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
