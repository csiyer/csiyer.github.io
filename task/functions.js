/* Helper functions  */ 


/* Generic helpers */

function pad(number, length) {
    var str = '' + number;
    while (str.length < length) {
        str = '0' + str;
    }
    return str;
}

function random_int_from_interval(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function get_random_index(arr) {
    return Math.floor(Math.random()*arr.length)
}

function array_random_sample(arr) {
    return arr[get_random_index(arr)]
}

function array_shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { 
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr
}

function array_average(arr) {
    return arr.reduce((a, b) => a + b) / arr.length;
}

// function array_equals(a, b) {
//     return Array.isArray(a) &&
//         Array.isArray(b) &&
//         a.length === b.length &&
//         a.every((val, index) => val === b[index]);
// }

// function swap(two_value_array) {
//     let temp = two_value_array[0];
//     two_value_array[0] = two_value_array[1];
//     two_value_array[1] = temp;
//     return two_value_array
// }

/* Task-specific helpers */

function get_iti() {
    if (params.exponential_iti) {
        const sample = -params.exponential_iti_mean * Math.log(Math.random());
        return Math.max(sample, params.sexponential_iti_min );
    } else {
        return params.iti
    }
}

function generate_block_reversals() {
    var reversals = []
    var trial_count = 0
    while (trial_count < params.n_trials_per_block) {
        var next_rev = random_int_from_interval(params.reversal_time_min, params.reversal_time_max)
        trial_count += next_rev
        reversals.push(trial_count)
    }
    return reversals
}


function generate_outcomes() {
    // this function takes a list of how many of each outcome, and a list of the possible outcomes
    // e.g., dist=[1,2], values=[0.2,0.4] --> [0.2,0.4,0.4]

    luckydist = params.lucky_outcome_dist // [2, 3, 4, 5, 6, 7];
    unluckydist = params.unlucky_outcome_dist // [7, 6, 5, 4, 3, 2];
    possible_outcomes = params.possible_outcomes // [0, 0.2, 0.4, 0.6, 0.8, 1]
    function gen_outcomes_helper(dist, values) {
        let o = values.map((val, i) => Array(dist[i]).fill(val))
        return array_shuffle( o.flat() )
    }
    return {
        'lucky': gen_outcomes_helper(luckydist, possible_outcomes), 
        'unlucky': gen_outcomes_helper(luckydist, possible_outcomes)
    }
}

function sample_random_stim(blue_orange, possible_objects) {

    var stim_id = random_int_from_interval(1,665)
    if (blue_orange == 'blue') {
        var stim_path = './stimuli/blue/object' + stim_id + '.jpg'
    } else if (blue_orange == 'orange') {
        var stim_path = './stimuli/orange/object' + stim_id + '.jpg'
    } else {
        var stim_path = './stimuli/no_deck/object' + stim_id + '.jpg'
    }

    if (stims_to_exclude.includes(stim_path)) {
        return sample_random_stim(blue_orange, stims_to_exclude) // try again
    } else {
        return stim_path
    }
}