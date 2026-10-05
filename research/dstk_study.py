import pandas as pd, numpy as np, os, warnings
warnings.filterwarnings("ignore")
D = "/home/claude/data/"; YEARS = [y for y in range(2021, 2026) if os.path.exists(f"{D}stats_player_week_{y}.csv")]
FIX = {"LA": "LAR", "OAK": "LV", "SD": "LAC", "STL": "LAR", "WSH": "WAS", "JAC": "JAX"}
need = ["season", "week", "season_type", "team", "opponent_team", "position", "player_id", "def_sacks", "def_interceptions", "fumble_recovery_opp", "def_tds", "def_safeties", "def_punt_blocks", "def_pat_blocks", "def_fg_blocks", "special_teams_tds", "attempts", "sacks_suffered", "carries", "passing_epa", "rushing_epa", "passing_interceptions", "sack_fumbles_lost", "rushing_fumbles_lost", "receiving_fumbles_lost", "fg_made_0_19", "fg_made_20_29", "fg_made_30_39", "fg_made_40_49", "fg_made_50_59", "fg_made_60_", "fg_att", "fg_made", "pat_made"]
P = pd.concat([pd.read_csv(f"{D}stats_player_week_{y}.csv", usecols=lambda c: c in need, low_memory=False) for y in YEARS]); P = P[P.season_type == "REG"].copy()
for c in ("team", "opponent_team"): P[c] = P[c].replace(FIX)
P = P.fillna({c: 0 for c in need if c not in ("season", "week", "season_type", "team", "opponent_team", "position", "player_id")})
G = pd.read_csv(D + "games.csv", low_memory=False); G = G[(G.game_type == "REG") & G.season.isin(YEARS)].copy(); G["home_team"] = G.home_team.replace(FIX); G["away_team"] = G.away_team.replace(FIX)
rows = []
for _, r in G.iterrows():
    for home in (True, False):
        t, o = (r.home_team, r.away_team) if home else (r.away_team, r.home_team); em = r.spread_line if home else -r.spread_line
        rows.append(dict(season=r.season, week=r.week, team=t, opp=o, home=home, pts=r.home_score if home else r.away_score, opp_pts=r.away_score if home else r.home_score, own_imp=r.total_line / 2 + em / 2, opp_imp=r.total_line / 2 - em / 2, spread=em, total=r.total_line, wind=r.wind if pd.notna(r.wind) else 0.0, temp=r.temp if pd.notna(r.temp) else 65.0, dome=1.0 if str(r.roof) in ("dome", "closed") else 0.0))
