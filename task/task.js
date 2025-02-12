/********* THINGS TO REVISIT
 * Feedback trial stimuli
 * testing everything
/*********/ 
var jsPsych = initJsPsych();


/* Save experimental info */
const experiment_id = jsPsych.randomization.randomID(20) // random subject ID of length 20
const date = + new Date()
console.log('Experiment ID: ', experiment_id)

const subject_id = jsPsych.data.getURLVariable('PROLIFIC_PID');
const study_id = jsPsych.data.getURLVariable('STUDY_ID');
const session_id = jsPsych.data.getURLVariable('SESSION_ID');
console.log('Prolific info:', subject_id, study_id, session_id)

jsPsych.data.addProperties({
    experiment_id: experiment_id, //unique ID
    date: date, // current date
    // URL variables
    subject_id: subject_id,
    study_id: study_id,
    session_id: session_id,
  });

if (subject_id == undefined) {
    params.iteration = 'testing'
}
console.log('Iteration: ', params.iteration)
const filename = `${params.iteration}_${experiment_id}.csv`

/*
    1. Initial checks
    2. Welcome & instructions
    3. Practice
    4. Task
    5. Debrief & finishing
    6. Run experiment
*/


/*** 1. Initial stuff ***/

var browser_check = { // if not using Chrome, prompt them to use chrome 
    type: jsPsychBrowserCheck,
    // minimum_width: 1350,
    // minimum_height: 759,
    inclusion_function: (data) => {
        return 'chrome' == data.browser && !data.mobile
    },
    exclusion_message: (data) => {
        if (data.browser != 'chrome') {
            return '<p>Welcome! Please reopen this page in Chrome to begin the experiment.</p>'
        } else if (data.mobile) {
            return '<p>Welcome! Please reopen this page in Chrome on a computer.</p>'
        }
    },
};

var local_alert = { // running non-local version?
    type: jsPsychHtmlKeyboardResponse,
    stimulus: 'You are running this task locally! If you are a participant, please close this window and contact the experimenter.',
    choices: "ALL_KEYS"
};

var iti = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: '<div style="font-size:60px;">+</div>',
    choices: [],
    trial_duration: get_iti(),
    data: { trial_type: 'iti' }
};


/*** 2. Welcome & instructions ***/

var welcome_fullscreen = {
    type: jsPsychFullscreen,
    message: "<p style= 'font-size:200%' ><b>Welcome to our experiment!</b></br></p>" + 
        "<p>The experiment will take approximately " + params.total_completion_time + " minute(s).</p>"+
        '<p>Before starting, please note that you are participating in a scientific study. Your responses are very important to us, and will be a huge help for our research.<br>' +
        'We will have to reject your data if you respond randomly, exit full screen, or respond to only a few trials.<br>' +
        'We hope you choose to participate in our study!</p>'
        ,
    button_label: "Click to enter full screen and begin experiment",
    fullscreen_mode: true,
    on_start: function() {
        document.body.style.backgroundColor = params.background
        document.body.style.color = params.text_color
    }
}

