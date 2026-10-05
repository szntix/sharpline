import numpy as np, pandas as pd, math, json, warnings
warnings.filterwarnings("ignore")
src = open("/tmp/p1/dstk_study.py").read(); exec(compile(src.split("def loso(")[0], "head", "exec"))
ncdf = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
PAT = [(-1e9, .5, 10), (.5, 6.5, 7), (6.5, 13.5, 4), (13.5, 20.5, 1), (20.5, 27.5, 0), (27.5, 34.5, -1), (34.5, 1e9, -4)]
# kicker components by game
Kb = K.groupby(["season", "week", "team"]).agg(f19=("fg_made_0_19", "sum"), f29=("fg_made_20_29", "sum"), f39=("fg_made_30_39", "sum"), f49=("fg_made_40_49", "sum"), f50=("fg_made_50_59", "sum"), f60=("fg_made_60_", "sum"), xpm=("pat_made", "sum"), att=("fg_att", "sum"), made=("fg_made", "sum")).reset_index(); Kb["f50p"] = Kb.f50 + Kb.f60; Kb["miss"] = Kb.att - Kb.made
T2 = T.merge(Kb, on=["season", "week", "team"], how="left")
D = T2[(T2.week >= 4)].dropna(subset=["dst", "opp_imp", "spread", "own_imp"]).copy(); D["x"] = D.opp_imp - 22
Kk = T2[(T2.week >= 4) & T2.kpts.notna() & T2.xpm.notna()].dropna(subset=["own_imp", "spread"]).copy(); Kk["x"] = Kk.own_imp - 22
dcomp = {"sack": "sacks", "int": "ints", "fum_rec": "frec", "def_td": "dtd", "safe": "saf", "blk_kick": "blk", "def_st_td": "sttd"}
kcomp = {"fgm_0_19": "f19", "fgm_20_29": "f29", "fgm_30_39": "f39", "fgm_40_49": "f49", "fgm_50p": "f50p", "xpm": "xpm", "fgmiss": "miss"}
def fit(df, cols, y):
    X = np.column_stack([np.ones(len(df))] + [df[c].values for c in cols]); return np.linalg.lstsq(X, df[y].values, rcond=None)[0]
def pred(b, df, cols): return np.column_stack([np.ones(len(df))] + [df[c].values for c in cols]) @ b
dcols = ["x", "spread"]; Dfit = {}
for k, c in dcomp.items(): Dfit[k] = fit(D, dcols, c)
pa_b = fit(D, ["x"], "opp_pts"); pa_res = D.opp_pts - pred(pa_b, D, ["x"])      # note: x here is centered at 22 so mean points allowed = a + b*(opp_imp-22)
# sd of points allowed by implied-points bin (to see if a single sd is right)
D["bin"] = pd.cut(D.opp_imp, [0, 17, 20, 23, 26, 60]); sds = D.groupby("bin").opp_pts.std(); 
print("points allowed vs the line: mean = %.2f + %.2f*(implied-22); residual sd %.2f overall; by bin: %s" % (pa_b[0] + 22 * 0, pa_b[1], pa_res.std(), sds.round(2).tolist()))
def dst_expected(row_x, row_s, coefs, pab, sd):
    pr = {k: max(0.0, coefs[k][0] + coefs[k][1] * row_x + coefs[k][2] * row_s) for k in coefs}; mu = pab[0] + pab[1] * row_x
    pa = sum(p * (ncdf((hi - mu) / sd) - ncdf((lo - mu) / sd)) for lo, hi, p in PAT)
    return pa + pr["sack"] + 2 * pr["int"] + 2 * pr["fum_rec"] + 6 * pr["def_td"] + 2 * pr["safe"] + 2 * pr["blk_kick"] + 6 * pr["def_st_td"]
# leave-one-season-out check of the calibrated structure
D["new"] = np.nan; sd_pa = pa_res.std()
for s in sorted(D.season.unique()):
    tr, te = D[D.season != s], D[D.season == s]; cf = {k: fit(tr, dcols, c) for k, c in dcomp.items()}; pb = fit(tr, ["x"], "opp_pts"); sd = (tr.opp_pts - pred(pb, tr, ["x"])).std()
    D.loc[te.index, "new"] = [dst_expected(x, sp, cf, pb, sd) for x, sp in zip(te.x, te.spread)]
