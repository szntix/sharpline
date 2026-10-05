import pandas as pd, numpy as np, math
FIX = {"LA": "LAR", "OAK": "LV", "SD": "LAC", "STL": "LAR", "WSH": "WAS"}
DIV = {"AFC": [["BUF","MIA","NE","NYJ"],["BAL","CIN","CLE","PIT"],["HOU","IND","JAX","TEN"],["DEN","KC","LV","LAC"]], "NFC": [["DAL","NYG","PHI","WAS"],["CHI","DET","GB","MIN"],["ATL","CAR","NO","TB"],["ARI","LAR","SF","SEA"]]}
g = pd.read_csv("/tmp/nfl/games.csv", low_memory=False); g["home_team"] = g.home_team.replace(FIX); g["away_team"] = g.away_team.replace(FIX)
rng = np.random.default_rng(11); SD = 13.4
def ridge(df, teams, target, prior, lam, kappa):
    ix = {t: i for i, t in enumerate(teams)}; A = np.zeros((len(df), len(teams))); y = np.zeros(len(df)); k = 0
    for h, a, hs, as_, sp, loc in zip(df.home_team, df.away_team, df.home_score, df.away_score, df.spread_line, df.location):
        v = (hs - as_) if target == "margin" else sp
        if pd.isna(v) or h not in ix or a not in ix: continue
        A[k, ix[h]] = 1; A[k, ix[a]] = -1; y[k] = v - (0 if loc == "Neutral" else 2.0); k += 1
    A, y = A[:k], y[:k]; p = np.array([(prior or {}).get(t, 0.0) for t in teams]) * kappa
    return dict(zip(teams, np.linalg.lstsq(np.vstack([A, math.sqrt(lam) * np.eye(len(teams))]), np.concatenate([y, math.sqrt(lam) * p]), rcond=None)[0]))
def playoffs(wins, teams):
    """wins: N x T. Division winners, then three wild cards per conference; ties broken at random."""
    N = wins.shape[0]; ix = {t: i for i, t in enumerate(teams)}; key = wins + rng.random(wins.shape) * 0.01; made = np.zeros(wins.shape, bool)
    for conf, divs in DIV.items():
        cols = [ix[t] for d in divs for t in d]; won = np.zeros(wins.shape, bool)
        for d in divs:
            c = [ix[t] for t in d]; w = np.argmax(key[:, c], axis=1); won[np.arange(N), np.array(c)[w]] = True
        rest = key[:, cols].copy(); rest[won[:, cols]] = -1; order = np.argsort(-rest, axis=1)[:, :3]
        for j in range(3): made[np.arange(N), np.array(cols)[order[:, j]]] = True
        made[:, cols] |= won[:, cols]
    return made
rows = []; calib = []
for s in range(2020, 2026):
    reg = g[(g.season == s) & (g.game_type == "REG")]; teams = sorted(set(reg.home_team) | set(reg.away_team)); assert len(teams) == 32, (s, len(teams))
    post = g[(g.season == s) & g.game_type.isin(["WC", "DIV"])]; made = {t: 1 for t in set(post.home_team) | set(post.away_team)}
    pv = g[(g.season == s - 1) & (g.game_type == "REG") & g.home_score.notna()]; pteams = sorted(set(pv.home_team) | set(pv.away_team))
    prA, prB = ridge(pv, pteams, "margin", None, 1, 0), ridge(pv, pteams, "spread_line", None, 0.5, 0)
    final = {t: 0.0 for t in teams}
    for _, r in reg.iterrows():
        d = r.home_score - r.away_score; final[r.home_team] += 1 if d > 0 else 0.5 if d == 0 else 0; final[r.away_team] += 1 if d < 0 else 0.5 if d == 0 else 0
    for cut in (4, 8, 12):
        played = reg[reg.week <= cut]; rem = reg[reg.week > cut]
        a = ridge(played, teams, "margin", prA, 4, 0.4); b = ridge(played, teams, "spread_line", prB, 0.5, 0.4); pw = {t: (a[t] + b[t]) / 2 for t in teams}
        w0 = np.zeros(32); ix = {t: i for i, t in enumerate(teams)}
        for _, r in played.iterrows():
            d = r.home_score - r.away_score; w0[ix[r.home_team]] += 1 if d > 0 else 0.5 if d == 0 else 0; w0[ix[r.away_team]] += 1 if d < 0 else 0.5 if d == 0 else 0
        H = np.array([ix[t] for t in rem.home_team]); A_ = np.array([ix[t] for t in rem.away_team]); neutral = (rem.location == "Neutral").values
        mu_r = np.array([pw[h] - pw[a_] + (0 if n else 2.0) for h, a_, n in zip(rem.home_team, rem.away_team, neutral)]); mu_c = np.zeros(len(rem)) + np.where(neutral, 0, 0)   # coin flips: no ratings at all
        for name, mu, tau in (("tau4", mu_r, 4.0), ("coin", mu_c, 0.0)):
            N = 3000; e = tau * rng.standard_normal((N, 32)); hw = (mu + (e[:, H] - e[:, A_]) + SD * rng.standard_normal((N, len(rem)))) > 0
            Hm = np.zeros((len(rem), 32)); Hm[np.arange(len(rem)), H] = 1; Am = np.zeros((len(rem), 32)); Am[np.arange(len(rem)), A_] = 1
            wins = w0 + hw @ Hm + (~hw) @ Am; m = playoffs(wins, teams); p = m.mean(0); ew = wins.mean(0); lo, hi = np.percentile(wins, [10, 90], axis=0)
            y = np.array([made.get(t, 0) for t in teams]); fw = np.array([final[t] for t in teams])
            rows.append(dict(season=s, cut=cut, name=name, brier=((p - y) ** 2).mean(), mae=np.abs(ew - fw).mean(), cover=((fw >= lo - 0.5) & (fw <= hi + 0.5)).mean(), p=p, y=y))
