"""
Sharpline backtest. Decides which signals earn a place in the projection model.

For every player-game from 2021 to Week 3 of 2026 we build features using ONLY information
available before kickoff, then test each candidate signal with an ablation: does the model get
worse when that signal is removed? Every fold is scored on a season the model never saw
(leave-one-season-out; 2026 Weeks 1-3 are scored on a model trained on 2021-2025).

Run:  python backtest.py   (expects the nflverse CSVs + games.csv + FantasyPros archive in DATA)
"""
import json, os, sys, warnings
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")

DATA = os.environ.get("DATA", "/home/claude/data/")
OUT = os.environ.get("OUT", "/home/claude/edge/research/")
YEARS = [2021, 2022, 2023, 2024, 2025, 2026]
POS = ["QB", "RB", "WR", "TE"]
HALF = 4.0        # form half-life, in games
PRIOR_W = 1.0     # form starts as one pseudo-game at the position mean
LEAGUE_IMPLIED = 22.5

# ----------------------------------------------------------------------------------------------
# Load
# ----------------------------------------------------------------------------------------------
P = pd.concat([pd.read_csv(f"{DATA}stats_player_week_{y}.csv", low_memory=False) for y in YEARS])
P = P[(P.season_type == "REG") & P.position.isin(POS)].copy()
P = P[["player_id", "player_display_name", "position", "season", "week", "team", "opponent_team",
       "fantasy_points_ppr", "targets", "carries", "target_share"]].copy()
for c in ["targets", "carries", "target_share"]:
    P[c] = P[c].fillna(0.0)
P = P.sort_values(["player_id", "season", "week"]).reset_index(drop=True)

G = pd.read_csv(DATA + "games.csv", low_memory=False)
G = G[(G.game_type == "REG") & G.season.isin(YEARS)]
home = G.assign(team=G.home_team, opp=G.away_team, home=1, spread=G.spread_line)
away = G.assign(team=G.away_team, opp=G.home_team, home=0, spread=-G.spread_line)
T = pd.concat([home, away])[["season", "week", "team", "opp", "home", "spread", "total_line", "temp", "wind", "roof", "gameday"]].copy()
T["imp"] = T.total_line / 2 + T.spread / 2
T["imp_dev"] = T.imp / LEAGUE_IMPLIED - 1
outdoor = T.roof.isin(["outdoors", "open"])
T["wind15"] = ((T.wind >= 15) & outdoor).astype(float)
T["cold"] = ((T.temp <= 35) & outdoor).astype(float)
P = P.merge(T.drop(columns=["opp"]), on=["season", "week", "team"], how="left")


# ----------------------------------------------------------------------------------------------
# Pre-game features: recency-weighted form (uses only earlier games)
# ----------------------------------------------------------------------------------------------
def ewm_prior(values, mu, half=HALF, w0=PRIOR_W):
    n = len(values); out = np.empty(n)
    for i in range(n):
        if i == 0:
            out[i] = mu; continue
        w = 0.5 ** ((i - 1 - np.arange(i)) / half)
        out[i] = (w @ values[:i] + w0 * mu) / (w.sum() + w0)
    return out


def add_form(df, col, name, half=HALF):
    res = np.empty(len(df)); mus = df.groupby("position")[col].mean().to_dict()
    for _, idx in df.groupby("player_id").indices.items():
        pos = df.position.iat[idx[0]]
        res[idx] = ewm_prior(df[col].values[idx], mus[pos], half)
    df[name] = res


for col, name in [("fantasy_points_ppr", "form"), ("targets", "tgt"), ("carries", "car"), ("target_share", "ts")]:
    add_form(P, col, name)
P["n_prior"] = P.groupby("player_id").cumcount()

# Defense-vs-position: points a defense has allowed to that position (recency weighted, pre-game)
A = P.groupby(["season", "week", "opponent_team", "position"]).fantasy_points_ppr.sum().reset_index(name="allowed")
A = A.sort_values(["opponent_team", "position", "season", "week"]).reset_index(drop=True)
A["dvp"] = 0.0
for (team, pos), idx in A.groupby(["opponent_team", "position"]).indices.items():
    mu = A[A.position == pos].allowed.mean()
    A.loc[A.index[idx], "dvp"] = ewm_prior(A.allowed.values[idx], mu, half=6.0, w0=3.0) / mu - 1
