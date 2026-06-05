(function () {
    // ── Random helpers ────────────────────────────────────────────────────────
    function makeRandomHelpers(randomFn = Math.random) {
        return {
            random: randomFn,
            shuffle(arr) {
                const a = arr.slice();
                for (let i = a.length - 1; i > 0; i--) {
                    const j = Math.floor(randomFn() * (i + 1));
                    [a[i], a[j]] = [a[j], a[i]];
                }
                return a;
            },
            sample(arr, n) {
                if (n > arr.length) throw new Error(`Cannot sample ${n} from array of ${arr.length}`);
                return this.shuffle(arr).slice(0, n);
            },
        };
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function mean(values) {
        return values.reduce((s, v) => s + v, 0) / values.length;
    }

    function decimalScale(values) {
        const decimals = values.map(v => {
            const t = String(v); const d = t.indexOf(".");
            return d === -1 ? 0 : t.length - d - 1;
        });
        return 10 ** Math.max(0, ...decimals);
    }

    function findClosestRemainderCombo(valuesInt, remainder, targetSum) {
        let bestCombo = null, bestDistance = Infinity;
        function recurse(startIndex, remainingCount, remainingTarget, current) {
            if (remainingCount === 0) {
                const distance = Math.abs(remainingTarget);
                if (distance < bestDistance) { bestDistance = distance; bestCombo = current.slice(); }
                return;
            }
            for (let i = startIndex; i < valuesInt.length; i++) {
                current.push(i);
                recurse(i, remainingCount - 1, remainingTarget - valuesInt[i], current);
                current.pop();
            }
        }
        recurse(0, remainder, targetSum, []);
        return bestCombo;
    }

    function buildBalancedValueList(n, possibleValues, rng) {
        if (n <= 0) return [];
        const sorted = possibleValues.slice().sort((a, b) => a - b);
        const k = sorted.length;
        const base = Math.floor(n / k);
        const remainder = n % k;
        const counts = Array(k).fill(base);
        if (remainder > 0) {
            const scale = decimalScale(sorted);
            const scaled = sorted.map(v => Math.round(v * scale));
            const targetExtraSum = Math.round(remainder * mean(sorted) * scale);
            const combo = findClosestRemainderCombo(scaled, remainder, targetExtraSum);
            if (!combo) throw new Error("Unable to build balanced value list.");
            combo.forEach(idx => counts[idx]++);
        }
        const expanded = [];
        counts.forEach((count, idx) => { for (let i = 0; i < count; i++) expanded.push(sorted[idx]); });
        return rng.shuffle(expanded);
    }

    // ── Stimulus normalization ────────────────────────────────────────────────
    function normalizeStimulusRows(rows, params) {
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error("Stimulus metadata is missing or empty.");
        }
        return rows.map(row => {
            const relPath = row.image_path || `images/${row.image_name}`;
            return {
                image_name:             row.image_name,
                image_path:             `${params.stimuli_dir}/${relPath}`,
                relative_image_path:    relPath,
                things_file_path:       row.things_file_path,
                things_memorability:    Number(row.memorability_score ?? row.things_memorability),
                things_category:        row.things_category,
                memorability_percentile: Number(row.memorability_percentile),
                category27_label:       row.category27_label,
                category27_id:          Number(row.category27_id),
                concept_name:           row.concept_name || row.concept_id,
                memorability_bin:       row.memorability_bin,
            };
        });
    }

    // ── Retrieval type ────────────────────────────────────────────────────────
    function getRetType(hValue, lValue) {
        if      (hValue === 0 && lValue === 1) return 1;   // H=$0, L=$1
        else if (hValue === 1 && lValue === 0) return 2;   // H=$1, L=$0
        else if (hValue === 0 && lValue === 0) return 3;   // both $0
        else                                   return 4;   // both $1
    }

    // ── Sequence planner ──────────────────────────────────────────────────────
    /**
     * planSequence
     * ------------
     * Builds the full ordered trial list for Design A.
     *
     * Algorithm (mirrors simulate_design_a.py):
     *  1. Alternate H/H and L/L encoding trials; swap which comes first every
     *     other *pair* so that delay_H − delay_L alternates ±1 → mean ≈ 0.
     *  2. After each encoding trial, try to insert one old/old trial:
     *       primary   criterion: urgency  (fewest remaining steps — prevents starvation)
     *       tiebreak1 criterion: rarest retrieval type
     *       tiebreak2 criterion: rarest delay direction
     *       tiebreak3 criterion: smallest |pos_HH − pos_LL|
     *  3. Trailing pass: advance time to catch pool items near sequence end.
     *
     * Returns an array of trial-spec objects, each with:
     *   { trial_number, block_index, trial_type: 'new'|'old', ... }
     */
    function planSequence(hhSpecs, llSpecs, params, rng) {
        const { min_delay, max_delay, block_trial_boundaries } = params;
        const n_hh = hhSpecs.length;
        const n_ll = llSpecs.length;

        const poolHH = [];   // { seq_num, value, spec }
        const poolLL = [];
        const typeCounts    = [0, 0, 0, 0];
        const delayDirCounts = [0, 0];   // [0]: HH encoded first (delay_H > delay_L), [1]: LL first
        const trials = [];
        let trialNum = 1;
        let hhIdx = 0, llIdx = 0, step = 0;

        function getBlockIndex(t) {
            if (t <= block_trial_boundaries[0]) return 1;
            if (t <= block_trial_boundaries[1]) return 2;
            return 3;
        }

        function tryInsert() {
            const lo = trialNum - max_delay;
            const hi = trialNum - min_delay;
            const availHH = poolHH.filter(x => lo <= x.seq_num && x.seq_num <= hi);
            const availLL = poolLL.filter(x => lo <= x.seq_num && x.seq_num <= hi);
            if (!availHH.length || !availLL.length) return false;

            // Primary:   urgency (fewest remaining steps for either item — prevents starvation)
            // Tiebreak 1: rarest ret type
            // Tiebreak 2: rarest delay direction
            // Tiebreak 3: smallest |delay diff|
            let bestHH = null, bestLL = null;
            let bestUG = Infinity, bestTC = Infinity, bestDC = Infinity, bestDD = Infinity;
            for (const hh of availHH) {
                for (const ll of availLL) {
                    const rt  = getRetType(hh.value, ll.value);
                    const tc  = typeCounts[rt - 1];
                    const dir = hh.seq_num < ll.seq_num ? 0 : 1;
                    const dc  = delayDirCounts[dir];
                    const dd  = Math.abs(hh.seq_num - ll.seq_num);
                    const ug  = Math.min(hh.seq_num + max_delay - trialNum,
                                         ll.seq_num + max_delay - trialNum);
                    if (ug < bestUG ||
                        (ug === bestUG && tc < bestTC) ||
                        (ug === bestUG && tc === bestTC && dc < bestDC) ||
                        (ug === bestUG && tc === bestTC && dc === bestDC && dd < bestDD)) {
                        bestUG = ug; bestTC = tc; bestDC = dc; bestDD = dd;
                        bestHH = hh; bestLL = ll;
                    }
                }
            }

            const rt  = getRetType(bestHH.value, bestLL.value);
            const dir = bestHH.seq_num < bestLL.seq_num ? 0 : 1;
            typeCounts[rt - 1]++;
            delayDirCounts[dir]++;
            poolHH.splice(poolHH.indexOf(bestHH), 1);
            poolLL.splice(poolLL.indexOf(bestLL), 1);

            const delayH = trialNum - bestHH.seq_num;
            const delayL = trialNum - bestLL.seq_num;
            const leftIsH = rng.random() < 0.5;

            trials.push({
                trial_number:            trialNum,
                block_index:             getBlockIndex(trialNum),
                trial_type:              'old',
                ret_type:                rt,
                source_hh_trial_number:  bestHH.seq_num,
                source_ll_trial_number:  bestLL.seq_num,
                h_value:                 bestHH.value,
                l_value:                 bestLL.value,
                delay_h:                 delayH,
                delay_l:                 delayL,
                left_is_high:            leftIsH,
                fallback_hh_side:        bestHH.spec.fallback_side,
                fallback_ll_side:        bestLL.spec.fallback_side,
            });
            trialNum++;
            return true;
        }

        // ── Main encoding loop ───────────────────────────────────────────────
        while (hhIdx < n_hh || llIdx < n_ll) {
            // Alternate HH/LL; swap lead every other pair for delay balance
            // HLLHHLLH... pattern: each (HH,LL) pair alternates which type leads,
            // so delay_H − delay_L alternates +1/−1 → mean ≈ 0.
            const placeHH = (hhIdx < n_hh && llIdx < n_ll)
                ? ((step + Math.floor(step / 2)) % 2 === 0)
                : (hhIdx < n_hh);

            if (placeHH) {
                const spec = hhSpecs[hhIdx];
                poolHH.push({ seq_num: trialNum, value: spec.shared_value, spec });
                trials.push({
                    trial_number:  trialNum,
                    block_index:   getBlockIndex(trialNum),
                    trial_type:    'new',
                    enc_type:      'HH',
                    hh_index:      hhIdx,
                    left_stimulus: spec.left_stimulus,
                    right_stimulus: spec.right_stimulus,
                    shared_value:  spec.shared_value,
                    fallback_side: spec.fallback_side,
                });
                hhIdx++;
            } else {
                const spec = llSpecs[llIdx];
                poolLL.push({ seq_num: trialNum, value: spec.shared_value, spec });
                trials.push({
                    trial_number:  trialNum,
                    block_index:   getBlockIndex(trialNum),
                    trial_type:    'new',
                    enc_type:      'LL',
                    ll_index:      llIdx,
                    left_stimulus: spec.left_stimulus,
                    right_stimulus: spec.right_stimulus,
                    shared_value:  spec.shared_value,
                    fallback_side: spec.fallback_side,
                });
                llIdx++;
            }
            trialNum++;
            step++;

            tryInsert();
        }

        // ── Trailing pass ────────────────────────────────────────────────────
        // Advance time so items near the end of the sequence enter the window.
        let stalled = 0;
        while (stalled <= max_delay) {
            if (tryInsert()) {
                stalled = 0;
            } else {
                trialNum++;
                stalled++;
            }
        }

        return trials;
    }

    // ── Main plan builder ─────────────────────────────────────────────────────
    /**
     * buildSequencePlan
     * -----------------
     * Design A: within-bin H/H and L/L encoding + cross-bin old/old retrieval.
     *
     * Returns { trials, preload_images, normalized_stimuli }
     * where trials is a flat ordered list of all trial specs.
     *
     * Encoding trials  (trial_type: 'new'):
     *   enc_type       – 'HH' or 'LL'
     *   left_stimulus / right_stimulus  – stimulus objects
     *   shared_value   – $0 or $1
     *   fallback_side  – 'left'|'right' (used if participant misses the trial)
     *
     * Retrieval trials  (trial_type: 'old'):
     *   ret_type               – 1–4
     *   source_hh_trial_number – trial_number of the H/H encoding source
     *   source_ll_trial_number – trial_number of the L/L encoding source
     *   h_value / l_value      – values of H and L items
     *   delay_h / delay_l      – lags in sequence positions (both ≈ equal)
     *   left_is_high           – whether left card is the H item
     *   fallback_hh_side / fallback_ll_side – sides to show if source was missed
     */
    function buildSequencePlan(params, metadataRows, randomFn = Math.random) {
        const rng = makeRandomHelpers(randomFn);
        const normalizedStimuli = normalizeStimulusRows(metadataRows, params);

        const highStim = rng.shuffle(normalizedStimuli.filter(s => s.memorability_bin === 'high'));
        const lowStim  = rng.shuffle(normalizedStimuli.filter(s => s.memorability_bin === 'low'));

        // H/H trials use 2 H items each
        const n_hh = Math.floor(highStim.length / 2);   // 78 with 156 H items
        const n_ll = Math.floor(lowStim.length  / 2);   // 78 with 156 L items

        if (n_hh === 0 || n_ll === 0) {
            throw new Error("Not enough high or low-mem stimuli to build the sequence.");
        }

        // Joint balanced value assignment: hh/ll values are paired so that
        // urgency-first matching (which pairs hh_idx=i with ll_idx=i) gives exactly
        // balanced ret-type counts.  For 78 pairs: types 1,2 get 20 each, 3,4 get 19.
        const nPairs = Math.min(n_hh, n_ll);
        const base   = Math.floor(nPairs / 4);
        const rem    = nPairs % 4;   // 78 % 4 = 2 → types 1,2 each get base+1=20
        const typeToValues = [[0,1],[1,0],[0,0],[1,1]];   // ret-types 1-4
        const valuePairs = [];
        for (let t = 0; t < 4; t++) {
            const count = base + (t < rem ? 1 : 0);
            for (let k = 0; k < count; k++) valuePairs.push(typeToValues[t]);
        }
        const shuffledPairs = rng.shuffle(valuePairs);
        const hhValues = shuffledPairs.map(p => p[0]);
        const llValues = shuffledPairs.map(p => p[1]);

        // Build H/H encoding specs (each uses 2 H items)
        const hhSpecs = [];
        for (let i = 0; i < n_hh; i++) {
            const s1 = highStim[i * 2], s2 = highStim[i * 2 + 1];
            const leftIsFirst = rng.random() < 0.5;
            hhSpecs.push({
                left_stimulus:  leftIsFirst ? s1 : s2,
                right_stimulus: leftIsFirst ? s2 : s1,
                shared_value:   hhValues[i],
                fallback_side:  rng.sample(['left', 'right'], 1)[0],
            });
        }

        // Build L/L encoding specs (each uses 2 L items)
        const llSpecs = [];
        for (let i = 0; i < n_ll; i++) {
            const s1 = lowStim[i * 2], s2 = lowStim[i * 2 + 1];
            const leftIsFirst = rng.random() < 0.5;
            llSpecs.push({
                left_stimulus:  leftIsFirst ? s1 : s2,
                right_stimulus: leftIsFirst ? s2 : s1,
                shared_value:   llValues[i],
                fallback_side:  rng.sample(['left', 'right'], 1)[0],
            });
        }

        const trials = planSequence(hhSpecs, llSpecs, params, rng);

        return {
            trials,
            preload_images:     normalizedStimuli.map(s => s.image_path),
            normalized_stimuli: normalizedStimuli,
        };
    }

    // ── Exports ───────────────────────────────────────────────────────────────
    window.EpisodicChoiceSequence = {
        clamp,
        makeRandomHelpers,
        buildBalancedValueList,
        buildSequencePlan,
    };
})();
