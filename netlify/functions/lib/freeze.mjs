import { project } from "../../../public/js/model.js";

// What gets saved for a player before his team kicks off: the inputs, and the numbers the app computed from them at that moment.
// Grading uses the saved numbers, so changing the model later can never rewrite a past week's record.
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const r3 = (v) => (v == null ? null : +(+v).toFixed(3));
export function freezeRow(row, now) {
  const p = project(row);
  return compact({ ...row, at: now, out: compact({ k: p.kind, pre: r3(p.pre), m: r3(p.model), e: r3(p.experts), s: r3(p.sleeper), sd: r3(p.sd), mu: p.mult, st: row.status || null }) });
}