var instructions = {
    type: jsPsychInstructions,
    pages: [
        "<p style='font-size:150%''><b>Consent Form</b></p>" + 
        "<p>Before we get started, feel free to take a look at our consent form, and download a copy for your records if you like:<p>" + 
        "<div style='padding:1%' >"  + 
        "<embed src='stimuli/online_consent.png' width='100%' height='400px' style='border: 2px solid lightgrey';/>" + 
        "</div>" + 
        "<p>Click 'Next' if you agree to participate and you will begin the experiment.</p>"
        ,  

        "<p style='font-size: 150%'><b>Instructions</b></p>" +
        "<p><img  style='width:80%'' src='stimuli/examples/example-choice.png'></img></p>" +
        "<p>In this experiment, you will play a card came.</p>" +
        "<p>On each trial, you will pick between two cards, from an <b>orange deck</b> and a <b>blue deck</b>.</p>" +
        "<p>You will have " + params.choice_time / 1000 + " seconds to choose a card with the <b>left (&#x2190;) and right (&#x2192;) arrow keys</b>.</p>" +
        "<p>Let's say you pick the microscope...</p>"
        ,

        "<p style='font-size: 150%'><b>Instructions</b></p>" +
        "<p><img  style='width:100%' src='stimuli/examples/example-feedback.png'></img></p>" +
        "<p>Your chosen card will then turn over, and you'll see how much it was worth <b>(between $0 and $1)</b>.</p>" +
        "<p>In this example, you chose the the card on the right (<b>&#x2192;</b>), which was worth <b>$1</b>.</p>" +
        "<p>Your goal is to pick cards to make as much money as possible.</p>" +
        "<p>Your <b>real bonus</b> will be based on how much money you accumulate in the experiment!!</p>"
        ,

        "<p style='font-size: 150%'><b>Instructions</b></p>" +
        "<p>There are two ways to maximize the amount of money you make in this experiment: </p>" +
        "<p>(1) Sometimes you will encounter a <b>card you have chosen before</b>." + 
        "<br> These cards will always be worth the <b>same amount</b> as the first time you chose it," + 
        "<br> regardless of which deck it appears in the lucky or unlucky deck.</p>"+
        "<p><img  style='width:100%'' src='stimuli/examples/example-old-card.png'></img></p>" +
        "<p>So, you can use your memory to pick cards that are worth more.</p>"
        ,

        "<p style='font-size: 150%'><b>Instructions</b></p>" +
        "<p>(2) In addition, at any point in the experiment, one of the decks is <b>\"lucky.\"</b>" + 
        "<br> This means that this deck will tend to give good rewards." + 
        "<br> Here's an example of the difference in rewards between the lucky and unlucky decks:<br>"+
        "<p><img  style='width:100%'' src='stimuli/examples/example-deck-values.png'></img></p>" +
        "<p>So, you can pick cards according to which deck you think is luckier at that point, and you will earn more.</p>"
        ,

        "<p style='font-size: 150%'><b>Instructions</b></p>" +
        "<p>(2) In addition, at any point in the experiment, one of the decks is <b>\"lucky.\"</b>" + 
        "<br> This means that this deck will tend to give good rewards." + 
        "<br> Here's an example of the difference in rewards between the lucky and unlucky decks:<br>"+
        "<p><img  style='width:100%'' src='stimuli/examples/example-deck-values.png'></img></p>" +
        "<p>So, you can pick cards according to which deck you think is luckier at that point, and you will earn more.</p>"+

        "<p> <b>However, the lucky deck may switch at any point</b> (between orange and blue) without you knowing!</p>"+
        "<p><img  style='width:100%'' src='stimuli/examples/example-deck-luck.png'></img></p>"
        ,

        "<p style='font-size: 150%'><b>Instructions</b></p>" +
        "<p><img  style='width:60%'' src='stimuli/examples/example-choice.png'></img></p>" +
        "<p>To review, you will see pairs of cards and select one with the <b>left (&#x2190;) and right (&#x2192;) arrow keys</b>.</p>" +
        "<p>You'll then see how much your card was worth, and you'll receive a <b>final bonus</b> proportionate to your total sum.</p>" +
        "<p>You can use (1) your <b>memory</b>, or (2) which deck you think is <b>lucky</b> at each point, to earn more money.</p>" 
        ,

        "<p style='font-size: 150%'><b>Practice</b></p>" +
        "<p>When you press 'Next', you will begin a <b>brief practice period</b>.</p>" +
        "<p>If you need to review the rules, please press 'Previous' to go back.</p>" +
        "<p>Remember, select a card from the orange or blue deck with the <b>left (&#x2190;) and right (&#x2192;) arrow keys</b>.</p>" + 
        "<p>And remember to pay attention to the <b>lucky deck</b> and <b>repeated cards</b> to maximize your bonus!</p>"
    ],
    show_clickable_nav: true,
    show_page_number: false,
    post_trial_gap: 500,
    // on_finish: function() {
    //     document.body.style.backgroundColor = params.stim_background
    // }
}


