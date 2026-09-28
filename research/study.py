"""Correlation study behind Sharpline's simulator. Downloads nflverse data on first run.
Usage: pip install pandas numpy && python study.py"""
import os, urllib.request
BASE = "https://github.com/nflverse/nflverse-data/releases/download"
for y in [2021, 2022, 2023, 2024, 2025]:
    for kind, name in [("stats_player", f"stats_player_week_{y}.csv"), ("stats_team", f"stats_team_week_{y}.csv")]:
        if not os.path.exists(name): urllib.request.urlretrieve(f"{BASE}/{kind}/{name}", name)
if not os.path.exists("games.csv"): urllib.request.urlretrieve(f"{BASE}/schedules/games.csv", "games.csv")
import pandas as pd, numpy as np, json, warnings
warnings.filterwarnings("ignore")
YEARS = [2021, 2022, 2023, 2024, 2025]

P = pd.concat([pd.read_csv(f"stats_player_week_{y}.csv", low_memory=False) for y in YEARS])
T = pd.concat([pd.read_csv(f"stats_team_week_{y}.csv", low_memory=False) for y in YEARS])
G = pd.read_csv("games.csv", low_memory=False)
P = P[P.season_type == "REG"]; T = T[T.season_type == "REG"]
G = G[(G.game_type == "REG") & (G.season.isin(YEARS))].dropna(subset=["home_score"])

# ---------- kicker points (standard) ----------
P["k_pts"] = (P.fg_made_0_19.fillna(0)+P.fg_made_20_29.fillna(0)+P.fg_made_30_39.fillna(0))*3 \
    + P.fg_made_40_49.fillna(0)*4 + (P.fg_made_50_59.fillna(0)+P.fg_made_60_.fillna(0))*5 \
    + P.pat_made.fillna(0) - P.fg_missed.fillna(0) - P.pat_missed.fillna(0)

# ---------- DST points (standard) ----------
long = pd.concat([
    G.assign(team=G.home_team, opp=G.away_team, pf=G.home_score, pa=G.away_score, spread=G.spread_line, is_home=1),
    G.assign(team=G.away_team, opp=G.home_team, pf=G.away_score, pa=G.home_score, spread=-G.spread_line, is_home=0)])
# spread_line in nflverse is home margin expected (positive => home favored). team-perspective expected margin = spread
long["implied"] = long.total_line/2 + long.spread/2
long = long[["game_id","season","week","team","opp","pf","pa","spread","total_line","implied"]]

def pa_pts(pa):
    return np.select([pa==0, pa<=6, pa<=13, pa<=20, pa<=27, pa<=34], [10,7,4,1,0,-1], -4)
T2 = T.merge(long, on=["game_id","team"], how="inner", suffixes=("","_g"))
T2["dst_pts"] = T2.def_sacks.fillna(0) + 2*T2.def_interceptions.fillna(0) + 2*T2.fumble_recovery_opp.fillna(0) \
    + 6*T2.def_tds.fillna(0) + 2*T2.def_safeties.fillna(0) + 6*T2.special_teams_tds.fillna(0) + pa_pts(T2.pa)
dst = T2[["game_id","team","dst_pts"]]

# ---------- role assignment per team-game ----------
def roles(df):
    out = {}
    q = df[df.position=="QB"].sort_values("attempts", ascending=False)
    if len(q): out["QB"] = q.iloc[0]
    r = df[df.position=="RB"].sort_values("carries", ascending=False)
    if len(r): out["RB1"] = r.iloc[0]
    if len(r) > 1: out["RB2"] = r.iloc[1]
    w = df[df.position=="WR"].sort_values("targets", ascending=False)
    for i in range(min(2, len(w))): out[f"WR{i+1}"] = w.iloc[i]
    t = df[df.position=="TE"].sort_values("targets", ascending=False)
    if len(t): out["TE"] = t.iloc[0]
    k = df[df.position=="K"].sort_values("fg_att", ascending=False)
    if len(k): out["K"] = k.iloc[0]
    return out

# de-mean each player's points by their season average (leave-one-out) to strip talent confounding
P["pts"] = np.where(P.position=="K", P.k_pts, P.fantasy_points_ppr)
grp = P.groupby(["player_id","season"]).pts
n = grp.transform("count"); s = grp.transform("sum")
P["resid"] = np.where(n > 1, P.pts - (s - P.pts)/(n-1).clip(lower=1), np.nan)
dst = dst.merge(long[["game_id","team","season"]], on=["game_id","team"])
g2 = dst.groupby(["team","season"]).dst_pts
dn = g2.transform("count"); ds = g2.transform("sum")
dst["resid"] = dst.dst_pts - (ds - dst.dst_pts)/(dn-1)

rows = []
for (gid, team), df in P.groupby(["game_id","team"]):
    rr = roles(df); rec = {"game_id": gid, "team": team}
    for k, v in rr.items(): rec[k] = v.resid; rec[k+"_raw"] = v.pts
    rows.append(rec)
