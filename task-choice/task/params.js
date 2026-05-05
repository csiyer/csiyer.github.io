const params = {
    experiment_id: "episodic_choice_v3",

    n_trials: 312,
    n_blocks: 3,
    block_sizes: [105, 105, 102],
    n_attention_checks: 3,

    old_trial_pct: 0.5,
    min_delay: 7,
    max_delay: 15,
    possible_values: [0, 1], //// only $0 or $1 -- binary values

    // Timing (ms)
    max_stimulus_duration: 2000,
    highlight_duration: 1000,
    feedback_duration: 1500,
    too_slow_duration: 1500,
    iti: 500,
    break_duration: 20000,

    background_color: "#ececec",
    text_color: "#333333",
    highlight_color: "#22c55e",

    completion_time: 20,
    base_pay: 4,
    max_bonus: 2,
    bonus_sample_n: 10,
    data_pipe_id: "0eMBjYEVa3qX",
    osf_project_id: "2cm34",
    osf_component_id: "8d2cb",
    prolific_completion_code: "C10TSSI1",

    consent_pdf: "https://csiyer.github.io/files/online_consent_form.pdf",
    stimuli_dir: "../../stimuli",
    feedback_dir: "../../stimuli/feedback/feedback_cards_square",
    instructions_img_dir: "../../stimuli/images_for_instructions",
};

window.params = params;
