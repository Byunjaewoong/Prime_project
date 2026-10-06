const MIN_VOICE_PITCH = 80;
const MAX_VOICE_PITCH = 900;
const DECIMATION = 4;

// Estimate the first strong periodicity in the waveform (YIN difference function).
// This measures pitch in voice-like audio; it does not separate vocals from instruments.
export function estimateVoicePitch(samples: Float32Array, sampleRate: number): number | null {
  const length = Math.floor(samples.length / DECIMATION);
  const waveform = new Float32Array(length);
  let power = 0;
  for (let index = 0; index < length; index += 1) {
    let sample = 0;
    for (let offset = 0; offset < DECIMATION; offset += 1) {
      sample += samples[index * DECIMATION + offset];
    }
    waveform[index] = sample / DECIMATION;
    power += waveform[index] * waveform[index];
  }
  if (length < 32 || Math.sqrt(power / length) < 0.01) return null;

  const reducedRate = sampleRate / DECIMATION;
  const minimumLag = Math.max(2, Math.floor(reducedRate / MAX_VOICE_PITCH));
  const maximumLag = Math.min(Math.floor(reducedRate / MIN_VOICE_PITCH), Math.floor(length / 2) - 1);
  if (minimumLag >= maximumLag) return null;

  const windowLength = Math.floor(length / 2);
  const difference = new Float32Array(maximumLag + 1);
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    let sum = 0;
    for (let index = 0; index < windowLength; index += 1) {
      const delta = waveform[index] - waveform[index + lag];
      sum += delta * delta;
    }
    difference[lag] = sum;
  }

  let runningSum = 0;
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    runningSum += difference[lag];
    difference[lag] = runningSum > 0 ? difference[lag] * lag / runningSum : 1;
  }

  for (let lag = minimumLag; lag < maximumLag; lag += 1) {
    if (difference[lag] >= 0.17) continue;
    while (lag + 1 < maximumLag && difference[lag + 1] < difference[lag]) lag += 1;
    const previous = difference[lag - 1];
    const current = difference[lag];
    const next = difference[lag + 1];
    const denominator = previous - 2 * current + next;
    const refinedLag = Math.abs(denominator) > 1e-6
      ? lag + Math.max(-0.5, Math.min(0.5, (previous - next) / (2 * denominator)))
      : lag;
    const pitch = reducedRate / refinedLag;
    return pitch >= MIN_VOICE_PITCH && pitch <= MAX_VOICE_PITCH ? pitch : null;
  }
  return null;
}
