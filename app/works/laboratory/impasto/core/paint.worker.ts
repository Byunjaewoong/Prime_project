import { PaintSolver, PARTICLE_VOLUME } from "./PaintSolver";
import { PaintFilm } from "./PaintFilm";
import type { Command, PaintState } from "./protocol";
let solver: PaintSolver | null = null;
const film = new PaintFilm();
let lifted = false;
function publish(speed = 0, advanced = false) {
  if (!solver) return;
  const state: PaintState = { positions: solver.positions.slice(0, solver.count * 3), colors: solver.colors.slice(0, solver.count * 3), count: solver.count, capacity: solver.capacity, speed, advanced };
  const transfer: ArrayBuffer[] = [state.positions.buffer as ArrayBuffer, state.colors.buffer as ArrayBuffer];
  if (film.dirty) { state.film = film.snapshot(); film.dirty = false; transfer.push(state.film.height.buffer as ArrayBuffer, state.film.color.buffer as ArrayBuffer, state.film.grain.buffer as ArrayBuffer); }
  self.postMessage(state, { transfer });
}
self.onmessage = (event: MessageEvent<Command>) => {
  const c = event.data;
  if (c.type === "init") {
    solver = new PaintSolver(c.capacity);
    solver.substrate = (x, z) => film.sample(x, z); film.prepare();
    publish(); return;
  }
  if (!solver) return;
  if (c.type === "settings") solver.settings = c.settings;
  else if (c.type === "remember") { solver.remember(); film.remember(); }
  else if (c.type === "end") { solver.endContact(); film.end(); lifted = false; }
  else if (c.type === "clear") { solver.clear(); film.clear(); publish(); }
  else if (c.type === "prepare") { solver.clear(); film.prepare(Math.random() * 10000); publish(); }
  else if (c.type === "undo") { solver.undo(); film.undo(); publish(); }
  else if (c.type === "emit") { solver.emit(c.x, c.z, c.count); publish(); }
  else if (c.type === "step") {
    if (c.emit && c.contact) solver.emit(c.contact.x, c.contact.z, c.emit);
    if (c.contact) {
      film.contact(c.contact, solver.settings);
      if (c.contact.lifting > 0 && !lifted && solver.settings.adhesion > 0) {
        const count = Math.min(solver.capacity - solver.count, Math.floor(solver.settings.adhesion / 18));
        const pickup = film.extract(c.contact.x, c.contact.z, count * PARTICLE_VOLUME, PARTICLE_VOLUME);
        solver.pickUp(c.contact, pickup.color, Math.round(pickup.volume / PARTICLE_VOLUME)); lifted = true;
      }
    }
    const speed = solver.step(1 / 60, c.contact);
    if (c.contact && !c.contact.lifting && !["tube", "view"].includes(solver.settings.tool)) {
      const deposited = solver.depositContact((x, z, v, color) => film.deposit(x, z, v, color));
      if (deposited) film.contact(c.contact, solver.settings);
    }
    publish(speed, true);
  }
};
