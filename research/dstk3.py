import numpy as np, pandas as pd, warnings
warnings.filterwarnings("ignore")
src = open("/tmp/p1/dstk_study.py").read().replace('"fg_att", "fg_made", "pat_made"]', '"fg_att", "fg_made", "pat_made", "fg_missed_50_59", "fg_missed_60_"]')
exec(compile(src.split("def loso(")[0], "head", "exec"))                      # builds T (team-games with the defense and kicker scores, the line, weather, team-level rates)
def preds(df, y, feats):
    d = df.dropna(subset=[y] + feats); d = d[d.week >= 4].copy(); d["pred"] = np.nan
    for sn in sorted(d.season.unique()):
        tr, te = d[d.season != sn], d[d.season == sn]; mu, sd = tr[feats].mean(), tr[feats].std().replace(0, 1); X = np.column_stack([np.ones(len(tr)), ((tr[feats] - mu) / sd).values]); b = np.linalg.lstsq(X, tr[y].values, rcond=None)[0]
        d.loc[te.index, "pred"] = np.column_stack([np.ones(len(te)), ((te[feats] - mu) / sd).values]) @ b
    return d
def mse(d, y): return ((d[y] - d.pred) ** 2).mean()
def edge(d, y, k=1, pool=0.5, seed=3):
    rng = np.random.default_rng(seed); out = []
    for _, g in d.groupby(["season", "week"]):
        g = g[rng.random(len(g)) < pool]
        if len(g) >= 8: out.append(g.sort_values("pred", ascending=False).head(k)[y].mean() - g[y].mean())
    return np.mean(out), np.std(out) / np.sqrt(len(out))
def coefs(d, y, feats):
    mu, sd = d[feats].mean(), d[feats].std().replace(0, 1); X = np.column_stack([np.ones(len(d)), ((d[feats] - mu) / sd).values]); return dict(zip(feats, np.round(np.linalg.lstsq(X, d[y].values, rcond=None)[0][1:], 2)))
# ---------------- quarterback-level history (across seasons) ----------------
Q = P[P.position == "QB"].groupby(["season", "week", "team", "player_id"]).agg(db=("db", "sum"), sk=("sacks_suffered", "sum"), to=("to", "sum")).reset_index(); Q = Q[Q.db > 0].sort_values(["player_id", "season", "week"])
for c in ("db", "sk", "to"): Q["c" + c] = Q.groupby("player_id")[c].cumsum() - Q[c]
lsk, lto = Q.sk.sum() / Q.db.sum(), Q.to.sum() / Q.db.sum(); Q["qb_sk"] = (Q.csk + 150 * lsk) / (Q.cdb + 150); Q["qb_to"] = (Q.cto + 150 * lto) / (Q.cdb + 150); Q["qb_exp"] = np.log1p(Q.cdb)
Q = Q.sort_values(["season", "player_id", "week"]); Q["s_cdb"] = Q.groupby(["season", "player_id"]).db.cumsum() - Q.db
S = Q.sort_values("db", ascending=False).groupby(["season", "week", "team"]).head(1).copy()                      # the QB who played the most snaps that game
prim = {}
for (s, t), g in Q.groupby(["season", "team"]):
    for w in sorted(g.week.unique()): pr = g[g.week < w].groupby("player_id").db.sum(); prim[(s, w, t)] = pr.max() if len(pr) else 0
S["primary"] = [prim.get((r.season, r.week, r.team), 0) for r in S.itertuples()]; S["backup"] = ((S.s_cdb < S.primary) & (S.primary >= 60)).astype(float)
O = S[["season", "week", "team", "qb_sk", "qb_to", "qb_exp", "backup"]].rename(columns={"team": "opp", "qb_sk": "opp_qb_sk", "qb_to": "opp_qb_to", "qb_exp": "opp_qb_exp", "backup": "opp_backup"}); T = T.merge(O, on=["season", "week", "opp"], how="left")
ts = og.groupby(["season", "team"]).agg(sk=("sk", "sum"), db=("db", "sum"), to=("to", "sum"), g=("week", "nunique")).reset_index(); ts["psk"] = ts.sk / ts.db; ts["pto"] = ts.to / ts.g; ts["season"] += 1
T = T.merge(ts[["season", "team", "psk", "pto"]].rename(columns={"team": "opp", "psk": "opp_prior_sk", "pto": "opp_prior_to"}), on=["season", "opp"], how="left")
for c in ("opp_prior_sk", "opp_prior_to"): T[c] = T[c].fillna(T[c].mean())
for c in ("opp_qb_sk", "opp_qb_to", "opp_qb_exp"): T[c] = T[c].fillna(T[c].mean())
T["opp_backup"] = T.opp_backup.fillna(0.0)
out = []; B = ["opp_imp"]
base = preds(T, "dst", B, ); b0 = mse(base, "dst"); e0 = edge(base, "dst"); out.append(f"DEFENSE ({len(base)} team-games). Baseline, the line alone: MSE {b0:.3f}; best of the half still on waivers beats the average team by {e0[0]:+.2f} pts (+/-{e0[1]:.2f})")
for label, extra in [("reference: team-level sack + turnover rates (the first test)", ["opp_sk_rate", "opp_to"]), ("TEST 1  the opposing QB's own career sack and turnover rates", ["opp_qb_sk", "opp_qb_to"]), ("TEST 2  opposing QB is a backup, or inexperienced", ["opp_backup", "opp_qb_exp"]), ("TEST 4  last season's team sack and turnover rates", ["opp_prior_sk", "opp_prior_to"]), ("all of tests 1, 2 and 4 together", ["opp_qb_sk", "opp_qb_to", "opp_backup", "opp_qb_exp", "opp_prior_sk", "opp_prior_to"])]:
    d = preds(T, "dst", B + extra); m = mse(d, "dst"); e = edge(d, "dst"); out.append(f"  {label:62s} MSE {m:.3f} ({100*(m/b0-1):+.2f}% vs the line)  stream edge {e[0]:+.2f} pts   coefs {coefs(d, 'dst', B + extra)}")
