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
    n_trials: 180,
    n_trials_per_block: 60, // 30s rest between blocks
    break_duration: 30000,
    n_blocks: 3,

    // Timing (ms)
    iti: 1500,
    stimulus_duration: 2000,
    feedback_duration: 1000,
    too_slow_duration: 1500,

    // Incremental Logic
    // lucky_reward_dist: counts of [$0, $0.2, $0.4, $0.6, $0.8, $1.0]
    // Matches Raphael's MATLAB distribution: 2:7 and 7:-1:2
    // mean = (2*0.0 + 3*0.2 + 4*0.4 + 5*0.6 + 6*0.8 + 7*1.0) / 27 = 0.63 vs. 0.37
    lucky_reward_dist: [2, 3, 4, 5, 6, 7],
    unlucky_reward_dist: [7, 6, 5, 4, 3, 2], // mean = 0.37

    // Reversals
    min_reversal: 16,
    max_reversal: 24,

    // Episodic Logic
    old_trial_prob: 0.7, // it will always be lower, due to sampling (0.6 goal)
    old_window: [9, 30], // Range to look back for repeats

    // Manipulation Toggle: 'memorability' or 'distinctiveness'
    stim_type: 'memorability',

    // UI Styling
    blue_deck_color: '#4A90E2',
    orange_deck_color: '#F5A623',
    highlight_color: '#2ECC71', // Green for selection

    // Remote Save
    data_pipe_id: "TSYDEicoxR5E",
    prolific_completion_code: "C1B3YYAS",
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
        <p>Each card has an <strong>image</strong> on it that identifies that specific card.</p>
        <div style='display: flex; justify-content: center; gap: 40px; margin: 20px;'>
            <div style='width: 120px; height: 160px; background: white; border-radius: 12px; border: 8px solid ${params.blue_deck_color}; display: flex; align-items: center; justify-content: center; font-size: 60px;'>&#128522;</div>
            <div style='width: 120px; height: 160px; background: white; border-radius: 12px; border: 8px solid ${params.orange_deck_color}; display: flex; align-items: center; justify-content: center; font-size: 60px;'>&#128543;</div>
        </div>
        <p>Use the <b>Left</b> and <b>Right</b> arrow keys to choose a card from a deck.</p>
        <p>You have <b>2 seconds</b> to make a choice.</p>
    </div>`,
    `<div class='instruction-container'>
        <p>When you choose a card, you will see its value (ranging from $0 to $1).</p>
        <div style='display: flex; justify-content: center; gap: 40px; margin: 25px;'>
            <!-- Chosen Blue Deck (Reveal) -->
            <div style='width: 120px; height: 160px; background: white; border-radius: 12px; border: 10px solid ${params.blue_deck_color}; box-shadow: 0 0 20px ${params.highlight_color}; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;'>
                <div style='font-size: 30px; opacity: 0.3; margin-bottom: 5px;'>&#128522;</div>
                <div style='width: 80px; height: 50px; background: white; border: 2px solid ${params.blue_deck_color}; border-radius: 8px; display: flex; align-items: center; justify-content: center;'>
                    <b style='color: black; font-size: 1.4rem;'>80&cent</b>
                </div>
            </div>

            <!-- Unchosen Orange Deck -->
            <div style='width: 120px; height: 160px; background: white; border-radius: 12px; border: 8px solid ${params.orange_deck_color}; opacity: 0.4; display: flex; align-items: center; justify-content: center; font-size: 60px;'>&#128543;</div>
        </div>
        <p>Your goal is to maximize the rewards you get; your bonus will be a portion of your total rewards.</p>
    </div>`,
    `<div class='instruction-container'>
        <h3>Rule 1: The Lucky Deck</h3>
        <p>At any given time, one of the two decks is <b>"lucky."</b> The lucky deck tends to give higher rewards on average, while the unlucky deck gives lower rewards.</p>
        <p><b style="color: #e74c3c;">Important:</b> The lucky deck will periodically switch colors without warning. You must pay attention to the rewards to figure out which deck is currently lucky.</p>
    </div>`,
    `<div class='instruction-container'>
        <h3>Rule 2: Repeated Cards</h3>
        <p>Each card has a <strong>unique image</strong>. Sometimes, you will encounter a card you have <strong>seen before</strong>.</p>
        <p>A card will <b>always be worth the same amount</b> as the first time you saw it, regardless of its deck color or luck.</p>
        
        <div style='display: flex; align-items: center; justify-content: center; gap: 20px; margin: 30px 0;'>
             <!-- First Encounter -->
             <div style='display: flex; align-items: center; gap: 10px;'>
                 <div style='width: 80px; height: 110px; background: white; border-radius: 8px; border: 4px solid ${params.blue_deck_color}; display: flex; align-items: center; justify-content: center; font-size: 40px;'>&#128522;</div>
                 <div style='font-size: 24px;'>&rarr;</div>
                 <div style='width: 80px; height: 110px; background: white; border-radius: 8px; border: 4px solid ${params.blue_deck_color}; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold;'>80&cent;</div>
             </div>

             <div style='font-size: 0.9rem; color: #95a5a6; font-style: italic; margin: 0 10px;'>(later...)</div>

             <!-- Second Encounter -->
             <div style='display: flex; align-items: center; gap: 10px;'>
                 <div style='width: 80px; height: 110px; background: white; border-radius: 8px; border: 4px solid ${params.orange_deck_color}; display: flex; align-items: center; justify-content: center; font-size: 40px;'>&#128522;</div>
                 <div style='font-size: 24px;'>&rarr;</div>
                 <div style='width: 80px; height: 110px; background: white; border-radius: 8px; border: 4px solid ${params.orange_deck_color}; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold;'>80&cent;</div>
             </div>
        </div>
        
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
