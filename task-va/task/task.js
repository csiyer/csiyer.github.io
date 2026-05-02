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
const MEMORY_RESPONSE_KEYS = ["s", "d", "f", "j", "k", "l"];

function getFeedbackImagePath(value) {
    if (value === 1 || value === 1.0) return `${params.feedback_dir}/1d.jpeg`;
    return `${params.feedback_dir}/${Math.round(value * 100)}c.jpeg`;
}

function formatPossibleValues() {
    return params.possible_values.map((value) => formatValue(value)).join(", ");
}

function buildFullscreenMessage() {
    return `<div class="instruction-container" style="max-width:920px;">
        <h2>Welcome!</h2>
        <p>This study takes about <strong>${params.completion_time} minutes</strong>. You will earn <strong>$${params.base_pay}</strong> plus a bonus of up to <strong>$${params.max_bonus}</strong>.</p>
        <p>Please review the consent form below, and feel free to download a copy for your records.</p>
        <iframe src="${params.consent_pdf}" width="100%" height="480"
            style="border:1px solid #e8e8e8; border-radius:10px; margin:10px 0;"></iframe>
        <p>By clicking the button below, you confirm that you have read and voluntarily agree to participate.</p>
    </div>`;
}

function buildInstructionPages() {
    const allVals = formatPossibleValues();
    const blank = `${params.feedback_dir}/blank.jpeg`;
    const banana = `${params.instructions_img_dir}/banana_13s.jpg`;
    const car = `${params.instructions_img_dir}/car_01b.jpg`;
    const maxFeedback = getFeedbackImagePath(Math.max(...params.possible_values));

    const objectCard = (imagePath, extraClass = "") => `
        <div class="ins-card ins-card-sm${extraClass}">
            <img class="ins-card-bg" src="${blank}">
            <img class="ins-card-obj" src="${imagePath}">
        </div>`;

    const feedbackDemo = `
        <div class="ins-feedback-demo">
            <div class="ins-screen">
                ${objectCard(banana)}
            </div>
            <div class="ins-arrow">→</div>
            <div class="ins-screen">
                <div class="ins-card ins-card-sm">
                    <img class="ins-card-bg" src="${maxFeedback}">
                </div>
            </div>
        </div>`;

    const memoryDemo = `
        <div class="ins-memory-demo">
            ${objectCard(car)}
            <div class="memory-instruction-values">
                ${params.possible_values.map((value) => `<span>${formatValue(value)}</span>`).join("")}
            </div>
        </div>`;

    return [
        `<div class="instruction-container">
            <h2>Part 1: Value Learning</h2>
            <p>You will see a series of cards with images on them. Each card will then show how much it is worth.</p>
            ${feedbackDemo}
            <p>Your job is to learn each card's value. The possible card values are: <strong>${allVals}</strong></p>
        </div>`,
        `<div class="instruction-container">
            <h2>Part 2: Memory Test</h2>
            <p>After the learning phase, you will do a memory test for the value of each card.</p>
            ${memoryDemo}
            <p>Your bonus depends on how many exact values you remember correctly.</p>
            <p><strong>Use the keys 's', 'd', 'f', 'j', 'k', and 'l' to report each card's value.</strong></p>
        </div>`,
        `<div class="instruction-container">
            <h2>Summary</h2>
            <ul>
                <li>First, learn the value of each card when it is shown.</li>
                <li>Then, report the remembered value of each card during the memory test.</li>
                <li>Try your best: your bonus depends on your memory accuracy.</li>
            </ul>
        </div>`,
    ];
}

