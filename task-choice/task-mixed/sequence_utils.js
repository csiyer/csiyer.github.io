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

    // Assigns left_is_high to old trials so that, within each retrieval_type x
    // "which side has the longer delay" group, left/right is balanced. Because
    // retrieval_type fixes h_value/l_value, and each group here is split further
    // by which side is longer, this balances left/right simultaneously against
    // value and delay-length -- same spirit as the matched-memorability
    // assignBalancedLeftRight, generalized to 4 retrieval types instead of a
    // single (bin, value) pairing. Group sizes are small (roughly 5-10), so the
    // split can be off by at most 1 trial per group.
    function assignBalancedLeftRight(oldTrials, rng) {
        const groups = {};
        oldTrials.forEach(t => {
            const highLonger = t.delay_h > t.delay_l;
            const key = `${t.ret_type}_${highLonger}`;
            (groups[key] = groups[key] || []).push(t);
        });

        Object.values(groups).forEach(group => {
            const shuffled = rng.shuffle(group);
            const half = Math.floor(shuffled.length / 2);
            shuffled.forEach((t, idx) => {
                t.left_is_high = idx < half;
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

    // Numeric ret_type codes retained for backward-compat with existing analysis
    // scripts (analysis/analysis.R / .ipynb expect 1-4):
    //   1: H=$0, L=$1     2: H=$1, L=$0     3: both $0     4: both $1
    const RET_TYPE_CODES = {
        uneven_h0: 1,
        uneven_h1: 2,
        even_0:    3,
        even_1:    4,
    };

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
     * sequences/build_sequences.py's two-phase MILP), selected deterministically
     * per participant (hash of participantId mod length, so a page reload keeps
     * the same structure), and fills it in with randomly assigned concrete
     * images (per participant) and randomized left/right screen placement.
     *
     * The MILP guarantees, exactly:
     *   - 78 high-mem + 78 low-mem new (encoding) trials, each split 39 $1 / 39 $0
     *   - 78 old (retrieval) trials, always cross-bin (one high-mem source + one
     *     low-mem source): 20 even_1 (both $1) + 20 even_0 (both $0) +
     *     19 uneven_h1 (high=$1/low=$0) + 19 uneven_h0 (high=$0/low=$1)
     *   - identical delay-bucket histograms for the high-mem source and the
     *     low-mem source, within each of the "even" and "uneven" groups
     *   - exactly 19/19 split (within uneven trials) of which value has the
     *     longer delay, and 20/20 split (within even trials) of which
     *     memorability side has the longer delay
     *   - no run of >3 consecutive same-bin new trials (old trials, always
     *     showing one high + one low card, break any run)
     *   - no run of >8 consecutive same trial_type (old/new) trials
     *
     * Returns { trials, preload_images, normalized_stimuli }.
     *
     * Encoding trials (trial_type: 'new'):
     *   enc_type       – 'HH' or 'LL'
     *   left_stimulus / right_stimulus  – stimulus objects
     *   shared_value   – $0 or $1
     *
     * Retrieval trials (trial_type: 'old'):
     *   ret_type                – 1-4 (see RET_TYPE_CODES above)
     *   source_hh_trial_number / source_ll_trial_number
     *   h_value / l_value
     *   delay_h / delay_l
     *   left_is_high  – whether left card is the high-mem item; assigned by
     *     assignBalancedLeftRight so that, within each retrieval type, left/right
     *     is balanced against which side has the longer delay.
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
        const nHigh = newStructTrials.filter(t => t.memorability_bin === 'high').length;
        const nLow  = newStructTrials.filter(t => t.memorability_bin === 'low').length;

        if (highStim.length < nHigh * 2 || lowStim.length < nLow * 2) {
            throw new Error("Not enough high or low-mem stimuli to fill the precomputed sequence structure.");
        }

        // Each 'new' structure entry is one HH/LL encoding trial, consuming 2
        // same-bin stimuli (shown together, sharing one value).
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
                    trial_number:     st.trial_number,
                    block_index,
                    trial_type:       'new',
                    enc_type:         isHigh ? 'HH' : 'LL',
                    memorability_bin: st.memorability_bin,
                    left_stimulus:    leftIsFirst ? s1 : s2,
                    right_stimulus:   leftIsFirst ? s2 : s1,
                    shared_value:     st.shared_value,
                };
            }
            return {
                trial_number:            st.trial_number,
                block_index,
                trial_type:              'old',
                ret_type:                RET_TYPE_CODES[st.retrieval_type],
                retrieval_type:          st.retrieval_type,
                source_hh_trial_number:  st.high_source_trial_number,
                source_ll_trial_number:  st.low_source_trial_number,
                h_value:                 st.value_high,
                l_value:                 st.value_low,
                delay_h:                 st.delay_high,
                delay_l:                 st.delay_low,
                left_is_high:            null,   // assigned below by assignBalancedLeftRight
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
