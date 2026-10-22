import { PaintSolver } from "./PaintSolver";
import type { Command, PaintState } from "./protocol";
let solver: PaintSolver | null = null;
function publish(speed = 0, advanced = false) {
  if (!solver) return;
  const state: PaintState = { positions: solver.positions.slice(0, solver.count * 3), colors: solver.colors.slice(0, solver.count * 3), count: solver.count, capacity: solver.capacity, speed, advanced };
  self.postMessage(state, { transfer: [state.positions.buffer, state.colors.buffer] });
}
self.onmessage = (event: MessageEvent<Command>) => {
  const c = event.data;
  if (c.type === "init") {
    solver = new PaintSolver(c.capacity);
    for (let i = 0; i < 5; i++) solver.emit(-.18 + i * .09, 0, 80);
    publish(); return;
  }
  if (!solver) return;
  if (c.type === "settings") solver.settings = c.settings;
  else if (c.type === "remember") solver.remember();
  else if (c.type === "end") solver.endContact();
  else if (c.type === "clear") { solver.clear(); publish(); }
  else if (c.type === "undo") { solver.undo(); publish(); }
  else if (c.type === "emit") { solver.emit(c.x, c.z, c.count); publish(); }
  else if (c.type === "step") {
    if (c.emit && c.contact) solver.emit(c.contact.x, c.contact.z, c.emit);
    publish(solver.step(1 / 60, c.contact), true);
  }
};
