(function () {
    const BIN_ORDER = ["high", "mid", "low"];

    // ── Random helpers ────────────────────────────────────────────────────────
    function makeRandomHelpers(randomFn = Math.random) {
        return {
            random: randomFn,
            shuffle(values) {
                const arr = values.slice();
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(randomFn() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                return arr;
            },
            sample(values, n) {
                if (n > values.length) {
                    throw new Error(`Cannot sample ${n} items from an array of length ${values.length}.`);
                }
                return this.shuffle(values).slice(0, n);
            }
        };
    }

    function mean(values) {
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Assigns old_side ('left'/'right') to old trials so that, within each
    // memorability bin, left/right is balanced (26/26 for a 52-trial bin).
    function assignBalancedOldSide(oldTrials, rng) {
        const byBin = {};
        oldTrials.forEach(t => {
            (byBin[t.memorability_bin] = byBin[t.memorability_bin] || []).push(t);
        });

        Object.values(byBin).forEach(group => {
            const shuffled = rng.shuffle(group);
            const half = Math.floor(shuffled.length / 2);
            shuffled.forEach((t, idx) => {
                t.old_side = idx < half ? "left" : "right";
            });
        });
    }

    // Simple string hash (djb2) -> non-negative int, for deterministic-per-participant
    // selection among the precomputed sequence structures.
    function hashString(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
        }
        return Math.abs(hash);
    }

    function cumulativeBoundaries(blockSizes) {
        const boundaries = [];
        let total = 0;
        blockSizes.forEach(size => {
            total += size;
            boundaries.push(total);
        });
        return boundaries;
    }

    // ── Stimulus normalization ────────────────────────────────────────────────
    function normalizeStimulusRows(rows, params) {
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error("Stimulus metadata is missing or empty.");
        }

        return rows.map((row) => {
            const relativeImagePath = row.image_path || `images/${row.image_name}`;
            return {
                image_name: row.image_name,
                image_path: `${params.stimuli_dir}/${relativeImagePath}`,
                relative_image_path: relativeImagePath,
                things_file_path: row.things_file_path,
                things_memorability: Number(row.things_memorability),
                things_category: row.things_category,
                memorability_percentile: Number(row.memorability_percentile),
                category27_label: row.category27_label,
                category27_id: Number(row.category27_id),
                concept_name: row.concept_name,
                memorability_bin: row.memorability_bin,
                selection_source: row.selection_source,
            };
        });
    }

    function buildAttentionChecks(params, rng) {
        const checks = [];
        const attentionKeys = "abcdefghijklmnopqrstuvwxyz"
            .split("")
            .filter((key) => key !== "j" && key !== "k" && key !== "x");
        let blockStart = 1;

        for (let blockIndex = 0; blockIndex < params.block_sizes.length && checks.length < params.n_attention_checks; blockIndex++) {
            const blockSize = params.block_sizes[blockIndex];
            const blockEnd = blockStart + blockSize - 1;
            const eligible = [];

            for (let trialNumber = blockStart + 6; trialNumber <= blockEnd - 3; trialNumber++) {
                eligible.push(trialNumber);
            }

            if (eligible.length > 0) {
                checks.push({
                    after_trial_number: rng.sample(eligible, 1)[0],
                    correct_key: rng.sample(attentionKeys, 1)[0],
                });
            }

            blockStart = blockEnd + 1;
        }

        return checks.sort((a, b) => a.after_trial_number - b.after_trial_number);
    }

    // ── Main plan builder ─────────────────────────────────────────────────────
    /**
     * buildSequencePlan
     * -----------------
     * Loads one of the precomputed structural solutions
     * (window.SEQUENCE_STRUCTURES, produced offline by
     * sequences/build_sequences.py's two-phase MILP), selected deterministically
     * per participant (hash of participantId mod length, so a page reload keeps
     * the same structure), and fills it in with randomly assigned concrete
     * images (per participant) and randomized left/right screen placement.
     *
     * The MILP guarantees, exactly:
     *   - 312 trials: 156 new (encoding) + 156 old (retrieval), 52 of each per
     *     memorability bin (high/mid/low)
     *   - new trials: 2 fresh same-bin images sharing one value, 26 $1 / 26 $0
     *     per bin. The chosen image becomes the source for exactly one old
     *     trial in the same bin.
     *   - old trials: 1 previously-chosen ("old") card + 1 brand-new ("lure")
     *     card, both same bin. old-card value 26/26 per bin (inherited from
     *     its source trial); lure-card value independently 26/26 per bin.
     *   - delay (trial_number - source_trial_number) in [min_delay, max_delay],
     *     with identical delay-bucket histograms across bins and across old-
     *     card value classes within a bin
     *   - no run of >3 consecutive same-bin trials (old or new)
     *   - no run of >8 consecutive same trial_type (old/new) trials
     *
     * Returns { trials, attention_checks, preload_images, normalized_stimuli }.
     *
     * Encoding trials (trial_type: 'new'):
     *   left_stimulus / right_stimulus  – stimulus objects
     *   shared_value   – $0 or $1 (participant only learns the value of
     *     whichever card they choose)
     *
     * Retrieval trials (trial_type: 'old'):
     *   source_trial_number  – the new trial whose chosen card reappears here
     *   delay                – trial_number - source_trial_number
     *   lure_stimulus / lure_value  – the brand-new companion card
     *   old_side  – 'left' or 'right'; assigned by assignBalancedOldSide so
     *     that, within each bin, left/right is balanced (26/26)
     *   fallback_side  – random side used only if no choice was ever recorded
     *     for the source trial (e.g. a missed response)
     */
    function buildSequencePlan(params, metadataRows, randomFn = Math.random, participantId = "") {
        const rng = makeRandomHelpers(randomFn);
        const structures = window.SEQUENCE_STRUCTURES;
        if (!Array.isArray(structures) || structures.length === 0) {
            throw new Error("Sequence structures missing. Make sure sequences/sequences.js is loaded.");
        }

        if (!params.block_sizes || params.block_sizes.reduce((s, v) => s + v, 0) !== params.n_trials) {
            throw new Error(`block_sizes must sum to n_trials (${params.n_trials}).`);
        }
        if (params.old_trial_pct !== 0.5) {
            throw new Error("This planner currently expects old_trial_pct to be exactly 0.5.");
        }

        const structureIndex = hashString(String(participantId)) % structures.length;
        const structure = structures[structureIndex];
        const structTrials = structure.trials;

        const normalizedStimuli = normalizeStimulusRows(metadataRows, params);
        const groupedStimuli = { high: [], mid: [], low: [] };
        normalizedStimuli.forEach((stimulus) => {
            groupedStimuli[stimulus.memorability_bin].push(stimulus);
        });
        BIN_ORDER.forEach((bin) => {
            if (!groupedStimuli[bin] || groupedStimuli[bin].length === 0) {
                throw new Error(`No stimuli found for memorability bin "${bin}".`);
            }
            groupedStimuli[bin] = rng.shuffle(groupedStimuli[bin]);
        });

        BIN_ORDER.forEach((bin) => {
            const nNew = structTrials.filter(t => t.trial_type === 'new' && t.memorability_bin === bin).length;
            const nOld = structTrials.filter(t => t.trial_type === 'old' && t.memorability_bin === bin).length;
            const required = nNew * 2 + nOld;
            if (groupedStimuli[bin].length < required) {
                throw new Error(`Bin "${bin}" needs at least ${required} stimuli for this design, but found ${groupedStimuli[bin].length}.`);
            }
        });

        const cursor = { high: 0, mid: 0, low: 0 };
        const blockBoundaries = cumulativeBoundaries(params.block_sizes);
        function getBlockIndex(t) {
            for (let i = 0; i < blockBoundaries.length; i++) {
                if (t <= blockBoundaries[i]) return i + 1;
            }
            return blockBoundaries.length;
        }

        const trials = structTrials.map(st => {
            const block_index = getBlockIndex(st.trial_number);
            const bin = st.memorability_bin;

            if (st.trial_type === 'new') {
                const s1 = groupedStimuli[bin][cursor[bin]++];
                const s2 = groupedStimuli[bin][cursor[bin]++];
                return {
                    trial_number: st.trial_number,
                    block_index,
                    triplet_index: null,
                    trial_type: 'new',
                    memorability_bin: bin,
                    left_stimulus: s1,
                    right_stimulus: s2,
                    shared_value: st.shared_value,
                };
            }

            const lureStimulus = groupedStimuli[bin][cursor[bin]++];
            return {
                trial_number: st.trial_number,
                block_index,
                triplet_index: null,
                trial_type: 'old',
                memorability_bin: bin,
                source_trial_number: st.old_source_trial_number,
                delay: st.delay,
                old_side: null,   // assigned below by assignBalancedOldSide
                lure_stimulus: lureStimulus,
                lure_value: st.new_card_value,
                fallback_side: rng.sample(["left", "right"], 1)[0],
            };
        });

        assignBalancedOldSide(trials.filter(t => t.trial_type === 'old'), rng);

        const delays = trials.filter(t => t.trial_type === 'old').map(t => t.delay);
        if (delays.some(d => d < params.min_delay || d > params.max_delay)) {
            throw new Error(`Found an old-trial delay outside [${params.min_delay}, ${params.max_delay}].`);
        }

        return {
            trials,
            attention_checks: buildAttentionChecks(params, rng),
            preload_images: normalizedStimuli.map((stimulus) => stimulus.image_path),
            normalized_stimuli: normalizedStimuli,
            structure_index: structureIndex,
            structure_seed: structure.metadata ? structure.metadata.seed : null,
        };
    }

    function summarizePlan(plan) {
        const summary = {
            total_trials: plan.trials.length,
            by_type: {},
            by_bin_and_type: {},
            delay: { min: null, max: null, mean: null },
            new_trial_value_means: {},
            old_lure_value_means: {},
            block_sizes: {},
            attention_checks: plan.attention_checks.slice(),
        };

        const oldDelays = [];
        const newValuesByBin = { high: [], mid: [], low: [] };
        const lureValuesByBin = { high: [], mid: [], low: [] };

        plan.trials.forEach((trial) => {
            summary.by_type[trial.trial_type] = (summary.by_type[trial.trial_type] || 0) + 1;

            const key = `${trial.memorability_bin}_${trial.trial_type}`;
            summary.by_bin_and_type[key] = (summary.by_bin_and_type[key] || 0) + 1;
            summary.block_sizes[trial.block_index] = (summary.block_sizes[trial.block_index] || 0) + 1;

            if (trial.trial_type === "new") {
                newValuesByBin[trial.memorability_bin].push(trial.shared_value);
            } else {
                oldDelays.push(trial.delay);
                lureValuesByBin[trial.memorability_bin].push(trial.lure_value);
            }
        });

        if (oldDelays.length > 0) {
            summary.delay = {
                min: Math.min(...oldDelays),
                max: Math.max(...oldDelays),
                mean: oldDelays.reduce((sum, value) => sum + value, 0) / oldDelays.length,
            };
        }

        BIN_ORDER.forEach((bin) => {
            summary.new_trial_value_means[bin] = mean(newValuesByBin[bin]);
            summary.old_lure_value_means[bin] = mean(lureValuesByBin[bin]);
        });

        return summary;
    }

    window.EpisodicChoiceSequence = {
        BIN_ORDER,
        clamp,
        makeRandomHelpers,
        buildSequencePlan,
        summarizePlan,
    };
})();
