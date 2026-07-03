#!/usr/bin/env python3
"""
Two-phase MILP solver for task-matched trial sequence structure.

Design
  - 234 trials total: 156 "new" (encoding) + 78 "old" (retrieval).
  - New trials: 78 H/H (two new high-mem images, same value) + 78 L/L (two new
    low-mem images, same value). Each bin's 78 new trials split 39 $1 / 39 $0.
  - Old trials: always within-bin (H/H or L/L), always uneven in value
    (one $1 source + one $0 source). 39 H/H old + 39 L/L old.
  - Every new trial's chosen card becomes the source for exactly one old trial
    (156 new trials = 78 old trials x 2 sources -- no leftover sources).
  - Delay (trial_number - source_trial_number) in [MIN_DELAY, MAX_DELAY] for
    every source.
  - Within each bin, the 39 $1-source delays AND the 39 $0-source delays each
    independently follow the same target histogram (so H and L bins end up
    with identical delay distributions for both value conditions).
  - Across all 78 old trials, exactly 39 have the $1-source further back
    (longer delay) than the $0-source, and 39 have the reverse.
  - No run of MAX_MEMORABILITY_RUN+1 or more consecutive trials (old or new)
    shares the same memorability_bin, so H/L never feels blocked.
  - No run of MAX_TRIAL_TYPE_RUN+1 or more consecutive trials shares the same
    trial_type (old/new). MAX_TRIAL_TYPE_RUN must be >= 8: with MIN_DELAY=7,
    position 7 (0-indexed) has only one valid source delay, so it can never
    be old, forcing a leading run of >= 8 new trials in every feasible
    sequence.

Phase 1 (~2-3k binary vars): decide old/new per position (now also subject to
  the trial-type run-length cap, a plain sliding-window sum over the existing
  old/new indicator variables), and which pairs of earlier "new" positions
  each old position draws its two (as-yet-unlabeled) sources from, at delays
  that respect the aggregate (4x) delay histogram.
Phase 2 (~300 binary vars): given each old trial's fixed (short-delay,
  long-delay) source pair, assign memorability bin (H/L, 39/39) and which
  value class ($1/$0) lands on the longer delay, so per-bin/per-value delay
  histograms match exactly, the longer-delay/value split is 39/39, and no
  memorability_bin run (across the full N-position sequence) exceeds
  MAX_MEMORABILITY_RUN. Every position (old or new) already aliases onto one
  of Phase 2's binH decision variables -- old positions have their own, new
  positions inherit the bin of whichever old trial claims them as a source
  (fixed by Phase 1's pairing) -- so the cap is a sliding-window sum
  constraint over existing variables, no new variables needed.

Only the *structure* is solved here (position -> old/new, bin, value class,
source links). Concrete images and left/right screen position are assigned
per-participant at runtime in sequence_utils.js.
"""

import json
import sys
import time
from collections import Counter

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import csc_matrix, lil_matrix

# ── Parameters ────────────────────────────────────────────────────────────────
N = 234
MIN_DELAY = 7
MAX_DELAY = 15
DELAYS = list(range(MIN_DELAY, MAX_DELAY + 1))   # 7..15, 9 values
N_OLD = 78
N_OLD_PER_BIN = 39
HIST = {7: 4, 8: 4, 9: 4, 10: 5, 11: 5, 12: 5, 13: 4, 14: 4, 15: 4}
assert sum(HIST.values()) == N_OLD_PER_BIN
MAX_MEMORABILITY_RUN = 3   # no more than this many consecutive same-bin trials
MAX_TRIAL_TYPE_RUN = 8     # no more than this many consecutive old/new trials (8 is the structural floor)


