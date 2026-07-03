#!/usr/bin/env python3
"""
Two-phase MILP solver for task (3-bin, single-card retrieval) trial sequence structure.

Design
  - 312 trials total: 156 "new" (encoding) + 156 "old" (retrieval), 50/50.
  - 3 memorability bins (high/mid/low), 104 trials each (52 new + 52 old).
  - New trials: 2 new same-bin images sharing one value ("shared_value"). Per
    bin, 52 new trials split 26 $1 / 26 $0. The participant only learns the
    value of whichever image they choose; that chosen image becomes the
    source for exactly one old trial (the other image is never shown again).
  - Old trials: 1 previously-chosen ("old") card + 1 brand-new ("new") card,
    always same bin as each other and as the old card's origin. Per bin:
      - old-card value: 26 $1 / 26 $0 (inherited from the source new trial's
        shared_value)
      - new-card value: 26 $1 / 26 $0 (independent, no delay/history --
        assigned by simple balanced shuffle after the MILP solve, since it
        has no interaction with delay or run-length constraints)
  - Delay (trial_number - source_trial_number) in [MIN_DELAY, MAX_DELAY] for
    every old card.
  - Within each bin, the 26 $1-old-card delays AND the 26 $0-old-card delays
    each independently follow the same target histogram, and that histogram
    is identical across all 3 bins (all 6 (bin,value) groups share one
    target) -- so all bins end up with identical overall delay distributions.
  - No run of MAX_MEMORABILITY_RUN+1 or more consecutive trials (old or new)
    shares the same memorability_bin.
  - No run of MAX_TRIAL_TYPE_RUN+1 or more consecutive trials shares the same
    trial_type (old/new). MAX_TRIAL_TYPE_RUN must be >= 8: with MIN_DELAY=7,
    position 7 (0-indexed) has only one valid source delay, so it can never
    be old, forcing a leading run of >= 8 new trials in every feasible
    sequence.
  - (Triplet-grouping constraint from the original single-phase design has
    been dropped.)

Phase 1 (~5k binary vars): decide old/new per position (subject to the
  trial-type run-length cap) and which single earlier "new" position each old
  position draws its (as-yet-unlabeled) source from, at a delay that respects
  the aggregate (6x) delay histogram.
Phase 2 (~1.1k binary vars): given each old trial's fixed delay, assign
  memorability bin (52/52/52) and old-card value class (26/26 per bin) so
  that per-bin/per-value delay histograms match exactly, and no
  memorability_bin run (across the full N-position sequence) exceeds
  MAX_MEMORABILITY_RUN. Every new position already aliases onto the bin
  variable of the one old trial that claims it as a source (fixed by Phase
  1's pairing), so the run-cap is a sliding-window sum constraint over
  existing variables, no new variables needed.

Only the *structure* is solved here (position -> old/new, bin, old-card value
class, source link). New-card value class, concrete images, and left/right
screen position are assigned per-participant at runtime in sequence_utils.js
(new-card value is assigned once here too, via a simple balanced shuffle, so
it ships as part of the fixed structure).
"""

import json
import sys
import time
from collections import Counter

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import csc_matrix, lil_matrix

# ── Parameters ────────────────────────────────────────────────────────────────
N = 312
MIN_DELAY = 7
MAX_DELAY = 15
DELAYS = list(range(MIN_DELAY, MAX_DELAY + 1))   # 7..15, 9 values
N_OLD = 156
BINS = ["high", "mid", "low"]
N_OLD_PER_BIN = 52
HIST = {7: 2, 8: 3, 9: 3, 10: 3, 11: 3, 12: 3, 13: 3, 14: 3, 15: 3}
assert sum(HIST.values()) == N_OLD_PER_BIN // 2
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
# PHASE 1: old/new + unlabeled single-source structure
# ══════════════════════════════════════════════════════════════════════════════

