export const BEAT_FFT_SIZE = 4096;

export type OnsetState = {
  previousEnergy: number;
  averageFlux: number;
  cooldownUntil: number;
  pulse: number;
};

export function createOnsetState(): OnsetState {
  return { previousEnergy: 0, averageFlux: 0, cooldownUntil: 0, pulse: 0 };
}

export function bandEnergy(
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

export function updateOnset(
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
