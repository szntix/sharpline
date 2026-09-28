import { getJson, cached } from "./util.mjs";
import { STADIUM } from "./teams.mjs";

// Kickoff-hour forecast from Open-Meteo (free, keyless). Wind and cold are the two weather effects
// the backtest found to matter, and only for quarterbacks.
export async function kickoffWeather(game) {
  if (!game.kickoff || game.venue?.indoor || game.venue?.neutral) return null;
  const ll = STADIUM[game.home]; if (!ll) return null;
  const at = Date.parse(game.kickoff);
  if (at - Date.now() > 15 * 864e5 || Date.now() - at > 6 * 3600e3) return null;
  const day = new Date(at).toISOString().slice(0, 10);
  return cached(`wx-${game.home}-${day}`, 3 * 3600e3, async () => {
    const q = new URLSearchParams({ latitude: ll[0], longitude: ll[1], hourly: "temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability",
      temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: "UTC", forecast_days: "16" });
    const d = await getJson(`https://api.open-meteo.com/v1/forecast?${q}`);
    const t = d.hourly?.time || []; const target = new Date(at + 3600e3).toISOString().slice(0, 13);
    const i = t.findIndex((x) => x.startsWith(target)); if (i < 0) return null;
    return { temp: Math.round(d.hourly.temperature_2m[i]), wind: Math.round(d.hourly.wind_speed_10m[i]), gust: Math.round(d.hourly.wind_gusts_10m[i]), pop: d.hourly.precipitation_probability?.[i] ?? null, asOf: Date.now() };
  });
}
