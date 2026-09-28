import { quantile, dots as dotsOf } from "./model.js";
import { esc, f1, f0 } from "./ui.js";

// ---------------------------------------------------------------------------------------------
// The football field is the axis for everything: points are yards, with tick marks every 5 and
// numerals every 10. Ranges are stacked dots on that ruler; win probability is where the ball sits.
// ---------------------------------------------------------------------------------------------
export const axisMax = (prs, floor = 30) => Math.max(floor, Math.ceil((Math.max(...prs.filter((p) => p && p.mean > 0).map((p) => quantile(p.mean, p.sd, 0.965)), 0) + 1) / 5) * 5);

// ---------- Quantile dotplot: 20 dots, each one is a 1-in-20 outcome (5% of games) ----------
export const DOT = { W: 320, padL: 10, padR: 10, r: 5.6 };
export function dotplot(pr, { max, threshold = null, tone = "us", id = "dp", name = "", all = false } = {}) {
  const { W, padL, padR, r } = DOT, d = 2 * r + 1.2;
  const vals = dotsOf(pr.mean, pr.sd, 20);
  const xs = (v) => padL + Math.max(0, Math.min(1, v / max)) * (W - padL - padR);
  const placed = [];
  vals.forEach((v, i) => { const x = xs(v); let lvl = 0; while (placed.some((p) => p.lvl === lvl && Math.abs(p.x - x) < d)) lvl++; placed.push({ x, lvl, v, i }); });
  const levels = Math.max(...placed.map((p) => p.lvl)) + 1;
  const axisY = 10 + levels * d + 8, H = axisY + 30;
  let ticks = "";
  for (let v = 0; v <= max; v += 5) {
    const big = v % 10 === 0, x = xs(v);
    ticks += `<line class="tick${big ? " big" : ""}" x1="${x}" x2="${x}" y1="${axisY}" y2="${axisY + (big ? 8 : 4.5)}"/>`;
    if (big) ticks += `<text class="ax" x="${x}" y="${axisY + 22}" text-anchor="middle">${v}</text>`;
  }
  const on = (v) => all || (threshold != null && v >= threshold);
  const circles = placed.map((p) => `<circle class="dot ${tone}${on(p.v) ? " on" : ""}" data-v="${p.v.toFixed(2)}" cx="${p.x.toFixed(1)}" cy="${(axisY - 4.5 - r - p.lvl * d).toFixed(1)}" r="${r}" style="--i:${p.i}"/>`).join("");
  const tx = threshold != null ? xs(threshold) : -20;
  return `<svg class="dotplot" id="${id}" viewBox="0 0 ${W} ${H}" role="img" data-max="${max}" data-w="${W}" data-pl="${padL}" data-pr="${padR}" data-cap="${id}-cap" data-name="${esc(name)}"
    aria-label="Twenty dots. Each dot is one of twenty equally likely outcomes for ${esc(name)}, from ${f1(vals[0])} to ${f1(vals[19])} points.">
    <line class="axis" x1="${padL}" x2="${W - padR}" y1="${axisY}" y2="${axisY}"/>${ticks}${circles}
    <g class="thr" style="transform:translateX(${tx}px)"><line x1="0" x2="0" y1="2" y2="${axisY}"/><path d="M-6 ${axisY + 1} L6 ${axisY + 1} L0 ${axisY - 8} Z"/></g>
    <rect class="hit" x="0" y="0" width="${W}" height="${H}" fill="transparent"/></svg>`;
}
export const dotCount = (pr, thr) => dotsOf(pr.mean, pr.sd, 20).filter((v) => v >= thr).length;
export function dotCaption(pr, thr, who = "He") {
  const n = dotCount(pr, thr);
  return `In <b>${n} of 20</b> games ${esc(who)} scores <b>${f0(thr)}+</b> points.`;
}

