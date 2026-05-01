const params = {
    experiment_id: "value_associability_v1",

    n_trials: 12,
    n_attention_checks: 1,
    possible_values: [0, 0.2, 0.4, 0.6, 0.8, 1.0],

    learning_preview_duration: 2000,
    flip_duration: 500,
    revealed_duration: 2000,
    iti: 1000,
    memory_iti: 500,

    background_color: "#ececec",
    text_color: "#333333",
    card_color: "#8c9299",
    highlight_color: "#cfd4da",

    completion_time: 5,
    base_pay: 2,
    max_bonus: 2,
    data_pipe_id: "5DcSyF1yOSY1",
    osf_project_id: "2cm34",
    osf_component_id: null,
    prolific_completion_code: "PLACEHOLDER",

    consent_pdf: "https://csiyer.github.io/files/online_consent_form.pdf",
    stimuli_dir: "../../stimuli/images",
    stimuli_metadata_path: "../../stimuli/stimulimetadata.js",
};

params.instruction_pages = [
    `<div class="instruction-container">
        <h2>Welcome</h2>
        <p>This study takes about <strong>${params.completion_time} minutes</strong>.</p>
        <p>You will earn a base payment of <strong>$${params.base_pay}</strong>, plus a bonus of up to <strong>$${params.max_bonus}</strong> based on your performance.</p>
        <p>Please note that you are participating in a scientific study. Your responses will be a huge help for our research, so we ask you give the study your best effort and attention. Thank you!</p>
    </div>`,
    `<div class="instruction-container" style="max-width: 920px;">
        <h2>Consent Form</h2>
        <p>Please review the consent form below. Feel free to download a copy for your records.</p>
        <iframe src="${params.consent_pdf}" width="100%" height="600" style="border: 1px solid #e8e8e8; border-radius: 10px; margin-top: 10px;"></iframe>
        <p style="margin-top: 18px;">By clicking "Next," you confirm that you have read the form and voluntarily agree to participate.</p>
    </div>`,
    `<div class="instruction-container">
        <h2>Part 1: Value Learning</h2>
        <p>You will see a series of cards with images on them. Each card will automatically flip over to reveal how much it is worth.</p>
        <div class="instruction-card-row">
            <div class="mini-card"></div>
            <div class="mini-card revealed"></div>
        </div>
        <p>Your job is to learn the card values.</p>
    </div>`,
    `<div class="instruction-container">
        <h2>Part 2: Memory Test</h2>
        <p>After the learning phase, you will do a memory test for the value of each card.</p>
        <div class="memory-mini-demo">
            <div class="mini-card"></div>
            <div class="memory-instruction-values">
                <span>0¢</span>
                <span>20¢</span>
                <span>40¢</span>
                <span>60¢</span>
                <span>80¢</span>
                <span>$1</span>
            </div>
        </div>
        <p>Your bonus depends on how many exact values you remember correctly.</p>
        <p>When you're ready, press "Next" to begin!</p>
    </div>`
];

window.params = params;