d = T[(T.week >= 4)].dropna(subset=["dst"]); bk = d[d.opp_backup == 1]; nb = d[d.opp_backup == 0]
out.append(f"  raw: defenses facing a BACKUP quarterback average {bk.dst.mean():.2f} pts (n={len(bk)}) vs {nb.dst.mean():.2f} otherwise (n={len(nb)}); difference {bk.dst.mean()-nb.dst.mean():+.2f} (+/-{np.sqrt(bk.dst.var()/len(bk)+nb.dst.var()/len(nb)):.2f}); sacks {bk.sacks.mean():.2f} vs {nb.sacks.mean():.2f}; takeaways {(bk.ints+bk.frec).mean():.2f} vs {(nb.ints+nb.frec).mean():.2f}")
# ---------------- kicker talent ----------------
Kr = K.copy(); Kr["m50"] = Kr.fg_made_50_59 + Kr.fg_made_60_; Kr["a50"] = Kr.m50 + Kr.fg_missed_50_59 + Kr.fg_missed_60_
Kg = Kr.groupby(["season", "week", "team", "player_id"]).agg(att=("fg_att", "sum"), made=("fg_made", "sum"), m50=("m50", "sum"), a50=("a50", "sum"), pts=("fgpts", "sum")).reset_index().sort_values(["player_id", "season", "week"]); Kg["one"] = 1
for c in ("att", "made", "m50", "a50", "pts", "one"): Kg["c" + c] = Kg.groupby("player_id")[c].cumsum() - Kg[c]
lm_pts = Kg.pts.mean(); lm_a50 = Kg.a50.mean()
Kg["k_fgpct"] = (Kg.cmade + 20 * 0.85) / (Kg.catt + 20); Kg["k_50pct"] = (Kg.cm50 + 6 * 0.6) / (Kg.ca50 + 6); Kg["k_ppg"] = (Kg.cpts + 8 * lm_pts) / (Kg.cone + 8); Kg["k_a50"] = (Kg.ca50 + 4 * lm_a50) / (Kg.cone + 4)
T = T.merge(Kg[["season", "week", "player_id", "k_fgpct", "k_50pct", "k_ppg", "k_a50"]].rename(columns={"player_id": "pid"}), on=["season", "week", "pid"], how="left")
Kd = T[T.kpts.notna() & T.pid.notna()].copy(); KB = ["own_imp"]; kb = preds(Kd, "kpts", KB); k0 = mse(kb, "kpts"); ke = edge(kb, "kpts")
out.append(f"\\nKICKER ({len(kb)} kicker-games). Baseline, the line alone: MSE {k0:.3f}; best of the half still on waivers beats the average by {ke[0]:+.2f} pts (+/-{ke[1]:.2f})")
for label, extra in [("reference: spread + wind + temperature + dome", ["spread", "wind", "temp", "dome"]), ("TEST 3  the kicker's own talent (FG%, 50+ rate, points per game)", ["k_fgpct", "k_50pct", "k_ppg"]), ("TEST 3  how often he attempts long kicks", ["k_a50"]), ("talent + weather + spread together", ["k_fgpct", "k_50pct", "k_ppg", "k_a50", "spread", "wind", "temp", "dome"])]:
    d = preds(Kd, "kpts", KB + extra); m = mse(d, "kpts"); e = edge(d, "kpts"); out.append(f"  {label:62s} MSE {m:.3f} ({100*(m/k0-1):+.2f}% vs the line)  stream edge {e[0]:+.2f} pts   coefs {coefs(d, 'kpts', KB + extra)}")
q = Kd[(Kd.week >= 4)].dropna(subset=["k_ppg"]).copy(); q["tier"] = pd.qcut(q.k_ppg, 4, labels=["worst quarter", "2nd", "3rd", "best quarter"]); g = q.groupby("tier").agg(prior_ppg=("k_ppg", "mean"), next_game=("kpts", "mean"), n=("kpts", "size")); out.append("  kickers sorted by their points-per-game history BEFORE the game, and what they then scored:\\n" + g.round(2).to_string())
open("/tmp/p1/dstk3.txt", "w").write("\\n".join(out)); print("\\n".join(out))
