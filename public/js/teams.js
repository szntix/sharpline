// Team identity: a color for each club, picked per theme so it stays visible, and the logo file name on ESPN.
// Stripe colors, set 2026-10-07 by the owner's rule (research/stripe_*.py): each team uses its brand primary (from the owner's hex list, gaps from nflverse), lightened only as far as needed to reach 3:1
// against the row, unless that color is within a color difference of 10 of two or more other teams, in which case it takes its least crowded palette color. No two teams share an exact color.
// Known limit of one color: 29 pairs in light and 38 in dark are still close (color difference under 12; it was 63 and 56 before). tests/stripes.mjs guards all of this.
// p = primary, l = color used on light backgrounds, d = color used on dark backgrounds (the primary is too dark on about
// two thirds of teams). The Rams are listed once, as LAR (Sleeper's spelling).
export const TEAMS = {"ARI":{"p":"#97233F","l":"#97233f","d":"#be485e","logo":"ari"},"ATL":{"p":"#A71930","l":"#a71930","d":"#cc404b","logo":"atl"},"BAL":{"p":"#241773","l":"#241773","d":"#9e7c0c","logo":"bal"},"BUF":{"p":"#00338D","l":"#00338d","d":"#5a68cb","logo":"buf"},"CAR":{"p":"#0085CA","l":"#868686","d":"#0085ca","logo":"car"},"CHI":{"p":"#0B162A","l":"#c83803","d":"#6a728b","logo":"chi"},"CIN":{"p":"#FB4F14","l":"#f3480b","d":"#fb4f14","logo":"cin"},"CLE":{"p":"#FF3C00","l":"#311d00","d":"#876c51","logo":"cle"},"DAL":{"p":"#002244","l":"#041e42","d":"#7f9695","logo":"dal"},"DEN":{"p":"#002244","l":"#002244","d":"#ff5200","logo":"den"},"DET":{"p":"#0076B6","l":"#004e89","d":"#4273b3","logo":"det"},"GB":{"p":"#203731","l":"#203731","d":"#5d766f","logo":"gb"},"HOU":{"p":"#03202F","l":"#03202f","d":"#5d7688","logo":"hou"},"IND":{"p":"#002C5F","l":"#80878a","d":"#596eaa","logo":"ind"},"JAX":{"p":"#006778","l":"#006778","d":"#297c8e","logo":"jax"},"KC":{"p":"#E31837","l":"#e31837","d":"#ffb81c","logo":"kc"},"LV":{"p":"#000000","l":"#000000","d":"#727272","logo":"lv"},"LAC":{"p":"#007BC7","l":"#0080c6","d":"#0080c6","logo":"lac"},"LAR":{"p":"#003594","l":"#a68400","d":"#ffd100","logo":"lar"},"MIA":{"p":"#008E97","l":"#008e97","d":"#008e97","logo":"mia"},"MIN":{"p":"#4F2683","l":"#4f2683","d":"#895abd","logo":"min"},"NE":{"p":"#002244","l":"#001532","d":"#b0b7bc","logo":"ne"},"NO":{"p":"#D3BC8D","l":"#9a8659","d":"#d3bc8d","logo":"no"},"NYG":{"p":"#0B2265","l":"#0d2266","d":"#6969b8","logo":"nyg"},"NYJ":{"p":"#003F2D","l":"#125740","d":"#3e7e65","logo":"nyj"},"PHI":{"p":"#004C54","l":"#004c54","d":"#2b8c4e","logo":"phi"},"PIT":{"p":"#000000","l":"#b87a00","d":"#ffb612","logo":"pit"},"SF":{"p":"#AA0000","l":"#aa0000","d":"#d43920","logo":"sf"},"SEA":{"p":"#002244","l":"#429a00","d":"#69be28","logo":"sea"},"TB":{"p":"#A71930","l":"#34302b","d":"#ff7900","logo":"tb"},"TEN":{"p":"#4495D2","l":"#438cd4","d":"#4b92db","logo":"ten"},"WAS":{"p":"#5A1414","l":"#5a1414","d":"#aa5a53","logo":"wsh"}};
const LOGO = (k) => `https://a.espncdn.com/i/teamlogos/nfl/500/${k}.png`;
export const teamOf = (abbr) => TEAMS[abbr] || null;
export const logoUrl = (abbr) => (TEAMS[abbr] ? LOGO(TEAMS[abbr].logo) : "");
// Black or white text, whichever reads better on a color.
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const inkOn = (h) => ((lum(h) + 0.05) / 0.0556 >= 1.05 / (lum(h) + 0.05) ? "#111111" : "#FFFFFF");
// Text on a team-color plate or panel needs 4.5:1. Mid-tone brand colors (a few blues and reds) cannot reach it with either white or
// black text, so the color is nudged a few steps toward whichever extreme helps, and only for those teams. The stripe keeps the exact brand color.
const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), toHex = (a) => "#" + a.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const contrastWith = (h, ink) => { const a = lum(h), b = lum(ink); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
export function readablePlate(h, target = 4.7) {
  let c = toRgb(h);
  for (let i = 0; i < 60; i++) {
    const hex = toHex(c), ink = inkOn(hex);
    if (contrastWith(hex, ink) >= target) return hex.toUpperCase();
    const to = ink === "#FFFFFF" ? [0, 0, 0] : [255, 255, 255]; c = c.map((v, k) => v * 0.985 + to[k] * 0.015);
  }
  return h;
}
// Which ghost logo a plate wears, tone on tone: a light plate gets a white one, a dark plate a black one. But a black logo cannot show on a near-black plate (the Raiders' and Steelers' are pure black),
// so a dark plate where the black one would be within 15% of invisible gets a light one instead ("glow"). Decided from the plate color, never from a list of teams.
export function ghostKind(abbr) {
  const k = teamColors(abbr, false); if (!k?.plate || !/^#[0-9a-f]{6}$/i.test(k.plate)) return ""; if (k.plateInk === "#111111") return "lite";
  const c = [1, 3, 5].map((i) => parseInt(k.plate.slice(i, i + 2), 16)), f = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }, L = (a) => .2126 * f(a[0]) + .7152 * f(a[1]) + .0722 * f(a[2]);
  return (L(c) + .05) / (L(c.map((v) => v * (1 - .16))) + .05) < 1.15 ? "glow" : "";
}
export function teamColors(abbr, dark) {
  const t = TEAMS[abbr]; if (!t) return { stripe: "var(--edge)", plate: "var(--hair2)", plateInk: "var(--ink)" };
  const plate = readablePlate(t.p);
  return { stripe: (dark ? t.d : t.l) || t.p, plate, plateInk: inkOn(plate) };
}
