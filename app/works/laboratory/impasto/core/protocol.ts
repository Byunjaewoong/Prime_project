import type { Settings, Contact } from "./PaintSolver";
export type PaintState = { positions: Float32Array; colors: Float32Array; count: number; capacity: number; speed: number; advanced: boolean };
export type Command = { type: "init"; capacity: number } | { type: "settings"; settings: Settings }
  | { type: "step"; contact: Contact | null; emit: number }
  | { type: "emit"; x: number; z: number; count: number }
  | { type: "remember" | "undo" | "clear" | "end" };
