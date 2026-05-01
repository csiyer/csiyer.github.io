if (typeof CanvasRenderingContext2D.prototype.roundRect !== "function") {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
        const r = typeof radius === "number"
            ? { tl: radius, tr: radius, br: radius, bl: radius }
            : Object.assign({ tl: 0, tr: 0, br: 0, bl: 0 }, radius);
        this.beginPath();
        this.moveTo(x + r.tl, y);
        this.lineTo(x + width - r.tr, y);
        this.quadraticCurveTo(x + width, y, x + width, y + r.tr);
        this.lineTo(x + width, y + height - r.br);
        this.quadraticCurveTo(x + width, y + height, x + width - r.br, y + height);
        this.lineTo(x + r.bl, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - r.bl);
        this.lineTo(x, y + r.tl);
        this.quadraticCurveTo(x, y, x + r.tl, y);
        this.closePath();
        return this;
    };
}

const IMAGE_CACHE = {};
const TASK_STATE = {
    plan: null,
    currentTrial: null,
    sourceChoiceByTrial: new Map(),
    bonusSummary: null,
};

function initTask(jsPsych, subject_id) {
    const timeline = [];
    const stimulusRows = loadStimulusMetadata();
    const plan = EpisodicChoiceSequence.buildSequencePlan(params, stimulusRows);
    const summary = EpisodicChoiceSequence.summarizePlan(plan);

    TASK_STATE.plan = plan;

    jsPsych.data.addProperties({
        experiment_id: params.experiment_id,
        subject_id: subject_id,
        participant_id: subject_id,
        possible_values: JSON.stringify(params.possible_values),
        old_trial_pct: params.old_trial_pct,
        min_delay: params.min_delay,
        max_delay: params.max_delay,
        planned_trials: params.n_trials,
        planned_blocks: JSON.stringify(params.block_sizes),
        sequence_summary: JSON.stringify(summary),
        data_pipe_id: params.data_pipe_id,
        osf_project_id: params.osf_project_id,
        osf_component_id: params.osf_component_id,
        task_params: JSON.stringify(params),
    });

    timeline.push({
        type: jsPsychPreload,
        images: plan.preload_images,
        message: "Loading card images...",
        on_finish: function () {
            plan.preload_images.forEach((path) => {
                const img = new Image();
                img.src = path;
                IMAGE_CACHE[path] = img;
            });
        }
    });

    timeline.push({
        type: jsPsychFullscreen,
        fullscreen_mode: true,
        message: `<div class="instruction-container">
            <h2>Welcome</h2>
            <p>This study takes about <strong>${params.completion_time} minutes</strong>.</p>
            <p>You will earn a base payment of <strong>$${params.base_pay}</strong>, plus a bonus of up to <strong>$${params.max_bonus}</strong>.</p>
            <p>Please note that you are participating in a scientific study. Your responses will be a huge help for our research, so we ask you give the study your best effort and attention. Thank you!</p>
        </div>`,
        button_label: "Enter fullscreen & begin"
    });

    timeline.push({
        type: jsPsychInstructions,
        pages: params.instruction_pages,
        show_clickable_nav: true,
        button_label_next: "Next",
        button_label_previous: "Back"
    });

    timeline.push(buildBlankCanvasTrial(params.iti));

    plan.trials.forEach((trialSpec) => {
        timeline.push(buildChoiceTrial(jsPsych, trialSpec));
        timeline.push(buildFeedbackTrial(jsPsych));
        timeline.push(buildBlankCanvasTrial(params.iti));

        const attentionCheck = plan.attention_checks.find((check) => check.after_trial_number === trialSpec.trial_number);
        if (attentionCheck) {
            timeline.push(buildAttentionCheckTrial(attentionCheck));
        }

        if (trialSpec.trial_number === params.block_sizes[0] || trialSpec.trial_number === params.block_sizes[0] + params.block_sizes[1]) {
            timeline.push(buildBreakTrial());
        }
    });

    timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus: function () {
            const bonusSummary = getBonusSummary(jsPsych);
            return `<div class="instruction-container">
                <h2>Finished!</h2>
                <p>We sampled <strong>${bonusSummary.sampledTrials.length}</strong> old-card trials for your bonus.</p>
                <p>Your sampled total was <strong>${formatCurrency(bonusSummary.sampledReward)}</strong>.</p>
                <p>Your bonus will be <strong>$${bonusSummary.bonus.toFixed(2)}</strong>.</p>
                <p>Your final pay will be <strong>$${(params.base_pay + bonusSummary.bonus).toFixed(2)}</strong>.</p>
                <p>Thank you for your participation!</p>
            </div>`;
        },
        choices: ["Submit data & end experiment"],
        on_finish: function (data) {
            const bonusSummary = getBonusSummary(jsPsych);
            data.is_summary = true;
            data.sampled_old_trial_numbers = JSON.stringify(bonusSummary.sampledTrialNumbers);
            data.sampled_old_rewards = JSON.stringify(bonusSummary.sampledRewards);
            data.sampled_old_total = bonusSummary.sampledReward.toFixed(2);
            data.final_bonus = bonusSummary.bonus.toFixed(2);
        }
    });

    timeline.push({
        type: jsPsychPipe,
        action: "save",
        experiment_id: params.data_pipe_id,
        filename: `${subject_id}.csv`,
        data_string: function () {
            return jsPsych.data.get().csv();
        },
        on_finish: function () {
            window.location.href = "https://app.prolific.com/submissions/complete?cc=" + params.prolific_completion_code;
        }
    });

    jsPsych.run(timeline);
}

