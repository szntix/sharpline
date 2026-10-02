// Team identity: a color for each club, picked per theme so it stays visible, and the logo file name on ESPN.
// p = primary, l = color used on light backgrounds, d = color used on dark backgrounds (the primary is too dark on about
// two thirds of teams). Sleeper writes the Rams as LAR, the colors file as LA, so both are listed.
export const TEAMS = {"ARI":{"p":"#97233F","l":"#97233F","d":"#ffb612","logo":"ari"},"ATL":{"p":"#A71930","l":"#A71930","d":"#a5acaf","logo":"atl"},"BAL":{"p":"#241773","l":"#241773","d":"#9E7C0C","logo":"bal"},"BUF":{"p":"#00338D","l":"#00338D","d":"#d50a0a","logo":"buf"},"CAR":{"p":"#0085CA","l":"#0085CA","d":"#0085CA","logo":"car"},"CHI":{"p":"#0B162A","l":"#0B162A","d":"#E64100","logo":"chi"},"CIN":{"p":"#FB4F14","l":"#FB4F14","d":"#FB4F14","logo":"cin"},"CLE":{"p":"#FF3C00","l":"#FF3C00","d":"#FF3C00","logo":"cle"},"DAL":{"p":"#002244","l":"#002244","d":"#B0B7BC","logo":"dal"},"DEN":{"p":"#002244","l":"#002244","d":"#FB4F14","logo":"den"},"DET":{"p":"#0076B6","l":"#0076B6","d":"#0076B6","logo":"det"},"GB":{"p":"#203731","l":"#203731","d":"#FFB612","logo":"gb"},"HOU":{"p":"#03202F","l":"#03202F","d":null,"logo":"hou"},"IND":{"p":"#002C5F","l":"#002C5F","d":"#a5acaf","logo":"ind"},"JAX":{"p":"#006778","l":"#006778","d":"#9f792c","logo":"jax"},"KC":{"p":"#E31837","l":"#E31837","d":"#E31837","logo":"kc"},"LV":{"p":"#000000","l":"#000000","d":"#A5ACAF","logo":"lv"},"LAC":{"p":"#007BC7","l":"#007BC7","d":"#007BC7","logo":"lac"},"LAR":{"p":"#003594","l":"#003594","d":"#FFD100","logo":"lar"},"MIA":{"p":"#008E97","l":"#008E97","d":"#008E97","logo":"mia"},"MIN":{"p":"#4F2683","l":"#4F2683","d":"#FFC62F","logo":"min"},"NE":{"p":"#002244","l":"#002244","d":"#b0b7bc","logo":"ne"},"NO":{"p":"#D3BC8D","l":"#000000","d":"#D3BC8D","logo":"no"},"NYG":{"p":"#0B2265","l":"#0B2265","d":"#a5acaf","logo":"nyg"},"NYJ":{"p":"#003F2D","l":"#003F2D","d":null,"logo":"nyj"},"PHI":{"p":"#004C54","l":"#004C54","d":"#A5ACAF","logo":"phi"},"PIT":{"p":"#000000","l":"#000000","d":"#FFB612","logo":"pit"},"SF":{"p":"#AA0000","l":"#AA0000","d":"#B3995D","logo":"sf"},"SEA":{"p":"#002244","l":"#002244","d":"#69be28","logo":"sea"},"TB":{"p":"#A71930","l":"#A71930","d":"#ff7900","logo":"tb"},"TEN":{"p":"#4495D2","l":"#4495D2","d":"#4495D2","logo":"ten"},"WAS":{"p":"#5A1414","l":"#5A1414","d":"#FFB612","logo":"wsh"}};
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
export function teamColors(abbr, dark) {
  const t = TEAMS[abbr]; if (!t) return { stripe: "var(--edge)", plate: "var(--hair2)", plateInk: "var(--ink)" };
  const plate = readablePlate(t.p);
  return { stripe: (dark ? t.d : t.l) || t.p, plate, plateInk: inkOn(plate) };
}
