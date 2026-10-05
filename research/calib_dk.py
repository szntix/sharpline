import numpy as np, pandas as pd, math, warnings
warnings.filterwarnings("ignore")
src = open("/tmp/p1/dstk_study.py").read(); exec(compile(src.split("def loso(")[0], "head", "exec"))
ncdf = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
PA = [(-1e9, .5, 10), (.5, 6.5, 7), (6.5, 13.5, 4), (13.5, 20.5, 1), (20.5, 27.5, 0), (27.5, 34.5, -1), (34.5, 1e9, -4)]
def app_dst(own, opp, spread):          # exactly the app's defenseStats, under standard defense scoring
    pr = 1 + 0.025 * spread - 0.015 * (opp - 22); pa = sum(p * (ncdf((hi - opp) / 9.6) - ncdf((lo - opp) / 9.6)) for lo, hi, p in PA)
    return pa + pr * (2.45 * 1 + 0.78 * 2 + 0.55 * 2 + 0.16 * 6) + 0.03 * 2 + 0.06 * 2 + 0.05 * 6
def app_k(own): fgm = own * 0.068; return fgm * (3 * (.02 + .25 + .28) + 4 * .27 + 5 * .18) + own * 0.087 * 0.94
D = T.dropna(subset=["dst", "opp_imp", "own_imp", "spread"]).copy(); D = D[D.week >= 4]; D["app"] = [app_dst(a, b, c) for a, b, c in zip(D.own_imp, D.opp_imp, D.spread)]
out = []; var = D.dst.var()
out.append(f"DEFENSE: {len(D)} team-games (week 4+). The app's projection (standard scoring): average {D.app.mean():.2f} vs what actually happened {D.dst.mean():.2f}")
out.append(f"  error (MSE): the app's projection {((D.dst - D.app) ** 2).mean():.3f} | a line-only fit {27.116:.3f} | a plain league average {var:.3f}")
b = np.polyfit(D.app, D.dst, 1); out.append(f"  calibration line (actual = a*projection + b): a = {b[0]:.2f}, b = {b[1]:+.2f}   (1.00 and 0.00 would be perfect)")
D["bin"] = pd.cut(D.opp_imp, [0, 17, 20, 23, 26, 60]); g = D.groupby("bin").agg(app=("app", "mean"), actual=("dst", "mean"), n=("dst", "size")); out.append("  by opponent expected points:\n" + g.round(2).to_string())
Kd = T[T.kpts.notna()].copy()
K2 = Kd.dropna(subset=["kpts", "own_imp"]); K2 = K2[K2.week >= 4].copy(); K2["app"] = K2.own_imp.map(app_k)
out.append(f"\nKICKER: {len(K2)} kicker-games. The app's projection (standard scoring, no miss penalties): average {K2.app.mean():.2f} vs actual {K2.kpts.mean():.2f}")
out.append(f"  error (MSE): the app's projection {((K2.kpts - K2.app) ** 2).mean():.3f} | a line-only fit {19.928:.3f} | league average {K2.kpts.var():.3f}")
b = np.polyfit(K2.app, K2.kpts, 1); out.append(f"  calibration line: a = {b[0]:.2f}, b = {b[1]:+.2f}")
K2["bin"] = pd.cut(K2.own_imp, [0, 18, 21, 24, 27, 60]); g = K2.groupby("bin").agg(app=("app", "mean"), actual=("kpts", "mean"), n=("kpts", "size")); out.append("  by team expected points:\n" + g.round(2).to_string())
# components, to see which count is off
c = D[["sacks", "ints", "frec", "dtd", "saf", "blk", "sttd"]].mean(); out.append("\nDEFENSE per-game counts, actual vs the app's constants: sacks %.2f vs 2.45 | interceptions %.2f vs 0.78 | fumble recoveries %.2f vs 0.55 | defensive TDs %.2f vs 0.16 | safeties %.3f vs 0.03 | blocks %.3f vs 0.06 | special-teams TDs %.3f vs 0.05" % (c.sacks, c.ints, c.frec, c.dtd, c.saf, c.blk, c.sttd))
print("\n".join(out)); open("/tmp/p1/calib_dk.txt", "w").write("\n".join(out))
