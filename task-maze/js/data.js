// data.js — MM.data: participant id (generated once, reused for both RNG seeding and the
// DataPipe filename), bonus computation from collected trial data, and the DataPipe save node
// (with a post-save Prolific redirect).
window.MM = window.MM || {};
MM.data = {};

(function () {
  let _pid = null;

  // Generated once per session and memoized, so the SAME id both seeds every MM.rng stream
  // (via design.js) and is used as the DataPipe `subject_id` at save time -- otherwise the
  // saved filename wouldn't correspond to the design that was actually seeded. Prefers a real
  // Prolific PID (from ?PROLIFIC_PID=) when present, falling back to a random id for direct
  // (non-Prolific) testing.
  function getParticipantId(jsPsych) {
    if (_pid) return _pid;
    _pid = MM.config.DEV.fakePID || MM.config.PROLIFIC_PID || jsPsych.randomization.randomID(10);
    return _pid;
  }

  function mean(arr) {
    return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0;
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  // Weighted combination of phase 2 (navigation efficiency), phase 3 (place-recall accuracy),
  // and phase 4 (directional accuracy) into an overall_accuracy used for the bonus, plus the
  // raw (un-normalized) per-phase averages shown on the debrief screen. A timed_out trial
  // contributes its worst-case score (and its cap value for the raw average) rather than being
  // dropped, so stalling out a hard trial is never advantageous.
  function computeBonusSummary(jsPsych) {
    const phase2Data = jsPsych.data.get().filter({ phase: 'phase2_navigate' }).values();
    const phase2Score = mean(phase2Data.map(function (d) {
      return d.timed_out ? 0 : d.efficiency;
    }));
    const phase2ExtraSteps = mean(phase2Data.map(function (d) {
      return d.timed_out ? (MM.config.max_moves - d.optimal_path_length) : d.extra_steps;
    }));

    const phase3Data = jsPsych.data.get().filter({ phase: 'phase3_recall' }).values();
    const phase3Score = mean(phase3Data.map(function (d) {
      const err = d.timed_out ? MM.config.max_recall_error_cells : d.recall_error_cells;
      return clamp(1 - err / MM.config.max_recall_error_cells, 0, 1);
    }));
    const phase3ErrorCells = mean(phase3Data.map(function (d) {
      return d.timed_out ? MM.config.max_recall_error_cells : d.recall_error_cells;
    }));

    const phase4Data = jsPsych.data.get().filter({ phase: 'phase4_direction' }).values();
    const phase4Score = mean(phase4Data.map(function (d) {
      const err = d.angular_error_deg != null ? d.angular_error_deg : 180;
      return 1 - err / 180;
    }));
    const phase4ErrorDeg = mean(phase4Data.map(function (d) {
      return d.angular_error_deg != null ? d.angular_error_deg : 180;
    }));

    const w = MM.config.bonus_weights;
    const overallAccuracy = phase2Score * w.phase2 + phase3Score * w.phase3 + phase4Score * w.phase4;
    const bonus = overallAccuracy * MM.config.max_bonus;

    return {
      phase2_score: phase2Score,
      phase3_score: phase3Score,
      phase4_score: phase4Score,
      phase2_extra_steps: phase2ExtraSteps,
      phase3_error_cells: phase3ErrorCells,
      phase4_error_deg: phase4ErrorDeg,
      overall_accuracy: overallAccuracy,
      base_pay: MM.config.base_pay,
      bonus_dollars: bonus,
      total_pay_dollars: MM.config.base_pay + bonus
    };
  }

  function redirectURL() {
    return MM.config.PROLIFIC_COMPLETION_URL + '?cc=' + MM.config.PROLIFIC_COMPLETION_CODE;
  }

  // If the DataPipe save fails (bad/inactive experiment_id, network error, etc.), don't
  // silently redirect as though nothing happened -- that's how a real participant's data
  // gets lost without anyone noticing. Offer a local CSV download as a fallback so the data
  // isn't gone even if the pipe never receives it, and surface a visible error instead of
  // sending them on to Prolific.
  function downloadCsvFallback(jsPsych, filename) {
    const csv = jsPsych.data.get().csv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.textContent = 'Download your data (click if it didn\'t start automatically)';
    a.className = 'mm-submit-btn';
    a.style.display = 'inline-block';
    a.style.marginTop = '16px';
    a.style.textDecoration = 'none';
    document.body.appendChild(a);
    a.click();

    const msg = document.createElement('div');
    msg.className = 'mm-instr-page';
    msg.style.textAlign = 'center';
    msg.style.marginTop = '24px';
    msg.innerHTML = '<p>We couldn\'t save your data automatically. A backup copy has been ' +
      'downloaded to your computer -- please send it to the research team.</p>';
    document.body.insertBefore(msg, a);
  }

  // The exact DataPipe save trial requested: subject_id generated via
  // jsPsych.randomization.randomID(10) (here, the same id already used to seed the design),
  // filename `${subject_id}.csv`, full raw jsPsych CSV export. Only redirects to Prolific if
  // the save actually succeeded (plugin-pipe reports this via data.save_successful); on
  // failure, keeps the participant here with a visible error and a local CSV download instead
  // of silently losing their data.
  function buildSaveNode(jsPsych) {
    const subject_id = getParticipantId(jsPsych);
    const filename = `${subject_id}.csv`;
    return {
      type: window.jsPsychPipe,
      action: 'save',
      experiment_id: MM.config.DATAPIPE_EXPERIMENT_ID,
      filename: filename,
      data_string: () => jsPsych.data.get().csv(),
      on_finish: function (data) {
        if (data.save_successful === false) {
          downloadCsvFallback(jsPsych, filename);
          return;
        }
        window.location = redirectURL();
      }
    };
  }

  MM.data = {
    getParticipantId: getParticipantId,
    computeBonusSummary: computeBonusSummary,
    buildSaveNode: buildSaveNode
  };
})();
