/**
 * task.js - Task 2 (mem-ep-inc)
 * Core Logic: Joint Episodic-Incremental Model (Nicholas et al. 2022 Strictly Synced)
 */

// Canvas Polyfill for Safari
if (typeof CanvasRenderingContext2D.prototype.roundRect !== 'function') {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
        if (typeof radius === 'number') radius = { tl: radius, tr: radius, br: radius, bl: radius };
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

// 1. Asset Configuration
const STIM_LISTS = {
    memorability: {
        high: Array.from({ length: 204 }, (_, i) => `../stimuli/highmem/highmem_${i + 1}.jpg`),
        low: Array.from({ length: 204 }, (_, i) => `../stimuli/lowmem/lowmem_${i + 1}.jpg`)
    },
    distinctiveness: {
        high: Array.from({ length: 300 }, (_, i) => `../stimuli/unique_objects/unique_${i + 1}.jpg`),
        low: Array.from({ length: 300 }, (_, i) => `../stimuli/airplanes/airplane_${i + 1}.jpg`)
    }
};

const IMAGE_CACHE = {};
const REWARD_OPTIONS = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

// 2. Global State Variables
let current_reversals = [];
let deck_lucks = { blue: 'unlucky', orange: 'unlucky' };
let reward_pools = { blue: [], orange: [] }; // Shuffled pools per color
let old_object_pool = []; // Memory of CHOSEN objects {path, value, deck, type, trial_idx}
let used_stim_paths = new Set();
let overall_reward_sum = 0;
let last_reversal_trial_i = 0;

// 3. Helper Functions
function generate_reversals(n_trials) {
    let revs = [];
    let last = 0;
    while (last < n_trials) {
        let step = Math.floor(Math.random() * (params.max_reversal - params.min_reversal + 1)) + params.min_reversal;
        last += step;
        if (last < n_trials) revs.push(last);
    }
    return revs;
}

function repopulate_color_pool(color) {
    const dist = params[`${deck_lucks[color]}_reward_dist`];
    // 2x repetition (40 items total) to improve matching availability (Step 3)
    reward_pools[color] = jsPsych.randomization.repeat(dist, 2);
}

function initTask(jsPsych) {
    const timeline = [];
    const condition = params.stim_type;

    const subject_id = jsPsych.data.getURLVariable('PROLIFIC_PID') || 'local_' + jsPsych.randomization.randomID(8);
    const study_id = jsPsych.data.getURLVariable('STUDY_ID');
    const session_id = jsPsych.data.getURLVariable('SESSION_ID');

    jsPsych.data.addProperties({
        subject_id: subject_id,
        study_id: study_id,
        session_id: session_id,
        experiment_id: params.experiment_id,
        params: params
    });

    current_reversals = generate_reversals(params.n_trials);
    const first_lucky = Math.random() < 0.5 ? 'blue' : 'orange';
    deck_lucks = {
        blue: (first_lucky === 'blue') ? 'lucky' : 'unlucky',
        orange: (first_lucky === 'orange') ? 'lucky' : 'unlucky'
    };
    repopulate_color_pool('blue');
    repopulate_color_pool('orange');

    const preload_paths = [...STIM_LISTS[condition].high, ...STIM_LISTS[condition].low];
    timeline.push({
        type: jsPsychPreload,
        images: preload_paths,
        on_finish: () => {
            preload_paths.forEach(p => {
                const img = new Image();
                img.src = p;
                IMAGE_CACHE[p] = img;
            });
        }
    });

    timeline.push({ type: jsPsychFullscreen, fullscreen_mode: true });

    timeline.push({
        type: jsPsychInstructions,
        pages: params.instruction_pages,
        show_clickable_nav: true
    });

    const DECK_W = 380, DECK_H = 500, CANVAS_W = 1200, CANVAS_H = 850, SPACING = 100;
    const leftX = CANVAS_W / 2 - DECK_W - SPACING / 2;
    const rightX = CANVAS_W / 2 + SPACING / 2;
    const centerY = CANVAS_H / 2 - DECK_H / 2;

    function drawCard(ctx, x, y, color, image = null, reward = null, isSelected = false, flipScale = 1.0) {
        ctx.save();
        ctx.translate(x + DECK_W / 2, y + DECK_H / 2);
        ctx.scale(flipScale, 1.0);
        ctx.translate(-DECK_W / 2, -DECK_H / 2);

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.roundRect(0, 0, DECK_W, DECK_H, 20);
        ctx.fill();

        ctx.strokeStyle = (color === 'blue') ? params.blue_deck_color : params.orange_deck_color;
        ctx.lineWidth = 24;

        if (isSelected) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = params.highlight_color;
        }
        ctx.stroke();

        if (reward !== null) {
            ctx.fillStyle = '#000';
            ctx.font = 'bold 70px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const txt = (reward === 1.0) ? "$1" : `${Math.round(reward * 100)}\u00A2`;
            ctx.fillText(txt, DECK_W / 2, DECK_H / 2);
        } else if (image) {
            const padding = 30;
            const maxW = DECK_W - padding * 2;
            const maxH = DECK_H - padding * 2;
            const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight);
            const w = image.naturalWidth * scale;
            const h = image.naturalHeight * scale;
            ctx.drawImage(image, (DECK_W - w) / 2, (DECK_H - h) / 2, w, h);
        }
        ctx.restore();
    }

    // --- Main Loop ---
    for (let i = 0; i < params.n_trials; i++) {

        let t_data = {};
        let old_obj_for_trial = null;

        const setupTrial = {
            type: jsPsychHtmlKeyboardResponse,
            stimulus: '',
            choices: "NO_KEYS",
            trial_duration: 0,
            on_start: function () {
                // (1) Handle Reversals & Pool Refresh
                if (current_reversals.includes(i)) {
                    [deck_lucks.blue, deck_lucks.orange] = [deck_lucks.orange, deck_lucks.blue];
                    repopulate_color_pool('blue');
                    repopulate_color_pool('orange');
                    last_reversal_trial_i = i;
                }

                // (2) Position Randomization
                const sides = jsPsych.randomization.shuffle(['blue', 'orange']);
                t_data.left_color = sides[0];
                t_data.right_color = sides[1];
                t_data.lucky_color = (deck_lucks.blue === 'lucky') ? 'blue' : 'orange';

                // (3) Episodic Sampling Logic (Rule i, ii, iii)
                const window_min = i - 30;
                const window_max = i - 9;
                const candidates = old_object_pool.filter(o => o.trial_idx >= window_min && o.trial_idx <= window_max);

                let is_old = false;
                let target_side = null;

                if (Math.random() < params.old_trial_prob && candidates.length > 0) {

                    // Identify ALL possible (candidate, side) pairs satisfy Rule i (Value Matching)
                    let valid_pairs = [];
                    candidates.forEach(obj => {
                        ['left', 'right'].forEach(side => {
                            const color = t_data[`${side}_color`];
                            if (reward_pools[color].includes(obj.value)) {
                                valid_pairs.push({ obj, side });
                            }
                        });
                    });

                    if (valid_pairs.length > 0) {
                        is_old = true;

                        // Rule ii: Narrow to Incongruent with current luck if available
                        const inc_pairs = valid_pairs.filter(p => {
                            const side_luck = deck_lucks[t_data[`${p.side}_color`]];
                            return (side_luck === 'lucky' && p.obj.value < 0.5) ||
                                (side_luck === 'unlucky' && p.obj.value > 0.5);
                        });

                        let selection_list = inc_pairs.length > 0 ? inc_pairs : valid_pairs;

                        // Rule iii: Centering (Lowest reward if average > 0.5)
                        const avg_reward = (overall_reward_sum > 0) ? (overall_reward_sum / i) : 0.5;
                        let selected_pair;

                        // Shuffle to avoid side bias if multiple identical mins exist
                        selection_list = jsPsych.randomization.shuffle(selection_list);

                        if (avg_reward > 0.5) {
                            selected_pair = selection_list.reduce((prev, curr) => (prev.obj.value < curr.obj.value) ? prev : curr);
                        } else {
                            selected_pair = selection_list[0]; // Already shuffled
                        }

                        old_obj_for_trial = selected_pair.obj;
                        target_side = selected_pair.side;

                        // REMOVE from memory pool
                        const sel_idx = old_object_pool.indexOf(old_obj_for_trial);
                        if (sel_idx > -1) old_object_pool.splice(sel_idx, 1);

                        // Synchronize: Remove the matched value from the deck's incremental pool
                        const color = t_data[`${target_side}_color`];
                        const val_idx = reward_pools[color].indexOf(old_obj_for_trial.value);
                        reward_pools[color].splice(val_idx, 1);
                    }
                }

                // (4) Image & Value Assignment
                const other_side = (target_side === 'left') ? 'right' : 'left';
                const other_color = t_data[`${other_side}_color`];

                if (is_old) {
                    t_data.is_old = true;
                    t_data.old_side = target_side;
                    t_data[`${target_side}_img`] = old_obj_for_trial.path;
                    t_data[`${target_side}_val`] = old_obj_for_trial.value;
                    t_data[`${target_side}_type`] = old_obj_for_trial.type;

                    const cat = old_obj_for_trial.type;
                    const available_new = STIM_LISTS[condition][cat].filter(p => !used_stim_paths.has(p));
                    const path_new = jsPsych.randomization.sampleWithoutReplacement(available_new, 1)[0];
                    used_stim_paths.add(path_new);

                    t_data[`${other_side}_img`] = path_new;
                    t_data[`${other_side}_val`] = reward_pools[other_color].shift(); // Sample incremental
                    t_data[`${other_side}_type`] = cat;
                } else {
                    t_data.is_old = false;
                    const cat = Math.random() < 0.5 ? 'high' : 'low';
                    const paths = jsPsych.randomization.sampleWithoutReplacement(STIM_LISTS[condition][cat].filter(p => !used_stim_paths.has(p)), 2);
                    used_stim_paths.add(paths[0]);
                    used_stim_paths.add(paths[1]);

                    t_data.left_img = paths[0];
                    t_data.right_img = paths[1];
                    t_data.left_val = reward_pools[t_data.left_color].shift();
                    t_data.right_val = reward_pools[t_data.right_color].shift();
                    t_data.left_type = cat;
                    t_data.right_type = cat;
                }

                // Repopulate if we just used the last items
                if (reward_pools.blue.length === 0) repopulate_color_pool('blue');
                if (reward_pools.orange.length === 0) repopulate_color_pool('orange');
            }
        };
        timeline.push(setupTrial);

        // 2. Choice Phase
        timeline.push({
            type: jsPsychCanvasKeyboardResponse,
            canvas_size: [CANVAS_H, CANVAS_W],
            choices: ['arrowleft', 'arrowright'],
            trial_duration: params.stimulus_duration,
            stimulus: function (canvas) {
                const ctx = canvas.getContext('2d');
                drawCard(ctx, leftX, centerY, t_data.left_color, IMAGE_CACHE[t_data.left_img]);
                drawCard(ctx, rightX, centerY, t_data.right_color, IMAGE_CACHE[t_data.right_img]);
            },
            data: { is_trial: true, trial_i: i },
            on_finish: function (data) {
                const side = (data.response === 'arrowleft') ? 'left' : 'right';
                if (!data.response) return;

                data.chosen_side = side;
                data.chosen_color = t_data[`${side}_color`];
                data.reward = t_data[`${side}_val`] || 0;
                data.is_lucky = (data.chosen_color === t_data.lucky_color);
                data.picked_luck = (data.is_lucky) ? "lucky" : "unlucky";
                data.is_old_trial = t_data.is_old;
                data.stim_type = t_data[`${side}_type`] || 'high';
                data.trials_since_reversal = i - last_reversal_trial_i;

                if (t_data.is_old) {
                    data.old_side = t_data.old_side;
                    data.old_reward = t_data[`${t_data.old_side}_val`] || 0;
                    data.did_choose_old = (side === t_data.old_side) ? 1 : 0;
                    data.encoding_trial_i = old_obj_for_trial.trial_idx;
                    data.old_card_deck = old_obj_for_trial.deck_on_chosen_trial;
                }

                overall_reward_sum += data.reward;

                // Logic: Any image seen for the FIRST time and CHOSEN enters the repeat pool.
                // It's a "New" encounter if:
                // a) The whole trial is New (is_old is false).
                // b) The trial is Old/New, but the participant picked the NEW side.
                const was_new_pick = !t_data.is_old || (t_data.is_old && side !== t_data.old_side);

                if (was_new_pick) {
                    old_object_pool.push({
                        path: t_data[`${side}_img`],
                        value: t_data[`${side}_val`],
                        deck_on_chosen_trial: t_data[`${side}_color`],
                        type: t_data[`${side}_type`],
                        trial_idx: i
                    });
                }
            }
        });

        // 3. Feedback Animation
        timeline.push({
            type: jsPsychCanvasKeyboardResponse,
            canvas_size: [CANVAS_H, CANVAS_W],
            choices: "NO_KEYS",
            trial_duration: function () {
                const last = jsPsych.data.get().last(1).values()[0];
                if (!last.response) return params.too_slow_duration;
                const cue_delay = 1000; // Constant 1s highlight
                return cue_delay + params.feedback_duration;
            },
            stimulus: function (canvas) {
                const ctx = canvas.getContext('2d');
                const last = jsPsych.data.get().last(1).values()[0];

                if (!last.response) {
                    ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 60px Outfit'; ctx.textAlign = 'center';
                    ctx.fillText("Too Slow!", CANVAS_W / 2, CANVAS_H / 2);
                    return;
                }

                const startTime = performance.now();
                const cueDelay = 1000; // Constant 1s
                const flipDuration = 400;

                function animate(now) {
                    const elapsed = now - startTime;
                    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
                    const targetX = (last.chosen_side === 'left') ? leftX : rightX;

                    if (elapsed < cueDelay) {
                        drawCard(ctx, targetX, centerY, last.chosen_color, IMAGE_CACHE[t_data[`${last.chosen_side}_img`]], null, true, 1.0);
                    } else {
                        const progress = Math.min((elapsed - cueDelay) / flipDuration, 1.0);
                        let flipScale, rw = null;
                        if (progress < 0.5) flipScale = 1.0 - (progress * 2);
                        else { flipScale = (progress - 0.5) * 2; rw = last.reward; }
                        drawCard(ctx, targetX, centerY, last.chosen_color, IMAGE_CACHE[t_data[`${last.chosen_side}_img`]], rw, true, flipScale);
                    }
                    if (elapsed < (cueDelay + params.feedback_duration)) requestAnimationFrame(animate);
                }
                requestAnimationFrame(animate);
            }
        });

        timeline.push({
            type: jsPsychHtmlKeyboardResponse,
            stimulus: '<div class="fixation-cross">+</div>',
            choices: "NO_KEYS",
            trial_duration: params.iti
        });

        if ((i + 1) % params.n_trials_per_block === 0 && (i + 1) < params.n_trials) {
            timeline.push({
                type: jsPsychHtmlKeyboardResponse,
                stimulus: function () {
                    const earnings = jsPsych.data.get().filter({ is_trial: true }).select('reward').sum();
                    return `<div class='instruction-container'>
                        <h2>Block ${Math.floor((i + 1) / 60)} Complete!</h2>
                        <p>Take a 30-second break. Your winnings so far: <b>$${earnings.toFixed(2)}</b></p>
                        <p>Press <b>Space</b> to resume early or wait for the timer.</p>
                        <div id='timer' style='font-size: 24px; font-weight: bold;'>30s</div>
                    </div>`;
                },
                choices: [' '],
                trial_duration: params.break_duration,
                on_start: function () {
                    let timeLeft = 30;
                    this.timer_interval = setInterval(() => {
                        const timer = document.getElementById('timer');
                        if (timer) timer.innerText = --timeLeft + 's';
                        if (timeLeft <= 0) clearInterval(this.timer_interval);
                    }, 1000);
                },
                on_finish: function () {
                    clearInterval(this.timer_interval);
                }
            });
        }
    }

    timeline.push({
        type: jsPsychHtmlButtonResponse,
        stimulus: function () {
            const trials = jsPsych.data.get().filter({ is_trial: true });
            if (trials.count() === 0) return "<div class='instruction-container'><h2>Game Over!</h2><p>No trials completed.</p></div>";
            const avg_reward = trials.select('reward').mean();
            const bonus_raw = (avg_reward - 0.50) / (0.70 - 0.50) * params.max_bonus;
            const final_bonus = Math.max(0, Math.min(params.max_bonus, bonus_raw)).toFixed(2);
            return `<div class='instruction-container'>
                <h2>Game Over!</h2>
                <p>Your average reward was <b>$${avg_reward.toFixed(2)}</b>.</p>
                <p>Based on your performance relative to a random player, your bonus is: <b>$${final_bonus}</b></p>
                <p>Press the button below to finish and save.</p>
            </div>`;
        },
        choices: ['Finish and Save'],
        on_finish: (data) => {
            const trials = jsPsych.data.get().filter({ is_trial: true });
            if (trials.count() > 0) {
                const avg_reward = trials.select('reward').mean();
                const bonus_raw = (avg_reward - 0.50) / (0.70 - 0.50) * params.max_bonus;
                data.final_bonus = Math.max(0, Math.min(params.max_bonus, bonus_raw)).toFixed(2);
            }
        }
    });

    timeline.push({
        type: jsPsychPipe,
        action: "save", experiment_id: params.data_pipe_id,
        filename: () => `${subject_id}.csv`,
        data_string: () => jsPsych.data.get().csv(),
        on_finish: () => { window.location.href = "https://app.prolific.com/submissions/complete?cc=" + params.prolific_completion_code; }
    });

    jsPsych.run(timeline);
}
