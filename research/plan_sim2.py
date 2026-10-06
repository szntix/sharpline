import pickle, numpy as np, itertools
res = pickle.load(open("/tmp/p1/plan_res.pkl", "rb")); seasons = sorted({s for s, w in res}); C = 0.4; TR = 40
def score(e, byes, r, W):                         # best hold length k in 1..3 of sum W_j * (expected - replacement); a bye counts as zero points
    best, kbest, cum = -1e9, 1, 0.0
    for j in range(3):
        cum += W[j] * ((0.0 if byes[j] else e[j]) - r[j])
        if cum > best: best, kbest = cum, j + 1
    return best, kbest
def run(W, seed, policy):
    rng = np.random.default_rng(seed); tot = 0.0; sw = 0; picks = []; e0cost = []
    for s in seasons:
        held = None
        for w in range(5, 17):
            E = res[(s, w)]; teams = list(E); pool = [t for t in teams if rng.random() < 0.5]; cand = list(set(pool) | ({held} if held else set()))
            top3 = lambda j: np.mean(sorted([E[t][0][j] if not E[t][2][j] else 0.0 for t in pool], reverse=True)[:3]) if pool else 0.0
            r = [top3(0), top3(1), top3(2)]
            def val(t):
                e, real, byes = E[t]
                if policy == "A": v = (0.0 if byes[0] else e[0])
                else: v = score(e, byes, r, W)[0]
                return v - (0 if t == held else C)
            pick = max(cand, key=val); e, real, byes = E[pick]
            if pick != held: sw += 1
            tot += (0.0 if byes[0] else real[0]); held = pick; picks.append((s, w, pick)); e0cost.append((0.0 if byes[0] else e[0]))
    return tot - C * sw, sw, picks, e0cost
print(f"{'W (this, next, after)':28s} {'plan - greedy, points per week (net of pickups)':50s} {'pick differs':14s} {'pickups per season: greedy / plan'}")
nweeks = len(seasons) * 12
for W in [(1, 0.0, 0.0), (1, 0.3, 0.15), (1, 0.5, 0.3), (1, 0.7, 0.45), (1, 0.5, 0.0), (1, 0.5, 0.5)]:
    d, diff, swa, swb, e0d = [], [], [], [], []
    for seed in range(60):
        ta, sa, pa, ea = run(W, seed, "A"); tb, sb, pb, eb = run(W, seed, "B"); d.append((tb - ta) / nweeks); swa.append(sa / len(seasons)); swb.append(sb / len(seasons)); diff.append(np.mean([x != y for x, y in zip(pa, pb)])); e0d.append(np.mean(ea) - np.mean(eb))
    print(f"{str(W):28s} {np.mean(d):+.3f} +/- {np.std(d)/np.sqrt(len(d)):.3f}   (this-week expected {np.mean(e0d):+.2f} lower){'':8s} {100*np.mean(diff):4.0f}%{'':8s} {np.mean(swa):.1f} / {np.mean(swb):.1f}")
