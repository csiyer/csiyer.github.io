/**
 * task.js - Core experiment logic for FIFO-Color
 * Updated to use CSS Filters to avoid CORS/Security errors on local files.
 */

async function initTask(jsPsych, subject_id) {

    const allStimuliPaths = Array.from({ length: 36 }, (_, i) => `stimuli/obj${(i + 1).toString().padStart(2, '0')}.jpg`);
    const instructionStim = allStimuliPaths[0];
    const taskStimuli = jsPsych.randomization.shuffle(allStimuliPaths.slice(1));

    // Capture Prolific metadata
    const pid = jsPsych.data.getURLVariable('PROLIFIC_PID') || 'unknown';
    const study_id = jsPsych.data.getURLVariable('STUDY_ID') || 'unknown';
    const session_id = jsPsych.data.getURLVariable('SESSION_ID') || 'unknown';
    jsPsych.data.addProperties({
        prolific_id: pid,
        study_id: study_id,
        session_id: session_id,
        subject_id: subject_id,
        experiment_id: params.experiment_id,
        experiment_date: new Date().toISOString()
    });

    const dist = params.color_distance_deg;
    const allUniqueStimuli = [];
    const allSequencePairs = [];

    // Generate 6 equally-spaced anchors
    const anchorPool = jsPsych.randomization.shuffle(
        Array.from({ length: 6 }, (_, i) => Math.floor(i * (360 / 6)))
    );

    let stimuliIdx = 0;
    const nextStim = () => taskStimuli[stimuliIdx++];

    // Helper to create stim object
    const createStim = (path, hue, role, condition, is_high_frequency = false) => {
        const stim = {
            path: path,
            hue: (hue + 360) % 360,
            role: role,
            condition: condition,
            is_high_frequency: is_high_frequency,
            image_id: parseInt(path.match(/obj(\d+)/)[1])
        };
        const existing = allUniqueStimuli.find(s => s.path === path && s.hue === stim.hue);
        if (existing) return existing;
        allUniqueStimuli.push(stim);
        return stim;
    };

    // Create Stimuli Objects
    // Fan-In: 2A -> 1B
    const B1 = createStim(nextStim(), anchorPool[1], 'B', 'fanin', true);
    const A1 = createStim(nextStim(), anchorPool[0] - dist / 2, 'A', 'fanin');
    const A2 = createStim(nextStim(), anchorPool[0] + dist / 2, 'A', 'fanin');
    allSequencePairs.push({ A: A1, B: B1 }, { A: A2, B: B1 });
    A1.color_pair_id = A2.image_id; A1.color_pair_hue = A2.hue;
    A2.color_pair_id = A1.image_id; A2.color_pair_hue = A1.hue;

    // Fan-Out: 1A -> 2B
    const A3 = createStim(nextStim(), anchorPool[2], 'A', 'fanout', true);
    const B2 = createStim(nextStim(), anchorPool[3] - dist / 2, 'B', 'fanout');
    const B3 = createStim(nextStim(), anchorPool[3] + dist / 2, 'B', 'fanout');
    allSequencePairs.push({ A: A3, B: B2 }, { A: A3, B: B3 });
    B2.color_pair_id = B3.image_id; B2.color_pair_hue = B3.hue;
    B3.color_pair_id = B2.image_id; B3.color_pair_hue = B2.hue;

    // Independent: 2A -> 2B
    // A4/A5 are color pairmates. B4/B5 are color pairmates.
    const A4 = createStim(nextStim(), anchorPool[4] - dist / 2, 'A', 'independent');
    const A5 = createStim(nextStim(), anchorPool[4] + dist / 2, 'A', 'independent');
    const B4 = createStim(nextStim(), anchorPool[5] - dist / 2, 'B', 'independent');
    const B5 = createStim(nextStim(), anchorPool[5] + dist / 2, 'B', 'independent');

    allSequencePairs.push({ A: A4, B: B4 }, { A: A5, B: B5 });
    A4.color_pair_id = A5.image_id; A4.color_pair_hue = A5.hue;
    A5.color_pair_id = A4.image_id; A5.color_pair_hue = A4.hue;
    B4.color_pair_id = B5.image_id; B4.color_pair_hue = B5.hue;
    B5.color_pair_id = B4.image_id; B5.color_pair_hue = B4.hue;

    // --- Timeline ---
    const timeline = [];
    timeline.push({ type: jsPsychPreload, images: allStimuliPaths });

    // Instructions
    let instructionObserver;
    timeline.push({
        type: jsPsychInstructions,
        pages: params.instruction_pages,
        show_clickable_nav: true,
        on_load: function () {
            instructionObserver = new MutationObserver((mutations) => {
                const canvas = document.getElementById('instruction-canvas');
                if (canvas && !canvas.dataset.initialized) {
                    canvas.dataset.initialized = "true";
                    renderColorTest(canvas, { path: instructionStim }, jsPsych);
                    setupColorWheelInteraction(jsPsych, { path: instructionStim }, false, true);
                }
            });
            instructionObserver.observe(document.body, { childList: true, subtree: true });
        },
        on_finish: function () { if (instructionObserver) instructionObserver.disconnect(); }
    });

    // --- Block Loop ---
    for (let b = 0; b < params.n_blocks; b++) {
        timeline.push({
            type: jsPsychHtmlKeyboardResponse,
            stimulus: '<div style="font-size: 60px;">+</div>',
            choices: "NO_KEYS",
            trial_duration: params.interpair_iti,
            data: { phase: 'iti', block: b }
        });

        const allRepTrials = [];
        for (let r = 0; r < params.n_repetitions_per_block; r++) {
            jsPsych.randomization.shuffle(allSequencePairs).forEach(pair => {
                allRepTrials.push({ pair: pair, rep: r });
            });
        }

        const sequenceTimeline = {
            timeline: [
                {
                    type: jsPsychHtmlKeyboardResponse,
                    stimulus: function () {
                        const pair = jsPsych.timelineVariable('pair');
                        if (params.show_pairs_together) {
                            return `<div style="display: flex; justify-content: center; align-items: center; gap: 50px;">
                                <img src="${pair.A.path}" style="width:300px; height:300px; filter: hue-rotate(${pair.A.hue}deg);">
                                <img src="${pair.B.path}" style="width:300px; height:300px; filter: hue-rotate(${pair.B.hue}deg);">
                            </div>`;
                        } else {
                            return `<img src="${pair.A.path}" style="width:400px; height:400px; filter: hue-rotate(${pair.A.hue}deg);">`;
                        }
                    },
                    choices: "NO_KEYS",
                    trial_duration: params.stim_duration,
                    data: function () {
                        const pair = jsPsych.timelineVariable('pair');
                        return {
                            phase: 'sequence',
                            block: b,
                            rep: jsPsych.timelineVariable('rep'),
                            path: pair.A.path,
                            image_id: pair.A.image_id,
                            target_hue: pair.A.hue,
                            role: 'A',
                            pair_b_path: pair.B.path,
                            condition: pair.A.condition,
                            is_high_frequency: pair.A.is_high_frequency,
                            color_pair_id: pair.A.color_pair_id,
                            color_pair_hue: pair.A.color_pair_hue
                        };
                    }
                },
                {
                    type: jsPsychHtmlKeyboardResponse,
                    stimulus: function () {
                        const pair = jsPsych.timelineVariable('pair');
                        if (params.show_pairs_together) return '<div style="font-size: 60px;">+</div>';
                        return `<img src="${pair.B.path}" style="width:400px; height:400px; filter: hue-rotate(${pair.B.hue}deg);">`;
                    },
                    choices: "NO_KEYS",
                    trial_duration: function () { return params.show_pairs_together ? params.interpair_iti : params.stim_duration; },
                    data: function () {
                        if (params.show_pairs_together) return { phase: 'iti' };
                        const pair = jsPsych.timelineVariable('pair');
                        return {
                            phase: 'sequence',
                            block: b,
                            rep: jsPsych.timelineVariable('rep'),
                            path: pair.B.path,
                            image_id: pair.B.image_id,
                            target_hue: pair.B.hue,
                            role: 'B',
                            condition: pair.B.condition,
                            is_high_frequency: pair.B.is_high_frequency,
                            color_pair_id: pair.B.color_pair_id,
                            color_pair_hue: pair.B.color_pair_hue
                        };
                    }
                },
                // If not together, we need one more ITI
                {
                    timeline: [{
                        type: jsPsychHtmlKeyboardResponse,
                        stimulus: '<div style="font-size: 60px;">+</div>',
                        choices: "NO_KEYS",
                        trial_duration: params.interpair_iti
                    }],
                    conditional_function: function () { return !params.show_pairs_together; }
                }
            ],
            timeline_variables: allRepTrials
        };
        timeline.push(sequenceTimeline);

        // --- Color Memory Test ---
        timeline.push({
            type: jsPsychInstructions,
            pages: [`<p>Now you will begin a memory test.</p>Identify the color of each object as accurately as you can to earn bonus money!</p>`],
            show_clickable_nav: true
        });

        const testStimuli = jsPsych.randomization.shuffle(allUniqueStimuli);
        testStimuli.forEach(target => {
            let lastHue = null;
            timeline.push({
                type: jsPsychCanvasButtonResponse,
                canvas_size: [450, 450],
                stimulus: (canvas) => renderColorTest(canvas, target, jsPsych),
                choices: ['Submit'],
                trial_duration: params.max_report_time,
                on_load: () => setupColorWheelInteraction(jsPsych, target, false, true, (h) => { lastHue = h; }),
                data: {
                    phase: 'color_test',
                    block: b,
                    path: target.path,
                    image_id: target.image_id,
                    target_hue: target.hue,
                    condition: target.condition,
                    role: target.role,
                    color_pair_id: target.color_pair_id,
                    color_pair_hue: target.color_pair_hue,
                    is_high_frequency: target.is_high_frequency
                },
                on_finish: function (data) {
                    data.response_hue = lastHue;
                    if (data.response_hue !== null) {
                        let diff = Math.abs(data.target_hue - data.response_hue);
                        if (diff > 180) diff = 360 - diff;
                        data.error_deg = diff;
                        data.is_accurate = diff <= 10;

                        // Attraction/Repulsion calculation:
                        if (data.color_pair_hue !== undefined) {
                            let hue_diff = data.response_hue - data.target_hue;
                            if (hue_diff > 180) hue_diff -= 360;
                            if (hue_diff < -180) hue_diff += 360;

                            let pair_diff = data.color_pair_hue - data.target_hue;
                            if (pair_diff > 180) pair_diff -= 360;
                            if (pair_diff < -180) pair_diff += 360;

                            // Positive bias_deg = attraction, negative = repulsion
                            data.bias_deg = (pair_diff > 0) ? hue_diff : -hue_diff;
                        }
                    }
                }
            });
        });

        // --- Associative Memory Test ---
        timeline.push({
            type: jsPsychInstructions,
            pages: [`<p>Now for an associative memory test.</p><p>You will see an image. Correctly select which of the three options below was paired with it to earn bonus money!</p>`],
            show_clickable_nav: true
        });

        // Ensure unique cues and unique targets for the associative test
        const uniqueCueTargetPairs = [];
        const usedCues = new Set();
        const usedTargets = new Set();

        jsPsych.randomization.shuffle(allSequencePairs).forEach(p => {
            if (!usedCues.has(p.A.path) && !usedTargets.has(p.B.path)) {
                usedCues.add(p.A.path);
                usedTargets.add(p.B.path);
                uniqueCueTargetPairs.push(p);
            }
        });

        const assocTrials = uniqueCueTargetPairs.slice(0, params.n_associative_test_trials);
        assocTrials.forEach(trial => {
            // Foil A: randomly chosen from another pair's A
            const otherAPairs = allSequencePairs.filter(p => p.A.path !== trial.A.path);
            const foilA = jsPsych.randomization.sampleWithoutReplacement(otherAPairs, 1)[0].A;
            // Foil B: randomly chosen from another pair's B and NOT the target
            const otherBPairs = allSequencePairs.filter(p => p.B.path !== trial.B.path && p.B.path !== trial.A.path);
            const foilB = jsPsych.randomization.sampleWithoutReplacement(otherBPairs, 1)[0].B;

            const options = jsPsych.randomization.shuffle([
                { path: trial.B.path, hue: trial.B.hue, is_correct: true },
                { path: foilA.path, hue: foilA.hue, is_correct: false },
                { path: foilB.path, hue: foilB.hue, is_correct: false }
            ]);

            timeline.push({
                type: jsPsychHtmlButtonResponse,
                stimulus: `<p>Which image was paired with this one?</p>
                           <img src="${trial.A.path}" style="width:250px; height:250px; filter: hue-rotate(${trial.A.hue}deg);">`,
                choices: options.map(opt => `<img src="${opt.path}" style="width:150px; height:150px; filter: hue-rotate(${opt.hue}deg);">`),
                data: {
                    phase: 'assoc_test',
                    block: b,
                    target_path: trial.B.path,
                    cue_path: trial.A.path,
                    condition: trial.A.condition,
                    foil1_path: options.find(o => !o.is_correct).path,
                    foil2_path: options.filter(o => !o.is_correct)[1].path
                },
                on_finish: function (data) {
                    data.response_index = data.response; // 0, 1, or 2
                    data.is_correct = options[data.response].is_correct;
                }
            });
        });
    }

    timeline.push({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: function () {
            const colorData = jsPsych.data.get().filter({ phase: 'color_test' }).values();
            const assocData = jsPsych.data.get().filter({ phase: 'assoc_test' }).values();
            const colorAcc = colorData.length > 0 ? colorData.filter(d => d.is_accurate).length / colorData.length : 0;
            const assocAcc = assocData.length > 0 ? assocData.filter(d => d.is_correct).length / assocData.length : 0;
            const overallAcc = (colorData.filter(d => d.is_accurate).length + assocData.filter(d => d.is_correct).length) / (colorData.length + assocData.length || 1);
            const bonus = (overallAcc * params.max_bonus).toFixed(2);

            return `<div style="line-height: 1.6;">
                <h2>Experiment Complete</h2>
                <p>Color Memory Accuracy: <strong>${(colorAcc * 100).toFixed(1)}%</strong></p>
                <p>Associative Memory Accuracy: <strong>${(assocAcc * 100).toFixed(1)}%</strong></p>
                <p>Bonus Earned: <strong>$${bonus}</strong></p>
                <br><button id="end-btn" class="jspsych-btn">End Experiment</button>
            </div>`;
        },
        data: function () {
            const colorData = jsPsych.data.get().filter({ phase: 'color_test' }).values();
            const assocData = jsPsych.data.get().filter({ phase: 'assoc_test' }).values();
            const colorAcc = colorData.length > 0 ? colorData.filter(d => d.is_accurate).length / colorData.length : 0;
            const assocAcc = assocData.length > 0 ? assocData.filter(d => d.is_correct).length / assocData.length : 0;
            const overallAcc = (colorData.filter(d => d.is_accurate).length + assocData.filter(d => d.is_correct).length) / (colorData.length + assocData.length || 1);
            const bonus = (overallAcc * params.max_bonus).toFixed(2);

            const validErrors = colorData.map(d => d.error_deg).filter(e => e !== null && e !== undefined);
            const avg_error = validErrors.length > 0 ? (validErrors.reduce((a, b) => a + b, 0) / validErrors.length).toFixed(1) : 0;

            return {
                phase: 'final_summary',
                total_time_min: (jsPsych.getTotalTime() / 60000).toFixed(2),
                final_avg_error: avg_error,
                final_bonus_earned: bonus,
                color_accuracy: colorAcc,
                assoc_accuracy: assocAcc
            };
        },
        on_load: function () {
            document.getElementById('end-btn').addEventListener('click', () => {
                const colorData = jsPsych.data.get().filter({ phase: 'color_test' }).values();
                const assocData = jsPsych.data.get().filter({ phase: 'assoc_test' }).values();
                const colorAcc = colorData.length > 0 ? colorData.filter(d => d.is_accurate).length / colorData.length : 0;
                const assocAcc = assocData.length > 0 ? assocData.filter(d => d.is_correct).length / assocData.length : 0;
                const overallAcc = (colorData.filter(d => d.is_accurate).length + assocData.filter(d => d.is_correct).length) / (colorData.length + assocData.length || 1);
                const bonus = (overallAcc * params.max_bonus).toFixed(2);

                const validErrors = colorData.map(d => d.error_deg).filter(e => e !== null && e !== undefined);
                const avg_error = validErrors.length > 0 ? (validErrors.reduce((a, b) => a + b, 0) / validErrors.length).toFixed(1) : 0;

                const summaryResults = {
                    phase: 'final_summary',
                    total_time_min: (jsPsych.getTotalTime() / 60000).toFixed(2),
                    final_avg_error: avg_error,
                    final_bonus_earned: bonus,
                    color_accuracy: colorAcc,
                    assoc_accuracy: assocAcc
                };

                // CRITICAL: Manually add to data before saving!
                jsPsych.data.write(summaryResults);

                const isLocal = window.location.protocol === "file:" ||
                                window.location.hostname === "localhost" ||
                                window.location.hostname === "127.0.0.1";
                
                const redirect = () => {
                    const cc = params.prolific_completion_code || 'unknown';
                    window.location.href = `https://app.prolific.com/submissions/complete?cc=${cc}`;
                };

                if (isLocal) {
                    jsPsych.data.get().localSave('csv', `fifocolor_${subject_id}.csv`);
                    setTimeout(redirect, 600);
                } else {
                    // Update button to show progress
                    const btn = document.getElementById('end-btn');
                    btn.disabled = true;
                    btn.innerHTML = "Saving data, please wait...";

                    // Explicitly use fetch to DataPipe to ensure it finishes before redirect
                    fetch("https://pipe.jspsych.org/api/data/", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Accept": "application/json",
                        },
                        body: JSON.stringify({
                            experiment_id: params.data_pipe_id,
                            filename: `${subject_id}.csv`,
                            data: jsPsych.data.get().csv(),
                        }),
                    })
                    .then(response => {
                        if (response.ok) {
                            console.log("DataPipe success:", response);
                            redirect();
                        } else {
                            // If it's a server error, show it to help debug (e.g. wrong ID)
                            response.text().then(text => {
                                console.error("DataPipe Server Error:", text);
                                btn.innerHTML = `Error ${response.status}: contact admin.`;
                                // Redirect after bit to not strand participant
                                setTimeout(redirect, 6000);
                            });
                        }
                    })
                    .catch(error => {
                        console.error("DataPipe Network Error:", error);
                        btn.innerHTML = "Network Error. Redirecting in 6s...";
                        setTimeout(redirect, 6000);
                    });
                }
            });
        }
    });

    jsPsych.run(timeline);
}

