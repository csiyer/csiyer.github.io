/**
 * task.js - Core experiment logic for FIFO-Color
 */

// --- Color Conversion Helpers (RGB <-> CIELAB) ---

function rgbToXyz(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    r *= 100; g *= 100; b *= 100;
    const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    return [x, y, z];
}

function xyzToLab(x, y, z) {
    const refX = 95.047; const refY = 100.000; const refZ = 108.883;
    x /= refX; y /= refY; z /= refZ;
    x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
    y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
    z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);
    const l = (116 * y) - 16;
    const a = 500 * (x - y);
    const b_ = 200 * (y - z);
    return [l, a, b_];
}

function labToXyz(l, a, b_) {
    let y = (l + 16) / 116;
    let x = a / 500 + y;
    let z = y - b_ / 200;
    const y3 = Math.pow(y, 3);
    const x3 = Math.pow(x, 3);
    const z3 = Math.pow(z, 3);
    y = y3 > 0.008856 ? y3 : (y - 16 / 116) / 7.787;
    x = x3 > 0.008856 ? x3 : (x - 16 / 116) / 7.787;
    z = z3 > 0.008856 ? z3 : (z - 16 / 116) / 7.787;
    return [x * 95.047, y * 100.000, z * 108.883];
}

function xyzToRgb(x, y, z) {
    x /= 100; y /= 100; z /= 100;
    let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
    let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
    let b = x * 0.0557 + y * -0.2040 + z * 1.0570;
    r = r > 0.0031308 ? 1.055 * (Math.pow(r, 1 / 2.4)) - 0.055 : 12.92 * r;
    g = g > 0.0031308 ? 1.055 * (Math.pow(g, 1 / 2.4)) - 0.055 : 12.92 * g;
    b = b > 0.0031308 ? 1.055 * (Math.pow(b, 1 / 2.4)) - 0.055 : 12.92 * b;
    return [
        Math.max(0, Math.min(255, r * 255)),
        Math.max(0, Math.min(255, g * 255)),
        Math.max(0, Math.min(255, b * 255))
    ];
}

function rotateHue(imgData, angle, grayscale = false) {
    const data = imgData.data;
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    for (let i = 0; i < data.length; i += 4) {
        const [x, y, z] = rgbToXyz(data[i], data[i + 1], data[i + 2]);
        let [l, a, b_] = xyzToLab(x, y, z);

        let a_new, b_new;
        if (grayscale) {
            a_new = 0;
            b_new = 0;
        } else {
            a_new = a * cos - b_ * sin;
            b_new = a * sin + b_ * cos;
        }

        const [nx, ny, nz] = labToXyz(l, a_new, b_new);
        const [nr, ng, nb] = xyzToRgb(nx, ny, nz);
        data[i] = nr;
        data[i + 1] = ng;
        data[i + 2] = nb;
    }
}

// --- Task Implementation ---