// ---------- Compact range ribbon for lists (same ruler, shared scale so rows compare) ----------
export function ribbon(pr, { max = 40, tone = "us" } = {}) {
  const n = max / 10, at = (v) => (Math.max(0, Math.min(max, v)) / max) * 100;
  if (!pr || !(pr.mean > 0)) return `<span class="rib" style="--n:${n}" role="img" aria-label="No projection"></span>`;
  const lo = quantile(pr.mean, pr.sd, 0.1), hi = quantile(pr.mean, pr.sd, 0.9), md = quantile(pr.mean, pr.sd, 0.5);
  return `<span class="rib ${tone}" style="--n:${n};--lo:${at(lo).toFixed(1)}%;--w:${Math.max(2.5, at(hi) - at(lo)).toFixed(1)}%;--md:${at(md).toFixed(1)}%" role="img" aria-label="Likely range ${f0(lo)} to ${f0(hi)} points, typical ${f0(md)}"><i class="band"></i><i class="med"></i></span>`;
}

// ---------- The drive: win probability as field position ----------
export function drive(win, { you = "You", foe = "Opponent" } = {}) {
  const W = 360, H = 132, ez = 24, x0 = ez, span = W - 2 * ez, bx = x0 + win * span, mid = x0 + span / 2;
  let g = "";
  for (let i = 0; i < 10; i++) g += `<rect x="${x0 + (i * span) / 10}" y="0" width="${span / 10}" height="${H}" fill="#fff" opacity="${i % 2 ? 0.045 : 0}"/>`;
  for (let y = 0; y <= 100; y += 2) {
    const x = x0 + (y / 100) * span, big = y % 10 === 0;
    if (big) g += `<line x1="${x}" x2="${x}" y1="0" y2="${H}" stroke="#fff" stroke-width="${y === 50 ? 2.4 : 1.6}" opacity="${y === 0 || y === 100 ? 0.9 : 0.5}"/>`;
    else { g += `<line x1="${x}" x2="${x}" y1="0" y2="5" stroke="#fff" stroke-width="1" opacity=".42"/><line x1="${x}" x2="${x}" y1="${H - 5}" y2="${H}" stroke="#fff" stroke-width="1" opacity=".42"/>`; }
  }
  const nums = [10, 20, 30, 40, 50, 40, 30, 20, 10];
  nums.forEach((n, i) => { const x = x0 + ((i + 1) / 10) * span; g += `<text class="yd" x="${x}" y="34" text-anchor="middle">${n}</text><text class="yd" x="${x}" y="${H - 15}" text-anchor="middle">${n}</text>`; });
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const dx = mid - bx;
  return `<svg class="drive" viewBox="0 0 ${W} ${H}" role="img" aria-label="${you} has a ${Math.round(win * 100)} percent chance to win against ${esc(foe)}. The ball sits ${Math.round(win * 100)} yards from your goal line.">
    <rect class="ez you" x="0" y="0" width="${ez}" height="${H}"/><rect class="ez foe" x="${W - ez}" y="0" width="${ez}" height="${H}"/>${g}
    <text class="ezt" transform="translate(${ez / 2 + 4} ${H / 2}) rotate(-90)" text-anchor="middle">${esc(short(you.toUpperCase(), 13))}</text>
    <text class="ezt" transform="translate(${W - ez / 2 + 4} ${H / 2}) rotate(90)" text-anchor="middle">${esc(short(foe.toUpperCase(), 13))}</text>
    <g transform="translate(${bx.toFixed(1)} ${H / 2 - 4})"><g class="ball" style="--dx:${dx.toFixed(1)}px">
      <ellipse class="shadow" cx="1" cy="15" rx="14" ry="3"/><ellipse class="pig" cx="0" cy="0" rx="15" ry="9.4" transform="rotate(-8)"/>
      <path class="lace" d="M-6 -2.4 L6 -3.6 M-3.5 -4.4 V-0.6 M0 -4.9 V-1.1 M3.5 -5.3 V-1.6"/><path class="stripe" d="M-9.5 -4.5 Q-10.6 -0.5 -9.4 3.2 M9.5 -6 Q10.6 -2 9.4 1.8"/></g></g></svg>`;
}

