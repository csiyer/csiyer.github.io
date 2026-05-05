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
    lastChosenSide: null,   // 'left' | 'right' | null (if missed)
    autoSide: null,          // side used for feedback when no response
    sourceChoiceByTrial: new Map(),
    bonusSummary: null,
};

// ─── Value helpers ────────────────────────────────────────────────────────────
function isBinaryDollarValues() {
    const v = params.possible_values;
    return v.length === 2 && v.includes(0) && v.includes(1);
}

function formatValue(value) {
    if (value === 1 || value === 1.0) return "$1";
    if (value === 0 && isBinaryDollarValues()) return "$0";
    return `${Math.round(value * 100)}¢`;
}

function formatCurrency(value) {
    return `$${Number(value).toFixed(2)}`;
}

function getFeedbackImagePath(value) {
    if (isBinaryDollarValues()) {
        return `${params.feedback_dir}/${value === 0 ? "0d" : "1d"}.jpeg`;
    }
    if (value === 1 || value === 1.0) return `${params.feedback_dir}/1d.jpeg`;
    return `${params.feedback_dir}/${Math.round(value * 100)}c.jpeg`;
}

function formatPossibleValues() {
    return params.possible_values.map(v => formatValue(v)).join(", ");
}

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

function drawFeedbackCard(ctx, x, y, size, feedbackImage) {
    if (feedbackImage && feedbackImage.complete) {
        ctx.drawImage(feedbackImage, x, y, size, size);
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

// ─── Scene drawing ────────────────────────────────────────────────────────────
function drawChoiceDisplay(ctx, trial) {
    const { cardSize, leftX, rightX, cardY } = getCardLayout(ctx.canvas);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawObjectCard(ctx, leftX, cardY, cardSize, IMAGE_CACHE[trial.left.image_path]);
    drawObjectCard(ctx, rightX, cardY, cardSize, IMAGE_CACHE[trial.right.image_path]);
}

function drawHighlightDisplay(ctx, trial, chosenSide) {
    const { cardSize, leftX, rightX, cardY } = getCardLayout(ctx.canvas);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const chosenX = chosenSide === "left" ? leftX : rightX;
    drawObjectCard(ctx, chosenX, cardY, cardSize, IMAGE_CACHE[trial[chosenSide].image_path]);
    drawHighlightBorder(ctx, chosenX, cardY, cardSize);
}

function drawFeedbackDisplay(ctx, trial, chosenSide) {
    const { cardSize, leftX, rightX, cardY } = getCardLayout(ctx.canvas);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const feedbackPath = getFeedbackImagePath(trial[chosenSide].value);
    const chosenX = chosenSide === "left" ? leftX : rightX;
    drawFeedbackCard(ctx, chosenX, cardY, cardSize, IMAGE_CACHE[feedbackPath]);
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
    const maxVal = formatValue(Math.max(...params.possible_values));
    const allVals = formatPossibleValues();
    const blank = `${params.feedback_dir}/blank.jpeg`;
    const banana = `${params.instructions_img_dir}/banana_13s.jpg`;
    const car = `${params.instructions_img_dir}/car_01b.jpg`;
    const maxFeedback = getFeedbackImagePath(Math.max(...params.possible_values));

    const nav = `<div class="nav-hint"><span>Press 'j' to go back</span><span>Press 'k' to continue</span></div>`;

    // Car LEFT, banana RIGHT inside a screen rectangle. hlRight = highlight banana.
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

    // Before → After used on pages 3 and 4.
    // Before: car left, banana right (highlighted).
    // After: same screen size (two slots), left slot invisible, feedback on right.
    const feedbackDemo = `
        <div class="ins-feedback-demo">
            <div class="ins-screen">
                <div class="ins-card ins-card-sm">
                    <img class="ins-card-bg" src="${blank}">
                    <img class="ins-card-obj" src="${car}">
                </div>
                <div class="ins-card ins-card-sm ins-card-highlighted">
                    <img class="ins-card-bg" src="${blank}">
                    <img class="ins-card-obj" src="${banana}">
                </div>
            </div>
            <div class="ins-arrow">→</div>
            <div class="ins-screen">
                <div class="ins-card ins-card-sm" style="visibility:hidden;"></div>
                <div class="ins-card ins-card-sm">
                    <img class="ins-card-bg" src="${maxFeedback}">
                </div>
            </div>
        </div>`;

    // Row of feedback card images for all possible values.
    const feedbackImgList = `
        <div class="ins-feedback-list">
            ${params.possible_values.map(v => `
                <div class="ins-feedback-item">
                    <img src="${getFeedbackImagePath(v)}" class="ins-feedback-img" alt="${formatValue(v)}">
                </div>`).join("")}
        </div>`;

    return [
        // Page 1
        `<div class="instruction-container">
            <p>In this experiment, you will play a <strong>memory card game</strong>.</p>
            <p>Your goal is to <strong>win as much money as possible</strong>.</p>
            ${nav}
        </div>`,

        // Page 2
        `<div class="instruction-container">
            <p>On each trial, you will see a pair of cards like the ones below.</p>
            ${screenPair()}
            <p>You have <strong>${params.max_stimulus_duration / 1000} seconds</strong> to pick a card.</p>
            <div class="ins-key-row">
                <span><strong>'j' key = left card</strong></span>
                <span><strong>'k' key = right card</strong></span>
            </div>
            ${nav}
        </div>`,

        // Page 3
        `<div class="instruction-container">
            <p>Your chosen card will then flip over and you will see how much it was worth.</p>
            <p>In this example, you chose the card on the right and it was worth <strong>${maxVal}</strong>.</p>
            ${feedbackDemo}
            ${nav}
        </div>`,

        // Page 4 — same demo as page 3
        `<div class="instruction-container">
            <p>There is a trick that you can use to earn more money: <strong>each card is always worth the same amount of money</strong>.</p>
            <p>For example, <strong>the banana card is always worth ${maxVal}</strong>, if it reappears again.</p>
            <p><strong>So, you can use your memory to pick more valuable cards, and avoid less valuable ones!</strong></p>
            ${feedbackDemo}
            ${nav}
        </div>`,

        // Page 5
        `<div class="instruction-container">
            <p>The possible card values are: <strong>${allVals}</strong></p>
            ${feedbackImgList}
            <p><strong>To get more bonus money, try your best to select the good cards and avoid the bad ones!</strong></p>
            ${nav}
        </div>`,

        // Page 6
        `<div class="instruction-container">
            <h2>Summary</h2>
            <ul>
                <li>Use the <strong>'j'</strong> and <strong>'k'</strong> keys to choose the left or right cards.</li>
                <li>Each card will always be worth the same amount of money if you see it again.</li>
                <li>Use your memory to select good cards and avoid bad ones.</li>
                <li>The experiment will last roughly <strong>${params.completion_time} minutes</strong>, with 3 short breaks.</li>
            </ul>
            ${nav}
        </div>`,

        // Page 7
        `<div class="instruction-container">
            <p>You will now take a short quiz to verify that you have read and understood the instructions.</p>
            <p>You must get all answers correct before proceeding.</p>
            <p>If you miss an answer, you will repeat the instructions and quiz until you answer all of them correctly.</p>
            ${nav}
        </div>`,
    ];
}

function buildQuizTrials() {
    const minVal = formatValue(Math.min(...params.possible_values));
    const maxVal = formatValue(Math.max(...params.possible_values));
    const blank = `${params.feedback_dir}/blank.jpeg`;
    const banana = `${params.instructions_img_dir}/banana_13s.jpg`;
    const car = `${params.instructions_img_dir}/car_01b.jpg`;

    function quizTrial(questionHtml, correctKey) {
        return {
            type: jsPsychHtmlKeyboardResponse,
            stimulus: questionHtml,
            choices: ["j", "k"],
            data: { is_quiz_trial: true, correct_key: correctKey },
            on_finish(data) { data.correct = data.response === correctKey; }
        };
    }

    const cardPair = `
        <div class="ins-trial-demo" style="margin: 10px 0;">
            <div class="ins-card-col">
                <div class="ins-card ins-card-sm">
                    <img class="ins-card-bg" src="${blank}">
                    <img class="ins-card-obj" src="${banana}">
                </div>
            </div>
            <div class="ins-card-col">
                <div class="ins-card ins-card-sm">
                    <img class="ins-card-bg" src="${blank}">
                    <img class="ins-card-obj" src="${car}">
                </div>
            </div>
        </div>`;

    const opts = (left, right) => `
        <div class="quiz-options">
            <div class="quiz-option"><strong>${left}</strong><br>(j)</div>
            <div class="quiz-option"><strong>${right}</strong><br>(k)</div>
        </div>`;

    const wrap = (n, body) => `<div class="instruction-container"><p class="quiz-num">Quiz Question ${n}/7</p>${body}</div>`;

    return [
        quizTrial(wrap(1, `
            <p>True or false? After choosing a card, you will receive feedback about your chosen card's value.</p>
            ${opts("True", "False")}`),
            "j"),

        quizTrial(wrap(2, `
            <p>Each card is worth a random amount of money between…</p>
            ${opts("$0 – $5", `${minVal} – ${maxVal}`)}`),
            "k"),

        quizTrial(wrap(3, `
            <p>True or false? If you see the same card again, it will be worth the same amount as the last time you saw it.</p>
            ${opts("True", "False")}`),
            "j"),

        quizTrial(wrap(4, `
            <p>If you previously learned the banana card is worth $0, which card should you pick to earn more money?</p>
            ${cardPair}
            ${opts("The left card (banana)", "The right card (car)")}`),
            "k"),

        quizTrial(wrap(5, `
            <p>Cards with similar objects on them are worth similar amounts of money.</p>
            ${opts("True", "False")}`),
            "k"),

        quizTrial(wrap(6, `
            <p>Which key should you use to choose an image on the right side?</p>
            ${opts("'j'", "'k'")}`),
            "k"),

        quizTrial(wrap(7, `
            <p>Your bonus payment will be higher if you perform better in this game.</p>
            ${opts("True", "False")}`),
            "j"),
    ];
}

// ─── Trial builders ───────────────────────────────────────────────────────────
function buildChoiceTrial(jsPsych, trialSpec) {
    return {
        type: jsPsychCanvasKeyboardResponse,
        canvas_size: [620, 1060],
        choices: ["j", "k"],
        trial_duration: params.max_stimulus_duration,
        data: { phase: "choice", is_choice_trial: true },
        on_start() {
            TASK_STATE.currentTrial = materializeRuntimeTrial(trialSpec);
            TASK_STATE.lastChosenSide = null;
            TASK_STATE.autoSide = null;
        },
        stimulus(canvas) {
            drawChoiceDisplay(canvas.getContext("2d"), TASK_STATE.currentTrial);
        },
        on_finish(data) {
            const trial = TASK_STATE.currentTrial;
            const responseKey = (data.response || "").toLowerCase();

            // Shared trial metadata
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
                old_value: trial.trial_type === "old"
                    ? (trial.old_side === "left" ? trial.left.value : trial.right.value)
                    : null,
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
                // No response — pick a random side for feedback display and sequence bookkeeping
                const autoSide = Math.random() < 0.5 ? "left" : "right";
                const autoCard = trial[autoSide];
                TASK_STATE.autoSide = autoSide;
                TASK_STATE.lastChosenSide = null;

                if (trial.trial_type === "new") {
                    TASK_STATE.sourceChoiceByTrial.set(trial.trial_number, {
                        chosen_side: autoSide,
                        card: autoCard,
                    });
                }

                Object.assign(data, {
                    chosen_side: null,
                    auto_side: autoSide,
                    chosen_image_name: null,
                    chosen_image_path: null,
                    chosen_value: null,
                    reward: autoCard.value,
                    response_key: null,
                    choice_missed: true,
                    auto_chosen: true,
                    old_chosen: null,
                    did_choose_old: null,
                    outcome: autoCard.value,
                    optimal_choice: null,
                });
                return;
            }

            const chosenSide = responseKey === "j" ? "left" : "right";
            const chosenCard = trial[chosenSide];
            TASK_STATE.lastChosenSide = chosenSide;

            if (trial.trial_type === "new") {
                TASK_STATE.sourceChoiceByTrial.set(trial.trial_number, {
                    chosen_side: chosenSide,
                    card: chosenCard,
                });
            }

            Object.assign(data, {
                chosen_side: chosenSide,
                auto_side: null,
                chosen_image_name: chosenCard.image_name,
                chosen_image_path: chosenCard.image_path,
                chosen_value: chosenCard.value,
                reward: chosenCard.value,
                response_key: responseKey,
                choice_missed: false,
                auto_chosen: false,
                old_chosen: trial.trial_type === "old" ? Number(chosenCard.is_old) : null,
                did_choose_old: trial.trial_type === "old" ? Number(chosenCard.is_old) : null,
                outcome: chosenCard.value,
                optimal_choice: computeOptimalChoice(trial, chosenSide),
            });
        }
    };
}

function buildHighlightTrial(jsPsych) {
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
            return TASK_STATE.lastChosenSide === null;
        }
    };
}