def _solve_milp(c_obj, rows, lbs, ubs, n_vars, time_limit, label):
    A = lil_matrix((len(rows), n_vars))
    for r, rd in enumerate(rows):
        for col, val in rd.items():
            A[r, col] += val
    t0 = time.time()
    print(f"{label}: {n_vars} vars, {len(rows)} constraints. Solving...")
    res = milp(
        c_obj,
        constraints=LinearConstraint(csc_matrix(A), np.array(lbs), np.array(ubs)),
        integrality=np.ones(n_vars),
        bounds=Bounds(0, 1),
        options={"time_limit": time_limit, "disp": False},
    )
    print(f"{label}: finished in {time.time()-t0:.1f}s | status={res.status} | {res.message}")
    return res


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1: old/new + unlabeled source-pair structure
# ══════════════════════════════════════════════════════════════════════════════

def solve_phase1(time_limit, rng):
    old_idx = {i: i for i in range(N)}
    _next = N
    y_idx = {}   # (i, d) -> col.  old trial i draws one of its 2 sources from i-d
    for i in range(N):
        for d in DELAYS:
            j = i - d
            if 0 <= j < N:
                y_idx[(i, d)] = _next; _next += 1
    n_vars = _next

    rows, lbs, ubs = [], [], []
    def eq(rd, v):  rows.append(rd); lbs.append(float(v)); ubs.append(float(v))
    def leq(rd, u): rows.append(rd); lbs.append(-np.inf); ubs.append(float(u))
    def geq(rd, l): rows.append(rd); lbs.append(float(l)); ubs.append(np.inf)

    # Total old trials = 78
    eq({old_idx[i]: 1 for i in range(N)}, N_OLD)
    # No old trial in the first MIN_DELAY positions
    for i in range(MIN_DELAY):
        eq({old_idx[i]: 1}, 0)
    # Every new trial must eventually be consumed -> last MIN_DELAY positions must be old
    for i in range(N - MIN_DELAY, N):
        eq({old_idx[i]: 1}, 1)
    # Each old trial draws exactly 2 (distinct-delay) sources
    for i in range(N):
        ds = [y_idx[(i, d)] for d in DELAYS if (i, d) in y_idx]
        eq({**{v: 1 for v in ds}, old_idx[i]: -2}, 0)
    # Each position used as a source exactly once if new, zero times if old
    for j in range(N):
        rd = {}
        for d in DELAYS:
            i = j + d
            if i < N and (i, d) in y_idx:
                rd[y_idx[(i, d)]] = 1
        rd[old_idx[j]] = rd.get(old_idx[j], 0) + 1
        eq(rd, 1)
    # Aggregate delay histogram: 4x per-(bin,value) target (to be split evenly in phase 2)
    for d in DELAYS:
        rd = {y_idx[(i, d)]: 1 for i in range(N) if (i, d) in y_idx}
        eq(rd, 4 * HIST[d])

    # Trial-type (old/new) run-length cap: no MAX_TRIAL_TYPE_RUN+1 consecutive
    # positions all old or all new. old_idx[i] is already a direct 0/1 var per
    # position (1 = old), so this is a plain sliding-window sum, no new vars.
    # MAX_TRIAL_TYPE_RUN must be >= 8: with MIN_DELAY=7, position 7 (0-indexed)
    # has only one valid source delay (d=7 -> source at position 0), so it can
    # never be old -- the first possible old trial is position 8, forcing a
    # leading run of >= 8 new trials in every feasible sequence.
    window_tt = MAX_TRIAL_TYPE_RUN + 1
    for s in range(N - window_tt + 1):
        rd = {old_idx[i]: 1 for i in range(s, s + window_tt)}
        geq(rd, 1)                  # can't be all-new (sum == 0)
        leq(rd, MAX_TRIAL_TYPE_RUN)  # can't be all-old (sum == window)

    c_obj = rng.normal(size=n_vars) * 0.01   # tiny random tiebreak, varies solution across seeds

    res = _solve_milp(c_obj, rows, lbs, ubs, n_vars, time_limit, "Phase 1")
    if res.x is None:
        return None
    x = np.round(res.x).astype(int)

    old_flag = {i: bool(x[old_idx[i]]) for i in range(N)}
    pairs = {}   # old trial i -> sorted [d_lo, d_hi]
    for (i, d), col in y_idx.items():
        if x[col] == 1:
            pairs.setdefault(i, []).append(d)
    for i, ds in pairs.items():
        ds.sort()
        assert len(ds) == 2, f"trial {i} has {len(ds)} sources: {ds}"

    return old_flag, pairs


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2: assign bin (H/L) + value-class (which gets the longer delay)
# ══════════════════════════════════════════════════════════════════════════════

