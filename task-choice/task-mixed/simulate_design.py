#!/usr/bin/env python3
"""
simulate_design_a.py
--------------------
Validates the Design A sequence planner.

Design
  - Within-bin encoding: H/H and L/L trials (both items same memorability bin)
  - 78 H/H + 78 L/L = 156 encoding trials  (uses all 156 H + 156 L stimuli)
  - Cross-bin old/old retrieval: 1 old H item (from H/H source) + 1 old L item (from L/L source)
  - Old ≈ 1/3 of trials (78 / 234)
  - 4 retrieval types, balanced (19–20 each):
        1: H=$0, L=$1
        2: H=$1, L=$0
        3: both $0
        4: both $1
  - Delay balance: mean(delay_H) ≈ mean(delay_L); ~equal counts of H-first vs L-first encoding

Pairing algorithm (mirrors JS sequence_utils.js planSequence)
  - Alternate H/H / L/L encoding (structural delay balance via ±1 offset)
  - After each encoding trial, insert one old/old trial if eligible:
        primary   criterion: rarest retrieval type
        tiebreak1 criterion: rarest delay direction (H-first vs L-first)
        tiebreak2 criterion: smallest |source_HH_pos − source_LL_pos|
  - After encoding loop, trailing pass advances time to catch remaining pool items

Usage
  python simulate_design_a.py               # default 1000 sims
  python simulate_design_a.py --n_sim 5000
  python simulate_design_a.py --min_delay 7 --max_delay 15
"""

import argparse
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

# ── Defaults ──────────────────────────────────────────────────────────────────
N_HH      = 78   # H/H encoding trials  (2 H stimuli each → uses all 156 H)
N_LL      = 78   # L/L encoding trials
MIN_DELAY = 7
MAX_DELAY = 15
N_SIM     = 1000
SEED      = 42


# ══════════════════════════════════════════════════════════════════════════════
# Planner (mirrors the JS sequence_utils.js planSequence function)
# ══════════════════════════════════════════════════════════════════════════════

def get_ret_type(h_val, l_val):
    """Map (H value, L value) → retrieval type 1–4."""
    if   h_val == 0 and l_val == 1: return 1   # H=$0, L=$1
    elif h_val == 1 and l_val == 0: return 2   # H=$1, L=$0
    elif h_val == 0 and l_val == 0: return 3   # both $0
    else:                           return 4   # both $1


