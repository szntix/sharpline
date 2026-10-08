import { points } from "./scoring.js";
import { kickerStats, teamContext } from "./model.js";
export const MILD = { wind: 8.4, temp: 57.1 }, sg = (v) => (v >= 0 ? "+" : "\u2212") + Math.abs(v).toFixed(1);

// What the weather and roof are worth to this kicker this week, in his league's points, against a typical mild outdoor game.
export function kickerConditions(pr, s) {
  const c = teamContext(pr.game, pr.team); if (!c || c.imp == null) return null;
  const indoor = !!pr.game?.venue?.indoor, wx = pr.game?.forecast || null, base = points(kickerStats(c.imp, { spread: c.spread, wx: MILD }), s, "K");
  const d = points(kickerStats(c.imp, { spread: c.spread, wx, dome: indoor }), s, "K") - base;
  if (indoor) return { text: `Dome ${sg(d)}`, tone: d >= 0.3 ? "up" : "", d };
  if (!wx) return { text: "Forecast not out", tone: "", d: 0 };
  const windy = wx.wind != null && wx.wind >= 15, cold = wx.temp != null && wx.temp <= 35;
  if (windy && cold) return { text: `Wind and cold ${sg(d)}`, tone: "dn", d };
  if (windy) return { text: `Wind ${Math.round(wx.wind)} mph ${sg(d)}`, tone: "dn", d };
  if (cold) return { text: `Cold ${Math.round(wx.temp)}\u00B0F ${sg(d)}`, tone: "dn", d };
  return { text: "Mild outdoors", tone: "", d };
}

// ---- The Game page header tiles ----
// Total points: a very faint tint at the extremes. 41 and 48 are the 20th and 80th percentiles of closing totals across 2021-2025 (1,359 regular-season games); 39 and 50 are the 10th and 90th.
export const totalTone = (t) => (t == null || !Number.isFinite(t) ? "" : t >= 50 ? "tt-hi2" : t >= 48 ? "tt-hi" : t <= 39 ? "tt-lo2" : t <= 41 ? "tt-lo" : "");
// Weather: which wash the tile wears, and what it says. Windy (15 mph) and cold (35 F) are the kicker model's own cutoffs above; hot (85 F) is for display only.
// With a forecast the tile keeps showing the wind, as it always has. Without one it shows the temperature and ESPN's own condition words. The wash is the glance; the words do the telling.
export const WX = { wind: 15, cold: 35, hot: 85 };
export function weatherTheme(g) {
  if (g?.venue?.indoor) return { key: "dome", num: "Dome", label: "No weather" };
  const fc = g?.forecast || null, w = g?.weather || null, temp = fc?.temp ?? w?.temp ?? null, wind = fc?.wind ?? null, text = String(w?.text || "").trim(), t = text.toLowerCase(), cap = text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  let key = "";
  if (/snow|flurr|sleet|wintry/.test(t)) key = "snow"; else if (/rain|shower|storm|thunder|drizzle|downpour/.test(t)) key = "rain";
  else if (wind != null && wind >= WX.wind) key = "wind"; else if (temp != null && temp <= WX.cold) key = "cold"; else if (temp != null && temp >= WX.hot) key = "hot";
  else if (/wind/.test(t)) key = "wind"; else if (/cloud|overcast|fog|haze|mist/.test(t)) key = "cloudy"; else if (/clear|sunny|fair/.test(t)) key = "clear";
  if (wind != null) return { key, num: String(Math.round(wind)), label: "mph wind" };
  const num = temp != null ? `${Math.round(temp)}\u00B0` : "\u2013", label = (key === "cold" || key === "hot") ? (cap ? `${cap}, ${key}` : key === "cold" ? "Cold" : "Hot") : cap || "degrees";
  return { key, num, label };
}