// ---------- Waterfall: how the number is built (plain HTML so it wraps well on phones) ----------
export function waterfall(rows, { total, unit = "pts" } = {}) {
  let cum = 0; const seg = [];
  for (const r of rows) {
    if (r.kind === "start") { seg.push({ ...r, a: 0, b: r.v }); cum = r.v; }
    else if (r.kind === "end") seg.push({ ...r, a: 0, b: r.v });
    else { seg.push({ ...r, a: Math.min(cum, cum + r.v), b: Math.max(cum, cum + r.v) }); cum += r.v; }
  }
  const max = Math.max(...seg.map((s) => s.b), 1) * 1.12;
  return `<div class="wf" role="list">${seg.map((s) => {
    const left = (s.a / max) * 100, width = Math.max(0.8, ((s.b - s.a) / max) * 100);
    const cls = s.kind === "start" ? "base" : s.kind === "end" ? "final" : s.v >= 0 ? "up" : "down";
    const val = s.kind === "delta" ? (Math.abs(s.v) < 0.05 ? "no change" : `${s.v > 0 ? "+" : "−"}${Math.abs(s.v).toFixed(1)}`) : f1(s.v);
    return `<div class="wf-row ${cls}" role="listitem"><div class="wf-l">${s.label}${s.note ? `<small>${s.note}</small>` : ""}</div>
      <div class="wf-t"><i style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></i></div><div class="wf-v">${val}</div></div>`;
  }).join("")}</div>`;
}

// ---------- Percentile bar (a stat, ranked among his position) ----------
export function pctBar(label, pct, valueText, sub = "") {
  if (pct == null) return "";
  const c = pct >= 80 ? "p5" : pct >= 60 ? "p4" : pct >= 40 ? "p3" : pct >= 20 ? "p2" : "p1";
  return `<div class="pct"><div class="pl">${label}${sub ? `<small>${sub}</small>` : ""}</div>
    <div class="ptrack" role="img" aria-label="${esc(label)}: ${valueText}, ${pct}th percentile among his position"><i class="pk ${c}" style="left:${pct}%"><b>${pct}</b></i></div><div class="pv">${valueText}</div></div>`;
}