var comprehension_check = {
    type: jsPsychSurveyMultiChoice,
    questions: [{
        prompt: "In this game, individual choices are between:",
        options: ['2 decks of cards', '2 different blues', 'Several geometric shapes']
    },
    {
        prompt: "After each choice, you will receive feedback about how much money your chosen card was worth.",
        options: ["True", "False"]
    },
    {
        prompt: "Each card is worth between:",
        options: ["$0.00 - $5.00", "$0.00 - $1.00", "$0.50 - $1.50"]
    },
    {
        prompt: "If you see the same object on a card, then that card is worth the same as it was last time you saw it.",
        options: ["False", "True"]
    },
    {
        prompt: "One deck will be luckier than the other deck at different points in the experiment.",
        options: ["True", "False"]
    },
    {
        prompt: "The decks will sometimes switch whether they are lucky or unlucky.",
        options: ["False", "True"]
    },
    {
        prompt: "Which key should you use to respond to an image on the left side?",
        options: ["&#x2190;", "&#x2192;"]
    }],
    on_finish: function (data) {
        var responses = JSON.parse(data.responses);
        var incorrect = false;
        if (responses["Q0"] != "2 decks of cards") {
            incorrect = true;
        } else if (responses["Q1"] != "True") {
            incorrect = true;
        } else if (responses["Q2"] != "$0.00 - $1.00") {
            incorrect = true;
        } else if (responses["Q3"] != "True") {
            incorrect = true;
        } else if (responses["Q4"] != "True") {
            incorrect = true;
        } else if (responses["Q5"] != "True") {
            incorrect = true;
        } else if (responses["Q6"] != "&#x2190;") {
            incorrect = true;
        } 
        data.failed_comprehension_check = incorrect
        // if (incorrect && !params.local) {
        //     var new_timeline = {
        //         timeline: [repeat_screen,
        //             instructions_repeat,
        //             comprehension_check]
        //     }
        // } else {
        //     var new_timeline = {
        //         timeline: [start_experiment,
        //             start_experiment2,
        //             task2_procedure,
        //             block_break1]
        //     }
        // }
    }
};



/*** 3. Practice ***/

// the actual practice trials will use the normal choice block

var post_practice = {
    type: jsPsychHtmlButtonResponse,
    stimulus:  "<p style='font-size: 150%'><b>Well done!</b></p>" +
        "<p>You are ready to begin the experiment.</p>" +
        "<p>Press the 'Continue' button to begin.</p>",
    choices: ['Continue'],
    trial_duration: [10000],
    on_finish: function (){
        // change the trial types so they are marked for practice
        ['choice','feedback','confirmation'].forEach(trial_label => {
            let trials_to_edit = jsPsych.data.get().filter({trial_type: trial_label});
            trials_to_edit.trials.forEach(trial => {
                trial.trial_type = trial_label + "_practice"
            })
        });

        // reset for the experiment
        trial_number = 0
        block_number = 0
        trials_since_reversal = 0
        old_trial_tracking = reset_old_trial_tracking()
        outcomes = generate_outcomes() // new outcomes
        reversals = generate_block_reversals() // set new reversals
        [deck_locs.blue, deck_locs.orange] = [deck_locs.orange, deck_locs.blue] // reverse deck locations
    }
}


/*** 4. Task ***/


// initialize deck lucks and deck placements randomly
if (Math.random () <= 0.5) {// initialize random which deck is lucky
    var deck_lucks = { blue: 'lucky', orange: 'unlucky'}
    var curr_lucky_deck = 'blue'
} else {
    var deck_lucks = { blue: 'unlucky', orange: 'lucky'}
    var curr_lucky_deck = 'orange'
}
if (Math.random () <= 0.5) {// initialize random which deck is lucky
    var deck_locs = { blue: 'left', orange: 'right'}
} else {
    var deck_locs = { blue: 'right', orange: 'left'}
}

// initialize outcomes and reversals
var outcomes = generate_outcomes() // reset at each reversal
var reversals = generate_block_reversals() // just for one block, will be reset

// keep track of all objects we've already used
var possible_object_nums = [] 
for (var i = 1; i <= 665; i++) {
    possible_object_nums.push(i)
}
var old_object_nums_already_repeated = []