mse_new = ((D.dst - D.new) ** 2).mean(); b = np.polyfit(D.new, D.dst, 1)
print(f"DEFENSE calibrated structure (leave-one-season-out): average {D.new.mean():.2f} vs actual {D.dst.mean():.2f}; MSE {mse_new:.3f} (the app now: 28.193, line-only fit: 27.116); calibration slope {b[0]:.2f}, intercept {b[1]:+.2f}")
print(D.groupby("bin").agg(new=("new", "mean"), actual=("dst", "mean")).round(2).to_string())
Kk.loc[Kk.dome == 1, "wind"] = 0.0; Kk.loc[Kk.dome == 1, "temp"] = 65.0   # indoors is calm and 65F, exactly as the app treats it
kcols = ["x", "spread", "wind", "temp", "dome"]; Kfit = {k: fit(Kk, kcols, c) for k, c in kcomp.items()}
def k_points(row, cf): return sum(max(0.0, pred(cf[k], row, kcols)[0]) * w for k, w in (("fgm_0_19", 3), ("fgm_20_29", 3), ("fgm_30_39", 3), ("fgm_40_49", 4), ("fgm_50p", 5), ("xpm", 1)))
Kk["new"] = np.nan
for s in sorted(Kk.season.unique()):
    tr, te = Kk[Kk.season != s], Kk[Kk.season == s]; cf = {k: fit(tr, kcols, c) for k, c in kcomp.items()}
    Kk.loc[te.index, "new"] = sum(np.maximum(0, pred(cf[k], te, kcols)) * w for k, w in (("fgm_0_19", 3), ("fgm_20_29", 3), ("fgm_30_39", 3), ("fgm_40_49", 4), ("fgm_50p", 5), ("xpm", 1)))
mse_k = ((Kk.kpts - Kk.new) ** 2).mean(); bk = np.polyfit(Kk.new, Kk.kpts, 1)
print(f"KICKER calibrated structure (leave-one-season-out): average {Kk.new.mean():.2f} vs actual {Kk.kpts.mean():.2f}; MSE {mse_k:.3f} (the app now: 20.964, line-only fit: 19.928, league average 20.359); slope {bk[0]:.2f}, intercept {bk[1]:+.2f}")
Kk["bin"] = pd.cut(Kk.own_imp, [0, 18, 21, 24, 27, 60]); print(Kk.groupby("bin").agg(new=("new", "mean"), actual=("kpts", "mean")).round(2).to_string())
out = dict(defense={k: [round(float(v), 5) for v in Dfit[k]] for k in Dfit}, pa=dict(a=round(float(pa_b[0]), 4), b=round(float(pa_b[1]), 5), sd=round(float(sd_pa), 3)), kicker={k: [round(float(v), 5) for v in Kfit[k]] for k in Kfit}, kcols=kcols, dcols=dcols, means=dict(dst=float(D.dst.mean()), k=float(Kk.kpts.mean())))
json.dump(out, open("/tmp/p1/dk_coefs.json", "w")); print("\ncoefficients saved:", {k: out["defense"][k] for k in ("sack", "def_td", "int")}, out["pa"])

# ---- export history and the python model's full-fit predictions, so the JavaScript can be checked against an independent implementation
D["full"] = [dst_expected(x, sp, Dfit, pa_b, sd_pa) for x, sp in zip(D.x, D.spread)]
Kk["full"] = sum(np.maximum(0, pred(Kfit[k], Kk, kcols)) * w for k, w in (("fgm_0_19", 3), ("fgm_20_29", 3), ("fgm_30_39", 3), ("fgm_40_49", 4), ("fgm_50p", 5), ("xpm", 1)))
json.dump(dict(dst=[[round(float(r.opp_imp), 3), round(float(r.spread), 3), float(r.dst), round(float(r.full), 6)] for r in D.itertuples()], k=[[round(float(r.own_imp), 3), round(float(r.spread), 3), float(r.wind), float(r.temp), float(r.dome), float(r.kpts), round(float(r.full), 6)] for r in Kk.itertuples()]), open("/tmp/fx/dk_history.json", "w"))
print("history exported:", len(D), "defense games,", len(Kk), "kicker games")

rows = [[int(round(r.opp_imp * 10)), int(round(r.spread * 10)), int(r.sacks), int(r.ints), int(r.frec), int(r.dtd), int(r.saf), int(r.blk), int(r.sttd), int(r.opp_pts)] for r in D.itertuples()]
js = "// Defense games from 2021 to 2025 (week 4 on), so the chance of a big game or a dud can be worked out under any league's scoring.\n// Each row: [the opponent's expected points x10, the team's spread x10, sacks, interceptions, fumble recoveries, defensive TDs, safeties, blocked kicks, special-teams TDs, points the opponent scored]\nexport const DST_GAMES = " + json.dumps(rows, separators=(",", ":")) + ";\n"
open("/home/claude/edge/public/js/dsthistory.js", "w").write(js); print("samples written:", len(rows), "rows,", len(js) // 1024, "KB")
