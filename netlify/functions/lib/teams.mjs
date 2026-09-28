// Team identity, normalized to Sleeper's abbreviations (the app's common language).
const ALIAS = { WSH: "WAS", LA: "LAR", JAC: "JAX", ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU", SL: "LAR", OAK: "LV", SD: "LAC" };
export const abbr = (a) => ALIAS[a] || a;

// Home stadium coordinates, for the wind and temperature forecast.
export const STADIUM = {
  ARI: [33.5276, -112.2626], ATL: [33.7554, -84.401], BAL: [39.278, -76.6227], BUF: [42.7738, -78.787], CAR: [35.2258, -80.8528],
  CHI: [41.8623, -87.6167], CIN: [39.0955, -84.5161], CLE: [41.5061, -81.6995], DAL: [32.7473, -97.0945], DEN: [39.7439, -105.0201],
  DET: [42.34, -83.0456], GB: [44.5013, -88.0622], HOU: [29.6847, -95.4107], IND: [39.7601, -86.1639], JAX: [30.3239, -81.6373],
  KC: [39.0489, -94.4839], LV: [36.0909, -115.1833], LAC: [33.9535, -118.3392], LAR: [33.9535, -118.3392], MIA: [25.958, -80.2389],
  MIN: [44.9736, -93.2575], NE: [42.0909, -71.2643], NO: [29.9511, -90.0812], NYG: [40.8135, -74.0745], NYJ: [40.8135, -74.0745],
  PHI: [39.9008, -75.1675], PIT: [40.4468, -80.0158], SF: [37.403, -121.97], SEA: [47.5952, -122.3316], TB: [27.9759, -82.5033],
  TEN: [36.1665, -86.7713], WAS: [38.9076, -76.8645],
};
export const TEAM_NAME = {
  ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers", CHI: "Bears", CIN: "Bengals", CLE: "Browns", DAL: "Cowboys",
  DEN: "Broncos", DET: "Lions", GB: "Packers", HOU: "Texans", IND: "Colts", JAX: "Jaguars", KC: "Chiefs", LV: "Raiders", LAC: "Chargers",
  LAR: "Rams", MIA: "Dolphins", MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants", NYJ: "Jets", PHI: "Eagles", PIT: "Steelers",
  SF: "49ers", SEA: "Seahawks", TB: "Buccaneers", TEN: "Titans", WAS: "Commanders",
};