P = P.merge(A[["season", "week", "opponent_team", "position", "dvp"]], on=["season", "week", "opponent_team", "position"], how="left")

P["form_x_imp"] = P.form * P.imp_dev
P["y"] = P.fantasy_points_ppr
P["wind15"] = P.wind15.fillna(0.0); P["cold"] = P.cold.fillna(0.0)

GROUPS = {
    "Vegas game environment": ["imp_dev", "form_x_imp"],
    "Opportunity (targets, carries)": None,   # position specific below
    "Opponent defense rating": ["dvp"],
    "Wind and cold": ["wind15", "cold"],
    "Home field": ["home"],
    "Point spread (game script)": ["spread"],
}
USAGE = {"QB": ["car"], "RB": ["tgt", "car", "ts"], "WR": ["tgt", "ts", "car"], "TE": ["tgt", "ts"]}
NO_WIND = {"RB"}


def feats(pos, groups):
    f = ["form"]
    for g in groups:
        if g == "Opportunity (targets, carries)": f += USAGE[pos]
        elif g == "Wind and cold":
            if pos not in NO_WIND: f += GROUPS[g]
        else: f += GROUPS[g]
    return f


def fit(X, y, lam=1e-3):
    Xb = np.column_stack([np.ones(len(X)), X])
    R = lam * np.eye(Xb.shape[1]); R[0, 0] = 0
    return np.linalg.solve(Xb.T @ Xb + R, Xb.T @ y)


def predict(b, X):
    return b[0] + X @ b[1:]


def eval_df(pos):
    d = P[(P.position == pos) & (P.n_prior >= 3) & (P.form >= 4.5)].dropna(subset=["imp", "dvp", "spread"]).copy()
    return d


def loso(d, features):
    preds = pd.Series(np.nan, index=d.index)
    for yr in YEARS:
        te = d.season == yr
        if te.sum() == 0: continue
        tr = (d.season != yr) & (d.season <= 2025)
        b = fit(d.loc[tr, features].values, d.loc[tr, "y"].values)
        preds[te] = predict(b, d.loc[te, features].values)
    return preds


def mse_by_year(d, pred):
    return {int(y): float(((d.y[d.season == y] - pred[d.season == y]) ** 2).mean()) for y in YEARS if (d.season == y).any()}


results = {"years": YEARS, "positions": {}, "half_life_games": HALF}
all_groups = list(GROUPS)
final = {}

for pos in POS:
    d = eval_df(pos)
    base_feats = feats(pos, [])
    full_feats = feats(pos, all_groups)
    p_full = loso(d, full_feats); m_full = mse_by_year(d, p_full)
    p_base = loso(d, base_feats); m_base = mse_by_year(d, p_base)
    var_y = {int(y): float(d.y[d.season == y].var()) for y in YEARS}
    grp = {}
    for g in all_groups:
        if g == "Wind and cold" and pos in NO_WIND: continue
        rest = [x for x in all_groups if x != g]
        m_drop = mse_by_year(d, loso(d, feats(pos, rest)))
        m_only = mse_by_year(d, loso(d, feats(pos, [g])))
        per_year = {}
        for y in m_full:
            per_year[y] = {"drop_delta_pct": 100 * (m_drop[y] - m_full[y]) / m_full[y], "alone_gain_pct": 100 * (m_base[y] - m_only[y]) / m_base[y]}
        wins = sum(1 for y in per_year if per_year[y]["drop_delta_pct"] > 0.02)
        grp[g] = {"per_year": per_year, "wins_of": [wins, len(per_year)], "avg_pct": float(np.mean([per_year[y]["drop_delta_pct"] for y in per_year]))}
    keep = [g for g, v in grp.items() if v["wins_of"][0] >= 4 and v["avg_pct"] >= 0.15]
    kept_feats = feats(pos, keep)
    p_kept = loso(d, kept_feats); m_kept = mse_by_year(d, p_kept)
    b_final = fit(d.loc[d.season <= 2026, kept_feats].values, d.y.values)
    means = {f: float(d[f].mean()) for f in kept_feats}
    # calibration of the range shown in the app (shifted lognormal, sd = a + b * prediction)
    resid = d.y - p_kept
    d = d.assign(pred=p_kept, res=resid)
    bins = pd.qcut(d.pred, 8, duplicates="drop")
    tb = d.groupby(bins, observed=True).apply(lambda x: pd.Series({"m": x.pred.mean(), "sd": x.res.std()}))
    A_ = np.vstack([np.ones(len(tb)), tb.m]).T
    sd_a, sd_b = np.linalg.lstsq(A_, tb.sd, rcond=None)[0]
    results["positions"][pos] = {
        "n": int(len(d)),
        "mse_by_year": {"form_only": m_base, "full": m_full, "kept": m_kept},
        "r2_kept_by_year": {y: 1 - m_kept[y] / var_y[y] for y in m_kept},
        "r2_form_by_year": {y: 1 - m_base[y] / var_y[y] for y in m_base},
        "groups": grp, "kept": keep, "features": kept_feats,
        "coef": {"intercept": float(b_final[0]), **{f: float(c) for f, c in zip(kept_feats, b_final[1:])}},
        "means": means, "sd": [float(sd_a), float(sd_b)],
    }
    final[pos] = d

