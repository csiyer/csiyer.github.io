window.params = {
    completion_time: 15,          // minutes
    stim_duration: 2000,          // ms
    iti: 1000,                    // ms
    set_size: 12,                 // one set will have 2A->1B (fan-in), 1A->2B (fan-out), and 2 independent A->B for 12 trials
    n_sets: 1,                    // how many sets in each sequence of stimuli
    n_repetitions_per_block: 1,   // repeat the sequence this many times per block
    n_blocks: 1,                  // number of whole block loops (sequence + test)
    n_test_trials_per_block: 12,  // number of memory test trials each block
    max_report_time: 10000,       // ms (10 seconds)
    data_pipe_id: "sNnaSCko8Xca",  // replace with your OSF DataPipe ID
    prolific_study_id: "PLACEHOLDER_PROLIFIC_ID",
    background_color: "#c0c0c0",// gray
    text_color: "#000000",      // black
    color_distance_min: 20,       // degrees
    color_distance_max: 20,       // degrees
    n_colors: 360,                // full color wheel
};