def solve_phase1(time_limit, rng):
    old_idx = {i: i for i in range(N)}
    _next = N
    y_idx = {}   # (i, d) -> col.  old trial i draws its source from i-d
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

    # Total old trials = 156
    eq({old_idx[i]: 1 for i in range(N)}, N_OLD)
    # No old trial in the first MIN_DELAY positions
    for i in range(MIN_DELAY):
        eq({old_idx[i]: 1}, 0)
    # Every new trial must eventually be consumed -> last MIN_DELAY positions must be old
    for i in range(N - MIN_DELAY, N):
        eq({old_idx[i]: 1}, 1)
    # Each old trial draws exactly one source
    for i in range(N):
        ds = [y_idx[(i, d)] for d in DELAYS if (i, d) in y_idx]
        eq({**{v: 1 for v in ds}, old_idx[i]: -1}, 0)
    # Each position used as a source exactly once if new, zero times if old
    for j in range(N):
        rd = {}
        for d in DELAYS:
            i = j + d
            if i < N and (i, d) in y_idx:
                rd[y_idx[(i, d)]] = 1
        rd[old_idx[j]] = rd.get(old_idx[j], 0) + 1
        eq(rd, 1)
    # Aggregate delay histogram: 6x per-(bin,value) target (3 bins x 2 values, to be split evenly in phase 2)
    for d in DELAYS:
        rd = {y_idx[(i, d)]: 1 for i in range(N) if (i, d) in y_idx}
        eq(rd, 6 * HIST[d])

    # Trial-type (old/new) run-length cap
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
    delay_of = {}   # old trial i -> its single source delay
    for (i, d), col in y_idx.items():
        if x[col] == 1:
            assert i not in delay_of, f"trial {i} has multiple sources"
            delay_of[i] = d

    return old_flag, delay_of


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2: assign bin (high/mid/low) + old-card value class
# ══════════════════════════════════════════════════════════════════════════════