# ----------------------------------------------------------------------------------------------
# Range calibration: shifted-lognormal 10th-90th band, sd = (a + b*pred) * scale
# ----------------------------------------------------------------------------------------------
from math import sqrt, log, exp
from statistics import NormalDist
ND = NormalDist(); SHIFT = 4.0


def q_ln(mean, sd, q):
    m = mean + SHIFT; v = log(1 + sd * sd / (m * m)); mu = log(m) - v / 2
    return exp(mu + sqrt(v) * ND.inv_cdf(q)) - SHIFT


def fit_sd(pred, res):
    d = pd.DataFrame({"pred": pred, "res": res})
    bins = pd.qcut(d.pred, 8, duplicates="drop")
    tb = d.groupby(bins, observed=True).apply(lambda x: pd.Series({"m": x.pred.mean(), "sd": x.res.std()}))
    A_ = np.vstack([np.ones(len(tb)), tb.m]).T
    return [float(x) for x in np.linalg.lstsq(A_, tb.sd, rcond=None)[0]]


def coverage(pred, y, ab, scale):
    inside = below = above = 0; n = len(pred)
    for pr, yy in zip(pred, y):
        pr = max(pr, 0.5); sd = max(1.0, (ab[0] + ab[1] * pr) * scale)
        lo, hi = q_ln(pr, sd, 0.10), q_ln(pr, sd, 0.90)
        inside += lo <= yy <= hi; below += yy < lo; above += yy > hi
    return {"inside": inside / n, "below": below / n, "above": above / n}


def calibrate(pred, y):
    ab = fit_sd(pred, y - pred); best = None
    for sc in np.arange(0.9, 1.5, 0.02):
        c = coverage(pred, y, ab, sc); gap = abs(c["inside"] - 0.80)
        if best is None or gap < best[0]: best = (gap, float(sc), c)
    return {"sd": ab, "scale": round(best[1], 2), "coverage_80": best[2]}


for pos in POS:
    d = final[pos]
    results["positions"][pos]["model_range"] = calibrate(d.pred.values, d.y.values)