def solve_phase2(pairs, time_limit, rng):
    old_positions = sorted(pairs.keys())   # 78 old trial positions (0-indexed)
    n = len(old_positions)
    assert n == N_OLD

    binH_idx = {p: k for k, p in enumerate(old_positions)}
    _next = n
    v1hi_idx = {p: _next + k for k, p in enumerate(old_positions)}
    _next += n
    z_idx = {p: _next + k for k, p in enumerate(old_positions)}   # z = binH AND v1hi
    _next += n
    n_vars = _next

    rows, lbs, ubs = [], [], []
    def eq(rd, v):  rows.append(rd); lbs.append(float(v)); ubs.append(float(v))
    def leq(rd, u): rows.append(rd); lbs.append(-np.inf); ubs.append(float(u))
    def geq(rd, l): rows.append(rd); lbs.append(float(l)); ubs.append(np.inf)

    eq({binH_idx[p]: 1 for p in old_positions}, N_OLD_PER_BIN)
    eq({v1hi_idx[p]: 1 for p in old_positions}, N_OLD_PER_BIN)

    for p in old_positions:
        b, v, z = binH_idx[p], v1hi_idx[p], z_idx[p]
        leq({z: 1, b: -1}, 0)
        leq({z: 1, v: -1}, 0)
        geq({z: 1, b: -1, v: -1}, -1)

    # Histogram buckets: (bin in {H,L}) x (value in {1,0}) x (delay in DELAYS) = HIST[d]
    hist_terms = {(b, c, d): {} for b in (1, 0) for c in (1, 0) for d in DELAYS}
    for p in old_positions:
        d_lo, d_hi = pairs[p]
        b, v, z = binH_idx[p], v1hi_idx[p], z_idx[p]
        # combo(H,v1hi)      = z            -> (H, c=1, d_hi) and (H, c=0, d_lo)
        # combo(H,not v1hi)  = b - z        -> (H, c=1, d_lo) and (H, c=0, d_hi)
        # combo(L,v1hi)      = v - z        -> (L, c=1, d_hi) and (L, c=0, d_lo)
        # combo(L,not v1hi)  = 1 - b - v + z -> (L, c=1, d_lo) and (L, c=0, d_hi)
        hist_terms[(1, 1, d_hi)][z] = hist_terms[(1, 1, d_hi)].get(z, 0) + 1
        hist_terms[(1, 0, d_lo)][z] = hist_terms[(1, 0, d_lo)].get(z, 0) + 1

        hist_terms[(1, 1, d_lo)][b] = hist_terms[(1, 1, d_lo)].get(b, 0) + 1
        hist_terms[(1, 1, d_lo)][z] = hist_terms[(1, 1, d_lo)].get(z, 0) - 1
        hist_terms[(1, 0, d_hi)][b] = hist_terms[(1, 0, d_hi)].get(b, 0) + 1
        hist_terms[(1, 0, d_hi)][z] = hist_terms[(1, 0, d_hi)].get(z, 0) - 1

        hist_terms[(0, 1, d_hi)][v] = hist_terms[(0, 1, d_hi)].get(v, 0) + 1
        hist_terms[(0, 1, d_hi)][z] = hist_terms[(0, 1, d_hi)].get(z, 0) - 1
        hist_terms[(0, 0, d_lo)][v] = hist_terms[(0, 0, d_lo)].get(v, 0) + 1
        hist_terms[(0, 0, d_lo)][z] = hist_terms[(0, 0, d_lo)].get(z, 0) - 1

        hist_terms[(0, 1, d_lo)][b] = hist_terms[(0, 1, d_lo)].get(b, 0) - 1
        hist_terms[(0, 1, d_lo)][v] = hist_terms[(0, 1, d_lo)].get(v, 0) - 1
        hist_terms[(0, 1, d_lo)][z] = hist_terms[(0, 1, d_lo)].get(z, 0) + 1
        hist_terms[(0, 0, d_hi)][b] = hist_terms[(0, 0, d_hi)].get(b, 0) - 1
        hist_terms[(0, 0, d_hi)][v] = hist_terms[(0, 0, d_hi)].get(v, 0) - 1
        hist_terms[(0, 0, d_hi)][z] = hist_terms[(0, 0, d_hi)].get(z, 0) + 1

    const_offsets = Counter()
    for p in old_positions:
        d_lo, d_hi = pairs[p]
        const_offsets[(0, 1, d_lo)] += 1
        const_offsets[(0, 0, d_hi)] += 1

    for (b, c, d), rd in hist_terms.items():
        rd = {k: v for k, v in rd.items() if v != 0}
        target = HIST[d] - const_offsets.get((b, c, d), 0)
        eq(rd, target)

    # ── Memorability-bin run-length cap (no new variables needed) ──────────
    # owner[i] = the old-trial position whose binH_idx variable determines
    # position i's bin: itself if i is old, or whichever old trial claims i
    # as a source if i is new (that mapping is already fixed by Phase 1's
    # (p, d_lo, d_hi) pairing).  For every window of MAX_MEMORABILITY_RUN+1
    # consecutive positions, forbid it from being all-high or all-low.
    owner = {}
    for p in old_positions:
        owner[p] = p
        d_lo, d_hi = pairs[p]
        owner[p - d_lo] = p
        owner[p - d_hi] = p
    assert len(owner) == N, f"owner map covers {len(owner)} of {N} positions"

    window = MAX_MEMORABILITY_RUN + 1
    for s in range(N - window + 1):
        rd = {}
        for i in range(s, s + window):
            col = binH_idx[owner[i]]
            rd[col] = rd.get(col, 0) + 1
        geq(rd, 1)                   # can't be all-low  (sum == 0)
        leq(rd, MAX_MEMORABILITY_RUN)  # can't be all-high (sum == window)

    c_obj = rng.normal(size=n_vars) * 0.01

    res = _solve_milp(c_obj, rows, lbs, ubs, n_vars, time_limit, "Phase 2")
    if res.x is None:
        return None
    x = np.round(res.x).astype(int)

    result = {}
    for p in old_positions:
        d_lo, d_hi = pairs[p]
        is_H = bool(x[binH_idx[p]])
        v1_gets_hi = bool(x[v1hi_idx[p]])
        result[p] = {
            "bin": "high" if is_H else "low",
            "delay_value1": d_hi if v1_gets_hi else d_lo,
            "delay_value0": d_lo if v1_gets_hi else d_hi,
        }
    return result