def solve_phase2(delay_of, time_limit, rng):
    old_positions = sorted(delay_of.keys())   # 156 old trial positions (0-indexed)
    n = len(old_positions)
    assert n == N_OLD

    bin_idx = {b: {} for b in BINS}
    _next = 0
    for b in BINS:
        for p in old_positions:
            bin_idx[b][p] = _next; _next += 1
    val_idx = {}
    for p in old_positions:
        val_idx[p] = _next; _next += 1
    z_idx = {b: {} for b in BINS}
    for b in BINS:
        for p in old_positions:
            z_idx[b][p] = _next; _next += 1
    n_vars = _next

    rows, lbs, ubs = [], [], []
    def eq(rd, v):  rows.append(rd); lbs.append(float(v)); ubs.append(float(v))
    def leq(rd, u): rows.append(rd); lbs.append(-np.inf); ubs.append(float(u))
    def geq(rd, l): rows.append(rd); lbs.append(float(l)); ubs.append(np.inf)

    # Each old trial picks exactly one bin
    for p in old_positions:
        eq({bin_idx[b][p]: 1 for b in BINS}, 1)

    # Bin counts: 52 each
    for b in BINS:
        eq({bin_idx[b][p]: 1 for p in old_positions}, N_OLD_PER_BIN)

    # Linearize z[b][p] = bin[b][p] AND val[p]
    for b in BINS:
        for p in old_positions:
            zb, binb, v = z_idx[b][p], bin_idx[b][p], val_idx[p]
            leq({zb: 1, binb: -1}, 0)
            leq({zb: 1, v: -1}, 0)
            geq({zb: 1, binb: -1, v: -1}, -1)

    # Old-card value count per bin: 26 $1 / 26 $0
    for b in BINS:
        eq({z_idx[b][p]: 1 for p in old_positions}, N_OLD_PER_BIN // 2)

    # Per-(bin,value) delay histograms
    for b in BINS:
        high_terms = {d: {} for d in DELAYS}   # value == 1
        low_terms = {d: {} for d in DELAYS}    # value == 0
        for p in old_positions:
            d = delay_of[p]
            binb, zb = bin_idx[b][p], z_idx[b][p]
            high_terms[d][zb] = high_terms[d].get(zb, 0) + 1              # val=1 -> zb=1
            low_terms[d][binb] = low_terms[d].get(binb, 0) + 1            # (binb - zb) -> val=0
            low_terms[d][zb] = low_terms[d].get(zb, 0) - 1
        for d in DELAYS:
            eq(high_terms[d], HIST[d])
            eq(low_terms[d], HIST[d])

    # ── Memorability-bin run-length cap (no new variables needed) ──────────
    # owner[i] = the old-trial position whose bin variables determine
    # position i's bin: itself if i is old, or whichever old trial claims i
    # as a source if i is new (fixed by Phase 1's pairing).
    owner = {}
    for p in old_positions:
        owner[p] = p
        owner[p - delay_of[p]] = p
    assert len(owner) == N, f"owner map covers {len(owner)} of {N} positions"

    window = MAX_MEMORABILITY_RUN + 1
    for s in range(N - window + 1):
        for b in BINS:
            rd = {}
            for i in range(s, s + window):
                col = bin_idx[b][owner[i]]
                rd[col] = rd.get(col, 0) + 1
            leq(rd, MAX_MEMORABILITY_RUN)   # can't be all-b (sum == window)

    c_obj = rng.normal(size=n_vars) * 0.01

    res = _solve_milp(c_obj, rows, lbs, ubs, n_vars, time_limit, "Phase 2")
    if res.x is None:
        return None
    x = np.round(res.x).astype(int)

    result = {}
    for p in old_positions:
        bin_name = next(b for b in BINS if x[bin_idx[b][p]] == 1)
        old_value = int(x[val_idx[p]])
        result[p] = {
            "bin": bin_name,
            "delay": delay_of[p],
            "old_card_value": old_value,
        }
    return result


# ══════════════════════════════════════════════════════════════════════════════
# Assembly + validation
# ══════════════════════════════════════════════════════════════════════════════

def assign_new_card_values(trials, rng):
    """Balanced 26/26 shuffle of new-card value per bin, independent of old-card value/delay."""
    by_bin = {b: [t for t in trials if t["trial_type"] == "old" and t["memorability_bin"] == b] for b in BINS}
    for b, group in by_bin.items():
        values = [1] * (N_OLD_PER_BIN // 2) + [0] * (N_OLD_PER_BIN // 2)
        rng.shuffle(values)
        for t, v in zip(group, values):
            t["new_card_value"] = int(v)


def assemble_trials(old_flag, phase2_result, rng):
    new_role = {}   # j -> {'used_by': i, 'bin': b, 'value': v}
    for i, info in phase2_result.items():
        src = i - info["delay"]
        new_role[src] = {"used_by": i, "bin": info["bin"], "value": info["old_card_value"]}

    trials = []
    for i in range(N):
        t = i + 1
        if old_flag[i]:
            info = phase2_result[i]
            trials.append({
                "trial_number": t,
                "trial_type": "old",
                "memorability_bin": info["bin"],
                "old_source_trial_number": (i - info["delay"]) + 1,
                "delay": info["delay"],
                "old_card_value": info["old_card_value"],
            })
        else:
            role = new_role[i]
            trials.append({
                "trial_number": t,
                "trial_type": "new",
                "memorability_bin": role["bin"],
                "shared_value": role["value"],
            })

    assign_new_card_values(trials, rng)
    return trials


def validate(trials):
    errors = []
    old_trials = [t for t in trials if t["trial_type"] == "old"]
    new_trials = [t for t in trials if t["trial_type"] == "new"]

    if len(old_trials) != N_OLD: errors.append(f"old count={len(old_trials)}, expected {N_OLD}")
    if len(new_trials) != N - N_OLD: errors.append(f"new count={len(new_trials)}")

    for b in BINS:
        n_new = sum(1 for t in new_trials if t["memorability_bin"] == b)
        n_old = sum(1 for t in old_trials if t["memorability_bin"] == b)
        if n_new != N_OLD_PER_BIN: errors.append(f"bin {b}: {n_new} new trials, expected {N_OLD_PER_BIN}")
        if n_old != N_OLD_PER_BIN: errors.append(f"bin {b}: {n_old} old trials, expected {N_OLD_PER_BIN}")
        for v in (0, 1):
            n_val_new = sum(1 for t in new_trials if t["memorability_bin"] == b and t["shared_value"] == v)
            if n_val_new != N_OLD_PER_BIN // 2:
                errors.append(f"bin {b}, value {v}: {n_val_new} new trials, expected {N_OLD_PER_BIN // 2}")
            n_val_old = sum(1 for t in old_trials if t["memorability_bin"] == b and t["old_card_value"] == v)
            if n_val_old != N_OLD_PER_BIN // 2:
                errors.append(f"bin {b}, value {v}: {n_val_old} old-card values, expected {N_OLD_PER_BIN // 2}")
            n_new_card_val = sum(1 for t in old_trials if t["memorability_bin"] == b and t["new_card_value"] == v)
            if n_new_card_val != N_OLD_PER_BIN // 2:
                errors.append(f"bin {b}, value {v}: {n_new_card_val} new-card values, expected {N_OLD_PER_BIN // 2}")

    by_num = {t["trial_number"]: t for t in trials}
    used_as_source = Counter()
    for t in old_trials:
        src_num = t["old_source_trial_number"]
        used_as_source[src_num] += 1
        src = by_num[src_num]
        if src["trial_type"] != "new":
            errors.append(f"trial {t['trial_number']}: source {src_num} is not new")
        elif src["memorability_bin"] != t["memorability_bin"]:
            errors.append(f"trial {t['trial_number']}: source {src_num} bin mismatch")
        elif src["shared_value"] != t["old_card_value"]:
            errors.append(f"trial {t['trial_number']}: source {src_num} value mismatch")

        d = t["trial_number"] - t["old_source_trial_number"]
        if d != t["delay"]: errors.append(f"trial {t['trial_number']}: delay mismatch")
        if not (MIN_DELAY <= d <= MAX_DELAY): errors.append(f"trial {t['trial_number']}: delay={d} out of range")

    for src_num, cnt in used_as_source.items():
        if cnt > 1: errors.append(f"source trial {src_num} used {cnt} times")
    for t in new_trials:
        if used_as_source[t["trial_number"]] != 1:
            errors.append(f"new trial {t['trial_number']} used as source {used_as_source[t['trial_number']]} times")

    for b in BINS:
        for val in (1, 0):
            delays = [t["delay"] for t in old_trials if t["memorability_bin"] == b and t["old_card_value"] == val]
            counts = Counter(delays)
            for d in DELAYS:
                if counts[d] != HIST[d]:
                    errors.append(f"bin {b}, value {val}: delay {d} count={counts[d]}, expected {HIST[d]}")

    bins_in_order = [t["memorability_bin"] for t in sorted(trials, key=lambda t: t["trial_number"])]
    run_label, run = None, 0
    for i in range(N):
        label = bins_in_order[i]
        run = run + 1 if label == run_label else 1
        run_label = label
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
    print("\nDelay histograms by bin/old-card-value (target: 2,3,3,3,3,3,3,3,3 for d=7..15, 26 total):")
    for b in BINS:
        for val in (1, 0):
            delays = [t["delay"] for t in old_trials if t["memorability_bin"] == b and t["old_card_value"] == val]
            counts = Counter(delays)
            print(f"  {b:5s} ${val}: " + "  ".join(f"d{d}={counts[d]}" for d in DELAYS))

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
    old_flag, delay_of = p1

    p2 = solve_phase2(delay_of, time_limit, rng)
    if p2 is None:
        print(f"[seed {seed}] Phase 2: no solution found.")
        return None

    trials = assemble_trials(old_flag, p2, rng)
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
    time_limit = int(sys.argv[2]) if len(sys.argv) > 2 else 90
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
