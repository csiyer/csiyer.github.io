const params = {
    experiment_id: "mem_choice_v1",
    stim_type: "memorability", // "memorability" or "distinctiveness"

    /////////// TIMING ///////////
    n_trials: 86,
    n_attention_checks: 5,
    stimulus_duration: 1500,      // Total view time for decks (ms)
    feedback_duration: 1200,      // Time to show the value and image (ms)
    too_slow_duration: 1200,      // "Too Slow!" message duration
    iti: 1000,                     // Inter-trial interval

    /////////// DESIGN ///////////
    rewards: [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],

    /////////// AESTHETICS ///////////
    background_color: "#f0f0f0",
    text_color: "#333333",
    blue_deck_color: "#2E5BFF",
    orange_deck_color: "#FF9100",
    highlight_color: "#FFEB3B",

    ////////// STUDY STUFF ///////
    completion_time: 7, // in minutes
    data_pipe_id: "a4wEmjxryCAr",
    prolific_completion_code: "C1G06HKV",
    base_pay: 2,
    max_bonus: 2,
};

params.instruction_pages = [
    `<div class='instruction-container'>
        <h2>Welcome to our card game!</h2>
        <p>This will take around <strong> ${params.completion_time} minutes</strong>.</p>
        <p>You will earn a base pay of <b>$${params.base_pay}</b> for completing the task, and a portion of your total winnings as a <b>bonus of up to $${params.max_bonus}</b>!</p>
    </div>`,
    `<div class='instruction-container' style='max-width: 900px;'>
        <h2 style="color: #333333;">Consent Form</h2>
        <p>Before we begin, please review the consent form below. You can also download a copy <a href="../files/online_consent_form.pdf" target="_blank" style="color: ${params.blue_deck_color}; font-weight: bold; text-decoration: underline;">here</a>.</p>
        <iframe src="../files/online_consent_form.pdf" width="100%" height="600px" style="border: 1px solid #eee; border-radius: 8px; margin-top: 10px;"></iframe>
        <p style="margin-top: 20px;">By clicking "Next", you confirm that you have read the form and voluntarily agree to participate in this study.</p>
    </div>`,
    `<div class='instruction-container'>
        <p>In this task, you will be playing a game with two decks of cards: a <b>Blue</b> deck and an <b>Orange</b> deck.</p>
        <p>On each trial, you will see two cards face down. Each card has a different <b>image</b> on its back.</p>
        <p><strong>Pay attention to the images</strong>, as these will be important later.</p>
        <div style='display: flex; justify-content: center; gap: 40px; margin: 20px;'>
            <div style='width: 100px; height: 140px; background: ${params.blue_deck_color}; border-radius: 8px; border: 2px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.2);'></div>
            <div style='width: 100px; height: 140px; background: ${params.orange_deck_color}; border-radius: 8px; border: 2px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.2);'></div>
        </div>
        <p>You can choose a card with the <strong>LEFT and RIGHT arrow keys</strong>.</p>
    </div>`,
    `<div class='instruction-container'>
        <p>Once you make a choice, the card will flip over to reveal its value (from <b>$0.0</b> to <b>$1.0</b>).</p>
        <div style='display: flex; justify-content: center; gap: 40px; margin: 25px;'>
            <!-- Unchosen Blue Deck -->
            <div style='width: 100px; height: 140px; background: ${params.blue_deck_color}; border-radius: 12px; border: 4px solid ${params.blue_deck_color}; opacity: 0.6; position: relative;'>
                 <div style='position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px; background: rgba(0,0,0,0.1); border-radius: 8px;'></div>
            </div>
            <!-- Chosen Orange Deck (Flipping Reveal) -->
            <div style='width: 100px; height: 140px; background: white; border-radius: 12px; border: 6px solid ${params.orange_deck_color}; box-shadow: 0 0 15px ${params.highlight_color}; display: flex; align-items: center; justify-content: center; position: relative;'>
                <div style='position: absolute; top: 10px; left: 10px; right: 10px; bottom: 10px; background: #eee; border-radius: 6px;'></div>
                <div style='width: 70px; height: 40px; background: white; border: 2px solid ${params.orange_deck_color}; border-radius: 6px; display: flex; align-items: center; justify-content: center; z-index: 1;'>
                    <b style='color: black; font-size: 1.2rem;'>80¢</b>
                </div>
            </div>
        </div>
        <p>At any given time, one of the decks is <b>"lucky"</b> and will tend to give higher rewards.</p>
        <p>The rewards are variable, so you might get a good card from an unlucky deck, or vice versa.</p>
        <p>And, the lucky deck can switch at any time.</p>
    </div>`,
    `<div class='instruction-container'>
        <p><b>Summary:</b></p>
        <ul>
            <li>Use <b>LEFT/RIGHT arrows</b> to pick a deck.</li>
            <li>Pay attention to the images.</li>
            <li>Try to maximize your reward through your choices.</li>
        </ul>
        <p>Press "Next" to start the game!</p>
    </div>`
];

window.params = params;
