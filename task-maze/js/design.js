// design.js — MM.design.buildDesign(pid): the full per-participant experimental design
// (condition, sampled landmark images, landmark-to-cell assignment, and all trial orders
// for phases 2-4), built entirely from `pid` + MM.config + MM.rng + MM.maze + MM.stimuli.
// Every random draw goes through MM.rng.makeRNG(pid, tag) so the whole design is
// deterministic and reproducible from the participant id alone (see dev/reproducibility.html).
// Framework-free (no jsPsych) by design, same as the reference repo's design.js.
window.MM = window.MM || {};
MM.design = {};

(function () {
  function assignCondition(pid) {
    const rng = MM.rng.makeRNG(pid, 'condition');
    return rng() < 0.5 ? 'high' : 'low';
  }

  // Sample MM.config.n_landmarks images from the participant's assigned bin, then map
  // them onto the maze's fixed landmark cells (MM.maze.LANDMARK_CELLS) in a random order.
  function assignLandmarks(pid, condition) {
    const rngImg = MM.rng.makeRNG(pid, 'landmark_images');
    const pool = MM.stimuli.binPool(condition);
    const sampled = MM.rng.sample(pool, MM.config.n_landmarks, rngImg);

    const rngAssign = MM.rng.makeRNG(pid, 'landmark_assignment');
    const imageOrder = MM.rng.shuffle(sampled.map(function (_, i) { return i; }), rngAssign);

    return MM.maze.LANDMARK_CELLS.map(function (cell, landmarkId) {
      const entry = sampled[imageOrder[landmarkId]];
      return {
        landmark_id: landmarkId,
        row: cell.row,
        col: cell.col,
        image_path: entry.image_path,
        image_url: MM.stimuli.imageUrl(entry),
        concept_name: entry.concept_name
      };
    });
  }

  // Phase 2 targets are freshly sampled maze cells that are NOT any of the 6 landmark
  // cells (and start cells are filtered the same way) -- this phase tests general
  // maze-layout navigation, deliberately decoupled from "recall where a landmark was"
  // (that's Phase 3's job). Sampled without replacement, so all trial targets are
  // distinct; no need for a no-repeat ordering pass.
  function buildPhase2Trials(pid, landmarks) {
    const landmarkCellSet = new Set(landmarks.map(function (lm) { return lm.row + ',' + lm.col; }));
    const nonLandmarkCells = [];
    for (let r = 0; r < MM.maze.ROWS; r++) {
      for (let c = 0; c < MM.maze.COLS; c++) {
        if (!landmarkCellSet.has(r + ',' + c)) nonLandmarkCells.push({ row: r, col: c });
      }
    }

    const rngTargets = MM.rng.makeRNG(pid, 'phase2_targets');
    const targetCells = MM.rng.sample(nonLandmarkCells, MM.config.n_phase2_trials, rngTargets);

    return targetCells.map(function (targetCell, trialIndex) {
      const dist = MM.maze.bfsDistances(targetCell);
      let candidates = MM.maze.cellsAtDistanceRange(targetCell, MM.config.min_nav_distance, MM.config.max_nav_distance)
        .filter(function (cell) { return !landmarkCellSet.has(cell.row + ',' + cell.col); });
      if (candidates.length === 0) {
        // extremely unlikely safety net -- fall back to the unfiltered distance range
        candidates = MM.maze.cellsAtDistanceRange(targetCell, MM.config.min_nav_distance, MM.config.max_nav_distance);
      }
      const rngStart = MM.rng.makeRNG(pid, 'phase2_start_' + trialIndex);
      const startCell = MM.rng.choice(candidates, rngStart);
      return {
        trial_index: trialIndex,
        target_row: targetCell.row,
        target_col: targetCell.col,
        start_row: startCell.row,
        start_col: startCell.col,
        optimal_path_length: dist[startCell.row][startCell.col]
      };
    });
  }

  function buildPhase3Trials(pid, landmarks) {
    const ids = landmarks.map(function (lm) { return lm.landmark_id; });
    const rngOrder = MM.rng.makeRNG(pid, 'phase3_order');
    const order = MM.rng.shuffle(ids, rngOrder).slice(0, MM.config.n_phase3_trials);

    return order.map(function (landmarkId, trialIndex) {
      const lm = landmarks[landmarkId];
      const trueCell = { row: lm.row, col: lm.col };
      const dist = MM.maze.bfsDistances(trueCell);
      const candidates = MM.maze.cellsAtDistanceRange(trueCell, MM.config.min_nav_distance, MM.config.max_nav_distance);
      const rngStart = MM.rng.makeRNG(pid, 'phase3_start_' + trialIndex);
      const startCell = MM.rng.choice(candidates, rngStart);
      return {
        trial_index: trialIndex,
        landmark_id: landmarkId,
        true_row: trueCell.row,
        true_col: trueCell.col,
        image_url: lm.image_url,
        image_path: lm.image_path,
        start_row: startCell.row,
        start_col: startCell.col
      };
    });
  }

  function buildPhase4Trials(pid, landmarks) {
    const n = landmarks.length;
    const allPairs = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) allPairs.push([i, j]);
    }
    const rngRoles = MM.rng.makeRNG(pid, 'phase4_roles');
    const rngOrder = MM.rng.makeRNG(pid, 'phase4_order');
    const roleFlipped = allPairs.map(function () { return rngRoles() < 0.5; });
    const withRoles = allPairs.map(function (pair, idx) {
      return roleFlipped[idx] ? [pair[1], pair[0]] : [pair[0], pair[1]];
    });
    const order = MM.rng.shuffle(withRoles.map(function (_, i) { return i; }), rngOrder).slice(0, MM.config.n_phase4_trials);

    return order.map(function (pairIdx, trialIndex) {
      const pair = withRoles[pairIdx];
      const a = landmarks[pair[0]];
      const b = landmarks[pair[1]];
      const cellA = { row: a.row, col: a.col };
      const cellB = { row: b.row, col: b.col };
      return {
        trial_index: trialIndex,
        landmark_a_id: a.landmark_id,
        landmark_a_row: a.row,
        landmark_a_col: a.col,
        landmark_a_image_url: a.image_url,
        landmark_b_id: b.landmark_id,
        landmark_b_row: b.row,
        landmark_b_col: b.col,
        landmark_b_image_url: b.image_url,
        true_bearing_deg: MM.maze.bearingDeg(cellA, cellB)
      };
    });
  }

  function buildDesign(pid) {
    const condition = assignCondition(pid);
    const landmarks = assignLandmarks(pid, condition);
    return {
      pid: pid,
      condition: condition,
      landmarks: landmarks,
      phase2_trials: buildPhase2Trials(pid, landmarks),
      phase3_trials: buildPhase3Trials(pid, landmarks),
      phase4_trials: buildPhase4Trials(pid, landmarks)
    };
  }

  MM.design = {
    buildDesign: buildDesign
  };
})();
