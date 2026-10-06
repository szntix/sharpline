import numpy as np, pandas as pd, warnings, itertools
warnings.filterwarnings("ignore")
src = open("/tmp/p1/dstk_study.py").read(); exec(compile(src.split("def loso(")[0], "head", "exec"))
def expand_by(df, key, col, name, k=4):
    out = np.full(len(df), np.nan); lm = df[col].mean()
    for (s, t), g in df.sort_values("week").groupby(["season", key]):
        v = g[col].values; cs = np.concatenate([[0], np.cumsum(v)[:-1]]); n = np.arange(len(v)); out[g.index] = (cs + k * lm) / (n + k)
    df[name] = out
T = T.sort_values(["season", "team", "week"]).reset_index(drop=True); expand_by(T, "team", "pts", "pf_x"); expand_by(T, "team", "opp_pts", "pa_x")
O = T[["season", "week", "opp", "dst"]].rename(columns={"opp": "off_team", "dst": "dst_allowed"}).sort_values(["season", "off_team", "week"]).reset_index(drop=True); expand_by(O, "off_team", "dst_allowed", "od_x")
T = T.merge(O[["season", "week", "off_team", "od_x"]].rename(columns={"off_team": "opp"}), on=["season", "week", "opp"], how="left")
# state "as of week w" for any team: its most recent row at or before w (season-to-date through w-1)
ST = {}
for (s, t), g in T.groupby(["season", "team"]): ST[(s, t)] = g.sort_values("week")[["week", "pf_x", "pa_x", "od_x"]].values
def asof(s, t, w):
    a = ST.get((s, t)); 
    if a is None: return None
    i = np.searchsorted(a[:, 0], w, side="right") - 1; return a[i] if i >= 0 else a[0]
# leave-one-season-out models: line model for THIS week, and a no-line model for FUTURE weeks
def fit(df, feats):
    mu, sd = df[feats].mean(), df[feats].std().replace(0, 1); X = np.column_stack([np.ones(len(df)), ((df[feats] - mu) / sd).values]); b = np.linalg.lstsq(X, df.dst.values, rcond=None)[0]; return mu, sd, b
def pred(m, X):
    mu, sd, b = m; return b[0] + (((X - mu.values) / sd.values) * b[1:]).sum(axis=1)
D = T.dropna(subset=["dst", "opp_imp", "opp_pf_x" if "opp_pf_x" in T else "pf_x", "pa_x", "od_x"]).copy()
rows = T[["season", "week", "team", "opp"]].copy(); RF = ["f_pf", "f_pa", "f_od"]
# training rows for the rough model: opponent's pf, own pa, opponent's DST-allowed, each as of that game's week
pfm = T[["season", "week", "team", "pf_x"]].rename(columns={"team": "opp", "pf_x": "f_pf"}); T2 = T.merge(pfm, on=["season", "week", "opp"], how="left").rename(columns={"pa_x": "f_pa", "od_x": "f_od"})
GAME = {(r.season, r.week, r.team): (r.opp, r.dst) for r in T.itertuples()}; OPPIMP = {(r.season, r.week, r.team): r.opp_imp for r in T.itertuples()}
res = {}
for hold in sorted(T.season.unique()):
    tr = T2[(T2.season != hold) & (T2.week >= 4)].dropna(subset=["dst", "opp_imp", "f_pf", "f_pa", "f_od"]); m0 = fit(tr, ["opp_imp"]); m1 = fit(tr, RF)
    for w in range(5, 17):
        teams = sorted({t for (s, ww, t) in GAME if s == hold and ww == w}); allteams = sorted({t for (s, ww, t) in GAME if s == hold})
        E = {}; R = {}
        for t in allteams:
            e, r, byes = [], [], []
            for j in range(3):
                g = GAME.get((hold, w + j, t))
                if g is None: e.append(0.0); r.append(0.0); byes.append(True); continue
                opp, dst = g; byes.append(False); r.append(dst)
                if j == 0: e.append(float(pred(m0, np.array([[OPPIMP[(hold, w, t)]]]))[0]))
                else:
                    a, b = asof(hold, opp, w), asof(hold, t, w); e.append(float(pred(m1, np.array([[a[1], b[2], a[3]]]))[0]))
            E[t] = (e, r, byes)
        res[(hold, w)] = E
print("built the weekly expectations and realized scores for", len(res), "(season, week) decision points")
import pickle; pickle.dump(res, open("/tmp/p1/plan_res.pkl", "wb"))