// keep track of data for the purpose of creating old trials

function reset_old_trial_tracking() {
    var old_trial_tracking = []
    for (var i = 0; i < params.n_trials_total; i++) {
        old_trial_tracking[i] = {
            'trial_number': NaN,
            'object': 'none',
            'value': NaN,
            'deck': 'none',
            'luck': 'none',
            'shown_twice': false,
        };
    }
    return old_trial_tracking
}
var old_trial_tracking = reset_old_trial_tracking()

// keep track of average outcomes to keep values from inflating
var all_outcomes = []

// track trial numbers
var trial_number = 0
var block_number = 0
var trials_since_reversal = 0

// previously, trial data (stims, reward, etc.) was determined in the on_start function
// and saved to the trial data, but in the new jsPsych it seems that the trial data
// cannot be permanently edited from the on_start function. So, we will instead store this 
// data temporarily on each trial in the following variable
var temp_data = {}

var choice = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: "",
    choices: ['ArrowLeft', 'ArrowRight'],
    trial_duration: params.choice_time,
    response_ends_trial: true,
    on_start: function (choice) {
        // all of this is stored in temp_data and then reloaded in the on_finish because accessing choice.data doesn't work
        temp_data.trial_type = 'choice';
        temp_data.trial_number = trial_number;
        temp_data.block_number = block_number;
        temp_data.reversal_trial = 0;
        temp_data.lucky_deck = curr_lucky_deck,
        temp_data.blue_luck = deck_lucks['blue'];
        temp_data.orange_luck = deck_lucks['orange'];
        temp_data.blue_loc = deck_locs['blue'];
        temp_data.orange_loc = deck_locs['orange'];
        temp_data.old_trial = 0;

        if (params.randomize_deck_locs_per_trial) { // not currently using this
            if (Math.random() <= 0.5) {
                deck_locs = { blue: 'left', orange: 'right'};
            } else {
                deck_locs = { blue: 'right', orange: 'left'};
            }
            temp_data.blue_loc = deck_locs['blue'];
            temp_data.orange_loc = deck_locs['orange'];
        } 

        // First, is it a reversal? figure out which deck is lucky
        if (reversals.includes(trial_number)) {
            // swap the deck lucks
            [deck_lucks.blue, deck_lucks.orange] = [deck_lucks.orange, deck_lucks.blue]
            curr_lucky_deck = (curr_lucky_deck === 'blue') ? 'orange' : 'blue'; // swap
            trials_since_reversal = 0
            temp_data.reversal_trial = 1
            // regenerate outcomes for the upcoming reversal period
            outcomes = generate_outcomes()
        }
        temp_data.trials_since_reversal = trials_since_reversal
        trials_since_reversal += 1


        // Next, is this an old trial?
        if (Math.random() <= params.old_trial_proportion && trial_number > params.old_delay_min) {
            temp_data.old_trial = 1

            // our strategy will be to get candidate old trials and then select based on some criteria
            old_candidates = []
            min_back = trial_number - params.old_delay_min
            max_back = Math.max( trial_number - params.old_delay_max, 0)
            for (var i = max_back; i <= min_back; i++) {
                /* search for candidate old trials that
                    - have only been shown once
                    - a choice was made
                    - has a value that remains in the values we haven't sampled yet
                */
                if ( !old_trial_tracking[i]['shown_twice'] && ['blue','orange'].includes(old_trial_tracking[i]['deck']) ) {
                    // did it appear in the deck that is presently lucky or unlucky
                    var curr_luck = deck_lucks[ old_trial_tracking[i]['deck'] ]
                    // is the value remaining in the list of possible outcomes for this luck 
                    if (outcomes[curr_luck].includes(old_trial_tracking[i]['value'])) {
                        old_candidates.push(i)
                    }
                }
            }
            if (old_candidates.length > 0) {
                // we will prioritize objects that are incongruent with deck's expected value
                mismatch_old_candidates = []
                for (var i = 0; i < old_candidates.length; i++) {
                    candidate_i = old_candidates[i];
                    candidate_value = old_trial_tracking[candidate_i]['value'];
                    candidate_deck = old_trial_tracking[candidate_i]['deck'];
                    
                    if ( (candidate_deck == curr_lucky_deck && candidate_value < 0.5) || (candidate_deck != curr_lucky_deck && candidate_value > 0.5) ) {
                        mismatch_old_candidates.push(candidate_i);
                    }
                }

                if (mismatch_old_candidates.length > 0) { // choose the mismatches if we have them // MONITOR THIS FOR IF WE'RE ANTICORRELATING
                    old_candidates = mismatch_old_candidates;
                }
                // now choose an old object from the candidates
                // we also want to prioritize low-value objects *if* object values are on average really high
                if (array_average(all_outcomes) >= 0.5) {
                    ind_of_least_value = 0
                    least_value = 2
                    for (var j = 0; j < old_candidates.length; j++) {
                        if (old_trial_tracking[old_candidates[j]]['value'] < least_value) {
                            least_value = old_trial_tracking[old_candidates[j]]['value']
                            ind_of_least_value = j
                        }
                    }
                    old_object_trial = old_candidates[ind_of_least_value]
                } else {
                    old_object_trial = array_random_sample(old_candidates)
                }
                
                old_trial_tracking[old_object_trial]["shown_twice"] = true;
                temp_data.old_trial_number = old_trial_tracking[old_object_trial]["trial_number"];
                temp_data.old_deck = old_trial_tracking[old_object_trial]["deck"];
                temp_data.old_luck = old_trial_tracking[old_object_trial]["luck"];
                temp_data.old_value = old_trial_tracking[old_object_trial]["value"];
                temp_data.old_object = old_trial_tracking[old_object_trial]["object"];

                // remove old value from deck outcomes list
                const idx_of_value = outcomes[deck_lucks[temp_data.old_deck]].indexOf(temp_data.old_value)
                outcomes[deck_lucks[temp_data.old_deck]].splice(idx_of_value, 1)

                // assign the stimuli 
                var rand_idx = get_random_index(possible_object_nums) // get a random object
                var new_object = possible_object_nums[rand_idx] 
                possible_object_nums.splice(rand_idx, 1) // remove it from array of possible objects

                if (temp_data.old_deck == 'blue') {
                    temp_data.blue_object = temp_data.old_object
                    temp_data.blue_value = temp_data.old_value
                    temp_data.orange_object = new_object
                    temp_data.orange_value = outcomes[deck_lucks['orange']].shift()
                } else {
                    temp_data.orange_object = temp_data.old_object
                    temp_data.orange_value = temp_data.old_value
                    temp_data.blue_object = new_object
                    temp_data.blue_value = outcomes[deck_lucks['blue']].shift()
                }
            } else {
                // failed to find old object, treat as a new/new trial -- this should be rare!!!!
                console.log('Failed to find old object, trial ' + trial_number)
                temp_data.old_trial = 0

                rand_idx = get_random_index(possible_object_nums) // get a random object
                temp_data.blue_object = possible_object_nums[rand_idx]
                possible_object_nums.splice(rand_idx, 1) // remove it from array of possible objects
                temp_data.blue_value = outcomes[deck_lucks['blue']].shift() // remove first element and its the value

                rand_idx = get_random_index(possible_object_nums)
                temp_data.orange_object = possible_object_nums[rand_idx]
                possible_object_nums.splice(rand_idx, 1)
                temp_data.orange_value = outcomes[deck_lucks['orange']].shift()
            }
           
        } else { // new/new trial 
            rand_idx = get_random_index(possible_object_nums) // get a random object
            temp_data.blue_object = possible_object_nums[rand_idx]
            possible_object_nums.splice(rand_idx, 1) // remove it from array of possible objects
            temp_data.blue_value = outcomes[deck_lucks['blue']].shift() // remove first element and its the value

            rand_idx = get_random_index(possible_object_nums)
            temp_data.orange_object = possible_object_nums[rand_idx]
            possible_object_nums.splice(rand_idx, 1)
            temp_data.orange_value = outcomes[deck_lucks['orange']].shift()
        }

        // Finally, assign the stimuli to right/left and embed
        if (deck_locs['blue'] == 'left') {
            left_stim = "stimuli/blue/object" + temp_data.blue_object + ".jpg"
            right_stim =  "stimuli/orange/object" + temp_data.orange_object + ".jpg"
            temp_data.left_value = temp_data.blue_value
            temp_data.left_object = temp_data.blue_object
            temp_data.right_value = temp_data.orange_value
            temp_data.right_object = temp_data.orange_object
        } else {
            left_stim = "stimuli/orange/object" + temp_data.orange_object + ".jpg"
            right_stim =  "stimuli/blue/object" + temp_data.blue_object + ".jpg"
            temp_data.left_value = temp_data.orange_value
            temp_data.left_object = temp_data.orange_object
            temp_data.right_value = temp_data.blue_value
            temp_data.right_object = temp_data.blue_object
        }
        choice.stimulus = "<div style='width: 800px;'>" +
            "<div style='float: left;'><img src='" + left_stim + "'></img></div>" +
            "<div style='float: right;'><img src='" + right_stim + "'></img></div>" +
            "</div>"
    },
    on_finish: function(data) {

        // first, add all stuff from temp_data to the current trial data
        for (const [key, value] of Object.entries(temp_data)) {
            data[key] = value
        }

        if (['ArrowLeft','ArrowRight'].includes(data.response)) {
            
            if (data.response=="ArrowLeft") {
                data.left_chosen = 1
                if (data.blue_loc == 'left') {
                    data.blue_chosen = 1
                    data.deck_chosen = 'blue'
                    data.object_chosen = data.blue_object
                    data.outcome = data.blue_value
                } else {
                    data.blue_chosen = 0
                    data.deck_chosen = 'orange'
                    data.object_chosen = data.orange_object
                    data.outcome = data.orange_value
                }
            } else if (data.response == 'ArrowRight') {
                data.left_chosen = 0
                if (data.blue_loc == 'right') {
                    data.blue_chosen = 1
                    data.deck_chosen = 'blue'
                    data.object_chosen = data.blue_object
                    data.outcome = data.blue_value
                } else {
                    data.blue_chosen = 0
                    data.deck_chosen = 'orange'
                    data.object_chosen = data.orange_object
                    data.outcome = data.orange_value
                }
            }
            data.lucky_chosen = + (data.deck_chosen == data.lucky_deck)

            if (data.old_trial == 1 && ['blue','orange'].includes(data.deck_chosen)) {
                data.old_chosen = + (data.deck_chosen == data.old_deck)
                data.optimal_old_choice = + ( (data.old_chosen==0 && data.old_value < 0.5 ) || (data.old_chosen==1 && data.old_value>0.5) )
            }
            
            all_outcomes.push(data.outcome) // for keeping track of average value of all feedback over time

        } else {
            data.deck_chosen = 'no_response'
        }
        console.log(trial_number)
        if (trial_number > old_trial_tracking.length-1) {
            console.log('!!!!!!!!!')
        }
        // update the old_trial_tracking variables
        old_trial_tracking[trial_number]['trial_number'] = data.trial_number;
        old_trial_tracking[trial_number]['value'] = data.outcome;
        old_trial_tracking[trial_number]['deck'] = data.deck_chosen;
        old_trial_tracking[trial_number]['object'] = data.object_chosen;
        if (data.old_chosen) { old_trial_tracking[trial_number]["shown_twice"] = true }
        if (data.lucky_chosen) {
            old_trial_tracking[trial_number]['luck'] = "lucky";
        } else {
            old_trial_tracking[trial_number]['luck'] = "unlucky";
        }
        // update trial number
        trial_number += 1;
    }

};