TG = pd.DataFrame(rows).dropna(subset=["pts", "opp_pts", "total", "spread"])
OFFPOS = {"QB", "RB", "WR", "TE", "FB", "K", "P", "LS", "T", "G", "C", "OT", "OG", "OL"}
Pd = P[~P.position.isin(OFFPOS)]; dg = Pd.groupby(["season", "week", "team"]).agg(sacks=("def_sacks", "sum"), ints=("def_interceptions", "sum"), frec=("fumble_recovery_opp", "sum"), dtd=("def_tds", "sum"), saf=("def_safeties", "sum"), blk=("def_punt_blocks", "sum")).reset_index()
dg2 = Pd.groupby(["season", "week", "team"])[["def_pat_blocks", "def_fg_blocks"]].sum().reset_index(); dg = dg.merge(dg2, on=["season", "week", "team"]); dg["blk"] += dg.def_pat_blocks + dg.def_fg_blocks
st = P.groupby(["season", "week", "team"]).special_teams_tds.sum().rename("sttd").reset_index()
P["db"] = P.attempts + P.sacks_suffered; P["to"] = P.passing_interceptions + P.sack_fumbles_lost + P.rushing_fumbles_lost + P.receiving_fumbles_lost; P["epa"] = P.passing_epa + P.rushing_epa; P["plays"] = P.db + P.carries
og = P[P.position.isin(["QB", "RB", "WR", "TE", "FB"])].groupby(["season", "week", "team"]).agg(db=("db", "sum"), sk=("sacks_suffered", "sum"), to=("to", "sum"), epa=("epa", "sum"), plays=("plays", "sum")).reset_index()
K = P[P.position == "K"].copy(); K["fgpts"] = 3 * (K.fg_made_0_19 + K.fg_made_20_29 + K.fg_made_30_39) + 4 * K.fg_made_40_49 + 5 * (K.fg_made_50_59 + K.fg_made_60_) + K.pat_made
kg = K.groupby(["season", "week", "team"]).agg(kpts=("fgpts", "sum"), fgatt=("fg_att", "sum"), fgm=("fg_made", "sum"), pid=("player_id", "first")).reset_index()
T = TG.merge(dg, on=["season", "week", "team"], how="left").merge(st, on=["season", "week", "team"], how="left").merge(og, on=["season", "week", "team"], how="left").merge(kg, on=["season", "week", "team"], how="left")
tier = lambda p: 10 if p == 0 else 7 if p <= 6 else 4 if p <= 13 else 1 if p <= 20 else 0 if p <= 27 else -1 if p <= 34 else -4
T["dst"] = T.sacks + 2 * T.ints + 2 * T.frec + 6 * (T.dtd + T.sttd) + 2 * T.saf + 2 * T.blk + T.opp_pts.map(tier)
T = T.sort_values(["season", "team", "week"]).reset_index(drop=True)
# opponent's offense in the same game, for the defense's matchup features
OO = T[["season", "week", "team", "db", "sk", "to", "epa", "plays"]].rename(columns={"team": "opp", "db": "o_db", "sk": "o_sk", "to": "o_to", "epa": "o_epa", "plays": "o_plays"}); T = T.merge(OO, on=["season", "week", "opp"], how="left")
def expand(col, name, k=4, prior=None):
    """season-to-date mean of col for each team using only EARLIER weeks, shrunk toward the league mean with k pseudo-games"""
    out = np.full(len(T), np.nan); lm = T[col].mean() if prior is None else prior
    for (s, t), g in T.groupby(["season", "team"]):
        v = g[col].fillna(0).values; cs = np.concatenate([[0], np.cumsum(v)[:-1]]); n = np.arange(len(v)); out[g.index] = (cs + k * lm) / (n + k)
    T[name] = out
for c, n in [("sacks", "own_sacks"), ("ints", "own_ints"), ("frec", "own_frec"), ("sk", "att_sk"), ("to", "att_to"), ("db", "att_db"), ("plays", "att_plays"), ("epa", "att_epa"), ("fgatt", "att_fgatt"), ("opp_pts", "own_pa")]: expand(c, n)
def opp_of(col, name):                       # the opponent's season-to-date value of a team-level feature
    m = T[["season", "week", "team", col]].rename(columns={"team": "opp", col: name}); return T.merge(m, on=["season", "week", "opp"], how="left")[name].values
for src, nm in [("att_sk", "opp_sk"), ("att_to", "opp_to"), ("att_db", "opp_db"), ("att_plays", "opp_plays"), ("att_epa", "opp_epa"), ("own_pa", "opp_pa"), ("att_fgatt", "opp_fgatt_for")]: T[nm] = opp_of(src, nm)
T["opp_sk_rate"] = T.opp_sk / T.opp_db.clip(lower=1); T["opp_epa_play"] = T.opp_epa / T.opp_plays.clip(lower=1); T["att_epa_play"] = T.att_epa / T.att_plays.clip(lower=1)
def loso(df, y, base, extra, label):
    d = df.dropna(subset=[y] + base + extra); d = d[d.week >= 4]; res = {}
    for name, feats in (("baseline", base), (label, base + extra)):
        err = np.zeros(len(d)); 
        for s in sorted(d.season.unique()):
            tr, te = d[d.season != s], d[d.season == s]; mu, sd = tr[feats].mean(), tr[feats].std().replace(0, 1); X = np.column_stack([np.ones(len(tr)), ((tr[feats] - mu) / sd).values]); b = np.linalg.lstsq(X, tr[y].values, rcond=None)[0]
            err[(d.season == s).values] = te[y].values - np.column_stack([np.ones(len(te)), ((te[feats] - mu) / sd).values]) @ b
        res[name] = (err ** 2).mean()
    mu, sd = d[base + extra].mean(), d[base + extra].std().replace(0, 1); X = np.column_stack([np.ones(len(d)), ((d[base + extra] - mu) / sd).values]); b = np.linalg.lstsq(X, d[y].values, rcond=None)[0]
    return len(d), res["baseline"], res[label], dict(zip(base + extra, np.round(b[1:], 3))), d[y].var()