function buildChoiceTrial(jsPsych, trialSpec) {
    return {
        type: jsPsychCanvasKeyboardResponse,
        canvas_size: [850, 1200],
        choices: ["arrowleft", "arrowright"],
        trial_duration: params.stimulus_time,
        data: {
            phase: "choice",
            is_choice_trial: true,
        },
        on_start: function () {
            TASK_STATE.currentTrial = materializeRuntimeTrial(trialSpec);
        },
        stimulus: function (canvas) {
            const ctx = canvas.getContext("2d");
            drawChoiceDisplay(ctx, TASK_STATE.currentTrial);
        },
        on_finish: function (data) {
            const trial = TASK_STATE.currentTrial;
            const responseKey = (data.response || "").toLowerCase();
            data.response_key = responseKey || null;

            Object.assign(data, {
                trial_number: trial.trial_number,
                block_index: trial.block_index,
                triplet_index: trial.triplet_index,
                trial_type: trial.trial_type,
                old_trial: trial.trial_type === "old" ? 1 : 0,
                memorability_bin: trial.memorability_bin,
                encoding_trial: trial.source_trial_number,
                delay: trial.delay,
                old_side: trial.old_side,
                old_value: trial.trial_type === "old" ? (trial.old_side === "left" ? trial.left.value : trial.right.value) : null,
                repeat_source_was_chosen: trial.repeat_source_was_chosen,
                repeat_source_fallback_side: trial.repeat_source_fallback_side,
                left_image_name: trial.left.image_name,
                left_image_path: trial.left.image_path,
                left_memorability: trial.left.things_memorability,
                left_value: trial.left.value,
                left_is_old: trial.left.is_old,
                right_image_name: trial.right.image_name,
                right_image_path: trial.right.image_path,
                right_memorability: trial.right.things_memorability,
                right_value: trial.right.value,
                right_is_old: trial.right.is_old,
                timestamp: new Date().toISOString(),
            });

            if (!responseKey) {
                const autoChosenSide = jsPsych.randomization.sampleWithoutReplacement(["left", "right"], 1)[0];
                const autoChosenCard = trial[autoChosenSide];

                data.chosen_side = autoChosenSide;
                data.chosen_image_name = autoChosenCard.image_name;
                data.chosen_image_path = autoChosenCard.image_path;
                data.chosen_value = autoChosenCard.value;
                data.reward = autoChosenCard.value;
                data.response = autoChosenSide;
                data.old_chosen = trial.trial_type === "old" ? Number(autoChosenCard.is_old) : null;
                data.did_choose_old = trial.trial_type === "old" ? Number(autoChosenCard.is_old) : null;
                data.choice_missed = true;
                data.auto_chosen = true;
                data.outcome = autoChosenCard.value;
                data.optimal_choice = computeOptimalChoice(trial, autoChosenSide);

                if (trial.trial_type === "new") {
                    TASK_STATE.sourceChoiceByTrial.set(trial.trial_number, {
                        chosen_side: autoChosenSide,
                        card: autoChosenCard,
                    });
                }
                return;
            }

            const chosenSide = responseKey === "arrowleft" ? "left" : "right";
            const chosenCard = trial[chosenSide];

            data.chosen_side = chosenSide;
            data.chosen_image_name = chosenCard.image_name;
            data.chosen_image_path = chosenCard.image_path;
            data.chosen_value = chosenCard.value;
            data.reward = chosenCard.value;
            data.response = chosenSide;
            data.choice_missed = false;
            data.auto_chosen = false;
            data.old_chosen = trial.trial_type === "old" ? Number(chosenCard.is_old) : null;
            data.did_choose_old = trial.trial_type === "old" ? Number(chosenCard.is_old) : null;
            data.outcome = chosenCard.value;
            data.optimal_choice = computeOptimalChoice(trial, chosenSide);

            if (trial.trial_type === "new") {
                TASK_STATE.sourceChoiceByTrial.set(trial.trial_number, {
                    chosen_side: chosenSide,
                    card: chosenCard,
                });
            }
        }
    };
}