// choice confirmation just puts a green box around the chosen item until the end of the trial
var choice_confirmation = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function () {
        var resp = jsPsych.data.get().last(1).values()[0].response
        if (resp == "ArrowLeft") {
            document.body.style.background = "url('stimuli/blank_confirmation_left.jpg') no-repeat center center";
        } else if (resp == "ArrowRight") {
            document.body.style.background = "url('stimuli/blank_confirmation_right.jpg') no-repeat center center";
        } 
        return jsPsych.data.get().last(1).values()[0].stimulus;
    },
    choices: [],
    trial_duration: function () { // until the end of the trial
        if (jsPsych.data.get().last(1).values()[0].deck_chosen == "no_response") {
            return 0 
        } else {
            return (params.choice_time - jsPsych.data.get().last(1).values()[0].rt);
        }
    },
    data: { trial_type: 'confirmation' }
};


// feedback portion will show the value of the chosen card
var feedback = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function () {
        document.body.style.background = "url('stimuli/blank_background.jpg') no-repeat center center";

        var last_trial_earned = jsPsych.data.get().last(2).values()[0].outcome;
        var left_chosen = jsPsych.data.get().last(2).values()[0].left_chosen;
        var stim = jsPsych.data.get().last(2).values()[0].stimulus;
        var choice = jsPsych.data.get().last(2).values()[0].deck_chosen;

        if (deck_locs.blue=='left') {
            leftImg = "blue/";
            rightImg = "orange/";
        } else {
            leftImg = "orange/";
            rightImg = "blue/";
        }

        if (last_trial_earned == 0) {
            imgVal = "0.jpg"
        } else if (last_trial_earned == 0.2) {
            imgVal = "20.jpg"
        } else if (last_trial_earned == 0.4) {
            imgVal = "40.jpg"
        } else if (last_trial_earned == 0.6) {
            imgVal = "60.jpg"
        } else if (last_trial_earned == 0.8) {
            imgVal = "80.jpg"
        } else if (last_trial_earned == 1) {
            imgVal = "1.jpg"
        }

        stim_array = stim.split('stimuli/')
        out_stim = stim_array[0]
        for (i = 1; i < stim_array.length; i++) {
            imgName = stim_array[i].split('></stimuli')[0]
            imgNames = imgName.split('.')
            
            if (left_chosen) {
                // only replace the left image
                if (i == 1) {
                    out_stim = out_stim + "stimuli/feedback/" + leftImg + imgVal + "'" + '></stimuli' + stim_array[i].split('></stimuli')[1]
                } else {
                    out_stim = out_stim + "stimuli/feedback/" + "blank.jpg" + "'" + '></stimuli' + stim_array[i].split('></stimuli')[1]
                }
            } else if (choice != "no_response") {
                // only replace the right image
                if (i == 2) {
                    out_stim = out_stim + "stimuli/feedback/" + rightImg + imgVal + "'" + '></stimuli' + stim_array[i].split('></img')[1]
                } else {
                    out_stim = out_stim + "stimuli/feedback/" + "blank.jpg" + "'" + '></stimuli' + stim_array[i].split('></img')[1]
                }
            } else if (choice == "no_response") {
                out_stim = '<div style="font-size:60px;">Too Slow!</div>';
            }
        }
        return out_stim
    },
    choices: [],
    trial_duration: params.feedback_time,
    data: { trial_type: 'feedback' }
};

