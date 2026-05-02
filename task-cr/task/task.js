// ─── Polyfill ────────────────────────────────────────────────────────────────
if (typeof CanvasRenderingContext2D.prototype.roundRect !== "function") {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        const R = typeof r === "number"
            ? { tl: r, tr: r, br: r, bl: r }
            : Object.assign({ tl: 0, tr: 0, br: 0, bl: 0 }, r);
        this.beginPath();
        this.moveTo(x + R.tl, y);
        this.lineTo(x + w - R.tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + R.tr);
        this.lineTo(x + w, y + h - R.br);
        this.quadraticCurveTo(x + w, y + h, x + w - R.br, y + h);
        this.lineTo(x + R.bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - R.bl);
        this.lineTo(x, y + R.tl);
        this.quadraticCurveTo(x, y, x + R.tl, y);
        this.closePath();
        return this;
    };
}

// ─── State ───────────────────────────────────────────────────────────────────
const IMAGE_CACHE = {};
const TASK_STATE = {
    plan: null,
    currentTrial: null,
    lastChosenSide: null,
    responseMade: false,
};

// ─── Card drawing ─────────────────────────────────────────────────────────────
function getCardLayout(canvas) {
    const cardSize = 440;
    const gap = 80;
    const leftX = canvas.width / 2 - cardSize - gap / 2;
    const rightX = canvas.width / 2 + gap / 2;
    const cardY = (canvas.height - cardSize) / 2;
    return { cardSize, leftX, rightX, cardY };
}

function drawObjectCard(ctx, x, y, size, objImage) {
    const blankImg = IMAGE_CACHE[`${params.feedback_dir}/blank.jpeg`];
    if (blankImg && blankImg.complete) {
        ctx.drawImage(blankImg, x, y, size, size);
    } else {
        ctx.fillStyle = "#d0d3d7";
        ctx.fillRect(x, y, size, size);
    }

    if (objImage && objImage.complete) {
        const pad = size * 0.14;
        const maxW = size - pad * 2;
        const maxH = size - pad * 2;
        const scale = Math.min(maxW / objImage.naturalWidth, maxH / objImage.naturalHeight);
        const dw = objImage.naturalWidth * scale;
        const dh = objImage.naturalHeight * scale;
        ctx.drawImage(objImage, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
    }
}

function drawHighlightBorder(ctx, x, y, size) {
    const pad = 7;
    ctx.save();
    ctx.strokeStyle = params.highlight_color;
    ctx.lineWidth = 6;
    ctx.shadowBlur = 20;
    ctx.shadowColor = params.highlight_color;
    ctx.beginPath();
    ctx.roundRect(x - pad, y - pad, size + pad * 2, size + pad * 2, 10);
    ctx.stroke();
    ctx.restore();
}

function drawChoiceDisplay(ctx, trial) {
    const { cardSize, leftX, rightX, cardY } = getCardLayout(ctx.canvas);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawObjectCard(ctx, leftX, cardY, cardSize, IMAGE_CACHE[trial.left.image_path]);
    drawObjectCard(ctx, rightX, cardY, cardSize, IMAGE_CACHE[trial.right.image_path]);
}

function drawHighlightDisplay(ctx, trial, chosenSide) {
    const { cardSize, leftX, rightX, cardY } = getCardLayout(ctx.canvas);
    const chosenX = chosenSide === "left" ? leftX : rightX;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawObjectCard(ctx, chosenX, cardY, cardSize, IMAGE_CACHE[trial[chosenSide].image_path]);
    drawHighlightBorder(ctx, chosenX, cardY, cardSize);
}

function drawTooSlowDisplay(ctx, trial) {
    const { cardSize, leftX, rightX, cardY } = getCardLayout(ctx.canvas);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawObjectCard(ctx, leftX, cardY, cardSize, IMAGE_CACHE[trial.left.image_path]);
    drawObjectCard(ctx, rightX, cardY, cardSize, IMAGE_CACHE[trial.right.image_path]);
    ctx.save();
    ctx.fillStyle = "#cc2222";
    ctx.font = "bold 40px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Too slow!", ctx.canvas.width / 2, cardY - 18);
    ctx.restore();
}

