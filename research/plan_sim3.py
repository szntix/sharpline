import pickle, numpy as np, collections
res = pickle.load(open("/tmp/p1/plan_res.pkl", "rb")); W = (1, 0.5, 0.3); rng = np.random.default_rng(7); stats = collections.Counter(); runs = collections.Counter(); n = 0; kinds = collections.Counter(); bye_pen = 0; byeTop = 0
def score(e, byes, r):
    best, kb, cum = -1e9, 1, 0.0
    for j in range(3):
        cum += W[j] * ((0.0 if byes[j] else e[j]) - r[j])
        if cum > best: best, kb = cum, j + 1
    return best, kb
for (s, w), E in res.items():
    for trial in range(30):
        pool = [t for t in E if rng.random() < 0.5]; 
        if len(pool) < 8: continue
        r = [np.mean(sorted([E[t][0][j] if not E[t][2][j] else 0.0 for t in pool], reverse=True)[:3]) for j in range(3)]
        g = sorted(pool, key=lambda t: -(0.0 if E[t][2][0] else E[t][0][0]))[:5]; sc = {t: score(E[t][0], E[t][2], r) for t in pool}; p = sorted(pool, key=lambda t: -sc[t][0])[:5]
        n += 1; stats["top1 differs"] += g[0] != p[0]; stats["top5 membership differs"] += set(g) != set(p); stats["order differs"] += g != p
        stats["mean teams swapped into the top 5"] += len(set(p) - set(g)); kinds[sc[p[0]][1]] += 1
        for t in p: runs[sc[t][1]] += 1
        byeTop += any(E[t][2][1] or E[t][2][2] for t in g)          # greedy top-5 contains a defense with a bye in the next two weeks
        stats["greedy top-1 has a bye in the next 2 weeks"] += (E[g[0]][2][1] or E[g[0]][2][2])
print(f"{n} simulated weekly boards (random 50% waiver pools)")
for k, v in stats.items(): print(f"  {k}: {100*v/n:.1f}%" if "swapped" not in k else f"  {k}: {v/n:.2f} of 5")
print("  greedy top-5 includes at least one defense with a bye in the next two weeks: %.0f%% of boards" % (100 * byeTop / n))
tot = sum(runs.values()); print("  best hold length across the five suggested defenses: " + ", ".join(f"{k} week{'s' if k>1 else ''}: {100*runs[k]/tot:.0f}%" for k in (1, 2, 3)))
print("  the recommended #1's best hold length: " + ", ".join(f"{k}: {100*kinds[k]/n:.0f}%" for k in (1, 2, 3)))