var block_break = {
    type: jsPsychHtmlButtonResponse,
    stimulus:  "<p style='font-size: 150%'><b>Take a break!</b></p>" +
        "<p>Take up to 2 minutes, and press 'Continue' when you're ready to begin again.</p>",
    choices: ['Continue'],
    trial_duration: [120000],
    on_finish: function (){
        // reset reversals for the next block
        reversals = generate_block_reversals() 
        // flip deck positions
        [deck_locs.blue, deck_locs.orange] = [deck_locs.orange, deck_locs.blue]
    }
}

var practice_procedure = {
    timeline: [iti, choice, choice_confirmation, feedback],
    // timeline_variables: [{ stimulus: "", data: {} }]; // jspsych wants this for some reason?
    repetitions: params.n_practice_trials,
};

var block_procedure = {
    timeline: [iti, choice, choice_confirmation, feedback],
    // timeline_variables: [{ stimulus: "", data: {} }];
    repetitions: params.n_trials_per_block,
}

var main_task_procedure = {
    timeline: [block_procedure, block_break],
    // timeline_variables: [{ stimulus: "", data: {} }];
    repetitions: params.n_blocks
}


/*** 5. Debrief & finishing ***/

var debrief_block = {
    type: jsPsychHtmlButtonResponse,
    stimulus: function () {
        
        var feedback_trials = jsPsych.data.get().filter({ trial_type: 'feedback' });
        bonus = feedback_trials.select('outcome').sum() * params.bonus_downweighting, 2
        bonus = Math.max(bonus, params.max_bonus).toFixed(2)

        var choice_trials = jsPsych.data.get().filter({ trial_type: 'choice' });
        var choice_trials_old = choice_trials.filter({old_trial: 1})
        var choice_trials_old_optimal = choice_trials_old.filter({optimal_old_choice: 1})
        rt = Math.round(choice_trials.select('rt').mean());
        accuracy = Math.round(choice_trials_old_optimal.count() / choice_trials_old.count() * 100)

        time_elapsed = (jsPsych.data.getLastTrialData().values()[0].time_elapsed / 1000 / 60).toFixed(2)

        return "<p>You earned a total bonus of <b>$" + bonus + "</b>!</p>" +
            "<p>Your average response time was " + rt + "ms.</p>" +
            "<p>You correctly remembered " + accuracy + "% of repeated images."
    },
    choices: ['Save data and end experiment'],
    response_ends_trial: true,
    on_finish:  function(data) {
        data.params = params
        data.trial_type = 'summary'
        data.experimental_duration = time_elapsed
        data.bonus = bonus
        data.total_payment = bonus + params.base_pay
        data.mean_rt = rt
        data.accuracy = accuracy
        data.experiment_id = experiment_id
        data.datetime = new Date().toLocaleString();
        console.log('Summary data:', data)
    }
}

