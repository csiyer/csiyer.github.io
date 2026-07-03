const params = {
    experiment_id: "matched_memorability-7-3-26",

    // Trial structure (fixed by the precomputed sequence structures; see sequences/)
    //   78 H/H encoding + 78 L/L encoding + 78 old/old = 234 trials total
    //   old/old trials are always within-bin (H/H or L/L) and always uneven in
    //   value (one $1 source + one $0 source)
    //   delay histogram (per bin, per value condition) identical: d7-9=4, d10-12=5, d13-15=4
    //   $1-source-longer-delay vs $0-source-longer-delay split exactly 39/39
    n_blocks: 3,
    block_trial_boundaries: [78, 156],  // break inserted after trial at these numbers
    n_attention_checks: 3,
    attention_check_trial_numbers: [25, 103, 181],

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
