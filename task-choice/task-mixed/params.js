const params = {
    experiment_id: "mixed_mem_pilot_6-5-26",

    n_enc: 152,                         // fixed encoding (new/new) trials; each pairs 1 high + 1 low item
    // old/old retrieval trials are inserted dynamically -- see task.js
    // expected yield ~63 retrieval trials at p_high=0.5, total sequence ~215 trials
    block_enc_boundaries: [49, 100],    // break inserted after enc trial at these 0-indexed enc_index values (~3 equal blocks)
    n_attention_checks: 3,
    attention_check_enc_indices: [20, 70, 130],

    min_delay: 7,
    max_delay: 15,
    possible_values: [0, 1],            // binary $0 / $1

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
    prolific_completion_code: "CW2WAAZP",

    consent_pdf: "https://csiyer.github.io/files/online_consent_form.pdf",
    stimuli_dir: "../../stimuli",
    feedback_dir: "../../stimuli/feedback/feedback_cards_square",
    instructions_img_dir: "../../stimuli/images_for_instructions",
};

window.params = params;
