// Polyfill for CanvasRenderingContext2D.prototype.roundRect for older browsers (Safari < 16)
if (typeof CanvasRenderingContext2D.prototype.roundRect !== 'function') {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
        if (typeof radius === 'number') {
            radius = { tl: radius, tr: radius, br: radius, bl: radius };
        } else {
            var defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
            for (var key in defaultRadius) {
                radius[key] = radius[key] || defaultRadius[key];
            }
        }
        this.beginPath();
        this.moveTo(x + radius.tl, y);
        this.lineTo(x + width - radius.tr, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
        this.lineTo(x + width, y + height - radius.br);
        this.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
        this.lineTo(x + radius.bl, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
        this.lineTo(x, y + radius.tl);
        this.quadraticCurveTo(x, y, x + radius.tl, y);
        this.closePath();
        return this;
    };
}

const STIM_LISTS = {};
if (params.stim_type === 'memorability') {
    STIM_LISTS.highmem = Array.from({ length: 102 }, (_, i) => `../stimuli/highmem/highmem_${i + 1}.jpg`);
    STIM_LISTS.lowmem = Array.from({ length: 102 }, (_, i) => `../stimuli/lowmem/lowmem_${i + 1}.jpg`);
} else {
    STIM_LISTS.unique = Array.from({ length: 300 }, (_, i) => `../stimuli/unique_objects/unique_${i + 1}.jpg`);
    STIM_LISTS.airplanes = Array.from({ length: 300 }, (_, i) => `../stimuli/airplanes/airplane_${i + 1}.jpg`);
}
const IMAGE_CACHE = {};

function initTask(jsPsych, subject_id) {
    const timeline = [];

    // Flatten only the active paths
    const all_preload_images = Object.values(STIM_LISTS).flat();

    // 1. Preload Assets
    timeline.push({
        type: jsPsychPreload,
        images: all_preload_images,
        message: 'Loading card game assets...',
        on_finish: function () {
            // Populate Global Cache with Image objects
            all_preload_images.forEach(path => {
                const img = new Image();
                img.src = path;
                IMAGE_CACHE[path] = img;
            });
        }
    });

    // Randomly assign mem_lucky deck color
    const deck_colors = ['blue', 'orange'];
    const mem_lucky_color = jsPsych.randomization.sampleWithoutReplacement(deck_colors, 1)[0];
    const mem_unlucky_color = mem_lucky_color === 'blue' ? 'orange' : 'blue';

    jsPsych.data.addProperties({
        experiment_id: params.experiment_id,
        mem_lucky_color: mem_lucky_color,
        mem_unlucky_color: mem_unlucky_color,
        stim_type: params.stim_type,
        subject_id: subject_id,
        prolific_id: jsPsych.data.getURLVariable('PROLIFIC_PID') || 'local'
    });

    // Welcome & Instructions
    timeline.push({
        type: jsPsychInstructions,
        pages: params.instruction_pages,
        show_clickable_nav: true,
        button_label_next: "Next",
        button_label_previous: "Back"
    });

    timeline.push({
        type: jsPsychFullscreen,
        fullscreen_mode: true
    });

    // --- Drawing Helpers ---
    const DECK_W = 400;
    const DECK_H = 560;
    const SPACING = 100;
    const CANVAS_W = 1200;
    const CANVAS_H = 850;

    function getCoords() {
        const leftX = CANVAS_W / 2 - DECK_W - SPACING / 2;
        const rightX = CANVAS_W / 2 + SPACING / 2;
        const centerY = CANVAS_H / 2 - DECK_H / 2;
        return { leftX, rightX, centerY };
    }

    function drawCard(ctx, x, y, width, height, color, image = null, text = null, isSelected = false, hScale = 1.0) {
        ctx.save();
        ctx.translate(x + width / 2, y + height / 2);
        ctx.scale(hScale, 1.0);
        ctx.translate(-(width / 2), -(height / 2));

        // Background
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.roundRect(0, 0, width, height, 20);
        ctx.fill();

        // Border (Deck Color)
        ctx.strokeStyle = color === 'blue' ? params.blue_deck_color : params.orange_deck_color;
        ctx.lineWidth = isSelected ? 12 : 8;
        if (isSelected) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = params.highlight_color;
        }
        ctx.stroke();

        // 1. Draw Image (if present)
        const padding = 20;
        if (image && image.complete) {
            const maxW = width - padding * 2;
            const maxH = height - padding * 2;
            const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight);
            const w = image.naturalWidth * scale;
            const h = image.naturalHeight * scale;
            ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
        }

        // 2. Overlay Text (Reward Box)
        if (text) {
            const boxW = 160;
            const boxH = 100;
            const boxX = (width - boxW) / 2;
            const boxY = (height - boxH) / 2;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.strokeStyle = color === 'blue' ? params.blue_deck_color : params.orange_deck_color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.roundRect(boxX, boxY, boxW, boxH, 12);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#000000';
            ctx.font = 'bold 54px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, width / 2, height / 2 + 3);
        }

        ctx.restore();
    }

    // --- Fixed Assignments ---
    const side_colors_init = jsPsych.randomization.shuffle(['blue', 'orange']);
    const FIXED_SIDES = {
        left: side_colors_init[0],
        right: side_colors_init[1]
    };

    // --- Build Trial List ---
    const high_cat = params.stim_type === 'memorability' ? 'highmem' : 'unique';
    const low_cat = params.stim_type === 'memorability' ? 'lowmem' : 'airplanes';
    const high_pool = jsPsych.randomization.shuffle(STIM_LISTS[high_cat]);
    const low_pool = jsPsych.randomization.shuffle(STIM_LISTS[low_cat]);

    let high_idx = 0;
    let low_idx = 0;

    const check_indices = jsPsych.randomization.sampleWithoutReplacement(Array.from({ length: params.n_trials }, (_, i) => i), params.n_attention_checks);
    const all_rewards = params.rewards;

    for (let i = 0; i < params.n_trials; i++) {
        const reward_L = jsPsych.randomization.sampleWithoutReplacement(all_rewards, 1)[0];
        const reward_R = jsPsych.randomization.sampleWithoutReplacement(all_rewards, 1)[0];

        const is_lucky_L = (FIXED_SIDES.left === mem_lucky_color);
        const is_lucky_R = (FIXED_SIDES.right === mem_lucky_color);

        const is_high_reward_L = reward_L >= 0.6;
        const imgType_L = is_lucky_L ? (is_high_reward_L ? 'high' : 'low') : (is_high_reward_L ? 'low' : 'high');
        const imgPath_L = imgType_L === 'high' ? high_pool[high_idx++ % high_pool.length] : low_pool[low_idx++ % low_pool.length];

        const is_high_reward_R = reward_R >= 0.6;
        const imgType_R = is_lucky_R ? (is_high_reward_R ? 'high' : 'low') : (is_high_reward_R ? 'low' : 'high');
        const imgPath_R = imgType_R === 'high' ? high_pool[high_idx++ % high_pool.length] : low_pool[low_idx++ % low_pool.length];

        const trial_info = {
            colors: FIXED_SIDES,
            rewards: { left: reward_L, right: reward_R },
            images: {
                left: { type: imgType_L, path: imgPath_L },
                right: { type: imgType_R, path: imgPath_R }
            }
        };

        // 1. Choice Phase
        timeline.push({
            type: jsPsychCanvasKeyboardResponse,
            canvas_size: [CANVAS_H, CANVAS_W],
            stimulus: function (canvas) {
                const ctx = canvas.getContext('2d');
                const { leftX, rightX, centerY } = getCoords();
                drawCard(ctx, leftX, centerY, DECK_W, DECK_H, trial_info.colors.left, IMAGE_CACHE[trial_info.images.left.path]);
                drawCard(ctx, rightX, centerY, DECK_W, DECK_H, trial_info.colors.right, IMAGE_CACHE[trial_info.images.right.path]);
            },
            choices: ['arrowleft', 'arrowright'],
            trial_duration: params.stimulus_duration,
            data: {
                is_trial: true,
                trial_index: i,
                left_color: trial_info.colors.left,
                right_color: trial_info.colors.right,
                left_img_type: trial_info.images.left.type,
                right_img_type: trial_info.images.right.type,
                left_img_path: trial_info.images.left.path,
                right_img_path: trial_info.images.right.path,
                left_reward: trial_info.rewards.left,
                right_reward: trial_info.rewards.right
            },
            on_finish: function (data) {
                if (data.response === null) return;
                const side = (data.response || "").toLowerCase() === 'arrowleft' ? 'left' : 'right';
                const other_side = side === 'left' ? 'right' : 'left';
                data.chosen_side = side;
                data.reward = trial_info.rewards[side];
                data.unchosen_reward = trial_info.rewards[other_side];
                data.chosen_color = trial_info.colors[side];
                data.chosen_img_type = trial_info.images[side].type;
                data.is_lucky_choice = (data.chosen_color === mem_lucky_color);
            }
        });

        // 2. Unified Feedback Phase (Highlight + Flip OR Too Slow)
        timeline.push({
            type: jsPsychCanvasKeyboardResponse,
            canvas_size: [CANVAS_H, CANVAS_W],
            choices: "NO_KEYS",
            trial_duration: function () {
                const lastData = jsPsych.data.get().last(1).values()[0];
                if (lastData.response === null) return params.too_slow_duration;
                // Buffer (remainder of viewing time) + Flip
                return Math.max(0, params.stimulus_duration - lastData.rt) + params.feedback_duration;
            },
            stimulus: function (canvas) {
                const ctx = canvas.getContext('2d');
                const lastData = jsPsych.data.get().last(1).values()[0];
                const { leftX, rightX, centerY } = getCoords();

                if (lastData.response === null) {
                    ctx.fillStyle = 'red';
                    ctx.font = 'bold 48px Outfit';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText("Too Slow!", CANVAS_W / 2, CANVAS_H / 2);
                    return;
                }

                const side = lastData.chosen_side;
                const targetX = side === 'left' ? leftX : rightX;
                const bufferTime = Math.max(0, params.stimulus_duration - lastData.rt);
                const startTime = performance.now();
                const flipDuration = 400;

                function animate(time) {
                    const elapsed = time - startTime;
                    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

                    if (elapsed < bufferTime) {
                        // Phase 1: Static Highlight
                        drawCard(ctx, leftX, centerY, DECK_W, DECK_H, trial_info.colors.left, IMAGE_CACHE[trial_info.images.left.path], null, side === 'left');
                        drawCard(ctx, rightX, centerY, DECK_W, DECK_H, trial_info.colors.right, IMAGE_CACHE[trial_info.images.right.path], null, side === 'right');
                    } else {
                        // Phase 2: Reveal Animation
                        const flipElapsed = elapsed - bufferTime;
                        const progress = Math.min(flipElapsed / flipDuration, 1.0);

                        let hScale, img, txt;
                        if (progress < 0.5) {
                            hScale = 1.0 - (progress * 2);
                            img = IMAGE_CACHE[trial_info.images[side].path];
                            txt = null;
                        } else {
                            hScale = (progress - 0.5) * 2;
                            img = IMAGE_CACHE[trial_info.images[side].path];
                            const rewardVal = lastData.reward;
                            txt = rewardVal === 1.0 ? "$1" : `${Math.round(rewardVal * 100)}¢`;
                        }
                        drawCard(ctx, targetX, centerY, DECK_W, DECK_H, trial_info.colors[side], img, txt, true, hScale);
                    }

                    if (elapsed < (bufferTime + params.feedback_duration)) {
                        requestAnimationFrame(animate);
                    }
                }
                requestAnimationFrame(animate);
            }
        });

        // 3. ITI (Inter-Trial Interval)
        timeline.push({
            type: jsPsychHtmlKeyboardResponse,
            stimulus: "",
            choices: "NO_KEYS",
            trial_duration: params.iti,
            conditional_function: function () {
                const trials = jsPsych.data.get().values().filter(d => d.is_trial);
                const lastTrial = trials[trials.length - 1];
                return lastTrial && lastTrial.response !== null;
            }
        });

        // 5. Optional Attention Check
        if (check_indices.includes(i)) {
            const target_key = jsPsych.randomization.sampleWithoutReplacement(['arrowup', 'arrowdown'], 1)[0];
            const target_label = target_key === 'arrowup' ? 'UP' : 'DOWN';

            timeline.push({
                type: jsPsychHtmlKeyboardResponse,
                stimulus: `<div style='font-size: 32px; font-weight: bold;'>Attention Check: Press the ${target_label} arrow</div>`,
                choices: "ALL_KEYS",
                trial_duration: 5000,
                data: { is_attention_check: true, correct_key: target_key },
                on_finish: function (data) {
                    data.success = (data.response === data.correct_key);
                }
            });

            // Add another small ITI after check
            timeline.push({
                type: jsPsychHtmlKeyboardResponse,
                stimulus: "",
                choices: "NO_KEYS",
                trial_duration: params.iti
            });
        }
    }

    // Finishing Screen
    timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus: function () {
            const trials = jsPsych.data.get().filter({ is_trial: true }).values();
            const allReward = trials.reduce((acc, t) => acc + (t.reward || 0), 0);
            const totalTrials = params.n_trials;
            const bonus = (allReward / totalTrials) * params.max_bonus;
            return `<div class='instruction-container'>
                <h2>Finished!</h2>
                <p>Your total winnings: <b>$${allReward.toFixed(2)}</b></p>
                <p>Your calculated bonus: <b>$${bonus.toFixed(2)}</b></p>
                <p>Total pay: $${(params.base_pay + bonus).toFixed(2)}</p>
                <p>Press the button below to submit your data.</p>
            </div>`;
        },
        choices: ['Finish'],
        on_finish: function (data) {
            const trials = jsPsych.data.get().filter({ is_trial: true }).values();
            const allReward = trials.reduce((acc, t) => acc + (t.reward || 0), 0);
            const totalTrials = params.n_trials;
            const bonus = (allReward / totalTrials) * params.max_bonus;

            data.is_summary = true;
            data.final_bonus = bonus.toFixed(2);
            data.total_winnings = allReward.toFixed(2);
        }
    });

    timeline.push({
        type: jsPsychPipe,
        action: "save",
        experiment_id: params.data_pipe_id,
        filename: `${subject_id}.csv`,
        data_string: () => jsPsych.data.get().csv(),
        on_finish: function () {
            window.location.href = "https://app.prolific.com/submissions/complete?cc=" + params.prolific_completion_code;
        }
    });

    jsPsych.run(timeline);
}