# ----------------------------------------------------------------------------------------------
# What do FantasyPros experts add?  Rank-to-points mapping is learned out-of-season.
# ----------------------------------------------------------------------------------------------
try:
    from sklearn.isotonic import IsotonicRegression
    from sklearn.linear_model import LogisticRegression
    E = pd.read_parquet(DATA + "db_fpecr.parquet")
    E = E[E.page_type.isin(["weekly-qb", "weekly-rb", "weekly-wr", "weekly-te"])].copy()
    E["scrape_date"] = pd.to_datetime(E.scrape_date)
    ids = pd.read_csv(DATA + "db_playerids.csv", low_memory=False)[["fantasypros_id", "gsis_id"]].dropna()
    ids["fantasypros_id"] = ids.fantasypros_id.astype(int)
    E["id"] = pd.to_numeric(E.id, errors="coerce"); E = E.dropna(subset=["id"]); E["id"] = E.id.astype(int)
    E = E.merge(ids, left_on="id", right_on="fantasypros_id", how="inner")
    G["gameday"] = pd.to_datetime(G.gameday)
    sundays = G[G.gameday.dt.weekday == 6].groupby(["season", "week"]).gameday.min().reset_index()

    def week_of(d):
        s_ = sundays[(sundays.gameday >= d - pd.Timedelta(hours=12)) & (sundays.gameday <= d + pd.Timedelta(days=7))].sort_values("gameday")
        return (int(s_.iloc[0].season), int(s_.iloc[0].week)) if len(s_) else (None, None)

    wk = {d: week_of(d) for d in E.scrape_date.unique()}
    E["season"] = E.scrape_date.map(lambda d: wk[d][0]); E["week"] = E.scrape_date.map(lambda d: wk[d][1])
    E = E.dropna(subset=["season", "week"]); E[["season", "week"]] = E[["season", "week"]].astype(int)
    E = E.sort_values("scrape_date").groupby(["gsis_id", "season", "week"]).tail(1)
    blend, table_out, duel = {}, {}, {}
    for pos in POS:
        d = final[pos].merge(E[["gsis_id", "season", "week", "ecr", "sd", "best", "worst"]], left_on=["player_id", "season", "week"], right_on=["gsis_id", "season", "week"], how="inner").rename(columns={"sd": "ecr_sd"})
        d["ecr_pts"] = np.nan
        for yr in YEARS:
            tr = (d.season != yr) & (d.season <= 2025); te = d.season == yr
            if te.sum() == 0: continue
            iso = IsotonicRegression(increasing=False, out_of_bounds="clip").fit(d.loc[tr, "ecr"], d.loc[tr, "y"])
            d.loc[te, "ecr_pts"] = iso.predict(d.loc[te, "ecr"])
        iso_all = IsotonicRegression(increasing=False, out_of_bounds="clip").fit(d.ecr, d.y)
        table_out[pos] = [round(float(x), 2) for x in iso_all.predict(list(range(1, 61)))]
        bl = pd.Series(np.nan, index=d.index)
        for yr in YEARS:
            tr = (d.season != yr) & (d.season <= 2025); te = d.season == yr
            if te.sum() == 0: continue
            w = np.linalg.lstsq(np.column_stack([d.loc[tr, "pred"], d.loc[tr, "ecr_pts"]]), d.loc[tr, "y"].values, rcond=None)[0]
            bl[te] = np.column_stack([d.loc[te, "pred"], d.loc[te, "ecr_pts"]]) @ w
        d["bl"] = bl
        rows = {}
        for yr in sorted(d.season.unique()):
            m = d.season == yr
            rows[int(yr)] = {"n": int(m.sum()), "model": float(((d.y[m] - d.pred[m]) ** 2).mean()), "experts": float(((d.y[m] - d.ecr_pts[m]) ** 2).mean()), "blend": float(((d.y[m] - bl[m]) ** 2).mean())}
        wall = np.linalg.lstsq(np.column_stack([d.pred, d.ecr_pts]), d.y.values, rcond=None)[0]
        tot = float(wall.sum())
        blend[pos] = {"by_year": rows, "w_model": float(wall[0] / tot), "w_experts": float(wall[1] / tot), "scale": tot,
                      "range": calibrate(d.bl.values, d.y.values)}
        # head-to-head: how often does the higher-projected player really outscore the other?
        a_, b_ = blend[pos]["range"]["sd"]; sc = blend[pos]["range"]["scale"]
        Z, Y, D = [], [], []
        for (yr, wkn), g in d.groupby(["season", "week"]):
            v = g.bl.values; yv = g.y.values
            if len(v) < 2: continue
            sd = np.maximum(1.0, (a_ + b_ * np.maximum(v, 0.5)) * sc)
            i, j = np.triu_indices(len(v), 1)
            keep_ = yv[i] != yv[j]
            i, j = i[keep_], j[keep_]
            Z.append((v[i] - v[j]) / np.sqrt(sd[i] ** 2 + sd[j] ** 2)); D.append(v[i] - v[j]); Y.append((yv[i] > yv[j]).astype(int))
        Z = np.concatenate(Z); Y = np.concatenate(Y); D = np.concatenate(D)
        Zs = np.concatenate([Z, -Z]); Ys = np.concatenate([Y, 1 - Y])
        lr = LogisticRegression(fit_intercept=False, C=1e6).fit(Zs.reshape(-1, 1), Ys)
        k = float(lr.coef_[0][0])
        edges = [0, 1, 2, 3, 5, 8, 100]; tab = []
        for lo, hi in zip(edges[:-1], edges[1:]):
            m = (np.abs(D) >= lo) & (np.abs(D) < hi)
            if m.sum() < 30: continue
            hit = float(np.mean(np.where(D[m] > 0, Y[m], 1 - Y[m])))
            tab.append({"gap": [lo, hi], "n": int(m.sum()), "higher_wins": round(hit, 3)})
        duel[pos] = {"k": round(k, 3), "table": tab}
    results["experts"] = {"blend": blend, "rank_to_points": table_out, "duel": duel}
