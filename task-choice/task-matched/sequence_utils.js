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

    // Assigns left_is_value1 to old trials so that, within each memorability bin,
    // left/right is balanced both on which side has the longer delay AND on which
    // side is $1 vs $0 -- these two balances are linked (left_longer === (left_is_value1
    // === value1IsLonger)), so splitting each "value1 is the longer delay" / "value0 is
    // the longer delay" subgroup exactly in half achieves both simultaneously. With 39
    // trials per bin the split can't be perfectly even (odd count), so this gets as close
    // as possible (off by at most 1 trial on one axis).
    function assignBalancedLeftRight(oldTrials, rng) {
        const byBin = {};
        oldTrials.forEach(t => {
            (byBin[t.memorability_bin] = byBin[t.memorability_bin] || []).push(t);
        });

        function assignHalfLeft(group) {
            const shuffled = rng.shuffle(group);
            const half = Math.floor(shuffled.length / 2);
            shuffled.forEach((t, idx) => {
                t.left_is_value1 = idx < half;
            });
        }

        Object.values(byBin).forEach(binTrials => {
            const value1Longer = binTrials.filter(t => t.delay_value1 > t.delay_value0);
            const value0Longer = binTrials.filter(t => t.delay_value0 > t.delay_value1);
            assignHalfLeft(value1Longer);
            assignHalfLeft(value0Longer);
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

    // ── Stimulus normalization ────────────────────────────────────────────────
    function normalizeStimulusRows(rows, params) {
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error("Stimulus metadata is missing or empty.");
        }
        return rows.map(row => {
            const relPath = row.image_path || `images/${row.image_name}`;
            return {
                image_name:              row.image_name,
                image_path:              `${params.stimuli_dir}/${relPath}`,
                relative_image_path:     relPath,
                things_file_path:        row.things_file_path,
                things_memorability:     Number(row.memorability_score ?? row.things_memorability),
                things_category:         row.things_category,
                memorability_percentile: Number(row.memorability_percentile),
                category27_label:        row.category27_label,
                category27_id:           Number(row.category27_id),
                concept_name:            row.concept_name || row.concept_id,
                memorability_bin:        row.memorability_bin,
            };
        });
    }

    // ── Main plan builder ─────────────────────────────────────────────────────
    /**
     * buildSequencePlan
     * -----------------
     * Loads one of the 10 precomputed structural solutions
     * (window.SEQUENCE_STRUCTURES, produced offline by
     * sequences/simulate_design.py's two-phase MILP), selected deterministically
     * per participant (hash of participantId mod length, so a page reload keeps
     * the same structure), and fills it in with randomly assigned concrete
     * images (per participant) and randomized left/right screen placement.
     *
     * The MILP guarantees, exactly:
     *   - 78 H/H + 78 L/L new (encoding) trials, each bin split 39 $1 / 39 $0
     *   - 78 old (retrieval) trials, always within-bin, always one $1 + one $0
     *     source, delay in [min_delay, max_delay]
     *   - identical delay-bucket histograms for $1-sources and $0-sources,
     *     identical between high-mem and low-mem old trials
     *   - exactly 39/39 split of which value condition has the longer delay
     *
     * Returns { trials, preload_images, normalized_stimuli }.
     *
     * Encoding trials (trial_type: 'new'):
     *   enc_type       – 'HH' or 'LL'
     *   left_stimulus / right_stimulus  – stimulus objects
     *   shared_value   – $0 or $1
     *
     * Retrieval trials (trial_type: 'old'):
     *   value1_source_trial_number / value0_source_trial_number
     *   delay_value1 / delay_value0
     *   left_is_value1  – whether left card is the $1 item; assigned by
     *     assignBalancedLeftRight so that, within each memorability bin, left/right
     *     is balanced both on which side is $1 vs $0 and on which side has the
     *     longer delay (as close to even as the odd bin size of 39 allows -- 19/20).
     */
    function buildSequencePlan(params, metadataRows, randomFn = Math.random, participantId = "") {
        const rng = makeRandomHelpers(randomFn);
        const structures = window.SEQUENCE_STRUCTURES;
        if (!Array.isArray(structures) || structures.length === 0) {
            throw new Error("Sequence structures missing. Make sure sequences/sequences.js is loaded.");
        }
        const structureIndex = hashString(String(participantId)) % structures.length;
        const structure = structures[structureIndex];

        const normalizedStimuli = normalizeStimulusRows(metadataRows, params);
        const highStim = rng.shuffle(normalizedStimuli.filter(s => s.memorability_bin === 'high'));
        const lowStim  = rng.shuffle(normalizedStimuli.filter(s => s.memorability_bin === 'low'));

        const structTrials = structure.trials;
        const newStructTrials = structTrials.filter(t => t.trial_type === 'new');
        const nHH = newStructTrials.filter(t => t.memorability_bin === 'high').length;
        const nLL = newStructTrials.filter(t => t.memorability_bin === 'low').length;

        if (highStim.length < nHH * 2 || lowStim.length < nLL * 2) {
            throw new Error("Not enough high or low-mem stimuli to fill the precomputed sequence structure.");
        }

        let highCursor = 0, lowCursor = 0;
        const blockBoundaries = params.block_trial_boundaries;
        function getBlockIndex(t) {
            if (t <= blockBoundaries[0]) return 1;
            if (t <= blockBoundaries[1]) return 2;
            return 3;
        }

        const trials = structTrials.map(st => {
            const block_index = getBlockIndex(st.trial_number);
            if (st.trial_type === 'new') {
                const isHigh = st.memorability_bin === 'high';
                const s1 = isHigh ? highStim[highCursor++] : lowStim[lowCursor++];
                const s2 = isHigh ? highStim[highCursor++] : lowStim[lowCursor++];
                const leftIsFirst = rng.random() < 0.5;
                return {
                    trial_number:   st.trial_number,
                    block_index,
                    trial_type:     'new',
                    enc_type:       isHigh ? 'HH' : 'LL',
                    memorability_bin: st.memorability_bin,
                    left_stimulus:  leftIsFirst ? s1 : s2,
                    right_stimulus: leftIsFirst ? s2 : s1,
                    shared_value:   st.shared_value,
                };
            }
            return {
                trial_number:               st.trial_number,
                block_index,
                trial_type:                 'old',
                memorability_bin:           st.memorability_bin,
                value1_source_trial_number: st.value1_source_trial_number,
                value0_source_trial_number: st.value0_source_trial_number,
                delay_value1:               st.delay_value1,
                delay_value0:               st.delay_value0,
                left_is_value1:             null,   // assigned below by assignBalancedLeftRight
            };
        });

        assignBalancedLeftRight(trials.filter(t => t.trial_type === 'old'), rng);

        return {
            trials,
            preload_images:     normalizedStimuli.map(s => s.image_path),
            normalized_stimuli: normalizedStimuli,
            structure_index:    structureIndex,
            structure_seed:     structure.metadata ? structure.metadata.seed : null,
        };
    }

    // ── Exports ───────────────────────────────────────────────────────────────
    window.EpisodicChoiceSequence = {
        clamp,
        makeRandomHelpers,
        buildSequencePlan,
    };
})();
