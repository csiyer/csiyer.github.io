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
        images: selectedImages,
        message: "Loading card images...",
        on_finish: function () {
            selectedImages.forEach((path) => {
                const img = new Image();
                img.src = path;
                IMAGE_CACHE[path] = img;
            });
        }
    });

    timeline.push({
        type: jsPsychFullscreen,
        fullscreen_mode: true,
        message: params.instruction_pages[0],
        button_label: "Enter fullscreen & begin"
    });

    timeline.push({
        type: jsPsychInstructions,
        pages: params.instruction_pages.slice(1),
        show_clickable_nav: true,
        button_label_next: "Next",
        button_label_previous: "Back"
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
            trial_duration: params.learning_preview_duration + params.flip_duration + params.revealed_duration,
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
    const cardWidth = 380;
    const cardHeight = 540;
    const cardX = (canvasWidth - cardWidth) / 2;
    const cardY = (canvasHeight - cardHeight) / 2;
    const startTime = performance.now();

    function animate(now) {
        const elapsed = now - startTime;
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        if (elapsed < params.learning_preview_duration) {
            drawCardFace(ctx, cardX, cardY, cardWidth, cardHeight, IMAGE_CACHE[trial.image_path]);
        } else {
            const flipElapsed = elapsed - params.learning_preview_duration;
            const progress = Math.min(flipElapsed / params.flip_duration, 1);
            if (progress < 0.5) {
                const hScale = Math.max(0.02, 1 - progress * 2);
                drawCardFace(ctx, cardX, cardY, cardWidth, cardHeight, IMAGE_CACHE[trial.image_path], null, hScale);
            } else {
                const hScale = Math.max(0.02, (progress - 0.5) * 2);
                drawRevealedCard(ctx, cardX, cardY, cardWidth, cardHeight, IMAGE_CACHE[trial.image_path], trial.value_label, hScale);
            }
        }

        if (elapsed < params.learning_preview_duration + params.flip_duration + params.revealed_duration) {
            requestAnimationFrame(animate);
        }
    }

    requestAnimationFrame(animate);
}

function drawBlankLearningIntertrial(ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawCardFace(ctx, x, y, width, height, image, text = null, hScale = 1) {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.scale(hScale, 1);
    ctx.translate(-width / 2, -height / 2);

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 22);
    ctx.fill();

    ctx.strokeStyle = params.card_color;
    ctx.lineWidth = 10;
    ctx.shadowBlur = 0;
    ctx.stroke();

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

    if (text) {
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
        ctx.fillText(text, width / 2, height / 2 + 2);
    }

    ctx.restore();
}

function drawRevealedCard(ctx, x, y, width, height, image, valueLabel, hScale = 1) {
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = params.highlight_color;
    drawCardFace(ctx, x, y, width, height, image, valueLabel, hScale);
    ctx.restore();
}

function buildMemoryStimulus(trial, memoryIndex) {
    const valueRow = params.possible_values.map((value) => `<span>${formatValue(value)}</span>`).join("");
    const keyRow = MEMORY_RESPONSE_KEYS.map((key) => `<span>(${key})</span>`).join("");

    return `<div class="memory-panel">
        <div class="memory-card-shell">
            <div class="memory-card">
                <img src="${trial.image_path}" alt="Card image ${memoryIndex + 1}">
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
            "Stimulus metadata is missing. Make sure stimulimetadata.js is present and loaded before task.js."
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