out = []; DB = ["opp_imp"]
n, b0, b1, co, var = loso(T, "dst", DB, [], "x"); out.append(f"DEFENSE / SPECIAL TEAMS fantasy points ({n} team-games, 2021-2025, week 4+; standard scoring; score variance {var:.2f})\n  the betting line alone (points the opponent is expected to score): out-of-sample MSE {b0:.3f}  (explains {100*(1-b0/var):.1f}% of the variance)")
for label, extra in [("+ how often the opponent's QB gets sacked", ["opp_sk_rate"]), ("+ how many turnovers the opponent gives away", ["opp_to"]), ("+ both of those", ["opp_sk_rate", "opp_to"]), ("+ opponent offense quality (EPA per play)", ["opp_epa_play"]), ("+ this defense's own sack and takeaway form", ["own_sacks", "own_ints", "own_frec"]), ("+ everything", ["opp_sk_rate", "opp_to", "opp_epa_play", "own_sacks", "own_ints", "own_frec", "wind", "dome"])]:
    n, b0, b1, co, var = loso(T, "dst", DB, extra, label); out.append(f"  {label:52s} MSE {b1:.3f}  ({100*(b1/b0-1):+.2f}% vs the line alone)   coefficients (per std dev): " + ", ".join(f"{k} {v:+.2f}" for k, v in co.items() if k != "opp_imp"))
KB = ["own_imp"]; Kd = T[T.kpts.notna() & (T.fgatt >= 0)].copy()
n, b0, b1, co, var = loso(Kd, "kpts", KB, [], "x"); out.append(f"\nKICKER fantasy points ({n} kicker-games; FG 3/4/5 by distance + extra points; score variance {var:.2f})\n  the betting line alone (points his team is expected to score): out-of-sample MSE {b0:.3f}  (explains {100*(1-b0/var):.1f}% of the variance)")
for label, extra in [("+ the spread (blowouts vs close games)", ["spread"]), ("+ his offense's quality (EPA per play)", ["att_epa_play"]), ("+ how often his team has been kicking FGs", ["att_fgatt"]), ("+ wind, temperature and dome", ["wind", "temp", "dome"]), ("+ everything", ["spread", "att_epa_play", "att_fgatt", "opp_fgatt_for", "wind", "temp", "dome"])]:
    n, b0, b1, co, var = loso(Kd, "kpts", KB, extra, label); out.append(f"  {label:52s} MSE {b1:.3f}  ({100*(b1/b0-1):+.2f}% vs the line alone)   coefficients: " + ", ".join(f"{k} {v:+.2f}" for k, v in co.items() if k != "own_imp"))
wd = Kd[Kd.week >= 4]; hi = wd[wd.wind >= 15]; lo = wd[(wd.wind < 15) & (wd.dome == 0)]; dm = wd[wd.dome == 1]
out.append(f"\n  raw check, kicker points per game: dome {dm.kpts.mean():.2f} | outdoors calm {lo.kpts.mean():.2f} | wind 15+ mph {hi.kpts.mean():.2f} (n={len(hi)})")
open("/tmp/p1/dstk.txt", "w").write("\n".join(out)); print("\n".join(out))
