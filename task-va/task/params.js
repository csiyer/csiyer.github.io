const params = {
    experiment_id: "value_associability_v1",

    n_trials: 12,
    n_attention_checks: 1,
    possible_values: [0, 0.2, 0.4, 0.6, 0.8, 1.0],

    learning_preview_duration: 2000,
    revealed_duration: 2000,
    iti: 1000,
    memory_iti: 500,

    background_color: "#ececec",
    text_color: "#333333",
    highlight_color: "#22c55e",

    completion_time: 5,
    base_pay: 2,
    max_bonus: 2,
    data_pipe_id: "5DcSyF1yOSY1",
    osf_project_id: "2cm34",
    osf_component_id: null,
    prolific_completion_code: "PLACEHOLDER",

    consent_pdf: "https://csiyer.github.io/files/online_consent_form.pdf",
    stimuli_dir: "../../stimuli/images",
    stimuli_metadata_path: "../../stimuli/stimuli_metadata.js",
    feedback_dir: "../../stimuli/feedback/feedback_cards_square",
    instructions_img_dir: "../../stimuli/images_for_instructions",
};

window.params = params;
