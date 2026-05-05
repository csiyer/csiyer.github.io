(function () {
    const BIN_ORDER = ["high", "mid", "low"];
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

    function decimalScale(values) {
        const decimals = values.map((value) => {
            const text = String(value);
            const dot = text.indexOf(".");
            return dot === -1 ? 0 : text.length - dot - 1;
        });
        return 10 ** Math.max(0, ...decimals);
    }

    function findClosestRemainderCombo(valuesInt, remainder, targetSum) {
        let bestCombo = null;
        let bestDistance = Infinity;

        function recurse(startIndex, remainingCount, remainingTarget, current) {
            if (remainingCount === 0) {
                const distance = Math.abs(remainingTarget);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestCombo = current.slice();
                }
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
        if (n <= 0) {
            return [];
        }

        const sortedValues = possibleValues.slice().sort((a, b) => a - b);
        const k = sortedValues.length;
        const baseCount = Math.floor(n / k);
        const remainder = n % k;
        const counts = Array(k).fill(baseCount);

        if (remainder > 0) {
            const scale = decimalScale(sortedValues);
            const scaledValues = sortedValues.map((value) => Math.round(value * scale));
            const targetMean = mean(sortedValues);
            const targetExtraSum = Math.round(remainder * targetMean * scale);
            const extraCombo = findClosestRemainderCombo(scaledValues, remainder, targetExtraSum);

            if (!extraCombo) {
                throw new Error("Unable to build a balanced value list for the requested trial count.");
            }

            extraCombo.forEach((index) => {
                counts[index] += 1;
            });
        }

        const expanded = [];
        counts.forEach((count, index) => {
            for (let i = 0; i < count; i++) {
                expanded.push(sortedValues[index]);
            }
        });

        return rng.shuffle(expanded);
    }

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

    function validatePlannerInputs(params, groupedStimuli) {
        if (params.n_trials % 3 !== 0) {
            throw new Error("n_trials must be divisible by 3 so each triplet can contain high, mid, and low trials.");
        }

        if (!Array.isArray(params.block_sizes) || params.block_sizes.length === 0) {
            throw new Error("block_sizes must be provided.");
        }

        const totalBlockTrials = params.block_sizes.reduce((sum, size) => sum + size, 0);
        if (totalBlockTrials !== params.n_trials) {
            throw new Error(`block_sizes sum to ${totalBlockTrials}, but n_trials is ${params.n_trials}.`);
        }

        if (params.block_sizes.some((size) => size % 3 !== 0)) {
            throw new Error("Each block size must be divisible by 3 so no high/mid/low triplet is split by a break.");
        }

        if (params.old_trial_pct !== 0.5) {
            throw new Error("This planner currently expects old_trial_pct to be exactly 0.5.");
        }

        const triplets = params.n_trials / 3;
        if (triplets % 2 !== 0) {
            throw new Error("The number of triplets must be even to split each memorability bin evenly into old and new trials.");
        }

        BIN_ORDER.forEach((bin) => {
            if (!groupedStimuli[bin] || groupedStimuli[bin].length === 0) {
                throw new Error(`No stimuli found for memorability bin "${bin}".`);
            }
        });
    }

    function buildTripletOrders(nTriplets, rng) {
        return Array.from({ length: nTriplets }, () => rng.shuffle(BIN_ORDER));
    }

    function buildAttentionChecks(params, rng) {
        const checks = [];
        const attentionKeys = "abcdefghijklmnopqrstuvwxyz"
            .split("")
            .filter((key) => key !== "j" && key !== "k");
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

    function solveBinTrialAssignments(binTrialNumbers, params, rng) {
        const failedStates = new Set();

        function stateKey(position, openSources) {
            return `${position}|${openSources.join(",")}`;
        }

        function recurse(position, openSources) {
            if (position === binTrialNumbers.length) {
                return openSources.length === 0 ? [] : null;
            }

            const currentTrialNumber = binTrialNumbers[position];
            if (openSources.some((sourceTrialNumber) => currentTrialNumber - sourceTrialNumber > params.max_delay)) {
                return null;
            }

            const remainingCount = binTrialNumbers.length - position;
            if (openSources.length > remainingCount) {
                return null;
            }

            const key = stateKey(position, openSources);
            if (failedStates.has(key)) {
                return null;
            }

            const eligibleSources = openSources.filter(
                (sourceTrialNumber) =>
                    currentTrialNumber - sourceTrialNumber >= params.min_delay &&
                    currentTrialNumber - sourceTrialNumber <= params.max_delay
            );

            const branchOrder = rng.shuffle(["new", "old"]);

            for (const branch of branchOrder) {
                if (branch === "old" && eligibleSources.length > 0) {
                    const sourceOrder = rng.shuffle(eligibleSources);
                    for (const sourceTrialNumber of sourceOrder) {
                        const nextOpen = openSources.filter((value) => value !== sourceTrialNumber);
                        const remainder = recurse(position + 1, nextOpen);
                        if (remainder) {
                            return [{
                                trial_number: currentTrialNumber,
                                trial_type: "old",
                                source_trial_number: sourceTrialNumber,
                            }].concat(remainder);
                        }
                    }
                }

                if (branch === "new") {
                    const nextOpen = openSources.concat([currentTrialNumber]).sort((a, b) => a - b);
                    const remainder = recurse(position + 1, nextOpen);
                    if (remainder) {
                        return [{
                            trial_number: currentTrialNumber,
                            trial_type: "new",
                            source_trial_number: null,
                        }].concat(remainder);
                    }
                }
            }

            failedStates.add(key);
            return null;
        }

        const solution = recurse(0, []);
        if (!solution) {
            throw new Error("Unable to assign old/new trial roles within the requested delay window.");
        }
        return solution;
    }

    function buildSequencePlan(params, metadataRows, randomFn = Math.random) {
        const rng = makeRandomHelpers(randomFn);
        const normalizedStimuli = normalizeStimulusRows(metadataRows, params);
        const groupedStimuli = { high: [], mid: [], low: [] };

        normalizedStimuli.forEach((stimulus) => {
            groupedStimuli[stimulus.memorability_bin].push(stimulus);
        });

        validatePlannerInputs(params, groupedStimuli);

        const nTriplets = params.n_trials / 3;
        const nOldPerBin = nTriplets / 2;
        const nNewPerBin = nTriplets / 2;
        const tripletOrders = buildTripletOrders(nTriplets, rng);
        const sourcePayloads = {};
        const oldPayloads = {};

        const trials = [];

        tripletOrders.forEach((binOrder, tripletIndex) => {
            binOrder.forEach((bin) => {
                const trial = {
                    trial_number: trials.length + 1,
                    triplet_index: tripletIndex,
                    memorability_bin: bin,
                    trial_type: null,
                    left_stimulus: null,
                    right_stimulus: null,
                    shared_value: null,
                    source_index: null,
                    source_triplet_index: null,
                    lure_stimulus: null,
                    lure_value: null,
                    old_side: null,
                    fallback_side: null,
                    source_trial_number: null,
                    delay: null,
                    block_index: null,
                };

                trials.push(trial);
            });
        });

        BIN_ORDER.forEach((bin) => {
            const binTrials = trials.filter((trial) => trial.memorability_bin === bin);
            const binTrialNumbers = binTrials.map((trial) => trial.trial_number);
            const assignments = solveBinTrialAssignments(binTrialNumbers, params, rng);
            const assignmentByTrialNumber = new Map(assignments.map((assignment) => [assignment.trial_number, assignment]));

            const shuffledStimuli = rng.shuffle(groupedStimuli[bin]);
            const requiredStimuli = nNewPerBin * 2 + nOldPerBin;
            if (shuffledStimuli.length < requiredStimuli) {
                throw new Error(
                    `Bin "${bin}" needs at least ${requiredStimuli} stimuli for this design, but found ${shuffledStimuli.length}.`
                );
            }
            const selectedStimuli = shuffledStimuli.slice(0, requiredStimuli);

            const sourceValues = buildBalancedValueList(nNewPerBin, params.possible_values, rng);
            const lureValues = buildBalancedValueList(nOldPerBin, params.possible_values, rng);
            const nLeftOld = Math.floor(nOldPerBin / 2);
            const nRightOld = nOldPerBin - nLeftOld;
            const oldSides = rng.shuffle(
                Array(nLeftOld).fill("left").concat(Array(nRightOld).fill("right"))
            );

            sourcePayloads[bin] = new Map();
            oldPayloads[bin] = new Map();

            const newTrialNumbers = assignments
                .filter((assignment) => assignment.trial_type === "new")
                .map((assignment) => assignment.trial_number)
                .sort((a, b) => a - b);
            const oldAssignments = assignments
                .filter((assignment) => assignment.trial_type === "old")
                .sort((a, b) => a.trial_number - b.trial_number);

            newTrialNumbers.forEach((trialNumber, sourceIndex) => {
                sourcePayloads[bin].set(trialNumber, {
                    trial_type: "new",
                    memorability_bin: bin,
                    left_stimulus: selectedStimuli[sourceIndex * 2],
                    right_stimulus: selectedStimuli[sourceIndex * 2 + 1],
                    shared_value: sourceValues[sourceIndex],
                    source_index: sourceIndex,
                });
            });

            oldAssignments.forEach((assignment, oldIndex) => {
                oldPayloads[bin].set(assignment.trial_number, {
                    trial_type: "old",
                    memorability_bin: bin,
                    source_trial_number: assignment.source_trial_number,
                    lure_stimulus: selectedStimuli[nNewPerBin * 2 + oldIndex],
                    lure_value: lureValues[oldIndex],
                    old_side: oldSides[oldIndex],
                    fallback_side: rng.sample(["left", "right"], 1)[0],
                    old_index: oldIndex,
                });
            });
        });

        let blockRunningTotal = 0;
        let blockIndex = 0;
        params.block_sizes.forEach((size, index) => {
            const blockStart = blockRunningTotal + 1;
            const blockEnd = blockRunningTotal + size;
            for (let trialNumber = blockStart; trialNumber <= blockEnd; trialNumber++) {
                trials[trialNumber - 1].block_index = index + 1;
            }
            blockRunningTotal = blockEnd;
            blockIndex = index + 1;
        });

        trials.forEach((trial) => {
            const payload = sourcePayloads[trial.memorability_bin].get(trial.trial_number)
                || oldPayloads[trial.memorability_bin].get(trial.trial_number);

            if (!payload) {
                throw new Error(`Missing payload for trial ${trial.trial_number} (${trial.memorability_bin}).`);
            }

            Object.assign(trial, payload);

            if (trial.trial_type === "old") {
                trial.delay = trial.trial_number - trial.source_trial_number;
            }
        });

        const delays = trials.filter((trial) => trial.trial_type === "old").map((trial) => trial.delay);
        if (delays.some((delay) => delay < params.min_delay || delay > params.max_delay)) {
            throw new Error(`Found an old-trial delay outside [${params.min_delay}, ${params.max_delay}].`);
        }

        if (trials.slice(0, params.min_delay).some((trial) => trial.trial_type === "old")) {
            throw new Error("An old trial was scheduled before the minimum delay window had elapsed.");
        }

        const attentionChecks = buildAttentionChecks(params, rng);

        return {
            trials,
            attention_checks: attentionChecks,
            preload_images: normalizedStimuli.map((stimulus) => stimulus.image_path),
            normalized_stimuli: normalizedStimuli,
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
        buildBalancedValueList,
        buildSequencePlan,
        summarizePlan,
    };
})();