async function initTask(jsPsych, subject_id) {
    const timeline = [];

    const stimulusPool = loadStimulusMetadata();

    if (stimulusPool.length < params.n_trials) {
        throw new Error(
            `Need ${params.n_trials} stimuli, but only found ${stimulusPool.length} in ${params.stimuli_metadata_path}.`
        );
    }

    const selectedStimuli = jsPsych.randomization.sampleWithoutReplacement(stimulusPool, params.n_trials);
    const selectedImages = selectedStimuli.map((stimulus) => stimulus.image_path);
    const feedbackImages = params.possible_values.map((value) => getFeedbackImagePath(value));
    const instructionImages = [
        `${params.feedback_dir}/blank.jpeg`,
        `${params.instructions_img_dir}/banana_13s.jpg`,
        `${params.instructions_img_dir}/car_01b.jpg`,
    ];
    const allImages = [...new Set([...selectedImages, ...feedbackImages, ...instructionImages])];
    const shuffledValues = [];
    while (shuffledValues.length < params.n_trials) {
        shuffledValues.push(...jsPsych.randomization.shuffle([...params.possible_values]));
    }

    const learningTrials = selectedStimuli.map((stimulus, index) => ({
        study_index: index,
        image_name: stimulus.image_name,
        image_path: stimulus.image_path,
        things_file_path: stimulus.things_file_path,
        things_memorability: stimulus.things_memorability,
        memorability_bin: stimulus.memorability_bin,
        things_category: stimulus.things_category,
        memorability_percentile: stimulus.memorability_percentile,
        value: shuffledValues[index],
        value_label: formatValue(shuffledValues[index]),
    }));

    const memoryTrials = jsPsych.randomization.shuffle([...learningTrials]);
    const attentionIndices = jsPsych.randomization.sampleWithoutReplacement(
        Array.from({ length: params.n_trials - 1 }, (_, i) => i + 1),
        params.n_attention_checks
    );

    jsPsych.data.addProperties({
        experiment_id: params.experiment_id,
        subject_id: subject_id,
        participant_id: subject_id,
        possible_values: JSON.stringify(params.possible_values),
        chance_rate: 1 / params.possible_values.length,
        data_pipe_id: params.data_pipe_id,
        osf_project_id: params.osf_project_id,
        osf_component_id: params.osf_component_id,
        task_params: JSON.stringify(params),
    });

    timeline.push({
        type: jsPsychPreload,
        images: allImages,
        message: "Loading card images...",
        on_finish: function () {
            allImages.forEach((path) => {
                const img = new Image();
                img.src = path;
                IMAGE_CACHE[path] = img;
            });
        }
    });

    timeline.push({
        type: jsPsychFullscreen,
        fullscreen_mode: true,
        message: buildFullscreenMessage(),
        button_label: "Enter fullscreen & begin"
    });

    timeline.push({
        type: jsPsychInstructions,
        pages: buildInstructionPages(),
        show_clickable_nav: true,
        button_label_next: "Next",
        button_label_previous: "Back",
    });

    timeline.push({
        type: jsPsychCanvasKeyboardResponse,
        canvas_size: [850, 1200],
        choices: "NO_KEYS",
        trial_duration: params.iti,
        stimulus: function (canvas) {
            const ctx = canvas.getContext("2d");
            drawBlankLearningIntertrial(ctx);
        }
    });

    learningTrials.forEach((trial, learningIndex) => {
        timeline.push({
            type: jsPsychCanvasKeyboardResponse,
            canvas_size: [850, 1200],
            choices: "NO_KEYS",
            trial_duration: params.learning_preview_duration + params.revealed_duration,
            data: {
                phase: "encoding",
                is_learning_trial: true,
                study_index: trial.study_index,
                trial_number: learningIndex + 1,
                image_name: trial.image_name,
                image_path: trial.image_path,
                image_memorability: trial.things_memorability,
                memorability_bin: trial.memorability_bin,
                things_file_path: trial.things_file_path,
                things_memorability: trial.things_memorability,
                things_category: trial.things_category,
                memorability_percentile: trial.memorability_percentile,
                value: trial.value,
                value_label: trial.value_label,
                outcome: trial.value,
            },
            stimulus: function (canvas) {
                const ctx = canvas.getContext("2d");
                runLearningAnimation(ctx, trial);
            },
            on_finish: function (data) {
                data.response = null;
                data.correct = null;
                data.response_error = null;
                data.timestamp = new Date().toISOString();
            }
        });

        timeline.push({
            type: jsPsychCanvasKeyboardResponse,
            canvas_size: [850, 1200],
            choices: "NO_KEYS",
            trial_duration: params.iti,
            stimulus: function (canvas) {
                const ctx = canvas.getContext("2d");
                drawBlankLearningIntertrial(ctx);
            }
        });
    });

    timeline.push({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `<div class="instruction-container">
            <h2>Memory Test</h2>
            <p>You are now beginning the memory test. Place your first 3 fingers of each hand on the keys: 's', 'd', 'f' and 'j', 'k', 'l'.</p>
            <p>For each card, press the key indicating its value.</p>
            <p>Your bonus will be based on how many you get correct!</p>
            <p><strong>Press any key to begin.</strong></p>
        </div>`,
        choices: "ALL_KEYS"
    });

    timeline.push({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: "",
        choices: "NO_KEYS",
        trial_duration: params.memory_iti
    });

    memoryTrials.forEach((trial, memoryIndex) => {
        timeline.push({
            type: jsPsychHtmlKeyboardResponse,
            stimulus: buildMemoryStimulus(trial, memoryIndex),
            choices: MEMORY_RESPONSE_KEYS,
            data: {
                phase: "test",
                is_memory_trial: true,
                memory_index: memoryIndex,
                study_index: trial.study_index,
                trial_number: memoryIndex + 1,
                image_name: trial.image_name,
                image_path: trial.image_path,
                image_memorability: trial.things_memorability,
                memorability_bin: trial.memorability_bin,
                things_file_path: trial.things_file_path,
                things_memorability: trial.things_memorability,
                things_category: trial.things_category,
                memorability_percentile: trial.memorability_percentile,
                value: trial.value,
                value_label: trial.value_label,
                true_value: trial.value,
                true_value_label: trial.value_label,
            },
            on_finish: function (data) {
                const responseKey = (data.response || "").toLowerCase();
                const responseIndex = MEMORY_RESPONSE_KEYS.indexOf(responseKey);
                const chosenValue = responseIndex >= 0 ? params.possible_values[responseIndex] : null;
                data.response_key = responseKey;
                data.response_index = responseIndex;
                data.response = chosenValue;
                data.reported_value = chosenValue;
                data.reported_value_label = chosenValue === null ? null : formatValue(chosenValue);
                data.chosen_value = chosenValue;
                data.chosen_value_label = chosenValue === null ? null : formatValue(chosenValue);
                data.correct = chosenValue === trial.value;
                data.response_error = chosenValue === null ? null : Number(Math.abs(chosenValue - trial.value).toFixed(2));
                data.abs_error = data.response_error;
                data.outcome = trial.value;
                data.timestamp = new Date().toISOString();
            }
        });

        if (memoryIndex < memoryTrials.length - 1) {
            timeline.push({
                type: jsPsychHtmlKeyboardResponse,
                stimulus: "",
                choices: "NO_KEYS",
                trial_duration: params.memory_iti
            });
        }

        if (attentionIndices.includes(memoryIndex)) {
            const targetKey = jsPsych.randomization.sampleWithoutReplacement(MEMORY_RESPONSE_KEYS, 1)[0];
            timeline.push({
                type: jsPsychHtmlKeyboardResponse,
                stimulus: `<div class="attention-check">
                    <h2 style="font-family: Inter, sans-serif; margin-top: 0;">Attention Check</h2>
                    <p style="font-size: 1.15rem;">Press the <strong>${targetKey.toUpperCase()}</strong> key to continue.</p>
                </div>`,
                choices: "ALL_KEYS",
                trial_duration: 5000,
                data: {
                    phase: "memory",
                    is_attention_check: true,
                    correct_key: targetKey,
                },
                on_finish: function (data) {
                    data.response_key = (data.response || "").toLowerCase();
                    data.success = data.response_key === targetKey;
                }
            });
        }
    });

    timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus: function () {
            const summary = getMemorySummary(jsPsych);
            return `<div class="instruction-container">
                <h2>Finished!</h2>
                <p>Your accuracy was <strong>${(summary.accuracy * 100).toFixed(1)}%</strong>.</p>
                <p>Your bonus will be <strong>$${summary.bonus.toFixed(2)}</strong>.</p>
                <p>Total pay will be <strong>$${(params.base_pay + summary.bonus).toFixed(2)}</strong>.</p>
                <p>Press the button below to submit your data.</p>
            </div>`;
        },
        choices: ["End & Submit Data"],
        on_finish: function (data) {
            const summary = getMemorySummary(jsPsych);
            data.is_summary = true;
            data.accuracy = summary.accuracy;
            data.corrected_accuracy = summary.correctedAccuracy;
            data.final_bonus = summary.bonus.toFixed(2);
            data.n_correct = summary.nCorrect;
            data.n_trials = summary.nTrials;
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

function runLearningAnimation(ctx, trial) {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const cardSize = 440;
    const cardX = (canvasWidth - cardSize) / 2;
    const cardY = (canvasHeight - cardSize) / 2;
    const startTime = performance.now();

    function animate(now) {
        const elapsed = now - startTime;
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        if (elapsed < params.learning_preview_duration) {
            drawCardFace(ctx, cardX, cardY, cardSize, IMAGE_CACHE[trial.image_path]);
        } else {
            drawFeedbackCard(ctx, cardX, cardY, cardSize, IMAGE_CACHE[getFeedbackImagePath(trial.value)]);
        }

        if (elapsed < params.learning_preview_duration + params.revealed_duration) {
            requestAnimationFrame(animate);
        }
    }

    requestAnimationFrame(animate);
}

function drawBlankLearningIntertrial(ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawCardFace(ctx, x, y, size, image, hScale = 1) {
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(hScale, 1);
    ctx.translate(-size / 2, -size / 2);
    drawObjectCard(ctx, 0, 0, size, image);
    ctx.restore();
}

function drawObjectCard(ctx, x, y, size, image) {
    const blankImage = IMAGE_CACHE[`${params.feedback_dir}/blank.jpeg`];
    if (blankImage && blankImage.complete) {
        ctx.drawImage(blankImage, x, y, size, size);
    } else {
        ctx.fillStyle = "#d0d3d7";
        ctx.fillRect(x, y, size, size);
    }

    if (image && image.complete) {
        const pad = size * 0.14;
        const maxW = size - pad * 2;
        const maxH = size - pad * 2;
        const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight);
        const drawW = image.naturalWidth * scale;
        const drawH = image.naturalHeight * scale;
        ctx.drawImage(image, x + (size - drawW) / 2, y + (size - drawH) / 2, drawW, drawH);
    }
}

function drawFeedbackCard(ctx, x, y, size, feedbackImage, hScale = 1) {
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(hScale, 1);
    ctx.translate(-size / 2, -size / 2);
    if (feedbackImage && feedbackImage.complete) {
        ctx.drawImage(feedbackImage, 0, 0, size, size);
    }
    ctx.restore();
}

function buildMemoryStimulus(trial, memoryIndex) {
    const valueRow = params.possible_values.map((value) => `<span>${formatValue(value)}</span>`).join("");
    const keyRow = MEMORY_RESPONSE_KEYS.map((key) => `<span>(${key})</span>`).join("");

    return `<div class="memory-panel">
        <div class="memory-card-shell">
            <div class="memory-card">
                <img class="memory-card-bg" src="${params.feedback_dir}/blank.jpeg" alt="">
                <img class="memory-card-obj" src="${trial.image_path}" alt="Card image ${memoryIndex + 1}">
            </div>
        </div>
        <div class="memory-keyboard-values">${valueRow}</div>
        <div class="memory-keyboard-keys">${keyRow}</div>
    </div>`;
}

function loadStimulusMetadata() {
    const rows = window.STIMULI_METADATA;
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error(
            "Stimulus metadata is missing. Make sure stimuli_metadata.js is present and loaded before task.js."
        );
    }

    return rows.map((row) => ({
        image_name: row.image_name,
        image_path: `${params.stimuli_dir}/${row.image_name}`,
        things_file_path: row.things_file_path,
        things_memorability: Number(row.things_memorability),
        memorability_bin: row.memorability_bin,
        things_category: row.things_category,
        memorability_percentile: Number(row.memorability_percentile),
    }));
}

function getMemorySummary(jsPsych) {
    const memoryData = jsPsych.data.get().filter({ is_memory_trial: true }).values();
    const nTrials = memoryData.length;
    const nCorrect = memoryData.filter((trial) => trial.correct).length;
    const accuracy = nTrials > 0 ? nCorrect / nTrials : 0;
    const chanceRate = 1 / params.possible_values.length;
    const correctedAccuracy = Math.max(0, Math.min(1, (accuracy - chanceRate) / (1 - chanceRate)));
    const bonus = params.max_bonus * correctedAccuracy;

    return {
        nTrials: nTrials,
        nCorrect: nCorrect,
        accuracy: accuracy,
        correctedAccuracy: correctedAccuracy,
        bonus: bonus,
    };
}

function formatValue(value) {
    if (value === 1 || value === 1.0) {
        return "$1";
    }
    return `${Math.round(value * 100)}¢`;
}