function buildFeedbackTrial() {
    return {
        type: jsPsychCanvasKeyboardResponse,
        canvas_size: [620, 1060],
        choices: "NO_KEYS",
        trial_duration: params.feedback_duration,
        stimulus(canvas) {
            const side = TASK_STATE.lastChosenSide || TASK_STATE.autoSide;
            drawFeedbackDisplay(canvas.getContext("2d"), TASK_STATE.currentTrial, side);
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
    const label = attentionCheck.correct_key.toUpperCase();
    return {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="instruction-container" style="text-align:center;">
            <h2>Attention Check</h2>
            <p>Press the <strong>${label}</strong> key.</p>
            <p style="color:#ffffff;">IMPORTANT: actually, click the SPACE bar.</p>
        </div>`,
        choices: "ALL_KEYS",
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
    // console.log(plan)
    // console.log(summary)
    TASK_STATE.plan = plan;

    jsPsych.data.addProperties({
        experiment_id: params.experiment_id,
        subject_id,
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

    // Preload all images
    const feedbackPaths = params.possible_values.map(v => getFeedbackImagePath(v));
    const blankPath = `${params.feedback_dir}/blank.jpeg`;
    const instructionPaths = [
        `${params.instructions_img_dir}/banana_13s.jpg`,
        `${params.instructions_img_dir}/car_01b.jpg`,
        getFeedbackImagePath(Math.max(...params.possible_values)),
    ];
    const allImages = [...new Set([...plan.preload_images, ...feedbackPaths, blankPath, ...instructionPaths])];

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

    // Consent form + fullscreen entry
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

    // Instructions + quiz (loops until all correct)
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
            return quizResults.length < 7 || !quizResults.every(d => d.correct);
        }
    });

    // All-correct confirmation
    timeline.push({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="instruction-container" style="text-align:center;">
            <h2>Great job!</h2>
            <p>You're ready to begin.</p>
            <p><strong>Press any key to begin.</strong></p>
        </div>`,
        choices: "ALL_KEYS"
    });

    // Initial ITI
    timeline.push(buildBlankCanvasTrial(params.iti));

    // Trials
    plan.trials.forEach(trialSpec => {
        timeline.push(buildChoiceTrial(jsPsych, trialSpec));
        timeline.push(buildHighlightTrial(jsPsych));
        timeline.push(buildTooSlowTrial());
        timeline.push(buildFeedbackTrial());
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

    // End screen
    timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus() {
            const b = getBonusSummary(jsPsych);
            return `<div class="instruction-container">
                <h2>Finished!</h2>
                <p>We sampled <strong>${b.sampledTrials.length}</strong> old-card trials for your bonus.</p>
                <p>Your sampled total was <strong>${formatCurrency(b.sampledReward)}</strong>.</p>
                <p>Your bonus will be <strong>$${b.bonus.toFixed(2)}</strong>.</p>
                <p>Your final pay will be <strong>$${(params.base_pay + b.bonus).toFixed(2)}</strong>.</p>
                <p>Thank you for your participation!</p>
            </div>`;
        },
        choices: ["Submit data & end experiment"],
        on_finish(data) {
            const b = getBonusSummary(jsPsych);
            data.is_summary = true;
            data.sampled_old_trial_numbers = JSON.stringify(b.sampledTrialNumbers);
            data.sampled_old_rewards = JSON.stringify(b.sampledRewards);
            data.sampled_old_total = b.sampledReward.toFixed(2);
            data.final_bonus = b.bonus.toFixed(2);
        }
    });

    // Data save + redirect
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
            repeat_source_was_chosen: null,
            repeat_source_fallback_side: null,
            left: buildCardFromStimulus(trialSpec.left_stimulus, trialSpec.shared_value, false),
            right: buildCardFromStimulus(trialSpec.right_stimulus, trialSpec.shared_value, false),
        };
    }

    const sourceTrialSpec = TASK_STATE.plan.trials.find(t => t.trial_number === trialSpec.source_trial_number);
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
        left: trialSpec.old_side === "left" ? repeatedCardCopy : lureCard,
        right: trialSpec.old_side === "right" ? repeatedCardCopy : lureCard,
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
        value,
        value_label: formatValue(value),
        is_old: isOld,
    };
}

