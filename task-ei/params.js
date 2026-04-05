/**
 * Task 2 Parameters: Episodic-Incremental Learning (mem-ep-inc)
 * Aimed at ~15 minute duration, 240 trials, $3+$3 pay.
 */
const params = {
    // Basic Info
    experiment_id: 'task-ei-' + Math.random().toString(36).substr(2, 9),
    base_pay: 3.00,
    max_bonus: 3.00,

    // Trial Structure
    n_trials: 240,
    n_trials_per_block: 80, // 30s rest between blocks
    break_duration: 30000,
    n_blocks: 3,

    // Timing (ms)
    iti: 1500,
    stimulus_duration: 2000,
    feedback_duration: 1000,
    too_slow_duration: 1500,

    // Incremental Logic
    // lucky_reward_dist: counts of [$0, $0.2, $0.4, $0.6, $0.8, $1.0]
    // (1*0.0 + 2*0.2 + 3*0.4 + 5*0.6 + 5*0.8 + 4*1.0) / 20 = 0.63
    lucky_reward_dist: [1, 2, 3, 5, 5, 4],
    unlucky_reward_dist: [4, 5, 5, 3, 2, 1], // mean = 0.37

    // Reversals
    min_reversal: 16,
    max_reversal: 24,

    // Episodic Logic
    old_trial_prob: 0.6,
    old_window: [10, 30], // Range to look back for repeats

    // Manipulation Toggle: 'memorability' or 'distinctiveness'
    stim_type: 'memorability',

    // UI Styling
    blue_deck_color: '#4A90E2',
    orange_deck_color: '#F5A623',
    highlight_color: '#2ECC71', // Green for selection

    // Remote Save
    data_pipe_id: "TJB5utBxDQPm",
    prolific_completion_code: "CFNQ0OZB",
};

params.instruction_pages = [
    `<div class='instruction-container'>
        <h2 style="color: #2c3e50;">Welcome to the Card Game!</h2>
        <p>In this experiment, you will play a game where your goal is to win as much money as possible.</p>
        <p>You will earn a base pay of $${params.base_pay.toFixed(2)} and can earn up to <b>$${params.max_bonus.toFixed(2)} in bonus money</b>!</p>
        <p>The game consists of 3 blocks, with a break between each block.</p>
    </div>`,
    `<div class='instruction-container'>
        <h3>How to Play</h3>
        <p>On each trial, you will see two decks of cards: a <b>Blue Deck</b> and an <b>Orange Deck</b>.</p>
        <div style='display: flex; justify-content: center; gap: 40px; margin: 20px;'>
            <div style='width: 100px; height: 140px; background: ${params.blue_deck_color}; border-radius: 8px; border: 2px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.2);'></div>
            <div style='width: 100px; height: 140px; background: ${params.orange_deck_color}; border-radius: 8px; border: 2px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.2);'></div>
        </div>
        <p>Use the <b>Left</b> and <b>Right</b> arrow keys to choose a card from a deck.</p>
        <p>You have <b>2 seconds</b> to make a choice.</p>
    </div>`,
    `<div class='instruction-container'>
        <p>When you choose a card, you will see its value (ranging from $0 to $1).</p>
        <div style='display: flex; justify-content: center; gap: 40px; margin: 25px;'>
            <!-- Unchosen Blue Deck -->
            <div style='width: 100px; height: 140px; background: ${params.blue_deck_color}; border-radius: 12px; border: 4px solid ${params.blue_deck_color}; opacity: 0.6; position: relative;'>
                 <div style='position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px; background: rgba(0,0,0,0.1); border-radius: 8px;'></div>
            </div>
            <!-- Chosen Orange Deck (Reveal) -->
            <div style='width: 100px; height: 140px; background: white; border-radius: 12px; border: 6px solid ${params.orange_deck_color}; box-shadow: 0 0 15px ${params.highlight_color}; display: flex; align-items: center; justify-content: center; position: relative;'>
                <div style='position: absolute; top: 10px; left: 10px; right: 10px; bottom: 10px; background: #eee; border-radius: 6px;'></div>
                <div style='width: 70px; height: 40px; background: white; border: 2px solid ${params.orange_deck_color}; border-radius: 6px; display: flex; align-items: center; justify-content: center; z-index: 1;'>
                    <b style='color: black; font-size: 1.2rem;'>80&cent</b>
                </div>
            </div>
        </div>
        <p>Your goal is to maximize the rewards you get; your bonus will be a a portion of your total rewards.</p>
    </div>`,
    `<div class='instruction-container'>
        <h3>Rule 1: The Lucky Deck</h3>
        <p>At any given time, one of the two decks is <b>"lucky."</b> The lucky deck tends to give higher rewards on average, while the unlucky deck gives lower rewards.</p>
        <p><b style="color: #e74c3c;">Important:</b> The lucky deck will periodically switch colors without warning. You must pay attention to the rewards to figure out which deck is currently lucky.</p>
    </div>`,
    `<div class='instruction-container'>
        <h3>Rule 2: Repeated Cards</h3>
        <p>Each card also has an image on it. Sometimes, you will encounter a card with an image you have <b>seen before</b>.</p>
        <p>A card will <b>always be worth the same amount</b> as the first time you saw it, regardless of which deck it appears in or whether that deck is currently lucky.</p>
        <p>Use your memory to help you pick high-value cards you've seen before!</p>
    </div>`,
    `<div class='instruction-container'>
        <h3>Summary</h3>
        <ul>
            <li>Find and pick the <b>Lucky Deck</b> to win more over time.</li>
            <li>Remember the value of <b>Specific Cards</b> (images) for when they repeat.</li>
            <li>The deck locations (Left/Right) will be randomized on each trial.</li>
        </ul>
        <p>Press <b>Next</b> to begin the experiment!</p>
    </div>`
];

window.params = params;
