const params = {
    experiment_id: "march_pilot1",
    /////////// TIMING ///////////
    completion_time: 15,          // minutes
    stim_duration: 2000,          // ms
    intrapair_iti: 0,             // between A and B in a pair
    interpair_iti: 1500,          // between pairs
    max_report_time: 10000,       // (10 seconds) on color test trials

    /////////// DESIGN ///////////
    // each set will have 2A->1B (fan-in), 1A->2B (fan-out), and 2 independent A->B = 10 stimuli in 6 pairs
    n_fanin: 1, // 2A->1B
    n_fanout: 1, // 1A->2B
    n_independent: 2, // 1A->1B
    n_blocks: 6,                  // how many blocks (sequence + color test)
    n_repetitions_per_block: 2,   // all sets repeat this many times per block
    n_associative_test_trials: 3, // per block

    /////////// OPTIONS ///////////
    show_pairs_together: true,

    /////////// COLORS ///////////
    background_color: "#c0c0c0",// gray
    text_color: "#000000",      // black
    color_distance_deg: 24,       // distance (in degrees) between high-similarity pairs (e.g., A1/A2)

    ////////// STUDY STUFF ///////
    data_pipe_id: "sNnaSCko8Xca",  // replace with your OSF DataPipe ID
    prolific_completion_code: "C1FKJGUS", // Change this to your Prolific completion code
    consent_form_path: "../files/online_consent_form.pdf",
    max_bonus: 3,
    base_pay: 3,                    // $12/hour
};
params.set_size = params.n_fanin * 3 + params.n_fanout * 3 + params.n_independent * 2 // # total images
params.set_size_pairs = params.n_fanin * 2 + params.n_fanout * 2 + params.n_independent // total pairs

// Set instruction pages after params object is defined to allow self-references
params.instruction_pages = [
    `<p><strong>Welcome to this experiment!</strong></p><p>This experiment will take ${params.completion_time} minutes to complete.</p><p>Press next to begin.</p>`,
    `<div class="consent-container"><h2>Consent Form</h2><p>Before we begin, please review this consent form. You can download a copy for your records if you like.</p><iframe src="${params.consent_form_path}" width="100%" height="500px"></iframe></div>`,
    `<p>In this experiment, you will see a sequence of images, appearing in pairs, each like the one below:</p>
        <img src="stimuli/obj01.jpg" style="width:200px; height:200px; margin: 20px auto; display: block;">
        <p>Your task is to <strong>remember which images go together</strong> (no need to press any buttons at the start).</p>`,
    `<div id="interactive-demo">
        <p>After some time, you will begin a memory test.</p>
        <p>You will see images from before, in a color wheel. You can click around the color wheel around to change the color of the object. Set the color to match the color of the object as it was shown before.</p>
        <div style="position: relative; width: 450px; height: 450px; margin: 0 auto;">
            <canvas id="instruction-canvas" width="450" height="450" style="display: block;"></canvas>
            <img id="instruction-img" src="stimuli/obj01.jpg" style="position: absolute; top: 150px; left: 150px; width: 150px; height: 150px; filter: grayscale(100%);">
        </div>
        <p>Test out the color wheel above before moving on.</p>
    </div>`,
    `<p>Your <strong>bonus</strong> will be calculated based on your performance on the tests.</p>
        <p>You can earn a bonus of <strong>up to $${params.max_bonus}</strong>, on top of the base pay of $${params.base_pay}!</p>`,
    `<p><strong>Summary</strong></p>
        <p>You will see pairs of images; remember which images go together.</p>
        <p>You will also be tested on your memory of the colors of the images.</p>
        <p>Press "Next" to begin the experiment!</p>`
];

window.params = params;