// ─── Instruction content ──────────────────────────────────────────────────────
function buildInstructionPages() {
    const blank = `${params.feedback_dir}/blank.jpeg`;
    const banana = `${params.instructions_img_dir}/banana_13s.jpg`;
    const car = `${params.instructions_img_dir}/car_01b.jpg`;
    const nav = `<div class="nav-hint"><span>Press 'j' to go back</span><span>Press 'k' to continue</span></div>`;

    const screenPair = (hlRight = false) => `
        <div style="display:flex; justify-content:center; margin:16px 0;">
            <div class="ins-screen">
                <div class="ins-card ins-card-sm">
                    <img class="ins-card-bg" src="${blank}">
                    <img class="ins-card-obj" src="${car}">
                </div>
                <div class="ins-card ins-card-sm${hlRight ? " ins-card-highlighted" : ""}">
                    <img class="ins-card-bg" src="${blank}">
                    <img class="ins-card-obj" src="${banana}">
                </div>
            </div>
        </div>`;

    return [
        `<div class="instruction-container">
            <p>In this experiment, you will play a <strong>memory card game</strong>.</p>
            <p>Your goal is to remember which images you have seen before.</p>
            <p>Your bonus will be higher if you make more correct responses.</p>
            ${nav}
        </div>`,

        `<div class="instruction-container">
            <p>On each trial, you will see a pair of cards like the ones below.</p>
            <p>Your job is to select which (if any) of the two images you have seen before.</p>
            <p>You have <strong>${params.max_stimulus_duration / 1000} seconds</strong> to respond.</p>
            ${screenPair()}
            <div class="ins-key-row">
                <span><strong>'j' key = left image was shown before</strong></span>
                <span><strong>'k' key = right image was shown before</strong></span>
            </div>
            <p style="text-align:center;"><strong>Space bar = neither image was shown before</strong></p>
            ${nav}
        </div>`,

        `<div class="instruction-container">
            <p>Sometimes one of the two images will be old, and sometimes neither will be old.</p>
            ${screenPair(true)}
            <div class="ins-key-row">
                <span><strong>'j' key = left image was shown before</strong></span>
                <span><strong>'k' key = right image was shown before</strong></span>
            </div>
            <p style="text-align:center;"><strong>Space bar = neither image was shown before</strong></p>
            ${nav}
        </div>`,

        `<div class="instruction-container">
            <h2>Summary</h2>
            <ul>
                <li>Use <strong>'j'</strong> when the left image was shown before.</li>
                <li>Use <strong>'k'</strong> when the right image was shown before.</li>
                <li>Use the <strong>space bar</strong> when neither image was shown before.</li>
                <li>Your bonus depends on your accuracy across the experiment.</li>
                <li>The experiment will last roughly <strong>${params.completion_time} minutes</strong>, with 3 short breaks.</li>
            </ul>
            ${nav}
        </div>`,

        `<div class="instruction-container">
            <p>You will now take a short quiz to verify that you have read and understood the instructions.</p>
            <p>You must get all answers correct before proceeding.</p>
            <p>If you miss an answer, you will repeat the instructions and quiz until you answer all of them correctly.</p>
            ${nav}
        </div>`,
    ];
}

function buildQuizTrials() {
    function quizTrial(questionHtml, choices, correctKey) {
        return {
            type: jsPsychHtmlKeyboardResponse,
            stimulus: questionHtml,
            choices,
            data: { is_quiz_trial: true, correct_key: correctKey },
            on_finish(data) { data.correct = data.response === correctKey; }
        };
    }

    const opts = (left, right) => `
        <div class="quiz-options">
            <div class="quiz-option"><strong>${left}</strong><br>(j)</div>
            <div class="quiz-option"><strong>${right}</strong><br>(k)</div>
        </div>`;
    const optsWithSpace = (left, right, neither) => `
        <div class="quiz-options">
            <div class="quiz-option"><strong>${left}</strong><br>(j)</div>
            <div class="quiz-option"><strong>${right}</strong><br>(k)</div>
            <div class="quiz-option"><strong>${neither}</strong><br>(space)</div>
        </div>`;
    const wrap = (n, body) => `<div class="instruction-container"><p class="quiz-num">Quiz Question ${n}/5</p>${body}</div>`;

    return [
        quizTrial(wrap(1, `
            <p>What should you do if the left image was shown before?</p>
            ${opts("Press 'j'", "Press 'k'")}`),
            ["j", "k"], "j"),

        quizTrial(wrap(2, `
            <p>What should you do if the right image was shown before?</p>
            ${opts("Press 'j'", "Press 'k'")}`),
            ["j", "k"], "k"),

        quizTrial(wrap(3, `
            <p>What should you do if neither image was shown before?</p>
            ${optsWithSpace("Press 'j'", "Press 'k'", "Press space")}`),
            ["j", "k", " "], " "),

        quizTrial(wrap(4, `
            <p>True or false? You will receive feedback after each response.</p>
            ${opts("True", "False")}`),
            ["j", "k"], "k"),

        quizTrial(wrap(5, `
            <p>Your bonus payment will be higher if you perform better in this game.</p>
            ${opts("True", "False")}`),
            ["j", "k"], "j"),
    ];
}