function buildFeedbackTrial(jsPsych) {
    return {
        type: jsPsychCanvasKeyboardResponse,
        canvas_size: [850, 1200],
        choices: "NO_KEYS",
        trial_duration: params.feedback_time,
        stimulus: function (canvas) {
            const ctx = canvas.getContext("2d");
            const lastData = jsPsych.data.get().last(1).values()[0];
            drawFeedbackDisplay(ctx, TASK_STATE.currentTrial, lastData);
        }
    };
}

function buildAttentionCheckTrial(attentionCheck) {
    const label = attentionCheck.correct_key === "arrowup" ? "UP" : "DOWN";
    return {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="instruction-container" style="text-align: center;">
            <h2>ATTENTION CHECK</h2>
            <p>Press the <strong>${label}</strong> key.</p>
        </div>`,
        choices: ["arrowup", "arrowdown"],
        data: {
            is_attention_check: true,
            correct_key: attentionCheck.correct_key,
            after_trial_number: attentionCheck.after_trial_number,
        },
        on_finish: function (data) {
            data.response_key = (data.response || "").toLowerCase();
            data.success = data.response_key === attentionCheck.correct_key;
        }
    };
}

function buildBreakTrial() {
    return {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="instruction-container" style="text-align: center;">
            <h2>Break</h2>
            <p>Click space bar to continue, or it will continue automatically in 20 seconds.</p>
        </div>`,
        choices: [" "],
        trial_duration: params.break_duration,
    };
}

function materializeRuntimeTrial(trialSpec) {
    if (trialSpec.trial_type === "new") {
        return {
            trial_number: trialSpec.trial_number,
            block_index: trialSpec.block_index,
            triplet_index: trialSpec.triplet_index,
            trial_type: "new",
            memorability_bin: trialSpec.memorability_bin,
            source_trial_number: null,
            delay: null,
            old_side: null,
            repeat_source_was_chosen: null,
            repeat_source_fallback_side: null,
            left: buildCardFromStimulus(trialSpec.left_stimulus, trialSpec.shared_value, false),
            right: buildCardFromStimulus(trialSpec.right_stimulus, trialSpec.shared_value, false),
        };
    }

    const sourceTrialSpec = TASK_STATE.plan.trials.find((trial) => trial.trial_number === trialSpec.source_trial_number);
    const recordedChoice = TASK_STATE.sourceChoiceByTrial.get(trialSpec.source_trial_number);
    const fallbackSide = trialSpec.repeat_source_fallback_side || trialSpec.fallback_side;
    const repeatedCard = recordedChoice
        ? recordedChoice.card
        : buildCardFromStimulus(
            fallbackSide === "left" ? sourceTrialSpec.left_stimulus : sourceTrialSpec.right_stimulus,
            sourceTrialSpec.shared_value,
            true
        );

    const repeatedCardCopy = Object.assign({}, repeatedCard, { is_old: true });
    const lureCard = buildCardFromStimulus(trialSpec.lure_stimulus, trialSpec.lure_value, false);
    const left = trialSpec.old_side === "left" ? repeatedCardCopy : lureCard;
    const right = trialSpec.old_side === "right" ? repeatedCardCopy : lureCard;

    return {
        trial_number: trialSpec.trial_number,
        block_index: trialSpec.block_index,
        triplet_index: trialSpec.triplet_index,
        trial_type: "old",
        memorability_bin: trialSpec.memorability_bin,
        source_trial_number: trialSpec.source_trial_number,
        delay: trialSpec.delay,
        old_side: trialSpec.old_side,
        repeat_source_was_chosen: Boolean(recordedChoice),
        repeat_source_fallback_side: recordedChoice ? null : fallbackSide,
        left: left,
        right: right,
    };
}

