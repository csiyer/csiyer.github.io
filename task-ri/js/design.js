// design.js — per-participant stimulus selection, role/pairing/reward assignment, and
// trial-list construction. Framework-free (depends only on SP.config + SP.rng) so it can be
// unit-tested in dev/reproducibility.html. Ports:
//   select_neutral_stimuli, assign_stimuli, build_{association,reward,decision}_trials
// from ../associative-looking/sensory_preconditioning/.
window.SP = window.SP || {};

(function () {
  const C = SP.config;
  const R = SP.rng;

  // --- selection: most-neutral items from the participant's own pre-ratings ----------
  // rated: [{ filename, rating }]. Returns { task:[8], example:[2], selectionRows }.
  function selectNeutral(rated, pid) {
    const rng = R.makeRNG(pid, 'select');
    let scored = rated.map(function (r) {
      return { abs: Math.abs(Number(r.rating)), filename: r.filename };
    });
    scored = R.shuffle(scored, rng);                 // random tie-break before the sort
    scored.sort(function (a, b) { return a.abs - b.abs; }); // stable ascending by |rating|
    const selected = scored.slice(0, C.N_TASK + C.N_EXAMPLE);
    const task = selected.slice(0, C.N_TASK).map(function (s) { return s.filename; });
    const example = selected.slice(C.N_TASK).map(function (s) { return s.filename; });
    const selectionRows = selected.map(function (s, i) {
      return { filename: s.filename, abs_rating: s.abs, role: i < C.N_TASK ? 'task' : 'example' };
    });
    return { task: task, example: example, selectionRows: selectionRows };
  }

  // --- assignment: pairs, reward status, roles ---------------------------------------
  // Returns { pairs:[{pair,A,B,rewarded}], roles:{filename:role}, example }.
  function assignStimuli(task, pid) {
    const rng = R.makeRNG(pid, 'assign');
    const shuffled = R.shuffle(task, rng);           // randomize which items become A vs B
    const pairs = [];
    for (let p = 0; p < C.N_PAIRS; p++) {
      pairs.push({ pair: p + 1, A: shuffled[2 * p], B: shuffled[2 * p + 1], rewarded: false });
    }
    const rewardedIdx = R.sample([0, 1, 2, 3], 2, rng); // 2 of 4 pairs rewarded
    rewardedIdx.forEach(function (i) { pairs[i].rewarded = true; });

    const roles = {};
    pairs.forEach(function (pr) {
      roles[pr.A] = pr.rewarded ? 'A+' : 'A-';
      roles[pr.B] = pr.rewarded ? 'B+' : 'B-';
    });
    return { pairs: pairs, roles: roles };
  }

  // --- random in-image dot offset (top-left px within the displayed image) ------------
  function dotXY(rng) {
    const range = C.IMG_PX - 2 * C.DOT_MARGIN_PX - C.DOT_PX;
    return {
      left: Math.round(C.DOT_MARGIN_PX + rng() * range),
      top: Math.round(C.DOT_MARGIN_PX + rng() * range)
    };
  }

  // --- association trials -------------------------------------------------------------
  // 40 trials (4 pairs x 10), no immediate pair repeat. Exactly 1 of each image's 10
  // presentations carries a dot (A and B chosen independently).
  function buildAssociation(design, pid) {
    const rng = R.makeRNG(pid, 'association');
    const entries = design.pairs.map(function (p) { return [p.pair, C.ASSOC_REPS]; });
    const seq = R.noRepeatSequence(entries, rng);     // array of pair numbers, length 40

    // For each pair, choose which of its 10 occurrences gets the A-dot and the B-dot.
    const occByPair = {};
    seq.forEach(function (pairNum, idx) {
      (occByPair[pairNum] = occByPair[pairNum] || []).push(idx);
    });
    const dotTrialA = {}, dotTrialB = {};
    design.pairs.forEach(function (p) {
      const occ = occByPair[p.pair];
      dotTrialA[p.pair] = occ[Math.floor(rng() * occ.length)];
      dotTrialB[p.pair] = occ[Math.floor(rng() * occ.length)];
    });

    return seq.map(function (pairNum, idx) {
      const pr = design.pairs.find(function (p) { return p.pair === pairNum; });
      const hasDotA = dotTrialA[pairNum] === idx;
      const hasDotB = dotTrialB[pairNum] === idx;
      return {
        pair: pairNum,
        a_filename: pr.A,
        b_filename: pr.B,
        role_a: design.roles[pr.A],
        role_b: design.roles[pr.B],
        has_dot_a: hasDotA,
        has_dot_b: hasDotB,
        dot_xy_a: hasDotA ? dotXY(rng) : null,
        dot_xy_b: hasDotB ? dotXY(rng) : null
      };
    });
  }

  // --- reward trials ------------------------------------------------------------------
  // 40 trials (4 B's x 10), no immediate B repeat. Each B's reward status is fixed.
  function buildReward(design, pid) {
    const rng = R.makeRNG(pid, 'reward');
    const entries = design.pairs.map(function (p) { return [p.pair, C.REWARD_REPS]; });
    const seq = R.noRepeatSequence(entries, rng);
    return seq.map(function (pairNum) {
      const pr = design.pairs.find(function (p) { return p.pair === pairNum; });
      return {
        pair: pairNum,
        b_filename: pr.B,
        paired_a_filename: pr.A,
        role_b: design.roles[pr.B],
        reward: pr.rewarded ? 1 : 0
      };
    });
  }

  // --- decision trials ----------------------------------------------------------------
  // 8 unique comparisons (4 indirect A+xA-, 4 direct B+xB-), 5 reps each = 40.
  // Per comparison the +item is on the left 3x / right 2x (shuffled). All 40 then shuffled
  // as a block (faithful to the in-lab build_decision_trials — no no-repeat constraint here).
  function buildDecision(design, pid) {
    const rng = R.makeRNG(pid, 'decision');
    const plusPairs = design.pairs.filter(function (p) { return p.rewarded; });   // 2
    const minusPairs = design.pairs.filter(function (p) { return !p.rewarded; });  // 2

    const comparisons = [];
    plusPairs.forEach(function (pp) {
      minusPairs.forEach(function (mp) {
        comparisons.push({
          type: 'indirect', plus: pp.A, minus: mp.A,
          plus_pairedB: pp.B, minus_pairedB: mp.B
        });
      });
    });
    plusPairs.forEach(function (pp) {
      minusPairs.forEach(function (mp) {
        comparisons.push({
          type: 'direct', plus: pp.B, minus: mp.B,
          plus_pairedB: null, minus_pairedB: null
        });
      });
    });

    let trials = [];
    comparisons.forEach(function (c) {
      // +item-on-left pattern: 3 true, 2 false, shuffled per comparison.
      const plusLeftSeq = R.shuffle([true, true, true, false, false], rng);
      plusLeftSeq.forEach(function (plusLeft) {
        trials.push({
          comparison_type: c.type,
          plus_filename: c.plus,
          left_filename: plusLeft ? c.plus : c.minus,
          right_filename: plusLeft ? c.minus : c.plus,
          paired_b_left: plusLeft ? c.plus_pairedB : c.minus_pairedB,
          paired_b_right: plusLeft ? c.minus_pairedB : c.plus_pairedB
        });
      });
    });
    trials = R.shuffle(trials, rng);                  // block shuffle of all 40
    return trials;
  }

  // --- top-level: build the whole design from ratings + pid ---------------------------
  function buildDesign(rated, pid) {
    const sel = selectNeutral(rated, pid);
    const assigned = assignStimuli(sel.task, pid);
    const design = {
      pid: pid,
      task: sel.task,
      example: sel.example,
      selectionRows: sel.selectionRows,
      pairs: assigned.pairs,
      roles: assigned.roles
    };
    design.associationTrials = buildAssociation(design, pid);
    design.rewardTrials = buildReward(design, pid);
    design.decisionTrials = buildDecision(design, pid);
    return design;
  }

  SP.design = {
    selectNeutral: selectNeutral,
    assignStimuli: assignStimuli,
    buildAssociation: buildAssociation,
    buildReward: buildReward,
    buildDecision: buildDecision,
    buildDesign: buildDesign,
    current: null
  };
})();