// ─── Trial builders ───────────────────────────────────────────────────────────
function buildRecognitionTrial(trialSpec) {
    return {
        type: jsPsychCanvasKeyboardResponse,
        canvas_size: [620, 1060],
        choices: ["j", "k", " "],
        trial_duration: params.max_stimulus_duration,
        data: { phase: "recognition", is_recognition_trial: true, is_choice_trial: true },
        on_start() {
            TASK_STATE.currentTrial = materializeRuntimeTrial(trialSpec);
            TASK_STATE.lastChosenSide = null;
            TASK_STATE.responseMade = false;
        },
        stimulus(canvas) {
            drawChoiceDisplay(canvas.getContext("2d"), TASK_STATE.currentTrial);
        },
        on_finish(data) {
            const trial = TASK_STATE.currentTrial;
            const responseKey = (data.response || "").toLowerCase();
            const chosenSide = responseKey === "j" ? "left" : responseKey === "k" ? "right" : null;
            const choseNeither = responseKey === " ";
            const correctKey = trial.trial_type === "old"
                ? (trial.old_side === "left" ? "j" : "k")
                : " ";
            const chosenCard = chosenSide ? trial[chosenSide] : null;

            TASK_STATE.lastChosenSide = chosenSide;
            TASK_STATE.responseMade = Boolean(responseKey);

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
                correct_key: correctKey,
                left_image_name: trial.left.image_name,
                left_image_path: trial.left.image_path,
                left_memorability: trial.left.things_memorability,
                left_is_old: trial.left.is_old,
                right_image_name: trial.right.image_name,
                right_image_path: trial.right.image_path,
                right_memorability: trial.right.things_memorability,
                right_is_old: trial.right.is_old,
                chosen_side: chosenSide,
                chose_neither: choseNeither,
                chosen_image_name: chosenCard ? chosenCard.image_name : null,
                chosen_image_path: chosenCard ? chosenCard.image_path : null,
                response_key: responseKey || null,
                response_category: chosenSide ? "image" : choseNeither ? "neither" : "missed",
                choice_missed: !responseKey,
                old_chosen: chosenCard ? Number(chosenCard.is_old) : choseNeither ? 0 : null,
                did_choose_old: chosenCard ? Number(chosenCard.is_old) : choseNeither ? 0 : null,
                correct: responseKey === correctKey,
                timestamp: new Date().toISOString(),
            });
        }
    };
}

function buildHighlightTrial() {
    return {
        timeline: [{
            type: jsPsychCanvasKeyboardResponse,
            canvas_size: [620, 1060],
            choices: "NO_KEYS",
            trial_duration: params.highlight_duration,
            stimulus(canvas) {
                drawHighlightDisplay(canvas.getContext("2d"), TASK_STATE.currentTrial, TASK_STATE.lastChosenSide);
            }
        }],
        conditional_function() {
            return TASK_STATE.lastChosenSide !== null;
        }
    };
}

function buildTooSlowTrial() {
    return {
        timeline: [{
            type: jsPsychCanvasKeyboardResponse,
            canvas_size: [620, 1060],
            choices: "NO_KEYS",
            trial_duration: params.too_slow_duration,
            stimulus(canvas) {
                drawTooSlowDisplay(canvas.getContext("2d"), TASK_STATE.currentTrial);
            }
        }],
        conditional_function() {
            return TASK_STATE.currentTrial && !TASK_STATE.responseMade;
        }
    };
}

function buildBlankCanvasTrial(duration) {
    return {
        type: jsPsychCanvasKeyboardResponse,
        canvas_size: [620, 1060],
        choices: "NO_KEYS",
        trial_duration: duration,
        stimulus(canvas) {
            canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        }
    };
}