except Exception as e:
    import traceback; traceback.print_exc()
    results["experts_error"] = repr(e)

json.dump(results, open(OUT + "backtest_results.json", "w"), indent=1)

# ----------------------------------------------------------------------------------------------
# Console summary
# ----------------------------------------------------------------------------------------------
print("HALF-LIFE", HALF, "games; positions:", {p: results["positions"][p]["n"] for p in POS})
for pos in POS:
    r = results["positions"][pos]
    print(f"\n=== {pos}  kept: {r['kept']}")
    print("  R2 form-only :", {y: round(v, 3) for y, v in r["r2_form_by_year"].items()})
    print("  R2 kept model:", {y: round(v, 3) for y, v in r["r2_kept_by_year"].items()})
    for g, v in r["groups"].items():
        cells = " ".join(("+" if v["per_year"][y]["drop_delta_pct"] > 0.02 else "-") for y in sorted(v["per_year"]))
        avg = np.mean([v["per_year"][y]["drop_delta_pct"] for y in v["per_year"]])
        print(f"  {g:34} helps {v['wins_of'][0]}/{v['wins_of'][1]}  [{cells}]  avg MSE change if removed {avg:+.2f}%")
    mr = r["model_range"]; print("  calibrated 80%% range: scale %.2f -> inside %.3f (below %.3f, above %.3f)" % (mr["scale"], mr["coverage_80"]["inside"], mr["coverage_80"]["below"], mr["coverage_80"]["above"]))
if "experts" in results:
    print("\n=== EXPERTS (FantasyPros) vs model, MSE on players with a ranking")
    for pos, b in results["experts"]["blend"].items():
        print(f"  {pos}: weights model {b['w_model']:.2f} / experts {b['w_experts']:.2f}")
        for y, r in b["by_year"].items(): print(f"     {y} n={r['n']:4d}  model {r['model']:.1f}  experts {r['experts']:.1f}  blend {r['blend']:.1f}")
        rg = b["range"]; print(f"     blend range scale {rg['scale']} -> inside {rg['coverage_80']['inside']:.3f}; sd = {rg['sd'][0]:.2f} + {rg['sd'][1]:.3f}*pred")
        dd = results["experts"]["duel"][pos]; print("     head-to-head (higher-projected player scores more):", [(f"{t['gap'][0]}-{t['gap'][1]}", t['higher_wins'], t['n']) for t in dd['table']], "k=", dd['k'])
else:
    print("\nExperts unavailable:", results.get("experts_error"))

