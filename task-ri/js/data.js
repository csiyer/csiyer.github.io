// data.js — Prolific URL params, DataPipe(OSF) save, and Prolific completion redirect.
window.SP = window.SP || {};

(function () {
  const C = SP.config;

  const state = { pid: null, studyId: 'NA', sessionId: 'NA' };

  function getParam(name) {
    const v = new URLSearchParams(window.location.search).get(name);
    return (v === null || v === '') ? null : v;
  }

  // Called once after initJsPsych. Stamps identifiers onto every data row.
  function initParams() {
    state.pid = getParam('PROLIFIC_PID') || C.DEV.fakePID || ('dev-' + Date.now());
    state.studyId = getParam('STUDY_ID') || 'NA';
    state.sessionId = getParam('SESSION_ID') || 'NA';
    SP.jsPsych.data.addProperties({
      participant_id: state.pid,
      prolific_pid: state.pid,
      study_id: state.studyId,
      session_id: state.sessionId,
      experiment: 'sp_repulsion',
      code_version: 'sp_v1'
    });
    return state.pid;
  }

  function redirectURL() {
    return C.PROLIFIC_COMPLETION_URL + '?cc=' + encodeURIComponent(C.PROLIFIC_COMPLETION_CODE);
  }

  // Bonus = weighted average of three part-level accuracies (weight per part, not per trial):
  // part 2 gray-dot detection (both the A- and B-window judgment per association trial, 25%),
  // part 3 reward-outcome detection (25%), and part 4 DIRECT (B+ vs B-) decision trials only
  // (50%) — indirect (A+ vs A-) trials never contribute, since that's the repulsion measure
  // itself. The direct test is weighted heaviest since it's the actual manipulation check
  // (did reward learning happen); the two cover tasks just confirm attention during encoding.
  // A missed response counts as incorrect (0), so there's no incentive to not respond. The
  // weights aren't shown to participants — only each accuracy and the resulting bonus.
  const BONUS_WEIGHTS = { part2: 0.25, part3: 0.25, part4: 0.5 };
  function computeBonusSummary() {
    function acc(vals) {
      if (!vals.length) return 0;
      const hits = vals.filter(function (v) { return v === 1; }).length;
      return hits / vals.length;
    }
    const rows = SP.jsPsych.data.get().values();
    const part2Vals = [];
    rows.filter(function (r) { return r.phase === 'associative'; }).forEach(function (r) {
      part2Vals.push(r.a_correct === 1 ? 1 : 0);
      part2Vals.push(r.correct === 1 ? 1 : 0);
    });
    const part3Vals = rows.filter(function (r) { return r.phase === 'reward'; })
      .map(function (r) { return r.correct === 1 ? 1 : 0; });
    const part4Vals = rows.filter(function (r) { return r.phase === 'decision' && r.decision_type === 'direct'; })
      .map(function (r) { return r.correct === 1 ? 1 : 0; });

    const part2Acc = acc(part2Vals), part3Acc = acc(part3Vals), part4Acc = acc(part4Vals);
    const overallAcc = BONUS_WEIGHTS.part2 * part2Acc + BONUS_WEIGHTS.part3 * part3Acc + BONUS_WEIGHTS.part4 * part4Acc;
    const bonus = Math.max(0, Math.min(C.MAX_BONUS, overallAcc * C.MAX_BONUS));
    return { part2Acc: part2Acc, part3Acc: part3Acc, part4Acc: part4Acc, overallAcc: overallAcc, bonus: bonus };
  }

  // Final timeline node: save the full jsPsych dataset to DataPipe(OSF), then redirect to Prolific.
  function saveAndRedirect() {
    return {
      type: jsPsychPipe,
      action: 'save',
      experiment_id: C.DATAPIPE_ID,
      filename: function () { return state.pid + '_' + Date.now() + '.csv'; },
      data_string: function () { return SP.jsPsych.data.get().csv(); },
      on_finish: function () { window.location = redirectURL(); }
    };
  }

  SP.data = {
    state: state,
    initParams: initParams,
    saveAndRedirect: saveAndRedirect,
    computeBonusSummary: computeBonusSummary,
    get pid() { return state.pid; }
  };
})();
