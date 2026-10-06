import { points } from "./scoring.js";
import { kickerStats, teamContext } from "./model.js";
const MILD = { wind: 8.4, temp: 57.1 }, sg = (v) => (v >= 0 ? "+" : "\u2212") + Math.abs(v).toFixed(1);

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
