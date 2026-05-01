const params = {
    experiment_id: "episodic_choice_v2",

    n_trials: 18, //312,
    n_blocks: 3,
    block_sizes: [6, 6, 6], // [105, 105, 102],
    n_attention_checks: 3,

    old_trial_pct: 0.5,
    min_delay: 7,
    max_delay: 15,
    possible_values: [0, 0.1, 0.2, 0.3, 0.4, 0.5],

    stimulus_time: 1500,
    feedback_time: 1500,
    iti: 500,
    break_duration: 20000,

    background_color: "#ececec",
    text_color: "#333333",
    card_color: "#8c9299",
    highlight_color: "#cfd4da",

    completion_time: 20,
    base_pay: 4,
    max_bonus: 1,
    bonus_sample_n: 10,
    data_pipe_id: "0eMBjYEVa3qX",
    osf_project_id: "2cm34",
    osf_component_id: "8d2cb",
    prolific_completion_code: "PLACEHOLDER",

    consent_pdf: "https://csiyer.github.io/files/online_consent_form.pdf",
    stimuli_dir: "../../stimuli",
};

params.instruction_pages = [
    `<div class="instruction-container" style="max-width: 920px;">
        <h2>Consent Form</h2>
        <p>Please review the consent form below. Feel free to download a copy for your records.</p>
        <iframe src="${params.consent_pdf}" width="100%" height="600" style="border: 1px solid #e8e8e8; border-radius: 10px; margin-top: 10px;"></iframe>
        <p style="margin-top: 18px;">By clicking "Next," you confirm that you have read the form and voluntarily agree to participate.</p>
    </div>`,
    `<div class="instruction-container">
        <h2>How To Play</h2>
        <p>On each trial, you will see two cards and choose one with the <strong>left</strong> or <strong>right</strong> arrow key.</p>
        <div class="instruction-card-row">
            <div class="mini-card"></div>
            <div class="mini-card"></div>
        </div>
        <p>You have ${params.stimulus_time / 1000} seconds to make your decision, or we'll choose randomly for you.</p>
        <p>After you choose, the selected card will flip over and reveal its value.</p>
        <p><strong>All rewards are either 0¢, 10¢, 20¢, 30¢, 40¢, or 50¢.</strong></p>
        <p>Your goal is to maximize your rewards!</p>
    </div>`,
    `<div class="instruction-container">
        <h2>Repeated Cards</h2>
        <p>On some trials, one card will be a card you <strong>previously chose</strong>. That old card will <strong>always be worth the same amount it was worth the first time you chose it</strong>.</p>
        <div class="repeat-demo">
            <div class="repeat-demo-block">
                <div class="repeat-demo-label">Earlier</div>
                <div class="mini-card revealed"></div>
                <div class="repeat-demo-value">30¢</div>
            </div>
            <div class="instruction-arrow">...</div>
            <div class="repeat-demo-block">
                <div class="repeat-demo-label">Later</div>
                <div class="mini-card"></div>
                <div class="repeat-demo-value">same value</div>
            </div>
        </div>
        <p>Use your memory on those trials to help you decide whether the old card is worth taking!</p>
        <p>Specifically, because rewards are between 0-50¢, <strong>the best strategy is to choose an old card if it's worth more than 25¢ and avoid it otherwise.</strong></p>
    </div>`,
    `<div class="instruction-container">
        <h2>Bonus</h2>
        <p>At the end of the experiment, we will randomly sample <strong>${params.bonus_sample_n} trials</strong> where you saw an old card and give you a bonus proportional to the amount you got on those trials.</p>
        <p>This means you have to use your memory well on every trial to maximize your potential bonus!</p>
    </div>`,
    `<div class="instruction-container">
        <h2>Summary</h2>
        <ul>
            <li>Choose cards with the left and right arrow keys.</li>
            <li>Some trials contain an old card you already know the value of.</li>
            <li>Use your memory to choose high-value old cards, and avoid low-value ones.</li>
            <li>Your bonus depends on randomly sampled old-card trials at the end.</li>
        </ul>
        <p>Press "Next" to begin the experiment.</p>
    </div>`
];

window.params = params;
