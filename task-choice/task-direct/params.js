const params = {
    experiment_id: "direct_value_memtest-8-7-26",

    n_trials: 312,
    n_blocks: 3,
    block_sizes: [105, 105, 102],
    n_attention_checks: 3,

    old_trial_pct: 0.5,
    min_delay: 7,
    max_delay: 15,
    possible_values: [0, 1],

    // Timing (ms)
    max_stimulus_duration: 2000,
    highlight_duration: 1000,
    feedback_duration: 1500,
    too_slow_duration: 1500,
    recognition_feedback_duration: 750,
    value_feedback_duration: 750,
    iti: 500,
    break_duration: 20000,

    background_color: "#ececec",
    text_color: "#333333",
    highlight_color: "#22c55e",       // new/new choice highlight AND memory-test "correct" highlight
    choice_highlight_color: "#3b82f6", // blue: new/new choice highlight (overrides highlight_color for choice trials)
    incorrect_color: "#ef4444",       // red: memory-test "incorrect" highlight

    // Bonus is accuracy-only: chance-adjusted recognition + value-test accuracy.
    // $ values shown on new/new trials are NOT summed into the bonus.
    bonus_chance_accuracy: 0.5,

    completion_time: 25,
    base_pay: 5,
    max_bonus: 2,
    data_pipe_id: "0eMBjYEVa3qX",
    osf_project_id: "2cm34",
    osf_component_id: "8d2cb",
    prolific_completion_code: "CEEKTYHV",

    consent_pdf: "https://csiyer.github.io/files/online_consent_form.pdf",
    stimuli_dir: "../../stimuli",
    feedback_dir: "../../stimuli/feedback/feedback_cards_square",
    instructions_img_dir: "../../stimuli/images_for_instructions",
};

window.params = params;
