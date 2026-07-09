// config.js — all tunable parameters for the sensory-preconditioning-repulsion task.
// Mirrors ../associative-looking/sensory_preconditioning/params.py, adapted for online
// (centered layout, online-optimized timings). Durations are in milliseconds.
window.SP = window.SP || {};

SP.config = {
  // ---- counts -------------------------------------------------------------
  N_POOL: 32,        // candidate object images (01..32.jpg)
  N_TASK: 8,         // task stimuli selected per participant (4 A–B pairs)
  N_EXAMPLE: 2,      // example stimuli for instruction demos
  N_PAIRS: 4,
  ASSOC_REPS: 10,    // per pair  -> 40 association trials
  REWARD_REPS: 10,   // per B     -> 40 reward trials
  DECISION_REPS: 5,  // per comparison (8 comparisons) -> 40 decision trials

  // ---- association timings (ms) ------------------------------------------
  ASSOC_A_MS: 1750,
  ASSOC_ISI_MS: 1000,   // A->B blank fixation: coactivation window, KEEP
  ASSOC_B_MS: 1750,
  ASSOC_ITI_MS: 2500,

  // ---- reward timings (ms) -----------------------------------------------
  REWARD_B_MS: 1000,
  REWARD_ISI_MS: 1000,
  REWARD_OUTCOME_MS: 1000, 
  REWARD_ITI_MS: 2000,

  // ---- decision timings (ms) ---------------------------------------------
  DECISION_PREVIEW_MS: 1000,   // response lockout: options visible but not clickable
  DECISION_TIMEOUT_MS: 10000,  // self-paced; generous cap after unlock (lab cap was 2000)
  DECISION_ITI_MS: 750,        // trimmed from lab 2000

  // ---- shared ------------------------------------------------------------
  LEAD_IN_MS: 600,        // "get ready" fixation before each phase's first trial
  TOO_SLOW_MS: 600,       // "Too slow!" flash shown after any missed response

  // ---- ratings -----------------------------------------------------------
  SLIDER_MIN: -1,
  SLIDER_MAX: 1,
  // jsPsych declares `step` as INT and coerces the value, so we pass a valid int here and
  // force true continuity (step="any") on the DOM element in the rating trial's on_load.
  SLIDER_STEP: 1,
  SLIDER_START: 0,         // neutral
  SLIDER_WIDTH: 600,
  REQUIRE_MOVEMENT: true,
  SLIDER_LABELS: ['strongly dislike', '', 'strongly like'],

  // ---- wheel / ring layout (ports ../associative-looking geometry) --------
  // The 8 task+... stimuli each own a fixed wedge on an 8-slice ring, so a pair's
  // A and B always appear at the same two on-screen locations — the spatial cue
  // that lets participants learn pairings without relying on temporal contiguity
  // alone. All lengths are fractions of the ring's outer radius, which itself is
  // sized to the viewport (see the --wheel-* CSS vars injected in stimuli.js), so
  // the wheel scales to any window like the lab's compute_scaled_geometry.
  WHEEL: {
    N_SLICES: 8,
    SLICE_ZERO_ANGLE_DEG: 112.5, // slice 0 center; rotated +22.5° so wedge boundaries land on the axes/diagonals
    EDGE_MARGIN_FRAC: 0.06,      // gap from ring outer edge to nearest viewport edge (of min(w,h)/2)
    IMAGE_CENTER_FRAC: 0.70,     // stimulus-center radius, as frac of outer radius
    IMAGE_SIZE_FRAC: 0.30,       // stimulus side length, as frac of outer radius
    HUB_RADIUS_FRAC: 0.045,      // central hub circle radius, as frac of outer radius
    // cover dot, as fractions of the (responsive) image side — keeps the lab's
    // dot-to-image proportion (18px on a 152px image ≈ 0.12) at every window size.
    DOT_FRAC: 0.12,              // dot diameter
    DOT_MARGIN_FRAC: 0.07        // keep the dot this far (of image side) from every image edge
  },

  // ---- response keys ------------------------------------------------------
  KEY_YES: 'ArrowUp',      // saw a dot
  KEY_NO: 'ArrowDown',     // no dot
  KEY_REWARD: 'ArrowUp',   // outcome was a reward (quarter)
  KEY_NOREWARD: 'ArrowDown', // no reward (black circle)

  // ---- assets -------------------------------------------------------------
  IMG_DIR: 'stimuli/img/',
  REWARD_IMG: 'quarter.png',
  NOREWARD_IMG: 'blackcircle.png',

  // ---- infrastructure (fill these in before launch) -----------------------
  DATAPIPE_ID: 'Qjq8MSCvwQwg',
  PROLIFIC_COMPLETION_CODE: 'REPLACE_WITH_PROLIFIC_CODE',
  PROLIFIC_COMPLETION_URL: 'https://app.prolific.com/submissions/complete',
  CONSENT_PDF_URL: 'https://csiyer.github.io/files/online_consent_form.pdf',

  // ---- bonus (must match the dollar figure quoted in instructions.js welcomeHtml) ---------
  MAX_BONUS: 2,

  // ---- Cloudflare Turnstile (bot check) ------------------------------------
  TURNSTILE_SITE_KEY: '0x4AAAAAADuq2AVsFg4ANjrs',
  TURNSTILE_WORKER_URL: 'https://turnstile-verify.csiyer.workers.dev',

  // ---- dev toggles --------------------------------------------------------
  DEV: {
    fast: false,            // divide every duration by durationDivisor for quick run-throughs
    durationDivisor: 10,
    skipFullscreen: false,
    skipTurnstile: false,
    fakePID: null,          // override PROLIFIC_PID when testing without URL params
    comprehensionLoopCap: 3, // max re-shows of instructions+question before moving on
    quickN: null             // ?quick=N: truncate each of assoc/reward/decision to N trials
  }
};

// Duration scaler — the online analog of the lab's scale_ms / fast_mode.
SP.scaleMs = function (ms) {
  if (SP.config.DEV.fast) return Math.max(1, Math.round(ms / SP.config.DEV.durationDivisor));
  return ms;
};

// ?quick=N — the online analog of run_experiment.py's --quick: truncates each phase's trial
// list to N trials for a fast, real-speed end-to-end walkthrough (timing untouched; use
// ?dev=1 for that). Must run before stimuli.js builds its pool from N_POOL. Also shrinks the
// pre-rating candidate pool to just enough images for neutral-stimulus selection (N_TASK +
// N_EXAMPLE) plus N, mirroring the Python pool[:max(max_trials, N_SELECTED)] cap.
(function () {
  const n = parseInt(new URLSearchParams(window.location.search).get('quick'), 10);
  if (n > 0) {
    SP.config.DEV.quickN = n;
    SP.config.N_POOL = Math.min(SP.config.N_POOL, Math.max(n, SP.config.N_TASK + SP.config.N_EXAMPLE));
  }
})();