// ─── Bonus calculation ────────────────────────────────────────────────────────
function getBonusSummary(jsPsych) {
    if (TASK_STATE.bonusSummary) return TASK_STATE.bonusSummary;

    const oldTrials = jsPsych.data.get()
        .filterCustom(t => t.is_choice_trial && t.trial_type === "old")
        .values();
    const sampleN = Math.min(params.bonus_sample_n, oldTrials.length);
    const rng = EpisodicChoiceSequence.makeRandomHelpers();
    const sampledTrials = sampleN > 0 ? rng.sample(oldTrials, sampleN) : [];
    sampledTrials.forEach(t => { t.bonus_sampled = true; });

    const sampledRewards = sampledTrials.map(t => Number(t.reward) || 0);
    const sampledReward = sampledRewards.reduce((s, v) => s + v, 0);
    const maxPossible = Math.max(...params.possible_values);
    const normalized = sampleN > 0 ? sampledReward / (sampleN * maxPossible) : 0;
    const bonus = EpisodicChoiceSequence.clamp(normalized * params.max_bonus, 0, params.max_bonus);

    TASK_STATE.bonusSummary = { sampledTrials, sampledTrialNumbers: sampledTrials.map(t => t.trial_number), sampledRewards, sampledReward, bonus };
    return TASK_STATE.bonusSummary;
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────
function computeOptimalChoice(trial, chosenSide) {
    if (trial.trial_type !== "old") return null;
    const oldCard = trial.old_side === "left" ? trial.left : trial.right;
    const threshold = getOldValueThreshold(params.possible_values);
    if (oldCard.value === threshold) return null;
    const shouldChooseOld = oldCard.value > threshold;
    const didChooseOld = chosenSide === trial.old_side;
    return Number((shouldChooseOld && didChooseOld) || (!shouldChooseOld && !didChooseOld));
}

function getOldValueThreshold(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    return (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
}

function loadStimulusMetadata() {
    const rows = window.STIMULI_METADATA;
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("Stimulus metadata missing. Make sure stimuli_metadata.js is loaded.");
    }
    return rows;
}