// ---------- Slate map: every game by expected total and expected margin ----------
export function slateMap(games) {
  const G = games.filter((g) => g.line);
  if (!G.length) return "";
  const W = 340, H = 236, L = 30, R = 10, T = 12, B = 30;
  const tots = G.map((g) => g.line.total), lo = Math.floor(Math.min(...tots, 38) - 1), hi = Math.ceil(Math.max(...tots, 50) + 1);
  const mx = Math.max(12, Math.ceil(Math.max(...G.map((g) => Math.abs(g.line.spread))) + 1.5));
  const X = (t) => L + ((t - lo) / (hi - lo)) * (W - L - R), Y = (m) => H - B - (m / mx) * (H - B - T);
  let a = "";
  for (let t = Math.ceil(lo / 5) * 5; t <= hi; t += 5) a += `<line class="gl" x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${H - B}"/><text class="ax" x="${X(t)}" y="${H - B + 15}" text-anchor="middle">${t}</text>`;
  for (let m = 0; m <= mx; m += 3) a += `<line class="gl" x1="${L}" x2="${W - R}" y1="${Y(m)}" y2="${Y(m)}"/><text class="ax" x="${L - 6}" y="${Y(m) + 3}" text-anchor="end">${m}</text>`;
  const q = (x, y, t, anchor) => `<text class="quad" x="${x}" y="${y}" text-anchor="${anchor}">${t}</text>`;
  const R_ = 12.5, P_ = G.map((g) => ({ g, x: X(g.line.total), y: Y(Math.abs(g.line.spread)) }));
  const home_ = P_.map((p) => ({ x: p.x, y: p.y }));
  for (let it = 0; it < 80; it++) for (let i = 0; i < P_.length; i++) for (let j = i + 1; j < P_.length; j++) {
    const dx = P_[j].x - P_[i].x, dy = P_[j].y - P_[i].y, d = Math.hypot(dx, dy) || 0.01, min = 2 * R_ + 1;
    if (d < min) { const k = (min - d) / 2 / d; P_[i].x -= dx * k; P_[i].y -= dy * k; P_[j].x += dx * k; P_[j].y += dy * k; }
  }
  P_.forEach((p, i) => { p.x = Math.min(W - R - R_, Math.max(L + R_, p.x)); p.y = Math.min(H - B - R_, Math.max(T + R_, p.y)); });
  const pts = P_.map(({ g, x, y }) => {
    const fav = g.line.spread >= 0 ? g.home : g.away, m = Math.abs(g.line.spread);
    return `<a href="#game/${esc(g.id)}" class="gbub"><title>${esc(g.away)} at ${esc(g.home)}: total ${g.line.total}, ${esc(fav)} by ${m}</title>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${R_}"/><text x="${x.toFixed(1)}" y="${(y + 3.2).toFixed(1)}" text-anchor="middle">${esc(fav)}</text></a>`;
  }).join("");
  return `<svg class="slatemap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of this week's games. Right means more points expected, higher means a bigger favorite.">${a}
    ${q(W - R - 4, H - B - 6, "Shootouts", "end")}${q(W - R - 4, T + 11, "Favorite runs away", "end")}${q(L + 6, H - B - 6, "Grinders", "start")}${q(L + 6, T + 11, "Lopsided, low scoring", "start")}
    <text class="axl" x="${(L + W - R) / 2}" y="${H - 2}" text-anchor="middle">Expected total points</text>
    <text class="axl" transform="translate(9 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Expected margin</text>${pts}</svg>`;
}

// ---------- Weekly form vs what the workload usually earns ----------
export function formStrip(log, xp, { weeks = null } = {}) {
  if (!log?.length) return `<p class="muted small">No games played yet this season.</p>`;
  const W = 320, H = 96, L = 8, R = 8, B = 20, T = 8, n = Math.max(log.length, 4), bw = Math.min(30, (W - L - R) / n - 6);
  const vals = log.map((l) => [l[1], xp ? xp(l[2], l[3]) : null]);
  const mx = Math.max(10, ...vals.flat().filter((v) => v != null)) * 1.1;
  const Y = (v) => T + (1 - v / mx) * (H - B - T);
  const gap = (W - L - R) / n;
  const bars = log.map((l, i) => {
    const x = L + i * gap + (gap - bw) / 2, [p, e] = vals[i], top = Y(Math.max(p, 0));
    return `<rect class="fbar" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, H - B - top).toFixed(1)}" rx="3"/>
      ${e != null ? `<line class="fexp" x1="${(x - 3).toFixed(1)}" x2="${(x + bw + 3).toFixed(1)}" y1="${Y(e).toFixed(1)}" y2="${Y(e).toFixed(1)}"/>` : ""}
      <text class="fv" x="${(x + bw / 2).toFixed(1)}" y="${(top - 3).toFixed(1)}" text-anchor="middle">${f0(p)}</text>
      <text class="ax" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${l[0]}</text>`;
  }).join("");
  return `<svg class="formstrip" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fantasy points by week, with the points his workload usually earns marked on each bar."><line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>${bars}</svg>`;
}

// ---------- Running hot / cold: points scored against points the workload usually earns ----------
export function luck(actual, expected, max) {
  const x = (v) => 2 + Math.max(0, Math.min(1, v / max)) * 96, hot = actual > expected;
  return `<svg class="luck ${hot ? "hot" : "cold"}" viewBox="0 0 100 18" role="img" aria-label="Scoring ${f1(actual)} a game; workload is worth ${f1(expected)}">
    <line class="tr" x1="2" x2="98" y1="9" y2="9"/><line class="lk" x1="${x(expected)}" x2="${x(actual)}" y1="9" y2="9"/>
    <circle class="ex" cx="${x(expected)}" cy="9" r="4.2"/><circle class="ac" cx="${x(actual)}" cy="9" r="4.6"/></svg>`;
}