def plan_sequence(hh_values, ll_values, min_delay, max_delay):
    """
    Plan the full Design A sequence given value assignments for H/H and L/L trials.

    Returns
    -------
    trials           : list of dicts, one per trial
    type_counts      : list[4]  – final counts of ret types 1–4
    delay_dir_counts : list[2]  – [HH-first count, LL-first count]
    """
    n_hh, n_ll = len(hh_values), len(ll_values)

    pool_HH          = []   # (seq_num, value, idx)
    pool_LL          = []
    type_counts      = [0, 0, 0, 0]
    delay_dir_counts = [0, 0]   # [0]: HH encoded first (delay_H > delay_L)
                                 # [1]: LL encoded first (delay_L > delay_H)
    trials      = []
    trial_num   = 1
    hh_idx = ll_idx = step = 0

    def try_insert(trial_num):
        """Try to insert one old/old trial; return (updated_trial_num, inserted)."""
        lo = trial_num - max_delay
        hi = trial_num - min_delay
        avail_HH = [(sn, v, i) for sn, v, i in pool_HH if lo <= sn <= hi]
        avail_LL = [(sn, v, i) for sn, v, i in pool_LL if lo <= sn <= hi]
        if not avail_HH or not avail_LL:
            return trial_num, False

        # Primary:   urgency  (fewest remaining steps for either item — prevents starvation)
        # Tiebreak 1: rarest retrieval type
        # Tiebreak 2: rarest delay direction
        # Tiebreak 3: smallest |pos_HH − pos_LL|
        best_hh = best_ll = None
        best_ug, best_tc, best_dc, best_dd = float('inf'), float('inf'), float('inf'), float('inf')
        for hh in avail_HH:
            for ll in avail_LL:
                rt      = get_ret_type(hh[1], ll[1])
                tc      = type_counts[rt - 1]
                dir_idx = 0 if hh[0] < ll[0] else 1
                dc      = delay_dir_counts[dir_idx]
                dd      = abs(hh[0] - ll[0])
                ug      = min(hh[0] + max_delay - trial_num,
                              ll[0] + max_delay - trial_num)
                if (ug < best_ug or
                    (ug == best_ug and tc < best_tc) or
                    (ug == best_ug and tc == best_tc and dc < best_dc) or
                    (ug == best_ug and tc == best_tc and dc == best_dc and dd < best_dd)):
                    best_ug, best_tc, best_dc, best_dd = ug, tc, dc, dd
                    best_hh, best_ll = hh, ll

        rt      = get_ret_type(best_hh[1], best_ll[1])
        dir_idx = 0 if best_hh[0] < best_ll[0] else 1
        type_counts[rt - 1]      += 1
        delay_dir_counts[dir_idx] += 1
        pool_HH.remove(best_hh)
        pool_LL.remove(best_ll)

        delay_h = trial_num - best_hh[0]
        delay_l = trial_num - best_ll[0]
        trials.append(dict(
            type      = 'old',
            seq_num   = trial_num,
            ret_type  = rt,
            hh_src    = best_hh[0],
            ll_src    = best_ll[0],
            delay_h   = delay_h,
            delay_l   = delay_l,
            h_value   = best_hh[1],
            l_value   = best_ll[1],
            delay_dir = dir_idx,
        ))
        return trial_num + 1, True

    # ── Main encoding loop ────────────────────────────────────────────────────
    while hh_idx < n_hh or ll_idx < n_ll:
        # Alternate H/H and L/L, swapping which comes first every OTHER PAIR
        # so that delay_H − delay_L alternates +1 / −1 → mean ≈ 0.
        if hh_idx < n_hh and ll_idx < n_ll:
            # HLLHHLLH... pattern: each (HH,LL) pair alternates which type leads,
            # so delay_H − delay_L alternates +1/−1 → mean ≈ 0.
            place_hh = (step + step // 2) % 2 == 0
        else:
            place_hh = (hh_idx < n_hh)

        if place_hh:
            pool_HH.append((trial_num, int(hh_values[hh_idx]), hh_idx))
            trials.append(dict(type='enc_hh', seq_num=trial_num, idx=hh_idx))
            hh_idx += 1
        else:
            pool_LL.append((trial_num, int(ll_values[ll_idx]), ll_idx))
            trials.append(dict(type='enc_ll', seq_num=trial_num, idx=ll_idx))
            ll_idx += 1

        trial_num += 1
        step += 1

        trial_num, _ = try_insert(trial_num)

    # ── Trailing pass: advance time so items near end enter the window ────────
    stalled = 0
    while stalled <= max_delay:
        trial_num, inserted = try_insert(trial_num)
        if inserted:
            stalled = 0
        else:
            trial_num += 1
            stalled   += 1

    return trials, type_counts, delay_dir_counts


# ══════════════════════════════════════════════════════════════════════════════
# One simulation run
# ══════════════════════════════════════════════════════════════════════════════

def run_sim(seed, min_delay=MIN_DELAY, max_delay=MAX_DELAY):
    rng = np.random.default_rng(seed)

    # Joint balanced value assignment: pairs (hh_val, ll_val) are pre-typed so that
    # urgency-first matching (which pairs hh_idx=i with ll_idx=i) yields exactly
    # balanced ret-type counts.  For 78 pairs: types 1,2 get 20 each, 3,4 get 19 each.
    n_pairs = N_HH  # == N_LL
    base    = n_pairs // 4
    rem     = n_pairs % 4   # 78 % 4 = 2
    type_to_vals = [(0,1), (1,0), (0,0), (1,1)]   # types 1-4
    pair_vals = []
    for t_idx in range(4):
        cnt = base + (1 if t_idx < rem else 0)
        pair_vals.extend([type_to_vals[t_idx]] * cnt)
    pair_vals = rng.permutation(pair_vals)
    hh_vals = [int(p[0]) for p in pair_vals]
    ll_vals  = [int(p[1]) for p in pair_vals]

    trials, type_counts, delay_dir_counts = plan_sequence(hh_vals, ll_vals, min_delay, max_delay)

    old   = [t for t in trials if t['type'] == 'old']
    n_old = len(old)

    delays_h = np.array([t['delay_h'] for t in old]) if old else np.array([np.nan])
    delays_l = np.array([t['delay_l'] for t in old]) if old else np.array([np.nan])
    diff     = delays_h - delays_l

    return dict(
        n_total          = len(trials),
        n_hh             = sum(1 for t in trials if t['type'] == 'enc_hh'),
        n_ll             = sum(1 for t in trials if t['type'] == 'enc_ll'),
        n_old            = n_old,
        type_counts      = type_counts,
        delay_dir_counts = delay_dir_counts,
        old_pct          = n_old / len(trials) if trials else np.nan,
        mean_delay_h     = float(np.nanmean(delays_h)),
        mean_delay_l     = float(np.nanmean(delays_l)),
        mean_delay_diff  = float(np.nanmean(diff)),    # H − L; target ≈ 0
        max_delay_h      = float(np.nanmax(delays_h)),
        min_delay_h      = float(np.nanmin(delays_h)),
        max_delay_l      = float(np.nanmax(delays_l)),
        min_delay_l      = float(np.nanmin(delays_l)),
        type_min         = min(type_counts),
        type_max         = max(type_counts),
        delay_dir_min    = min(delay_dir_counts),
        delay_dir_max    = max(delay_dir_counts),
    )


# ══════════════════════════════════════════════════════════════════════════════
# Sweep across seeds
# ══════════════════════════════════════════════════════════════════════════════

def run_sweep(n_sim, min_delay, max_delay, seed):
    sims = [run_sim(seed + i, min_delay, max_delay) for i in range(n_sim)]

    n_old  = np.array([s['n_old']          for s in sims])
    diffs  = np.array([s['mean_delay_diff'] for s in sims])
    dH     = np.array([s['mean_delay_h']    for s in sims])
    dL     = np.array([s['mean_delay_l']    for s in sims])
    tc     = np.array([s['type_counts']     for s in sims])   # (n_sim, 4)
    ddc    = np.array([s['delay_dir_counts'] for s in sims])  # (n_sim, 2)
    totals = np.array([s['n_total']         for s in sims])

    print(f"\n{'─'*60}")
    print(f"Design A simulation  |  delay [{min_delay},{max_delay}]  |  {n_sim:,} seeds")
    print(f"{'─'*60}")
    print(f"\nTrial counts (should be fixed at 234 = 78 HH + 78 LL + 78 old):")
    print(f"  total : {totals.mean():.1f} ± {totals.std():.2f}  [min {totals.min()}, max {totals.max()}]")
    print(f"  n_old : {n_old.mean():.1f} ± {n_old.std():.2f}  [min {n_old.min()}, max {n_old.max()}]")
    print(f"  old % : {(n_old/totals*100).mean():.1f}%  (target 33.3%)")

    print(f"\nRetrieval type balance (target 19–20 each):")
    for i in range(4):
        label = ['H=$0,L=$1', 'H=$1,L=$0', 'both=$0', 'both=$1'][i]
        vals = tc[:, i]
        print(f"  Type {i+1} ({label}): {vals.mean():.1f} ± {vals.std():.1f}  [min {vals.min()}, max {vals.max()}]")

    print(f"\nDelay direction balance (target ~39 each):")
    labels_dir = ['HH encoded first (delay_H > delay_L)', 'LL encoded first (delay_L > delay_H)']
    for i in range(2):
        vals = ddc[:, i]
        print(f"  Dir {i} ({labels_dir[i]}): {vals.mean():.1f} ± {vals.std():.1f}  [min {vals.min()}, max {vals.max()}]")

    print(f"\nDelay balance on old trials (target diff ≈ 0):")
    print(f"  mean delay_H : {dH.mean():.2f} ± {dH.std():.2f}")
    print(f"  mean delay_L : {dL.mean():.2f} ± {dL.std():.2f}")
    print(f"  mean(H−L)    : {diffs.mean():.3f} ± {diffs.std():.3f}  "
          f"[p5={np.percentile(diffs,5):.2f}, p95={np.percentile(diffs,95):.2f}]")

    within_window = np.array([
        s['min_delay_h'] >= min_delay and s['max_delay_h'] <= max_delay and
        s['min_delay_l'] >= min_delay and s['max_delay_l'] <= max_delay
        for s in sims
    ])
    print(f"\n  All delays in [{min_delay},{max_delay}]: {within_window.mean()*100:.1f}%")

    return sims


def plot_results(sims, min_delay, max_delay, out_dir):
    tc    = np.array([s['type_counts']      for s in sims])
    ddc   = np.array([s['delay_dir_counts'] for s in sims])
    dH    = np.array([s['mean_delay_h']     for s in sims])
    dL    = np.array([s['mean_delay_l']     for s in sims])
    diffs = np.array([s['mean_delay_diff']  for s in sims])

    fig, axes = plt.subplots(1, 4, figsize=(18, 4))
    fig.suptitle(
        f"Design A planner validation  |  delay [{min_delay}–{max_delay}]  "
        f"|  {len(sims):,} seeds", fontsize=11)

    # Panel 1: type balance
    ax = axes[0]
    labels = ['H=$0\nL=$1', 'H=$1\nL=$0', 'both\n$0', 'both\n$1']
    means = tc.mean(axis=0)
    stds  = tc.std(axis=0)
    x = np.arange(4)
    ax.bar(x, means, yerr=stds, capsize=5, color=['C0','C1','C2','C3'], alpha=0.8)
    ax.axhline(N_HH / 4, color='k', lw=1, ls='--', label=f'target ({N_HH//4}–{N_HH//4+1})')
    ax.set_xticks(x); ax.set_xticklabels(labels, fontsize=9)
    ax.set_ylabel('Count per type'); ax.set_title('Type balance (mean ± SD over seeds)')
    ax.legend(fontsize=8)

    # Panel 2: delay direction balance
    ax = axes[1]
    dir_labels = ['HH first\n(delay_H > delay_L)', 'LL first\n(delay_L > delay_H)']
    dir_means = ddc.mean(axis=0)
    dir_stds  = ddc.std(axis=0)
    ax.bar([0, 1], dir_means, yerr=dir_stds, capsize=5, color=['C4', 'C5'], alpha=0.8)
    ax.axhline(N_HH / 2, color='k', lw=1, ls='--', label=f'target ({N_HH//2})')
    ax.set_xticks([0, 1]); ax.set_xticklabels(dir_labels, fontsize=9)
    ax.set_ylabel('Count'); ax.set_title('Delay direction balance')
    ax.legend(fontsize=8)

    # Panel 3: delay distributions
    ax = axes[2]
    ax.hist(dH, bins=20, alpha=0.6, color='C0', label='mean delay_H per seed')
    ax.hist(dL, bins=20, alpha=0.6, color='C1', label='mean delay_L per seed')
    ax.axvline((min_delay + max_delay) / 2, color='gray', ls='--',
               label=f'window midpoint ({(min_delay+max_delay)/2:.0f})')
    ax.set_xlabel('Mean delay (trials)'); ax.set_ylabel('Seeds')
    ax.set_title('Delay distributions by bin')
    ax.legend(fontsize=8)

    # Panel 4: H−L delay difference
    ax = axes[3]
    ax.hist(diffs, bins=30, color='C3', alpha=0.8)
    ax.axvline(0, color='k', lw=1.5, ls='--', label='no bias')
    ax.axvline(diffs.mean(), color='C3', lw=2, label=f'mean={diffs.mean():.3f}')
    ax.set_xlabel('mean(delay_H) − mean(delay_L) per seed')
    ax.set_ylabel('Seeds')
    ax.set_title('Delay bias H − L\n(target: centered on 0)')
    ax.legend(fontsize=8)

    plt.tight_layout()
    out = Path(out_dir) / f'sim_design_a_delay{min_delay}-{max_delay}.png'
    fig.savefig(out, dpi=150); plt.show()
    print(f"Figure saved → {out}")


# ══════════════════════════════════════════════════════════════════════════════
# Entry point
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--n_sim',     type=int, default=N_SIM)
    parser.add_argument('--min_delay', type=int, default=MIN_DELAY)
    parser.add_argument('--max_delay', type=int, default=MAX_DELAY)
    parser.add_argument('--seed',      type=int, default=SEED)
    parser.add_argument('--out_dir',   type=str, default='.')
    args = parser.parse_args()

    sims = run_sweep(args.n_sim, args.min_delay, args.max_delay, args.seed)
    plot_results(sims, args.min_delay, args.max_delay, args.out_dir)


if __name__ == '__main__':
    main()
