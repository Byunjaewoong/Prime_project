// app/works/emergence/core/types.ts

export type SimType = "lenia" | "boids" | "grayscott" | "physarum" | "atoms";

export interface Simulation {
  update(delta: number): void;
  render(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  resize(w: number, h: number): void;
  destroy(): void;
  // Optional pointer interaction — implement per sim as needed
  onPointerDown?(x: number, y: number, button: number): void;
  onPointerMove?(x: number, y: number, buttons: number): void;
  onPointerUp?(x: number, y: number, button: number): void;
  // Return true when the simulation handled its own camera zoom.
  onWheel?(x: number, y: number, deltaY: number): boolean;
  // Return true when the simulation handled a two-finger pinch scale.
  onPinch?(x: number, y: number, scale: number): boolean;
  // Optional: expose current runtime parameters for HUD display
  getParams?(): Record<string, number>;
}