var fullscreen_close = {
    type: jsPsychFullscreen,
    fullscreen_mode:false,
}

var end_screen = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: '<p>Thank you for completing the experiment! Press any key to be redirected back to Prolific.</p>',
    response_ends_trial: true,
    on_finish: function() {
        window.location = params.prolific_redirect_link
    }
}

const save_data = {
    type: jsPsychPipe,
    action: "save",
    experiment_id: "TJB5utBxDQPm",
    filename: filename,
    data_string: ()=>jsPsych.data.get().csv()
};


/*** 6. Populate timeline and run experiment ***/

// preload images
images = [
    'stimuli/online_consent.png',
    'stimuli/examples/example-choice.png',
    'stimuli/examples/example-feedback.png',
    'stimuli/examples/example-old-card.png',
    'stimuli/examples/example-deck-values.png',
    'stimuli/examples/example-deck-luck.png',
    'stimuli/blank_confirmation_left.jpg',
    'stimuli/blank_confirmation_right.jpg',
    'stimuli/blank_background.jpg'
]
// card images
for (var i = 1; i <= 665; i++) {
    images.push('stimuli/blue/object' + i + '.jpg')
    images.push('stimuli/orange/object' + i + '.jpg')
    // images.push('stimuli/no_deck/object' + i + '.jpg')
}
// feedback images
vals = ["0.jpg", "20.jpg", "40.jpg", "60.jpg", "80.jpg", "1.jpg"];
for (var i = 0; i < vals.length; i++) {
    images.push('stimuli/feedback/blue/'+vals[i])
    images.push('stimuli/feedback/orange/'+vals[i])
    //images.push('stimuli/feedback/no_deck/'+vals[i])
    images.push('stimuli/feedback/blank.jpg')
}
var preload_images = {
    type: jsPsychPreload,
    images: images
}

// populate timeline
var timeline = [];
if (params.local) {
    timeline.push(local_alert)
}
timeline.push(
    browser_check, 
    preload_images, 
    welcome_fullscreen, 
    instructions,
    // comprehension_check,
    practice_procedure,
    post_practice,
    main_task_procedure,
    debrief_block,
    save_data,
    fullscreen_close,
    end_screen
)
jsPsych.run(timeline)

