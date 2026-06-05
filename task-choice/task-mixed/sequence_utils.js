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
                image_name:            row.image_name,
                image_path:            `${params.stimuli_dir}/${relPath}`,
                relative_image_path:   relPath,
                things_file_path:      row.things_file_path,
                things_memorability:   Number(row.memorability_score ?? row.things_memorability),
                things_category:       row.things_category,
                memorability_percentile: Number(row.memorability_percentile),
                category27_label:      row.category27_label,
                category27_id:         Number(row.category27_id),
                concept_name:          row.concept_name || row.concept_id,
                memorability_bin:      row.memorability_bin,
            };
        });
    }

    // ── Plan builder ──────────────────────────────────────────────────────────
    /**
     * buildSequencePlan
     * -----------------
     * Returns a static plan consisting of N_ENC encoding trial specs.
     * Retrieval (old/old) trials are NOT pre-planned here; they are inserted
     * dynamically at runtime by the task controller after each encoding trial,
     * using the insert-when-eligible algorithm:
     *   → after each encoding trial, if ≥1 chosen-H item AND ≥1 chosen-L item
     *     are in the delay window, insert one old/old retrieval trial.
     *
     * Each encoding trial spec:
     *   enc_index      – 0-indexed position among encoding trials
     *   high_stimulus  – stimulus object for the H item
     *   low_stimulus   – stimulus object for the L item
     *   left_stimulus  – whichever appears on the left (H or L, randomised)
     *   right_stimulus – the other
     *   left_is_high   – boolean
     *   shared_value   – $0 or $1 (both items share this value at encoding)
     */
    function buildSequencePlan(params, metadataRows, randomFn = Math.random) {
        const rng = makeRandomHelpers(randomFn);
        const normalizedStimuli = normalizeStimulusRows(metadataRows, params);

        // Split by bin (only high and low used)
        const highStim = normalizedStimuli.filter(s => s.memorability_bin === "high");
        const lowStim  = normalizedStimuli.filter(s => s.memorability_bin === "low");

        if (highStim.length < params.n_enc) {
            throw new Error(`Need ${params.n_enc} high-mem stimuli, found ${highStim.length}.`);
        }
        if (lowStim.length < params.n_enc) {
            throw new Error(`Need ${params.n_enc} low-mem stimuli, found ${lowStim.length}.`);
        }

        const shuffledHigh = rng.shuffle(highStim).slice(0, params.n_enc);
        const shuffledLow  = rng.shuffle(lowStim).slice(0, params.n_enc);

        // Balanced $0/$1 values for encoding trials
        const values = buildBalancedValueList(params.n_enc, params.possible_values, rng);

        const encodingTrials = [];
        for (let i = 0; i < params.n_enc; i++) {
            const high = shuffledHigh[i];
            const low  = shuffledLow[i];
            const leftIsHigh = rng.random() < 0.5;
            encodingTrials.push({
                enc_index:      i,
                high_stimulus:  high,
                low_stimulus:   low,
                left_stimulus:  leftIsHigh ? high : low,
                right_stimulus: leftIsHigh ? low  : high,
                left_is_high:   leftIsHigh,
                shared_value:   values[i],
            });
        }

        return {
            encodingTrials,
            preload_images: normalizedStimuli.map(s => s.image_path),
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