R = pd.DataFrame(rows); import json
out = {"cut": {}, "season": {}}
for cut in (4, 8, 12):
    a = R[(R.cut == cut) & (R.name == "tau4")]; c = R[(R.cut == cut) & (R.name == "coin")]; out["cut"][cut] = dict(brier=round(a.brier.mean(), 4), coin=round(c.brier.mean(), 4), mae=round(a.mae.mean(), 2), coin_mae=round(c.mae.mean(), 2), cover=round(a.cover.mean(), 3))
print("tau = 4 points. cutoff: playoff Brier (ours / coin-flip) | projected wins miss (ours / coin-flip) | 80% range held")
for cut, v in out["cut"].items(): print(f"  after week {cut:<2}: {v['brier']:.4f} / {v['coin']:.4f} | {v['mae']:.2f} / {v['coin_mae']:.2f} | {v['cover']:.0%}")
print("\nseason by season (all cutoffs): ours beats coin-flip on Brier in", sum(1 for s in range(2020, 2026) if R[(R.season == s) & (R.name == "tau4")].brier.mean() < R[(R.season == s) & (R.name == "coin")].brier.mean()), "of 6 seasons:", {s: (round(R[(R.season == s) & (R.name == "tau4")].brier.mean(), 3), round(R[(R.season == s) & (R.name == "coin")].brier.mean(), 3)) for s in range(2020, 2026)})
cal = np.array([x for _, r in R[R.name == "tau4"].iterrows() for x in zip(r.p, r.y)]); bins = [0, .01, .05, .2, .4, .6, .8, .95, .99, 1.0001]; rows_ = []
print("\ncalibration pooled (said -> happened):")
for lo, hi in zip(bins[:-1], bins[1:]):
    m = (cal[:, 0] >= lo) & (cal[:, 0] < hi)
    if m.sum(): rows_.append([round(lo, 2), round(min(hi, 1), 2), int(m.sum()), round(float(cal[m, 0].mean()), 3), round(float(cal[m, 1].mean()), 3)]); print(f"  {lo*100:>3.0f}-{min(hi,1)*100:>3.0f}%  said {cal[m,0].mean()*100:5.1f}%  happened {cal[m,1].mean()*100:5.1f}%  n={m.sum()}")
out["calibration"] = rows_; out["tau"] = 4.0; json.dump(out, open("/tmp/p1/outlook_track.json", "w"))
for lab, lo, hi in (("said 90%+", .9, 1.01), ("said under 10%", -.01, .1)):
    m = (cal[:, 0] >= lo) & (cal[:, 0] < hi); print(f"{lab}: n={m.sum()}, average said {cal[m,0].mean()*100:.1f}%, happened {cal[m,1].mean()*100:.1f}%")