# ══════════════════════════════════════════════════════════════════════════════
# Assembly + validation
# ══════════════════════════════════════════════════════════════════════════════

def assemble_trials(old_flag, phase2_result):
    new_role = {}   # j -> {'used_by': i, 'value': c, 'bin': b}
    for i, info in phase2_result.items():
        v1_src = i - info["delay_value1"]
        v0_src = i - info["delay_value0"]
        new_role[v1_src] = {"used_by": i, "value": 1, "bin": info["bin"]}
        new_role[v0_src] = {"used_by": i, "value": 0, "bin": info["bin"]}

    trials = []
    for i in range(N):
        t = i + 1
        if old_flag[i]:
            info = phase2_result[i]
            trials.append({
                "trial_number": t,
                "trial_type": "old",
                "memorability_bin": info["bin"],
                "value1_source_trial_number": (i - info["delay_value1"]) + 1,
                "value0_source_trial_number": (i - info["delay_value0"]) + 1,
                "delay_value1": info["delay_value1"],
                "delay_value0": info["delay_value0"],
            })
        else:
            role = new_role[i]
            trials.append({
                "trial_number": t,
                "trial_type": "new",
                "memorability_bin": role["bin"],
                "shared_value": role["value"],
            })
    return trials


def validate(trials):
    errors = []
    old_trials = [t for t in trials if t["trial_type"] == "old"]
    new_trials = [t for t in trials if t["trial_type"] == "new"]

    if len(old_trials) != N_OLD: errors.append(f"old count={len(old_trials)}, expected {N_OLD}")
    if len(new_trials) != N - N_OLD: errors.append(f"new count={len(new_trials)}")

    for b in ("high", "low"):
        n_new = sum(1 for t in new_trials if t["memorability_bin"] == b)
        n_old = sum(1 for t in old_trials if t["memorability_bin"] == b)
        if n_new != 78: errors.append(f"bin {b}: {n_new} new trials, expected 78")
        if n_old != N_OLD_PER_BIN: errors.append(f"bin {b}: {n_old} old trials, expected {N_OLD_PER_BIN}")
        for v in (0, 1):
            n_val = sum(1 for t in new_trials if t["memorability_bin"] == b and t["shared_value"] == v)
            if n_val != 39: errors.append(f"bin {b}, value {v}: {n_val} new trials, expected 39")

    by_num = {t["trial_number"]: t for t in trials}
    used_as_source = Counter()
    for t in old_trials:
        for key in ("value1_source_trial_number", "value0_source_trial_number"):
            src_num = t[key]
            used_as_source[src_num] += 1
            src = by_num[src_num]
            if src["trial_type"] != "new":
                errors.append(f"trial {t['trial_number']}: source {src_num} is not new")
            elif src["memorability_bin"] != t["memorability_bin"]:
                errors.append(f"trial {t['trial_number']}: source {src_num} bin mismatch")
        v1 = by_num[t["value1_source_trial_number"]]["shared_value"]
        v0 = by_num[t["value0_source_trial_number"]]["shared_value"]
        if v1 != 1: errors.append(f"trial {t['trial_number']}: value1_source isn't $1")
        if v0 != 0: errors.append(f"trial {t['trial_number']}: value0_source isn't $0")

        d1 = t["trial_number"] - t["value1_source_trial_number"]
        d0 = t["trial_number"] - t["value0_source_trial_number"]
        if d1 != t["delay_value1"]: errors.append(f"trial {t['trial_number']}: delay_value1 mismatch")
        if d0 != t["delay_value0"]: errors.append(f"trial {t['trial_number']}: delay_value0 mismatch")
        if not (MIN_DELAY <= d1 <= MAX_DELAY): errors.append(f"trial {t['trial_number']}: delay_value1={d1} out of range")
        if not (MIN_DELAY <= d0 <= MAX_DELAY): errors.append(f"trial {t['trial_number']}: delay_value0={d0} out of range")

    for src_num, cnt in used_as_source.items():
        if cnt > 1: errors.append(f"source trial {src_num} used {cnt} times")
    for t in new_trials:
        if used_as_source[t["trial_number"]] != 1:
            errors.append(f"new trial {t['trial_number']} used as source {used_as_source[t['trial_number']]} times")

    for b in ("high", "low"):
        for delay_key in ("delay_value1", "delay_value0"):
            delays = [t[delay_key] for t in old_trials if t["memorability_bin"] == b]
            counts = Counter(delays)
            for d in DELAYS:
                if counts[d] != HIST[d]:
                    errors.append(f"bin {b}, {delay_key}: delay {d} count={counts[d]}, expected {HIST[d]}")

    n_value1_longer = sum(1 for t in old_trials if t["delay_value1"] > t["delay_value0"])
    n_value0_longer = sum(1 for t in old_trials if t["delay_value0"] > t["delay_value1"])
    if n_value1_longer != 39: errors.append(f"$1-longer count={n_value1_longer}, expected 39")
    if n_value0_longer != 39: errors.append(f"$0-longer count={n_value0_longer}, expected 39")

    bins_in_order = [t["memorability_bin"] for t in sorted(trials, key=lambda t: t["trial_number"])]
    run = 1
    for i in range(1, len(bins_in_order)):
        run = run + 1 if bins_in_order[i] == bins_in_order[i - 1] else 1
        if run > MAX_MEMORABILITY_RUN:
            errors.append(f"memorability_bin run of {run} ending at trial {i + 1} exceeds cap of {MAX_MEMORABILITY_RUN}")

    types_in_order = [t["trial_type"] for t in sorted(trials, key=lambda t: t["trial_number"])]
    run = 1
    for i in range(1, len(types_in_order)):
        run = run + 1 if types_in_order[i] == types_in_order[i - 1] else 1
        if run > MAX_TRIAL_TYPE_RUN:
            errors.append(f"trial_type run of {run} ending at trial {i + 1} exceeds cap of {MAX_TRIAL_TYPE_RUN}")

    if errors:
        print("VALIDATION FAILED:")
        for e in errors: print(f"  x {e}")
        return False
    print("All checks passed.")
    return True