export async function initTask(jsPsych, subject_id) {

    const allStimuliPaths = Array.from({ length: 36 }, (_, i) => `stimuli/obj${(i + 1).toString().padStart(2, '0')}.jpg`);
    const instructionStim = allStimuliPaths[0];
    const taskStimuli = allStimuliPaths.slice(1); // Exclude first image from task

    // Define the sequence structure for a set of 12 stimuli
    // Roles: A1-A6, B1-B6
    const totalSetSize = 12;
    const nSets = params.n_sets;
    const rolesPerSet = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'];

    // Generate anchor hulls for all sets
    // 8 anchor slots per set of 12 stimuli
    const totalAnchors = nSets * 8;
    const anchorHues = jsPsych.randomization.shuffle(
        Array.from({ length: totalAnchors }, (_, i) => i * (params.n_colors / totalAnchors))
    );

    const experimentalStructure = [];
    const allUniqueStimuli = [];
    const allSequenceTransitions = [];

    const dist = params.color_distance_max; // using 20 degrees as set in params

    for (let s = 0; s < nSets; s++) {
        const setStimuli = taskStimuli.slice(s * totalSetSize, (s + 1) * totalSetSize);
        const setAnchors = anchorHues.slice(s * 8, (s + 1) * 8);

        const setRoles = {};
        rolesPerSet.forEach((role, idx) => {
            setRoles[role] = setStimuli[idx];
        });

        const struct = {
            // Similarity Pairs (Anchors 0-3)
            A1: { path: setRoles.A1, hue: (setAnchors[0] - dist / 2 + params.n_colors) % params.n_colors },
            A2: { path: setRoles.A2, hue: (setAnchors[0] + dist / 2 + params.n_colors) % params.n_colors },
            B2: { path: setRoles.B2, hue: (setAnchors[1] - dist / 2 + params.n_colors) % params.n_colors },
            B3: { path: setRoles.B3, hue: (setAnchors[1] + dist / 2 + params.n_colors) % params.n_colors },
            A4: { path: setRoles.A4, hue: (setAnchors[2] - dist / 2 + params.n_colors) % params.n_colors },
            A5: { path: setRoles.A5, hue: (setAnchors[2] + dist / 2 + params.n_colors) % params.n_colors },
            B4: { path: setRoles.B4, hue: (setAnchors[3] - dist / 2 + params.n_colors) % params.n_colors },
            B5: { path: setRoles.B5, hue: (setAnchors[3] + dist / 2 + params.n_colors) % params.n_colors },
            // Individual Anchors (Anchors 4-7)
            B1: { path: setRoles.B1, hue: setAnchors[4] },
            A3: { path: setRoles.A3, hue: setAnchors[5] },
            A6: { path: setRoles.A6, hue: setAnchors[6] },
            B6: { path: setRoles.B6, hue: setAnchors[7] }
        };

        experimentalStructure.push(struct);
        allUniqueStimuli.push(...Object.values(struct));

        // Define the 7 Transitions for this set
        allSequenceTransitions.push(
            { stim: struct.A1, next: struct.B1 },
            { stim: struct.A2, next: struct.B1 },
            { stim: struct.A3, next: struct.B2 },
            { stim: struct.A3, next: struct.B3 },
            { stim: struct.A4, next: struct.B4 },
            { stim: struct.A5, next: struct.B5 },
            { stim: struct.A6, next: struct.B6 }
        );
    }

    // Helper to rotate and cache images
    const rotatedCache = {};
    async function preRotateImages() {
        const promises = allUniqueStimuli.map(stim => {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    rotateHue(imgData, stim.hue);
                    ctx.putImageData(imgData, 0, 0);
                    rotatedCache[`${stim.path}_${stim.hue}`] = canvas.toDataURL();
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${stim.path}`);
                    resolve(); // Resolve anyway to avoid hanging Promise.all
                };
                img.src = stim.path;
            });
        });
        await Promise.all(promises);
    }

    // --- jsPsych Timeline ---

    const timeline = [];

    // Preload
    timeline.push({
        type: jsPsychPreload,
        images: allStimuliPaths,
        on_success: async () => {
            // Rotate images after preload
        }
    });

    // Pre-rotation call (we'll do this during the welcome screens)
    const rotateCall = {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: 'Loading experimental assets...',
        choices: "NO_KEYS",
        on_start: async () => {
            await preRotateImages();
            jsPsych.finishTrial();
        }
    };
    timeline.push(rotateCall);

    // Unified Instructions (Welcome -> Consent -> Sequence Intro -> Interactive Test)
    timeline.push({
        type: jsPsychInstructions,
        pages: [
            `<p>Welcome to this experiment!</p><p>This experiment will take ${params.completion_time} minutes to complete.</p><p>Press next to begin.</p>`,
            `<div class="consent-container"><h2>Consent Form</h2><p>Please review this consent form, and download a copy for your records if you like.</p></div>`,
            `<p>In this experiment, you will see a sequence of images, like the one below:</p>
             <img src="${instructionStim}" style="width:200px; height:200px; margin: 20px auto; display: block;">
             <p>Your task is simply to remember them (no need to press any buttons).</p>`,
            `<div id="interactive-demo">
                <p>After some time, you will begin a memory test.</p>
                <p>You will see images from before, in a color wheel. You can slide the color wheel around to change the color of the object. Change the color to match the color of the object as it was shown before.</p>
                <canvas id="instruction-canvas" width="450" height="450" style="margin: 0 auto; display: block;"></canvas>
                <p>Test out the color wheel above before moving on.</p>
                <p>When you click "Next", the experiment will begin!</p>
            </div>`
        ],
        show_clickable_nav: true,
        on_load: function () {
            // Use MutationObserver to detect when the interactive canvas is rendered (on the 4th page)
            const observer = new MutationObserver((mutations, obs) => {
                const canvas = document.getElementById('instruction-canvas');
                if (canvas) {
                    renderColorTest(canvas, { path: instructionStim }, jsPsych);
                    setupColorWheelInteraction(jsPsych, { path: instructionStim }, false, true);
                    // No need to keep observing once it's set up for this trial
                    obs.disconnect(); // Disconnect the observer once the canvas is found and initialized
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            // Cleanup observer when the trial finishes
            jsPsych.getCurrentTrial().on_finish = () => observer.disconnect();
        }
    });

    // --- Block Loop ---
    for (let b = 0; b < params.n_blocks; b++) {

        // 0. Pre-block Break
        timeline.push({
            type: jsPsychHtmlKeyboardResponse,
            stimulus: '<div style="font-size: 60px;">+</div>',
            choices: "NO_KEYS",
            trial_duration: 1000,
            data: { phase: 'break', block: b }
        });

        // 1. Sequence Phase (Intermixed Transitions)
        const allRepTrials = [];
        for (let r = 0; r < params.n_repetitions_per_block; r++) {
            const shuffledTransitions = jsPsych.randomization.shuffle(allSequenceTransitions);
            shuffledTransitions.forEach(pair => {
                allRepTrials.push(pair.stim);
                allRepTrials.push(pair.next);
            });
        }

        const sequenceTimeline = {
            timeline: [
                {
                    type: jsPsychHtmlKeyboardResponse,
                    stimulus: '<div style="font-size: 60px;">+</div>',
                    choices: "NO_KEYS",
                    trial_duration: params.iti,
                    data: { phase: 'fixation', block: b }
                },
                {
                    type: jsPsychCanvasKeyboardResponse,
                    canvas_size: [400, 400],
                    stimulus: function (canvas) {
                        const ctx = canvas.getContext('2d');
                        const stim = jsPsych.timelineVariable('stim');
                        const dataUrl = rotatedCache[`${stim.path}_${stim.hue}`];
                        const img = new Image();
                        img.onload = () => ctx.drawImage(img, 0, 0, 400, 400);
                        img.src = dataUrl;
                    },
                    choices: "NO_KEYS",
                    trial_duration: params.stim_duration,
                    data: { phase: 'sequence', block: b }
                }
            ],
            timeline_variables: allRepTrials.map(t => ({ stim: t }))
        };
        timeline.push(sequenceTimeline);

        // 2. Test Phase Screen
        timeline.push({
            type: jsPsychInstructions,
            pages: [`<p>Now you will begin a memory test.</p>Identify the color of each object as accurately as you can.</p>`],
            show_clickable_nav: true
        });

        // 3. Test Trials (Intermixed objects)
        const testStimuli = jsPsych.randomization.shuffle(allUniqueStimuli);
        const limitedTestStim = testStimuli.slice(0, Math.min(params.n_test_trials_per_block, testStimuli.length));

        limitedTestStim.forEach(target => {
            let lastHue = null;
            timeline.push({
                type: jsPsychCanvasButtonResponse,
                canvas_size: [450, 450],
                stimulus: function (canvas) {
                    renderColorTest(canvas, target, jsPsych);
                },
                choices: ['Submit'],
                on_load: function () {
                    // setup interaction; pass 'true' for noAdvance
                    setupColorWheelInteraction(jsPsych, target, false, true, (hue) => {
                        lastHue = hue;
                    });
                },
                data: { phase: 'test', block: b, target_path: target.path, target_hue: target.hue },
                on_finish: function (data) {
                    data.response_hue = lastHue;
                    if (data.response_hue !== null) {
                        let diff = Math.abs(data.target_hue - data.response_hue);
                        if (diff > 180) diff = 360 - diff;
                        data.error_deg = diff;
                    }
                }
            });
        });

        // Attention Check
        let lastAttHue = null;
        const attentionHue = 60; // YELLOW in HSL
        timeline.push({
            type: jsPsychCanvasButtonResponse,
            canvas_size: [450, 450],
            stimulus: function (canvas) {
                renderColorTest(canvas, { path: '' }, jsPsych, true);
            },
            choices: ['Submit'],
            on_load: function () {
                setupColorWheelInteraction(jsPsych, { path: '' }, true, true, (hue) => {
                    lastAttHue = hue;
                });
            },
            data: { phase: 'attention_check', block: b, target_hue: attentionHue },
            on_finish: function (data) {
                data.response_hue = lastAttHue;
            }
        });
    }

    // 4. Final Save and End
    timeline.push({
        type: jsPsychPipe,
        action: "save",
        experiment_id: params.data_pipe_id,
        filename: `${subject_id}.csv`,
        data_string: () => jsPsych.data.get().csv(),
        wait_message: "Saving data..."
    });

    timeline.push({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: function () {
            const testData = jsPsych.data.get().filter({ phase: 'test' }).values();
            const validErrors = testData.map(d => d.error_deg).filter(e => e !== null && e !== undefined);
            const n = validErrors.length;
            const avg_error = (validErrors.reduce((a, b) => a + b, 0) / n).toFixed(1);
            const p10 = ((validErrors.filter(e => e <= 10).length / n) * 100).toFixed(0);
            const p20 = ((validErrors.filter(e => e <= 20).length / n) * 100).toFixed(0);
            return `<div style="padding: 20px; line-height: 1.6;">
                <h2>Experiment Complete</h2>
                <p>You've reached the end of the experiment!</p>
                <p>On average, your color memory was <strong>${avg_error}</strong> degrees away from the ground truth.</p>
                <p>You got <strong>${p10}%</strong> of answers within 10 degrees of the truth, and <strong>${p20}%</strong> within 20 degrees.</p>
                <p>Well done!</p>
                <button id="end-btn" class="jspsych-btn" style="padding: 10px 20px; font-size: 1.2rem; cursor: pointer;">End Experiment</button>
            </div>`;
        },
        choices: "NO_KEYS",
        on_load: function () {
            document.getElementById('end-btn').addEventListener('click', () => {
                const pid = jsPsych.data.getURLVariable('PROLIFIC_PID') || 'unknown';
                window.location.href = `https://app.prolific.com/submissions/complete?cc=${pid}`;
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
    const radius = 200; // Original radius
    const innerPadding = 60; // Fixed padding

    ctx.fillStyle = params.background_color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < params.n_colors; i++) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, (i * Math.PI) / (params.n_colors / 2), ((i + 1) * Math.PI) / (params.n_colors / 2));
        ctx.fillStyle = `hsl(${i * (360 / params.n_colors)}, 100%, 50%)`;
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius - innerPadding, 0, Math.PI * 2);
    ctx.fillStyle = params.background_color;
    ctx.fill();

    // Draw selection indicator
    if (currentHue !== null) {
        const radAngle = (currentHue * (360 / params.n_colors)) * (Math.PI / 180);
        const indicatorX = cx + (radius - innerPadding / 2) * Math.cos(radAngle);
        const indicatorY = cy + (radius - innerPadding / 2) * Math.sin(radAngle);

        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY, innerPadding * 0.35, 0, Math.PI * 2);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY, innerPadding * 0.3, 0, Math.PI * 2);
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    if (!isAttention && target.path) {
        // Draw image (either grayscale or rotated)
        const img = new Image();
        img.onload = () => {
            const offCanvas = document.createElement('canvas');
            offCanvas.width = img.width;
            offCanvas.height = img.height;
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(img, 0, 0);
            const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);

            if (currentHue === null) {
                rotateHue(imgData, 0, true); // Grayscale
            } else {
                rotateHue(imgData, currentHue, false);
            }

            offCtx.putImageData(imgData, 0, 0);
            const size = canvas.width / 3;
            ctx.drawImage(offCanvas, cx - size / 2, cy - size / 2, size, size);
        };
        img.onerror = () => {
            console.error(`Failed to load image during test: ${target.path}`);
        };
        img.src = target.path;
    } else if (isAttention) {
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.font = `bold ${Math.round(canvas.width * 0.04)}px Inter, sans-serif`;
        ctx.fillText("Attention check:", cx, cy - radius * 0.1);
        ctx.fillText("submit YELLOW", cx, cy + radius * 0.1);
    }
}

function setupColorWheelInteraction(jsPsych, target, isAttention = false, noAdvance = false, onUpdate = null) {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const updateUI = (hue) => {
        // Re-render the whole test to update the indicator position and image
        renderColorTest(canvas, target, jsPsych, isAttention, hue);
    };

    const mouseHandler = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - cx;
        const y = e.clientY - rect.top - cy;
        const angle = Math.atan2(y, x) * (180 / Math.PI);
        const hue = (angle + 360) % 360;
        const normalizedHue = hue * (params.n_colors / 360);
        updateUI(normalizedHue);
        if (onUpdate) onUpdate(normalizedHue);

        const stop = () => {
            canvas.removeEventListener('mousemove', mouseHandler);
            window.removeEventListener('mouseup', stop);

            if (!noAdvance) {
                setTimeout(() => jsPsych.finishTrial({
                    response_hue: normalizedHue,
                    rt: jsPsych.getTotalTime()
                }), 400);
            }
        };
        window.addEventListener('mouseup', stop);
        canvas.addEventListener('mousemove', mouseHandler);
    };

    canvas.addEventListener('mousedown', mouseHandler);
}