// ---------- Where the experts sit: best-to-worst range, their average, and where we rank him ----------
export function rankRange(ecr, ours, N = 36) {
  const W = 320, H = 54, L = 12, R = 12, Y = 22;
  const N2 = Math.max(N, Math.ceil(Math.max(ecr.w, ours || 0, ecr.e) * 1.12 / 6) * 6);
  const X = (r) => L + ((r - 1) / (N2 - 1)) * (W - L - R);
  let t = "";
  for (let r = 1; r <= N2; r += r === 1 ? 5 : 6) t += `<line class="tick big" x1="${X(r)}" x2="${X(r)}" y1="${Y + 6}" y2="${Y + 11}"/><text class="ax" x="${X(r)}" y="${Y + 24}" text-anchor="middle">${r}</text>`;
  return `<svg class="rankrange" viewBox="0 0 ${W} ${H}" role="img" aria-label="Experts rank him between ${f0(ecr.b)} and ${f0(ecr.w)}, on average ${f1(ecr.e)}${ours ? `; our model ranks him ${ours}` : ""}.">
    <line class="axis" x1="${L}" x2="${W - R}" y1="${Y + 6}" y2="${Y + 6}"/>${t}
    <rect class="rr" x="${X(ecr.b)}" y="${Y - 5}" width="${Math.max(4, X(ecr.w) - X(ecr.b))}" height="10" rx="5"/>
    <path class="rd" d="M${X(ecr.e)} ${Y - 9} l6 9 l-6 9 l-6 -9 Z"/>
    ${ours ? `<circle class="rm" cx="${X(Math.min(ours, N2))}" cy="${Y}" r="5.5"/>` : ""}</svg>`;
}

// ---------- Mirrored comparison bars (winner solid, loser faded) ----------
export function mirrorRows(rows) {
  return `<div class="mirror">${rows.map((r) => {
    const a = r.a ?? 0, b = r.b ?? 0, m = Math.max(Math.abs(a), Math.abs(b), 1e-9);
    const better = r.lowerBetter ? (a < b ? "a" : b < a ? "b" : "") : (a > b ? "a" : b > a ? "b" : "");
    return `<div class="mr"><div class="mv a ${better === "a" ? "win" : ""}">${r.fa ?? f1(a)}</div>
      <div class="mb a ${better === "a" ? "win" : ""}"><i style="width:${(Math.abs(a) / m) * 100}%"></i></div><div class="ml">${r.label}</div>
      <div class="mb b ${better === "b" ? "win" : ""}"><i style="width:${(Math.abs(b) / m) * 100}%"></i></div><div class="mv b ${better === "b" ? "win" : ""}">${r.fb ?? f1(b)}</div></div>`;
  }).join("")}</div>`;
}

// ---------- Six-square proof strip (one square per test season) ----------
export function proofDots(years, { labels = null } = {}) {
  return `<span class="pd" role="img" aria-label="Helped in ${years.filter(Boolean).length} of ${years.length} tests">${years.map((y, i) => `<i class="${y ? "on" : ""}" title="${labels ? esc(labels[i]) : ""}"></i>`).join("")}</span>`;
}

// ---------- Tiny last-5 bars for list rows ----------
export function miniBars(log, max = 30) {
  const last = (log || []).slice(-5); if (!last.length) return "";
  const w = 5 * 7 - 2;
  return `<svg class="mini" viewBox="0 0 ${w} 18" aria-hidden="true">${last.map((l, i) => { const h = Math.max(1.5, Math.min(1, l[1] / max) * 16); return `<rect x="${i * 7}" y="${18 - h}" width="5" height="${h}" rx="1.5"/>`; }).join("")}</svg>`;
}