def summarize(trials):
    old_trials = [t for t in trials if t["trial_type"] == "old"]
    print("\nDelay histograms (target: 4,4,4,5,5,5,4,4,4 for d=7..15):")
    for b in ("high", "low"):
        for label, delay_key in (("$1", "delay_value1"), ("$0", "delay_value0")):
            delays = [t[delay_key] for t in old_trials if t["memorability_bin"] == b]
            counts = Counter(delays)
            print(f"  {b:5s} {label}: " + "  ".join(f"d{d}={counts[d]}" for d in DELAYS))

    n_value1_longer = sum(1 for t in old_trials if t["delay_value1"] > t["delay_value0"])
    print(f"\n$1-source longer delay: {n_value1_longer} / 78  ($0-longer: {78-n_value1_longer})")

    types = [t["trial_type"] for t in trials]
    bins = [t["memorability_bin"] for t in trials]
    def longest_run(seq):
        best = cur = 1
        for i in range(1, len(seq)):
            cur = cur + 1 if seq[i] == seq[i-1] else 1
            best = max(best, cur)
        return best
    print(f"\nLongest run of same trial_type: {longest_run(types)}")
    print(f"Longest run of same memorability_bin: {longest_run(bins)}")


def generate_one(seed, time_limit):
    rng = np.random.default_rng(seed)

    p1 = solve_phase1(time_limit, rng)
    if p1 is None:
        print(f"[seed {seed}] Phase 1: no solution found.")
        return None
    old_flag, pairs = p1

    p2 = solve_phase2(pairs, time_limit, rng)
    if p2 is None:
        print(f"[seed {seed}] Phase 2: no solution found.")
        return None

    trials = assemble_trials(old_flag, p2)
    ok = validate(trials)
    if not ok:
        print(f"[seed {seed}] validation FAILED -- discarding.")
        return None
    summarize(trials)
    return {
        "metadata": {
            "n_trials": N,
            "min_delay": MIN_DELAY,
            "max_delay": MAX_DELAY,
            "delay_histogram_per_bin_per_value": HIST,
            "seed": seed,
        },
        "trials": trials,
    }


if __name__ == "__main__":
    n_sequences = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    time_limit = int(sys.argv[2]) if len(sys.argv) > 2 else 45
    base_seed = int(sys.argv[3]) if len(sys.argv) > 3 else 0

    sequences = []
    seed = base_seed
    while len(sequences) < n_sequences:
        print(f"\n{'='*60}\nGenerating sequence {len(sequences)+1}/{n_sequences} (seed={seed})\n{'='*60}")
        result = generate_one(seed, time_limit)
        if result is not None:
            sequences.append(result)
        seed += 1

    js_path = "sequences.js"
    with open(js_path, "w") as f:
        f.write("window.SEQUENCE_STRUCTURES = ")
        json.dump(sequences, f, indent=2)
        f.write(";\n")
    print(f"\nSaved {len(sequences)} sequences to {js_path}")