// --- UI Helpers ---

function renderColorTest(canvas, target, jsPsych, isAttention = false, currentHue = null) {
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 200;
    const innerPadding = 60;

    ctx.fillStyle = params.background_color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Color Wheel
    for (let i = 0; i < 360; i++) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, (i * Math.PI) / 180, ((i + 1) * Math.PI) / 180);
        ctx.fillStyle = `hsl(${i}, 100%, 50%)`;
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius - innerPadding, 0, Math.PI * 2);
    ctx.fillStyle = params.background_color;
    ctx.fill();

    if (currentHue !== null) {
        const radAngle = (currentHue) * (Math.PI / 180);
        const indicatorX = cx + (radius - innerPadding / 2) * Math.cos(radAngle);
        const indicatorY = cy + (radius - innerPadding / 2) * Math.sin(radAngle);
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY, innerPadding * 0.3, 0, Math.PI * 2);
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    if (!isAttention && target.path) {
        const img = new Image();
        img.onload = () => {
            ctx.save();
            if (currentHue === null) {
                ctx.filter = 'grayscale(100%)';
            } else {
                // Using Canvas Filter to avoid reading pixel data!
                ctx.filter = `hue-rotate(${currentHue}deg)`;
            }
            const size = canvas.width / 3;
            ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
            ctx.restore();
        };
        img.src = target.path;
    }
}

