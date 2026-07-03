#!/usr/bin/env python3
"""
Two-phase MILP solver for mixed-memorability trial sequence structure.

Design
  - 234 trials total: 156 "new" (encoding) + 78 "old" (retrieval).
  - New trials: 78 high-mem (two new high-mem images, same value) + 78 low-mem
    (two new low-mem images, same value). Each bin's 78 new trials split
    39 $1 / 39 $0.
  - Old trials: always cross-bin -- one high-mem source + one low-mem source
    (never same-bin, unlike the matched-memorability design). Four retrieval
    categories:
        even_1   : high=$1, low=$1   (20 trials)
        even_0   : high=$0, low=$0   (20 trials)
        uneven_h1: high=$1, low=$0   (19 trials)
        uneven_h0: high=$0, low=$1   (19 trials)
    even   = 40 trials total (20/20)
    uneven = 38 trials total (19/19)
  - Every new trial's chosen card becomes the source for exactly one old
    trial (156 new trials = 78 old trials x 2 sources -- no leftover
    sources).
  - Delay (trial_number - source_trial_number) in [MIN_DELAY, MAX_DELAY] for
    every source.
  - Within "even" trials (40 total), the high-mem-source delay histogram and
    the low-mem-source delay histogram are identical across BOTH even
    subtypes (even_1, even_0) -- all 4 series (even_1-high, even_1-low,
    even_0-high, even_0-low) share one target histogram over 20 trials.
  - Within "uneven" trials (38 total), same idea: uneven_h1-high,
    uneven_h1-low, uneven_h0-high, uneven_h0-low all share one target
    histogram over 19 trials.
    (These two per-group constraints jointly guarantee the high-mem bin's
    overall delay distribution == the low-mem bin's overall delay
    distribution, i.e. "the two memorability bins share the exact same
    delay distributions".)
  - Across the 38 uneven trials, exactly 19 have the high-mem source at the
    longer delay and 19 have the low-mem source at the longer delay. This is
    the PRIORITIZED split (matching the two memorability bins is the primary
    design goal, so it gets the hard equality).
  - Given that, the $1-source/$0-source-longer split on those same 38 uneven
    trials CANNOT also be exactly 19/19: N_UNEVEN_H1 == N_UNEVEN_H0 == 19
    (odd), and forcing high-longer==19 algebraically forces the $1-longer
    count to be even (proof: let x = #uneven_h1 with high-longer, y =
    #uneven_h0 with high-longer; high-longer = x+y = 19 fixed; $1-longer =
    x + (19-y) = 38-2y, always even -- 19 is odd, so unreachable). It's
    instead bounded to the two nearest achievable values, 18 or 20 (off by
    exactly one trial), rather than left unconstrained.
  - Across the 40 even trials, exactly 20 have the high-mem source at the
    longer delay and 20 have the low-mem source at the longer delay -- no
    parity conflict here since both group sizes (20 and 20) are even, so
    this and the (identical, since value_high==value_low on even trials)
    $1/$0-longer split can both be exactly 20/20 simultaneously.
  - No run of MAX_MEMORABILITY_RUN+1 or more consecutive NEW trials shares
    the same memorability_bin with nothing (old or opposite-bin new) in
    between. Old trials always show one high + one low card together, so
    they carry no single memorability label and always break a run --
    this is naturally what a raw sliding-window sum over "isHigh"/"isLow"
    indicators (0 for old positions) enforces.
  - No run of MAX_TRIAL_TYPE_RUN+1 or more consecutive trials shares the
    same trial_type (old/new). MAX_TRIAL_TYPE_RUN must be >= 8: with
    MIN_DELAY=7, position 7 (0-indexed) has only one valid source delay,
    so it can never be old, forcing a leading run of >= 8 new trials in
    every feasible sequence.

Phase 1 (~2-3k binary vars): decide old/new per position (also subject to
  the trial-type run-length cap, a plain sliding-window sum over the
  existing old/new indicator variables), and which pairs of earlier "new"
  positions each old position draws its two (as-yet-unlabeled) sources
  from, at delays that respect the aggregate (4x) delay histogram. Identical
  to the matched-memorability Phase 1 except for the aggregate histogram
  target (here: 4x(HIST20[d]+HIST19[d]), since there are 2 groups of size
  20 and 2 of size 19, vs matched's 4 groups of size 39).
Phase 2 (~700 binary vars): given each old trial's fixed (short-delay,
  long-delay) source pair, assign one of the 4 retrieval categories and
  which source (high-mem or low-mem) lands on the longer delay, so that:
    - category counts are exactly 20/20/19/19
    - per-category/per-role delay histograms match exactly (as above)
    - the uneven high-longer/low-longer split is exactly 19/19 (prioritized,
      hard equality); the $1-longer/$0-longer split on those same trials is
      bounded to 18 or 20 (parity-limited, cannot be exact -- see Design)
    - the even high-longer/low-longer split is exactly 20/20
    - no memorability_bin run (over the full N-position sequence, old
      positions contributing to neither high nor low) exceeds
      MAX_MEMORABILITY_RUN
  Every new position already aliases onto one of Phase 2's hiLong decision
  variables via the same (p, d_lo, d_hi) pairing fixed by Phase 1, so the
  run-cap is a sliding-window sum constraint over existing variables, no
  new variables needed for it.

Only the *structure* is solved here (position -> old/new, category, which
source gets the longer delay). Concrete images and left/right screen
position are assigned per-participant at runtime in sequence_utils.js.
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

N_EVEN_1 = 20    # high=$1, low=$1
N_EVEN_0 = 20    # high=$0, low=$0
N_UNEVEN_H1 = 19   # high=$1, low=$0
N_UNEVEN_H0 = 19   # high=$0, low=$1
CATEGORIES = ["even_1", "even_0", "uneven_h1", "uneven_h0"]
CAT_SIZE = {"even_1": N_EVEN_1, "even_0": N_EVEN_0, "uneven_h1": N_UNEVEN_H1, "uneven_h0": N_UNEVEN_H0}
CAT_VALUE_HIGH = {"even_1": 1, "even_0": 0, "uneven_h1": 1, "uneven_h0": 0}
CAT_VALUE_LOW  = {"even_1": 1, "even_0": 0, "uneven_h1": 0, "uneven_h0": 1}

# Per-group (even / uneven) delay histogram, 9 bins summing to the group size.
# The +1 bumps for HIST20 (d10, d12) and HIST19 (d11) are chosen to NOT overlap,
# so that the Phase-1 aggregate target 4*(HIST20[d]+HIST19[d]) comes out as a
# smooth {16,16,16,20,20,20,16,16,16} plateau -- structurally identical to the
# matched-memorability design's proven-solvable Phase-1 histogram. An earlier
# version bumped d10 in both HIST20 and HIST19, producing a lumpy aggregate
# {16,16,16,24,16,20,16,16,16} that Phase 1 could not solve within the time
# limit (no feasible solution found even after 40s across several seeds).
HIST20 = {7: 2, 8: 2, 9: 2, 10: 3, 11: 2, 12: 3, 13: 2, 14: 2, 15: 2}
HIST19 = {7: 2, 8: 2, 9: 2, 10: 2, 11: 3, 12: 2, 13: 2, 14: 2, 15: 2}
assert sum(HIST20.values()) == 20
assert sum(HIST19.values()) == 19
CAT_HIST = {"even_1": HIST20, "even_0": HIST20, "uneven_h1": HIST19, "uneven_h0": HIST19}

MAX_MEMORABILITY_RUN = 3   # no more than this many consecutive same-bin NEW trials (uninterrupted)
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
#   (identical to matched-memorability's Phase 1, except the aggregate delay
#   histogram target accounts for 2 groups of 20 + 2 groups of 19 instead of
#   4 groups of 39.)
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
    # Aggregate delay histogram: 4x per-(group,role) target (to be split evenly in phase 2)
    hist_agg = {d: 4 * (HIST20[d] + HIST19[d]) for d in DELAYS}
    for d in DELAYS:
        rd = {y_idx[(i, d)]: 1 for i in range(N) if (i, d) in y_idx}
        eq(rd, hist_agg[d])

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
    pairs = {}   # old trial i -> sorted [d_lo, d_hi]
    for (i, d), col in y_idx.items():
        if x[col] == 1:
            pairs.setdefault(i, []).append(d)
    for i, ds in pairs.items():
        ds.sort()
        assert len(ds) == 2, f"trial {i} has {len(ds)} sources: {ds}"

    return old_flag, pairs


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2: assign retrieval category (even_1/even_0/uneven_h1/uneven_h0) +
#          which source (high-mem or low-mem) lands on the longer delay
# ══════════════════════════════════════════════════════════════════════════════

def solve_phase2(pairs, time_limit, rng):
    old_positions = sorted(pairs.keys())   # 78 old trial positions (0-indexed)
    n = len(old_positions)
    assert n == N_OLD

    cat_idx = {c: {} for c in CATEGORIES}
    z_idx = {c: {} for c in CATEGORIES}
    _next = 0
    for c in CATEGORIES:
        for p in old_positions:
            cat_idx[c][p] = _next; _next += 1
    hiLong_idx = {}
    for p in old_positions:
        hiLong_idx[p] = _next; _next += 1
    for c in CATEGORIES:
        for p in old_positions:
            z_idx[c][p] = _next; _next += 1
    n_vars = _next

    rows, lbs, ubs = [], [], []
    def eq(rd, v):  rows.append(rd); lbs.append(float(v)); ubs.append(float(v))
    def leq(rd, u): rows.append(rd); lbs.append(-np.inf); ubs.append(float(u))
    def geq(rd, l): rows.append(rd); lbs.append(float(l)); ubs.append(np.inf)

    # Each old trial picks exactly one category
    for p in old_positions:
        eq({cat_idx[c][p]: 1 for c in CATEGORIES}, 1)

    # Category counts
    for c in CATEGORIES:
        eq({cat_idx[c][p]: 1 for p in old_positions}, CAT_SIZE[c])

    # Linearize z[c][p] = cat[c][p] AND hiLong[p]
    for c in CATEGORIES:
        for p in old_positions:
            zc, catc, hl = z_idx[c][p], cat_idx[c][p], hiLong_idx[p]
            leq({zc: 1, catc: -1}, 0)
            leq({zc: 1, hl: -1}, 0)
            geq({zc: 1, catc: -1, hl: -1}, -1)

    # Per-category/per-role delay histograms
    for c in CATEGORIES:
        hist = CAT_HIST[c]
        high_terms = {d: {} for d in DELAYS}
        low_terms = {d: {} for d in DELAYS}
        for p in old_positions:
            d_lo, d_hi = pairs[p]
            catc, zc = cat_idx[c][p], z_idx[c][p]
            # high-role delay = d_hi if hiLong else d_lo;  low-role delay = the other
            high_terms[d_hi][zc] = high_terms[d_hi].get(zc, 0) + 1          # hiLong=1 -> high@d_hi
            high_terms[d_lo][catc] = high_terms[d_lo].get(catc, 0) + 1      # (cat - z) -> high@d_lo
            high_terms[d_lo][zc] = high_terms[d_lo].get(zc, 0) - 1
            low_terms[d_lo][zc] = low_terms[d_lo].get(zc, 0) + 1            # hiLong=1 -> low@d_lo
            low_terms[d_hi][catc] = low_terms[d_hi].get(catc, 0) + 1        # (cat - z) -> low@d_hi
            low_terms[d_hi][zc] = low_terms[d_hi].get(zc, 0) - 1
        for d in DELAYS:
            eq(high_terms[d], hist[d])
            eq(low_terms[d], hist[d])

    # Uneven high-longer / low-longer split: exactly 19/19 (PRIORITIZED --
    # hard equality). high-longer = hiLong[p], for any p, regardless of
    # category, so over just the uneven positions this is
    # sum(z[uneven_h1]) + sum(z[uneven_h0]).
    rd = {}
    for p in old_positions:
        rd[z_idx["uneven_h1"][p]] = rd.get(z_idx["uneven_h1"][p], 0) + 1
        rd[z_idx["uneven_h0"][p]] = rd.get(z_idx["uneven_h0"][p], 0) + 1
    eq(rd, 19)

    # Uneven $1-longer / $0-longer split: as close to 19/19 as parity allows
    # given the hard constraint above (see Design docstring for the proof
    # that exact 19/19 is impossible here) -- bounded to {18, 20} instead of
    # forced to 19, which would make Phase 2 infeasible.
    # value1-longer = (# uneven_h1 with hiLong) + (# uneven_h0 with NOT hiLong)
    #               = sum z[uneven_h1] + sum(cat[uneven_h0] - z[uneven_h0])
    rd = {}
    for p in old_positions:
        rd[z_idx["uneven_h1"][p]] = rd.get(z_idx["uneven_h1"][p], 0) + 1
        rd[cat_idx["uneven_h0"][p]] = rd.get(cat_idx["uneven_h0"][p], 0) + 1
        rd[z_idx["uneven_h0"][p]] = rd.get(z_idx["uneven_h0"][p], 0) - 1
    geq(rd, 18)
    leq(rd, 20)

    # Even high-longer / low-longer split: exactly 20/20 over the 40 even trials.
    rd = {}
    for p in old_positions:
        rd[z_idx["even_1"][p]] = rd.get(z_idx["even_1"][p], 0) + 1
        rd[z_idx["even_0"][p]] = rd.get(z_idx["even_0"][p], 0) + 1
    eq(rd, N_EVEN_1)   # == 20

    # ── Memorability-bin run-length cap (no new variables needed) ──────────
    # For each old trial p with sources at positions p-d_lo (short) and
    # p-d_hi (long): the long-delay source is high-mem iff hiLong[p]=1, the
    # short-delay source is high-mem iff hiLong[p]=0. Old positions
    # themselves contribute to neither "isHigh" nor "isLow" (they show one
    # of each). For every window of MAX_MEMORABILITY_RUN+1 consecutive raw
    # positions, forbid the isHigh-sum and the isLow-sum from reaching the
    # full window (i.e. cap each at MAX_MEMORABILITY_RUN).
    owner = {}   # position -> (p, 'hi' | 'lo')
    for p in old_positions:
        d_lo, d_hi = pairs[p]
        owner[p - d_hi] = (p, "hi")
        owner[p - d_lo] = (p, "lo")

    window = MAX_MEMORABILITY_RUN + 1
    for s in range(N - window + 1):
        rd_high, rd_low = {}, {}
        offset_high = offset_low = 0
        for i in range(s, s + window):
            if i in owner:
                p, role = owner[i]
                hl = hiLong_idx[p]
                if role == "hi":
                    rd_high[hl] = rd_high.get(hl, 0) + 1
                    rd_low[hl] = rd_low.get(hl, 0) - 1
                    offset_low += 1
                else:
                    rd_high[hl] = rd_high.get(hl, 0) - 1
                    offset_high += 1
                    rd_low[hl] = rd_low.get(hl, 0) + 1
            # else: i is an old position itself -> contributes 0 to both
        leq(rd_high, MAX_MEMORABILITY_RUN - offset_high)
        leq(rd_low, MAX_MEMORABILITY_RUN - offset_low)

    c_obj = rng.normal(size=n_vars) * 0.01

    res = _solve_milp(c_obj, rows, lbs, ubs, n_vars, time_limit, "Phase 2")
    if res.x is None:
        return None
    x = np.round(res.x).astype(int)

    result = {}
    for p in old_positions:
        d_lo, d_hi = pairs[p]
        cat = next(c for c in CATEGORIES if x[cat_idx[c][p]] == 1)
        hi_long = bool(x[hiLong_idx[p]])
        result[p] = {
            "category": cat,
            "value_high": CAT_VALUE_HIGH[cat],
            "value_low": CAT_VALUE_LOW[cat],
            "delay_high": d_hi if hi_long else d_lo,
            "delay_low": d_lo if hi_long else d_hi,
        }
    return result


# ══════════════════════════════════════════════════════════════════════════════
# Assembly + validation
# ══════════════════════════════════════════════════════════════════════════════

def assemble_trials(old_flag, phase2_result):
    new_role = {}   # j -> {'used_by': i, 'bin': 'high'|'low', 'value': v}
    for i, info in phase2_result.items():
        hi_src = i - info["delay_high"]
        lo_src = i - info["delay_low"]
        new_role[hi_src] = {"used_by": i, "bin": "high", "value": info["value_high"]}
        new_role[lo_src] = {"used_by": i, "bin": "low", "value": info["value_low"]}

    trials = []
    for i in range(N):
        t = i + 1
        if old_flag[i]:
            info = phase2_result[i]
            trials.append({
                "trial_number": t,
                "trial_type": "old",
                "retrieval_type": info["category"],
                "high_source_trial_number": (i - info["delay_high"]) + 1,
                "low_source_trial_number": (i - info["delay_low"]) + 1,
                "delay_high": info["delay_high"],
                "delay_low": info["delay_low"],
                "value_high": info["value_high"],
                "value_low": info["value_low"],
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
        if n_new != 78: errors.append(f"bin {b}: {n_new} new trials, expected 78")
        for v in (0, 1):
            n_val = sum(1 for t in new_trials if t["memorability_bin"] == b and t["shared_value"] == v)
            if n_val != 39: errors.append(f"bin {b}, value {v}: {n_val} new trials, expected 39")

    for c in CATEGORIES:
        n_c = sum(1 for t in old_trials if t["retrieval_type"] == c)
        if n_c != CAT_SIZE[c]: errors.append(f"category {c}: {n_c} trials, expected {CAT_SIZE[c]}")

    by_num = {t["trial_number"]: t for t in trials}
    used_as_source = Counter()
    for t in old_trials:
        c = t["retrieval_type"]
        for key, want_bin, want_val in (
            ("high_source_trial_number", "high", CAT_VALUE_HIGH[c]),
            ("low_source_trial_number", "low", CAT_VALUE_LOW[c]),
        ):
            src_num = t[key]
            used_as_source[src_num] += 1
            src = by_num[src_num]
            if src["trial_type"] != "new":
                errors.append(f"trial {t['trial_number']}: source {src_num} is not new")
            else:
                if src["memorability_bin"] != want_bin:
                    errors.append(f"trial {t['trial_number']}: source {src_num} bin mismatch")
                if src["shared_value"] != want_val:
                    errors.append(f"trial {t['trial_number']}: source {src_num} value mismatch")

        d_hi = t["trial_number"] - t["high_source_trial_number"]
        d_lo = t["trial_number"] - t["low_source_trial_number"]
        if d_hi != t["delay_high"]: errors.append(f"trial {t['trial_number']}: delay_high mismatch")
        if d_lo != t["delay_low"]: errors.append(f"trial {t['trial_number']}: delay_low mismatch")
        if not (MIN_DELAY <= d_hi <= MAX_DELAY): errors.append(f"trial {t['trial_number']}: delay_high={d_hi} out of range")
        if not (MIN_DELAY <= d_lo <= MAX_DELAY): errors.append(f"trial {t['trial_number']}: delay_low={d_lo} out of range")

    for src_num, cnt in used_as_source.items():
        if cnt > 1: errors.append(f"source trial {src_num} used {cnt} times")
    for t in new_trials:
        if used_as_source[t["trial_number"]] != 1:
            errors.append(f"new trial {t['trial_number']} used as source {used_as_source[t['trial_number']]} times")

    for c in CATEGORIES:
        hist = CAT_HIST[c]
        for role, delay_key in (("high", "delay_high"), ("low", "delay_low")):
            delays = [t[delay_key] for t in old_trials if t["retrieval_type"] == c]
            counts = Counter(delays)
            for d in DELAYS:
                if counts[d] != hist[d]:
                    errors.append(f"category {c}, {role}: delay {d} count={counts[d]}, expected {hist[d]}")

    uneven = [t for t in old_trials if t["retrieval_type"] in ("uneven_h1", "uneven_h0")]
    n_v1_longer = sum(1 for t in uneven if t["delay_high"] > t["delay_low"] and t["value_high"] == 1
                       or t["delay_low"] > t["delay_high"] and t["value_low"] == 1)
    n_high_longer_uneven = sum(1 for t in uneven if t["delay_high"] > t["delay_low"])
    if len(uneven) != 38: errors.append(f"uneven count={len(uneven)}, expected 38")
    if n_high_longer_uneven != 19: errors.append(f"uneven high-mem-longer count={n_high_longer_uneven}, expected 19 (hard/prioritized)")
    if n_v1_longer not in (18, 20): errors.append(f"uneven $1-longer count={n_v1_longer}, expected 18 or 20 (soft, parity-limited)")

    even = [t for t in old_trials if t["retrieval_type"] in ("even_1", "even_0")]
    n_high_longer = sum(1 for t in even if t["delay_high"] > t["delay_low"])
    if len(even) != 40: errors.append(f"even count={len(even)}, expected 40")
    if n_high_longer != 20: errors.append(f"even high-longer count={n_high_longer}, expected 20")

    # Memorability run cap: build the raw-position bin sequence (old positions = None)
    bin_of_pos = [None] * N
    for t in new_trials:
        bin_of_pos[t["trial_number"] - 1] = t["memorability_bin"]
    run_label, run = None, 0
    for i in range(N):
        label = bin_of_pos[i]
        if label is not None and label == run_label:
            run += 1
        else:
            run = 1 if label is not None else 0
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
    print("\nDelay histograms by category (target: even->20 total, uneven->19 total):")
    for c in CATEGORIES:
        for label, delay_key in (("high", "delay_high"), ("low", "delay_low")):
            delays = [t[delay_key] for t in old_trials if t["retrieval_type"] == c]
            counts = Counter(delays)
            print(f"  {c:10s} {label:4s}: " + "  ".join(f"d{d}={counts[d]}" for d in DELAYS))

    uneven = [t for t in old_trials if t["retrieval_type"] in ("uneven_h1", "uneven_h0")]
    n_v1_longer = sum(1 for t in uneven if (t["delay_high"] > t["delay_low"]) == (t["value_high"] == 1))
    n_high_longer_uneven = sum(1 for t in uneven if t["delay_high"] > t["delay_low"])
    print(f"\nUneven: high-mem source longer delay: {n_high_longer_uneven} / 38  (hard target: 19)")
    print(f"Uneven: $1-source longer delay: {n_v1_longer} / 38  ($0-longer: {38-n_v1_longer})  (soft target: 18 or 20)")

    even = [t for t in old_trials if t["retrieval_type"] in ("even_1", "even_0")]
    n_high_longer = sum(1 for t in even if t["delay_high"] > t["delay_low"])
    print(f"Even: high-mem source longer delay: {n_high_longer} / 40  (low-longer: {40-n_high_longer})")

    types = [t["trial_type"] for t in trials]
    def longest_run(seq):
        best = cur = 1
        for i in range(1, len(seq)):
            cur = cur + 1 if seq[i] == seq[i-1] else 1
            best = max(best, cur)
        return best
    print(f"\nLongest run of same trial_type: {longest_run(types)}")


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
            "seed": seed,
        },
        "trials": trials,
    }


if __name__ == "__main__":
    n_sequences = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    time_limit = int(sys.argv[2]) if len(sys.argv) > 2 else 60
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