# ----------------------------------------------------------------------------------------------
# Volume-based expected points (how many points this usage is normally worth) -> "running hot / cold"
# ----------------------------------------------------------------------------------------------
xppr = {}
for pos in ["RB", "WR", "TE"]:
    d = P[(P.position == pos) & (P.n_prior >= 3)]
    X = np.column_stack([np.ones(len(d)), d.targets.values, d.carries.values])
    b = np.linalg.lstsq(X, d.fantasy_points_ppr.values, rcond=None)[0]
    xppr[pos] = [round(float(x), 4) for x in b]
mus = {c: {p: round(float(P[P.position == p][col].mean()), 4) for p in POS} for c, col in [("form", "fantasy_points_ppr"), ("tgt", "targets"), ("car", "carries"), ("ts", "target_share")]}
dvp_mu = {p: round(float(A[A.position == p].allowed.mean()), 3) for p in POS}

# ----------------------------------------------------------------------------------------------
# Export for the app
# ----------------------------------------------------------------------------------------------
GROUP_KEY = {"Vegas game environment": "env", "Opportunity (targets, carries)": "usage", "Opponent defense rating": "dvp",
             "Wind and cold": "wind", "Home field": "home", "Point spread (game script)": "spread"}
app = {"built": "2026-09-28", "seasons": "2021 to Week 3 of 2026", "halfLife": HALF, "priorWeight": PRIOR_W, "leagueImplied": LEAGUE_IMPLIED,
       "mu": mus, "dvpMu": dvp_mu, "xppr": xppr, "pos": {}, "proof": {"signals": {}, "r2": {}, "experts": {}, "duel": {}, "labels": {"env": "Vegas team total", "usage": "Opportunity: targets and carries", "dvp": "Opponent defense rating", "wind": "Wind and cold", "home": "Home field", "spread": "Point spread"}}}
for pos in POS:
    r = results["positions"][pos]
    ex = results.get("experts", {}).get("blend", {}).get(pos)
    app["pos"][pos] = {
        "features": r["features"], "coef": {k: round(v, 5) for k, v in r["coef"].items()}, "means": {k: round(v, 5) for k, v in r["means"].items()},
        "kept": [GROUP_KEY[g] for g in r["kept"]],
        "sdModel": r["model_range"]["sd"] + [r["model_range"]["scale"]],
        "sdBlend": (ex["range"]["sd"] + [ex["range"]["scale"]]) if ex else None,
        "wModel": round(ex["w_model"], 3) if ex else 1.0, "wExperts": round(ex["w_experts"], 3) if ex else 0.0,
        "k": results["experts"]["duel"][pos]["k"] if ex else 1.9,
    }
    app["proof"]["signals"][pos] = {GROUP_KEY[g]: {"years": [1 if v["per_year"][y]["drop_delta_pct"] > 0.02 else 0 for y in sorted(v["per_year"])], "avg": round(v["avg_pct"], 2), "kept": g in r["kept"]} for g, v in r["groups"].items()}
    app["proof"]["r2"][pos] = {"form": [round(r["r2_form_by_year"][y], 3) for y in sorted(r["r2_form_by_year"])], "model": [round(r["r2_kept_by_year"][y], 3) for y in sorted(r["r2_kept_by_year"])]}
    if ex:
        app["proof"]["experts"][pos] = {str(y): {k: round(v, 1) if k != "n" else v for k, v in row.items()} for y, row in ex["by_year"].items()}
        app["proof"]["duel"][pos] = results["experts"]["duel"][pos]["table"]
app["rankToPoints"] = results.get("experts", {}).get("rank_to_points", {})
app["proof"]["years"] = ["2021", "2022", "2023", "2024", "2025", "2026 (wks 1-3)"]
app["proof"]["coverage"] = {p: round(results["positions"][p]["model_range"]["coverage_80"]["inside"], 3) for p in POS}
os.makedirs("/home/claude/edge/public/js", exist_ok=True)
open("/home/claude/edge/public/js/coefs.js", "w").write("// Generated by research/backtest.py. Do not edit by hand.\nexport const MODEL = " + json.dumps(app, separators=(",", ":")) + ";\n")
print("\nwrote coefs.js", os.path.getsize("/home/claude/edge/public/js/coefs.js"), "bytes")
print("xppr", xppr, "\nmu", mus)