R = pd.DataFrame(rows).merge(dst.rename(columns={"resid":"DST","dst_pts":"DST_raw"})[["game_id","team","DST","DST_raw"]], on=["game_id","team"], how="left")
R = R.merge(long[["game_id","team","opp","spread","total_line","implied"]], on=["game_id","team"])
O = R.drop(columns=["opp","spread","total_line","implied"]).rename(columns=lambda c: c if c in ("game_id",) else "OPP_"+c)
RO = R.merge(O, left_on=["game_id","opp"], right_on=["game_id","OPP_team"])

def corr(a, b, df=RO):
    d = df[[a,b]].dropna()
    if len(d) < 200: return None
    c = d[a].corr(d[b]); se = (1-c*c)/np.sqrt(len(d)-3)
    return round(float(c),3), int(len(d)), round(float(1.96*se),3)

pairs = [
 ("QB","WR1","Same team"),("QB","WR2","Same team"),("QB","TE","Same team"),("QB","RB1","Same team"),
 ("QB","K","Same team"),("RB1","K","Same team"),("RB1","DST","Same team"),("QB","DST","Same team"),
 ("WR1","WR2","Same team"),("WR1","TE","Same team"),("RB1","RB2","Same team"),("RB1","WR1","Same team"),
 ("K","DST","Same team"),
 ("QB","OPP_QB","Opponent"),("WR1","OPP_WR1","Opponent"),("QB","OPP_WR1","Opponent"),
 ("RB1","OPP_RB1","Opponent"),("DST","OPP_QB","Opponent"),("DST","OPP_WR1","Opponent"),
 ("DST","OPP_RB1","Opponent"),("DST","OPP_K","Opponent"),("K","OPP_K","Opponent"),("DST","OPP_TE","Opponent"),
]
res = []
for a, b, kind in pairs:
    c = corr(a, b)
    if c: res.append({"a":a,"b":b,"kind":kind,"r":c[0],"n":c[1],"ci":c[2]})
        
# ---------- game-script / market effects (raw points regressed on lines) ----------
eff = {}
for role in ["QB","RB1","WR1","TE","K","DST"]:
    d = R[[role+"_raw","implied","spread","total_line"]].dropna()
    X = np.column_stack([np.ones(len(d)), d.implied, d.spread])
    beta, *_ = np.linalg.lstsq(X, d[role+"_raw"], rcond=None)
    pred = X @ beta; r2 = 1 - ((d[role+"_raw"]-pred)**2).sum()/((d[role+"_raw"]-d[role+"_raw"].mean())**2).sum()
    eff[role] = {"per_implied_pt": round(float(beta[1]),3), "per_spread_pt_holding_implied": round(float(beta[2]),3), "r2": round(float(r2),3), "n": int(len(d))}

# RB carries share by spread bucket (game script)
rb = R[["RB1_raw","spread"]].dropna()
rb["bucket"] = pd.cut(rb.spread, [-40,-7,-3,3,7,40], labels=["Dog 7+","Dog 3-7","Pick'em","Fav 3-7","Fav 7+"])
rbb = rb.groupby("bucket").RB1_raw.mean().round(2).to_dict()

# ---------- injury redistribution: when team's season target leader is absent ----------
tg = P[P.position.isin(["WR","TE","RB"])]
lead = tg.groupby(["season","team","player_id"]).targets.sum().reset_index().sort_values("targets").groupby(["season","team"]).tail(1)
redis = []
for _, L in lead.iterrows():
    tw = tg[(tg.season==L.season)&(tg.team==L.team)]
    weeks_all = set(tw.week); weeks_with = set(tw[tw.player_id==L.player_id].week)
    wo = weeks_all - weeks_with
    if len(wo) < 2 or len(weeks_with) < 4: continue
    for pid, pdf in tw[tw.player_id!=L.player_id].groupby("player_id"):
        a = pdf[pdf.week.isin(weeks_with)].target_share.mean(); b = pdf[pdf.week.isin(wo)].target_share.mean()
        if pd.notna(a) and pd.notna(b) and a > 0.08:
            redis.append({"pos": pdf.position.iloc[0], "with": a, "without": b})
RD = pd.DataFrame(redis)
redis_summary = RD.groupby("pos").apply(lambda d: {"share_with": round(d["with"].mean(),3), "share_without": round(d.without.mean(),3), "lift_pct": round((d.without.mean()/d["with"].mean()-1)*100,1), "n": len(d)}).to_dict()

out = {"seasons": YEARS, "pairs": res, "market_effects": eff, "rb1_ppr_by_spread": {str(k):v for k,v in rbb.items()}, "target_leader_absent": redis_summary}
json.dump(out, open("study_results.json","w"), indent=1)
print(json.dumps(out, indent=1))