function buildCardFromStimulus(stimulus, value, isOld) {
    return {
        image_name: stimulus.image_name,
        image_path: stimulus.image_path,
        things_file_path: stimulus.things_file_path,
        things_memorability: Number(stimulus.things_memorability),
        things_category: stimulus.things_category,
        memorability_percentile: Number(stimulus.memorability_percentile),
        value: value,
        value_label: formatValue(value),
        is_old: isOld,
    };
}

function buildBlankCanvasTrial(duration) {
    return {
        type: jsPsychCanvasKeyboardResponse,
        canvas_size: [850, 1200],
        choices: "NO_KEYS",
        trial_duration: duration,
        stimulus: function (canvas) {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };
}

function drawChoiceDisplay(ctx, trial) {
    const dims = getCardLayout(ctx.canvas);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawCard(ctx, dims.leftX, dims.cardY, dims.cardWidth, dims.cardHeight, IMAGE_CACHE[trial.left.image_path]);
    drawCard(ctx, dims.rightX, dims.cardY, dims.cardWidth, dims.cardHeight, IMAGE_CACHE[trial.right.image_path]);
}

function drawFeedbackDisplay(ctx, trial, lastData) {
    const dims = getCardLayout(ctx.canvas);
    const total = params.feedback_time;
    const highlightDuration = Math.floor(total * 0.4);
    const flipDuration = Math.floor(total * 0.3);
    const revealDuration = total - highlightDuration - flipDuration;
    const chosenSide = lastData.chosen_side;

    const chosenCard = trial[chosenSide];
    const chosenX = chosenSide === "left" ? dims.leftX : dims.rightX;
    const startTime = performance.now();

    function animate(now) {
        const elapsed = now - startTime;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        if (elapsed < highlightDuration) {
            drawCard(ctx, chosenX, dims.cardY, dims.cardWidth, dims.cardHeight, IMAGE_CACHE[chosenCard.image_path], null, true);
        } else if (elapsed < highlightDuration + flipDuration) {
            const progress = (elapsed - highlightDuration) / flipDuration;
            if (progress < 0.5) {
                drawCard(ctx, chosenX, dims.cardY, dims.cardWidth, dims.cardHeight, IMAGE_CACHE[chosenCard.image_path], null, true, Math.max(0.02, 1 - progress * 2));
            } else {
                drawCard(ctx, chosenX, dims.cardY, dims.cardWidth, dims.cardHeight, IMAGE_CACHE[chosenCard.image_path], chosenCard.value_label, true, Math.max(0.02, (progress - 0.5) * 2));
            }
        } else {
            drawCard(ctx, chosenX, dims.cardY, dims.cardWidth, dims.cardHeight, IMAGE_CACHE[chosenCard.image_path], chosenCard.value_label, true);
        }

        if (elapsed < highlightDuration + flipDuration + revealDuration) {
            requestAnimationFrame(animate);
        }
    }

    requestAnimationFrame(animate);
}

function getCardLayout(canvas) {
    const cardWidth = 380;
    const cardHeight = 540;
    const spacing = 80;
    const leftX = canvas.width / 2 - cardWidth - spacing / 2;
    const rightX = canvas.width / 2 + spacing / 2;
    const cardY = canvas.height / 2 - cardHeight / 2;
    return { cardWidth, cardHeight, leftX, rightX, cardY };
}

function drawCard(ctx, x, y, width, height, image, valueLabel = null, isSelected = false, hScale = 1, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + width / 2, y + height / 2);
    ctx.scale(hScale, 1);
    ctx.translate(-width / 2, -height / 2);

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 22);
    ctx.fill();

    ctx.strokeStyle = params.card_color;
    ctx.lineWidth = isSelected ? 12 : 10;
    if (isSelected) {
        ctx.shadowBlur = 18;
        ctx.shadowColor = params.highlight_color;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    const innerGradient = ctx.createLinearGradient(0, 0, width, height);
    innerGradient.addColorStop(0, "#f3f4f5");
    innerGradient.addColorStop(1, "#e5e7ea");
    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    ctx.roundRect(24, 24, width - 48, height - 48, 16);
    ctx.fill();

    if (image && image.complete) {
        const padding = 34;
        const maxW = width - padding * 2;
        const maxH = height - padding * 2;
        const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight);
        const drawW = image.naturalWidth * scale;
        const drawH = image.naturalHeight * scale;
        ctx.drawImage(image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
    }

    if (valueLabel) {
        const boxW = 180;
        const boxH = 104;
        const boxX = (width - boxW) / 2;
        const boxY = (height - boxH) / 2;

        ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
        ctx.strokeStyle = params.card_color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 14);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#111111";
        ctx.font = "bold 54px Inter";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(valueLabel, width / 2, height / 2 + 2);
    }

    ctx.restore();
}

