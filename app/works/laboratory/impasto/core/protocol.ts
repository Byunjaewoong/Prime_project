import type { Settings, Contact } from "./PaintSolver";
import type { FilmState } from "./PaintFilm";
export type PaintState = { positions: Float32Array; colors: Float32Array; count: number; capacity: number; speed: number; advanced: boolean; film?: FilmState };
export type Command = { type: "init"; capacity: number } | { type: "settings"; settings: Settings }
  | { type: "step"; contact: Contact | null; emit: number }
  | { type: "emit"; x: number; z: number; count: number }
  | { type: "remember" | "undo" | "clear" | "end" | "prepare" };