function buildAttentionCheckTrial(attentionCheck) {
    const label = attentionCheck.correct_key === "arrowup" ? "UP" : "DOWN";
    return {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="instruction-container" style="text-align:center;">
            <h2>Attention Check</h2>
            <p>Press the <strong>${label}</strong> arrow key.</p>
        </div>`,
        choices: ["arrowup", "arrowdown"],
        data: {
            is_attention_check: true,
            correct_key: attentionCheck.correct_key,
            after_trial_number: attentionCheck.after_trial_number,
        },
        on_finish(data) {
            data.response_key = (data.response || "").toLowerCase();
            data.success = data.response_key === attentionCheck.correct_key;
        }
    };
}

function buildBreakTrial() {
    return {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="instruction-container" style="text-align:center;">
            <h2>Break</h2>
            <p>Take a short break. Press <strong>Space</strong> to continue, or wait 20 seconds.</p>
        </div>`,
        choices: [" "],
        trial_duration: params.break_duration,
    };
}

// ─── Main init ────────────────────────────────────────────────────────────────
function initTask(jsPsych, subject_id) {
    const timeline = [];
    const stimulusRows = loadStimulusMetadata();
    const plan = EpisodicChoiceSequence.buildSequencePlan(params, stimulusRows);
    const summary = EpisodicChoiceSequence.summarizePlan(plan);
    TASK_STATE.plan = plan;

    jsPsych.data.addProperties({
        experiment_id: params.experiment_id,
        subject_id,
        participant_id: subject_id,
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

    const blankPath = `${params.feedback_dir}/blank.jpeg`;
    const instructionPaths = [
        `${params.instructions_img_dir}/banana_13s.jpg`,
        `${params.instructions_img_dir}/car_01b.jpg`,
    ];
    const allImages = [...new Set([...plan.preload_images, blankPath, ...instructionPaths])];

    timeline.push({
        type: jsPsychPreload,
        images: allImages,
        message: "Loading...",
        on_finish() {
            allImages.forEach(path => {
                const img = new Image();
                img.src = path;
                IMAGE_CACHE[path] = img;
            });
        }
    });

    timeline.push({
        type: jsPsychFullscreen,
        fullscreen_mode: true,
        message: `<div class="instruction-container" style="max-width:920px;">
            <h2>Welcome!</h2>
            <p>This study takes about <strong>${params.completion_time} minutes</strong>. You will earn <strong>$${params.base_pay}</strong> plus a bonus of up to <strong>$${params.max_bonus}</strong>.</p>
            <p>Please review the consent form below, and feel free to download a copy for your records.</p>
            <iframe src="${params.consent_pdf}" width="100%" height="480"
                style="border:1px solid #e8e8e8; border-radius:10px; margin:10px 0;"></iframe>
            <p>By clicking the button below, you confirm that you have read and voluntarily agree to participate.</p>
        </div>`,
        button_label: "Enter fullscreen & begin"
    });

    timeline.push({
        timeline: [
            {
                type: jsPsychInstructions,
                pages: buildInstructionPages(),
                show_clickable_nav: false,
                key_forward: "k",
                key_backward: "j",
            },
            ...buildQuizTrials(),
        ],
        loop_function(data) {
            const quizResults = data.filter({ is_quiz_trial: true }).values();
            return quizResults.length < 5 || !quizResults.every(d => d.correct);
        }
    });

    timeline.push({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="instruction-container" style="text-align:center;">
            <h2>Great job!</h2>
            <p>You're ready to begin.</p>
            <p><strong>Press any key to begin.</strong></p>
        </div>`,
        choices: "ALL_KEYS"
    });

    timeline.push(buildBlankCanvasTrial(params.iti));

    plan.trials.forEach(trialSpec => {
        timeline.push(buildRecognitionTrial(trialSpec));
        timeline.push(buildHighlightTrial());
        timeline.push(buildTooSlowTrial());
        timeline.push(buildBlankCanvasTrial(params.iti));

        const check = plan.attention_checks.find(c => c.after_trial_number === trialSpec.trial_number);
        if (check) timeline.push(buildAttentionCheckTrial(check));

        if (
            trialSpec.trial_number === params.block_sizes[0] ||
            trialSpec.trial_number === params.block_sizes[0] + params.block_sizes[1]
        ) {
            timeline.push(buildBreakTrial());
        }
    });

    timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus() {
            const b = getBonusSummary(jsPsych);
            return `<div class="instruction-container">
                <h2>Finished!</h2>
                <p>You completed <strong>${b.nTrials}</strong> trials.</p>
                <p>You got <strong>${b.nCorrect}</strong> correct.</p>
                <p>Your bonus will be <strong>$${b.bonus.toFixed(2)}</strong>.</p>
                <p>Your final pay will be <strong>$${(params.base_pay + b.bonus).toFixed(2)}</strong>.</p>
                <p>Thank you for your participation!</p>
            </div>`;
        },
        choices: ["Submit data & end experiment"],
        on_finish(data) {
            const b = getBonusSummary(jsPsych);
            data.is_summary = true;
            data.n_recognition_trials = b.nTrials;
            data.n_correct = b.nCorrect;
            data.accuracy = b.accuracy;
            data.bonus_chance_accuracy = b.chanceAccuracy;
            data.chance_adjusted_accuracy = b.chanceAdjustedAccuracy;
            data.final_bonus = b.bonus.toFixed(2);
        }
    });

    timeline.push({
        type: jsPsychPipe,
        action: "save",
        experiment_id: params.data_pipe_id,
        filename: `${subject_id}.csv`,
        data_string() { return jsPsych.data.get().csv(); },
        on_finish() {
            window.location.href = "https://app.prolific.com/submissions/complete?cc=" + params.prolific_completion_code;
        }
    });

    jsPsych.run(timeline);
}

// ─── Sequence materialisation ─────────────────────────────────────────────────
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
            left: buildCardFromStimulus(trialSpec.left_stimulus, false),
            right: buildCardFromStimulus(trialSpec.right_stimulus, false),
        };
    }

    const sourceTrialSpec = TASK_STATE.plan.trials.find(t => t.trial_number === trialSpec.source_trial_number);
    const repeatedSourceSide = trialSpec.fallback_side;
    const repeatedStimulus = repeatedSourceSide === "left"
        ? sourceTrialSpec.left_stimulus
        : sourceTrialSpec.right_stimulus;
    const repeatedCard = buildCardFromStimulus(repeatedStimulus, true);
    const lureCard = buildCardFromStimulus(trialSpec.lure_stimulus, false);

    return {
        trial_number: trialSpec.trial_number,
        block_index: trialSpec.block_index,
        triplet_index: trialSpec.triplet_index,
        trial_type: "old",
        memorability_bin: trialSpec.memorability_bin,
        source_trial_number: trialSpec.source_trial_number,
        delay: trialSpec.delay,
        old_side: trialSpec.old_side,
        repeated_source_side: repeatedSourceSide,
        left: trialSpec.old_side === "left" ? repeatedCard : lureCard,
        right: trialSpec.old_side === "right" ? repeatedCard : lureCard,
    };
}

function buildCardFromStimulus(stimulus, isOld) {
    return {
        image_name: stimulus.image_name,
        image_path: stimulus.image_path,
        things_file_path: stimulus.things_file_path,
        things_memorability: Number(stimulus.things_memorability),
        things_category: stimulus.things_category,
        memorability_percentile: Number(stimulus.memorability_percentile),
        is_old: isOld,
    };
}

function getBonusSummary(jsPsych) {
    const trials = jsPsych.data.get()
        .filterCustom(t => t.is_recognition_trial)
        .values();
    const nCorrect = trials.filter(t => t.correct).length;
    const accuracy = trials.length > 0 ? nCorrect / trials.length : 0;
    const chanceAccuracy = params.bonus_chance_accuracy;
    const chanceAdjustedAccuracy = chanceAccuracy < 1
        ? EpisodicChoiceSequence.clamp((accuracy - chanceAccuracy) / (1 - chanceAccuracy), 0, 1)
        : 0;
    const bonus = chanceAdjustedAccuracy * params.max_bonus;
    return { nTrials: trials.length, nCorrect, accuracy, chanceAccuracy, chanceAdjustedAccuracy, bonus };
}

function loadStimulusMetadata() {
    const rows = window.STIMULI_METADATA;
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("Stimulus metadata missing. Make sure stimuli_metadata.js is loaded.");
    }
    return rows;
}
