// config.js — all tunable parameters for the maze-memorability task. Durations are in
// milliseconds. Mirrors the sensory-preconditioning-repulsion convention: one flat params
// object, plus a scaleMs() duration helper and URL-param dev toggles at the bottom.
window.MM = window.MM || {};

MM.config = {
  // ---- stimuli / condition -------------------------------------------------
  // Path from index.html back to the shared csiyer.github.io/stimuli/ directory
  // (this copy is deployed flat inside csiyer.github.io/task-maze/; synced from maze-memorability/task/ via scripts/sync-to-pages.sh).
  stimuli_dir: '../stimuli',
  n_landmarks: 6,          // images sampled per participant from their assigned memorability bin

  // ---- maze / navigation ----------------------------------------------------
  see_this_far: 1,          // fog-of-war radius, in grid cells (Chebyshev distance)
  cell_px: 48,              // rendered size of one grid cell
  max_moves: 300,           // safety cap per maze trial; hitting it force-finishes as timed_out
  min_nav_distance: 8,      // phase2/3 start cell must be >= this many BFS moves from target
  max_nav_distance: 20,     // ...and <= this many
  max_recall_error_cells: 12, // normalizes phase3 bonus score; ~= this maze's mean pairwise BFS distance (12.35, see maze.js)

  // ---- timings (ms) ---------------------------------------------------------
  image_display_duration: 1500,  // landmark popup (phase1) / recall study image (phase3)
  reached_flash_ms: 300,          // brief "Reached!" flash at the end of a phase2 trial

  // ---- trial counts -----------------------------------------------------
  n_phase2_trials: 10,
  n_phase3_trials: 6,       // == n_landmarks, one recall trial per landmark
  n_phase4_trials: 15,      // == C(6,2), all unordered landmark pairs

  // ---- direction-response dial (phase 4) ---------------------------------
  dial_radius_px: 120,
  require_movement: true,   // participant must rotate the handle before Submit is enabled

  // ---- comprehension quiz -------------------------------------------------
  comprehension_loop_cap: 3,   // max re-shows of a part's instructions+quiz before moving on anyway

  // ---- pay / bonus --------------------------------------------------------
  base_pay: 2.00,
  max_bonus: 2.00,
  // equal-weighted mean of the three phase scores -> overall_accuracy -> bonus (see data.js)
  bonus_weights: { phase2: 1 / 3, phase3: 1 / 3, phase4: 1 / 3 },

  // ---- infrastructure (fill these in before launch) --------------------------
  DATAPIPE_EXPERIMENT_ID: 'VFtioPa7Hm5f',
  CONSENT_PDF_URL: 'https://csiyer.github.io/files/online_consent_form.pdf',
  PROLIFIC_COMPLETION_CODE: 'FILL_IN_PROLIFIC_COMPLETION_CODE',
  PROLIFIC_COMPLETION_URL: 'https://app.prolific.com/submissions/complete',

  // ---- Prolific -------------------------------------------------------------
  PROLIFIC_PID: null,        // set from ?PROLIFIC_PID= below, if present

  // ---- dev toggles ------------------------------------------------------
  DEV: {
    fast: false,             // divide every duration by durationDivisor for quick run-throughs
    durationDivisor: 10,
    fakePID: null,           // override the generated participant id when testing
    quickN: null             // ?quick=N: truncate phase2/phase4 trial counts for a fast real-speed run-through
  }
};

// Duration scaler — the online analog of the reference repo's scaleMs / fast_mode.
MM.scaleMs = function (ms) {
  if (MM.config.DEV.fast) return Math.max(1, Math.round(ms / MM.config.DEV.durationDivisor));
  return ms;
};

// ?dev=1 -> fast durations for quick manual run-throughs.
(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get('dev') === '1') {
    MM.config.DEV.fast = true;
  }
  // ?quick=N -> truncate phase2 (navigate) and phase4 (direction) trial counts; phase3 stays
  // at n_landmarks since every recall trial needs its own distinct image.
  const n = parseInt(params.get('quick'), 10);
  if (n > 0) {
    MM.config.DEV.quickN = n;
    MM.config.n_phase2_trials = Math.min(MM.config.n_phase2_trials, n);
    MM.config.n_phase4_trials = Math.min(MM.config.n_phase4_trials, n);
  }
  // ?fakePID=xyz -> deterministic participant id for testing/reproducibility checks.
  const fakePID = params.get('fakePID');
  if (fakePID) {
    MM.config.DEV.fakePID = fakePID;
  }
  // ?PROLIFIC_PID=xyz -> standard Prolific recruitment URL param; used as the participant id
  // (see data.js getParticipantId) when present and no fakePID override is set.
  const prolificPID = params.get('PROLIFIC_PID');
  if (prolificPID) {
    MM.config.PROLIFIC_PID = prolificPID;
  }
})();