function loadStimulusMetadata() {
    const rows = window.STIMULI_METADATA;
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("Stimulus metadata is missing. Make sure ../../stimuli/stimulimetadata.js is loaded.");
    }
    return rows;
}

function getBonusSummary(jsPsych) {
    if (TASK_STATE.bonusSummary) {
        return TASK_STATE.bonusSummary;
    }

    const oldTrials = jsPsych.data.get().filterCustom((trial) => trial.is_choice_trial && trial.trial_type === "old").values();
    const sampleN = Math.min(params.bonus_sample_n, oldTrials.length);
    const rng = EpisodicChoiceSequence.makeRandomHelpers();
    const sampledTrials = sampleN > 0 ? rng.sample(oldTrials, sampleN) : [];

    sampledTrials.forEach((trial) => {
        trial.bonus_sampled = true;
    });

    const sampledRewards = sampledTrials.map((trial) => Number(trial.reward) || 0);
    const sampledReward = sampledRewards.reduce((sum, value) => sum + value, 0);
    const maxPossibleValue = Math.max(...params.possible_values);
    const denominator = sampleN * maxPossibleValue;
    const normalized = denominator > 0 ? sampledReward / denominator : 0;
    const bonus = EpisodicChoiceSequence.clamp(normalized * params.max_bonus, 0, params.max_bonus);

    TASK_STATE.bonusSummary = {
        sampledTrials,
        sampledTrialNumbers: sampledTrials.map((trial) => trial.trial_number),
        sampledRewards,
        sampledReward,
        bonus,
    };
    return TASK_STATE.bonusSummary;
}

function computeOptimalChoice(trial, chosenSide) {
    if (trial.trial_type !== "old") {
        return null;
    }

    const oldCard = trial.old_side === "left" ? trial.left : trial.right;
    const threshold = getOldValueThreshold(params.possible_values);
    if (oldCard.value === threshold) {
        return null;
    }

    const shouldChooseOld = oldCard.value > threshold;
    const didChooseOld = chosenSide === trial.old_side;
    return Number((shouldChooseOld && didChooseOld) || (!shouldChooseOld && !didChooseOld));
}

function getOldValueThreshold(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const midLeft = sorted[(sorted.length / 2) - 1];
    const midRight = sorted[sorted.length / 2];
    return (midLeft + midRight) / 2;
}

function formatValue(value) {
    if (value === 1 || value === 1.0) {
        return "$1";
    }
    return `${Math.round(value * 100)}¢`;
}

function formatCurrency(value) {
    return `$${Number(value).toFixed(2)}`;
}