function setupColorWheelInteraction(jsPsych, target, isAttention = false, noAdvance = false, onUpdate = null) {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const mouseHandler = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - cx;
        const y = e.clientY - rect.top - cy;
        const radius = Math.sqrt(x * x + y * y);

        // Only trigger if clicking on the wheel
        if (radius < 140 || radius > 200) return;

        const angle = Math.atan2(y, x) * (180 / Math.PI);
        const hue = (angle + 360) % 360;

        renderColorTest(canvas, target, jsPsych, isAttention, hue);
        if (onUpdate) onUpdate(hue);

        const stop = () => {
            window.removeEventListener('mouseup', stop);
            canvas.removeEventListener('mousemove', moveHandler);
        };
        const moveHandler = (me) => {
            const mrect = canvas.getBoundingClientRect();
            const mx = me.clientX - mrect.left - cx;
            const my = me.clientY - mrect.top - cy;
            const mangle = Math.atan2(my, mx) * (180 / Math.PI);
            const mhue = (mangle + 360) % 360;
            renderColorTest(canvas, target, jsPsych, isAttention, mhue);
            if (onUpdate) onUpdate(mhue);
        };
        window.addEventListener('mouseup', stop);
        canvas.addEventListener('mousemove', moveHandler);
    };
    canvas.addEventListener('mousedown', mouseHandler);
}
