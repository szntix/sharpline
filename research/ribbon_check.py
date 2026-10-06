import numpy as np, pandas as pd, urllib.request, io, warnings
warnings.filterwarnings("ignore")
src = open("/tmp/p1/dstk_study.py").read(); exec(compile(src.split("def loso(")[0], "head", "exec"))
# --- features known BEFORE the game, from season-to-date results only (no betting line: lines don't exist beyond next week)
def expand_by(df, key, col, name, k=4):
    out = np.full(len(df), np.nan); lm = df[col].mean()
    for (s, t), g in df.sort_values("week").groupby(["season", key]):
        v = g[col].values; cs = np.concatenate([[0], np.cumsum(v)[:-1]]); n = np.arange(len(v)); out[g.index] = (cs + k * lm) / (n + k)
    df[name] = out
T = T.sort_values(["season", "team", "week"]).reset_index(drop=True)
expand_by(T, "team", "pts", "pf_x"); expand_by(T, "team", "opp_pts", "pa_x")                       # a team's own scoring / points allowed so far
T["dst_vs_opp"] = T.dst                                                                            # DST points the defense scored against its opponent
O = T[["season", "week", "opp", "dst"]].rename(columns={"opp": "off_team", "dst": "dst_allowed"}).sort_values(["season", "off_team", "week"]).reset_index(drop=True)   # per OFFENSE: DST points scored against it
expand_by(O, "off_team", "dst_allowed", "off_dst_allowed_x"); T = T.merge(O[["season", "week", "off_team", "off_dst_allowed_x"]].rename(columns={"off_team": "opp"}), on=["season", "week", "opp"], how="left")
opp_pf = T[["season", "week", "team", "pf_x"]].rename(columns={"team": "opp", "pf_x": "opp_pf_x"}); T = T.merge(opp_pf, on=["season", "week", "opp"], how="left")
T["mine"] = (T.opp_pf_x + T.pa_x) / 2                                                               # the app's rough implied points: (opponent's scoring + this defense's points allowed) / 2
def oos(feats, label):
    d = T.dropna(subset=["dst"] + feats); d = d[d.week >= 5].copy(); err = np.zeros(len(d)); i = 0
    for s in sorted(d.season.unique()):
        tr, te = d[d.season != s], d[d.season == s]; mu, sd = tr[feats].mean(), tr[feats].std().replace(0, 1); X = np.column_stack([np.ones(len(tr)), ((tr[feats] - mu) / sd).values]); b = np.linalg.lstsq(X, tr.dst.values, rcond=None)[0]
        err[(d.season == s).values] = te.dst.values - np.column_stack([np.ones(len(te)), ((te[feats] - mu) / sd).values]) @ b
    base = ((d.dst - d.dst.mean()) ** 2).mean(); m = (err ** 2).mean(); print(f"  {label:68s} error {m:.3f}  ({100*(m/base-1):+.2f}% vs a flat league average {base:.3f})"); return m
print("PREDICTING A DEFENSE'S WEEK FROM SEASON-TO-DATE RESULTS ONLY (week 5+, 2021-2025, leave-one-season-out)")
a = oos(["mine"], "THE APP'S MEASURE: (opponent scoring + this defense's points allowed) / 2"); b = oos(["off_dst_allowed_x"], "THE REFERENCE SITE'S KIND: DST points the opponent offense has given up")
c = oos(["opp_pf_x"], "opponent's scoring alone"); d = oos(["opp_pf_x", "pa_x"], "opponent scoring + own points allowed (fitted)"); e = oos(["opp_pf_x", "pa_x", "off_dst_allowed_x"], "all three together")
# --- what each measure says about Jacksonville's actual next opponents (2026 season to date)
try:
    st = pd.read_csv("/tmp/nfl/stats_2026.csv", low_memory=False); print("\n2026 stats file covers weeks:", int(st.week.min()), "to", int(st.week.max()))
except Exception as ex: print("no 2026 stats", ex)
