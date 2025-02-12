params = {

    local: true,
    iteration: 'testing',
    prolific_redirect_link: 'https://www.google.com',

    background: 'white', // lightgray
    text_color: 'black',

    total_completion_time: 20, // minutes // calculate?
    base_pay: 6.00, // $ // calculate based on time??
    max_bonus: 10.00, // $
    bonus_downweighting: 0.07, // they earn 7% of their total winnings

    n_trials_per_block: 80,
    n_blocks: 4, 
    n_practice_trials: 5,

    choice_time: 2000, //ms
    choice_feedback_isi: 0,
    feedback_time: 1000,
    iti: 1500, 
    // fMRI version: exponential distribution mean of 4 minimum of 1.5
    exponential_iti: false,
    exponential_iti_min: 1500,
    exponential_iti_mean: 4000,

    possible_outcomes: [0, 0.2, 0.4, 0.6, 0.8, 1], // $ 
    lucky_outcome_dist: [2,3,4,5,6,7], // 2 $0 cards, 3 20c cards, 4 40c cards, etc.
    unlucky_outcome_dist: [7,6,5,4,3,2],
    // RG: lucky deck mean 0.63, unlucky deck mean 0.37, variance 0.1

    reversal_time_min: 16,
    reversal_time_max: 24,

    old_trial_proportion: 0.6, // Duncan: 0.5, make it possible to have = 0 for no episodic
    old_delay_min: 5, // Nicholas: 9, Duncan/Gerraty: 5
    old_delay_max: 30,

    n_memory_trials: 0, // 2-afc memory test after main task (NOT IMPLEMENTED)

    key_: {37:1, 40:3, 39:2}, //for button presses
}

params.n_trials_total = params.n_blocks * params.n_trials_per_block // 320
// Duncan 2019: 348 trials in 3 blocks; Nicholas 2020: 320 trials in 4 blocks; Gerraty: 300 trials in 5 blocks

params.total_completion_time = 20 // minutes

if (params.local) { // testing mode
    params.choice_time = 10
    params.feedback_time = 10
    params.iti = 5
}