// phases.js — MM.phases: builds the concrete jsPsych trial/timeline objects for each part
// of the study from a participant's `design` (see design.js). Trial objects are fully
// concrete (no jsPsych.timelineVariable()), same convention as the reference repo.
//
// Each part (1-4) gets its own short instructions immediately before that part, followed
// by a small comprehension check and a "ready to begin" screen — nothing is explained
// upfront, and the instructions never reveal in advance that this is a memory study.
window.MM = window.MM || {};
MM.phases = {};

(function () {
  function buildWelcomeConsent() {
    return [{
      type: window.jsPsychHtmlButtonResponse,
      stimulus: MM.instructions.welcomeHtml(),
      choices: ['Begin'],
      data: { phase: 'consent' }
    }];
  }

  function buildFullscreen() {
    return [{
      type: window.jsPsychFullscreen,
      fullscreen_mode: true,
      data: { phase: 'fullscreen' }
    }];
  }

  function buildOverview() {
    return [{
      type: window.jsPsychHtmlButtonResponse,
      stimulus: MM.instructions.overviewHtml(),
      choices: ['Continue'],
      data: { phase: 'overview' }
    }];
  }

  // One part's instructions + comprehension question(s), retried (instructions + questions
  // together) until every question is answered correctly or comprehension_loop_cap attempts
  // are used up, then a "ready to begin" screen. A "let's review" interstitial is shown on
  // retries via jsPsych's documented { timeline: [...], conditional_function } wrapper form
  // (a bare conditional_function on a single trial object is not reliable).
  function buildPartInstructionsAndQuiz(partNum) {
    const questions = MM.instructions.partQuizQuestions(partNum);
    let attempt = 0;

    const failNode = {
      timeline: [{
        type: window.jsPsychHtmlButtonResponse,
        stimulus: MM.instructions.quizFailHtml(partNum),
        choices: ['Continue'],
        data: { phase: 'quiz_fail', part: partNum }
      }],
      conditional_function: function () { return attempt > 0; }
    };

    const introTrial = {
      type: window.jsPsychHtmlButtonResponse,
      stimulus: MM.instructions.partIntroHtml(partNum),
      choices: ['Continue'],
      data: { phase: 'part_instructions', part: partNum }
    };

    function buildQuestionTrial(q, idx) {
      return {
        type: window.jsPsychHtmlButtonResponse,
        stimulus: '<div class="mm-quiz-prompt">' + q.prompt + '</div>',
        choices: q.options,
        data: { phase: 'comprehension', part: partNum, question_index: idx, correct_index: q.correct },
        on_finish: function (data) {
          data.correct = data.response === q.correct;
        }
      };
    }

    const loopNode = {
      timeline: [failNode, introTrial].concat(questions.map(buildQuestionTrial)),
      loop_function: function (data) {
        attempt++;
        const questionData = data.filter({ phase: 'comprehension', part: partNum }).values();
        const allCorrect = questionData.length > 0 && questionData.every(function (d) { return d.correct; });
        if (allCorrect || attempt >= MM.config.comprehension_loop_cap) return false;
        return true;
      }
    };

    const readyTrial = {
      type: window.jsPsychHtmlKeyboardResponse,
      stimulus: MM.instructions.readyScreenHtml(partNum),
      choices: 'ALL_KEYS',
      data: { phase: 'ready_screen', part: partNum }
    };

    return [loopNode, readyTrial];
  }

  function buildExploreTrial(design, repIndex) {
    return {
      type: window.jsPsychMazeNav,
      mode: 'explore',
      start_cell: MM.maze.START,
      landmarks: design.landmarks,
      see_this_far: MM.config.see_this_far,
      cell_px: MM.config.cell_px,
      max_moves: MM.config.max_moves,
      image_display_duration: MM.scaleMs(MM.config.image_display_duration),
      hint_text: 'Use the arrow keys to explore. Find all the landmark images!',
      data: {
        phase: 'phase1_explore',
        trial_index: repIndex,
        start_row: MM.maze.START.row,
        start_col: MM.maze.START.col,
        landmarks_json: JSON.stringify(design.landmarks)
      }
    };
  }

  // Phase 1 (landmark discovery) runs MM.config.n_phase1_reps times back to back, with a
  // short interstitial between each pass, so participants get repeated exposure to
  // consolidate the maze/landmark layout.
  function buildPhase1(design) {
    const interstitial = {
      type: window.jsPsychHtmlButtonResponse,
      stimulus: '<div class="mm-instr-page"><p>Well done! Now repeat the exploration again.</p></div>',
      choices: ['Continue'],
      data: { phase: 'phase1_repeat_interstitial' }
    };

    const trials = [];
    for (let rep = 0; rep < MM.config.n_phase1_reps; rep++) {
      if (rep > 0) trials.push(interstitial);
      trials.push(buildExploreTrial(design, rep));
    }
    return trials;
  }

  function buildLeadIn(labelHtml) {
    return {
      type: window.jsPsychHtmlKeyboardResponse,
      stimulus: labelHtml,
      choices: 'NO_KEYS',
      trial_duration: MM.scaleMs(600),
      data: { phase: 'lead_in' }
    };
  }

  function buildPhase2(design) {
    const trials = [];
    design.phase2_trials.forEach(function (t) {
      trials.push(buildLeadIn('<div class="mm-lead-in">Trial ' + (t.trial_index + 1) + ' of ' + MM.config.n_phase2_trials + '</div>'));
      trials.push({
        type: window.jsPsychMazeNav,
        mode: 'navigate',
        start_cell: { row: t.start_row, col: t.start_col },
        target_cell: { row: t.target_row, col: t.target_col },
        see_this_far: MM.config.see_this_far,
        cell_px: MM.config.cell_px,
        max_moves: MM.config.max_moves,
        progress_label: 'Trial ' + (t.trial_index + 1) + ' / ' + MM.config.n_phase2_trials,
        hint_text: 'Navigate to the star.',
        data: {
          phase: 'phase2_navigate',
          trial_index: t.trial_index,
          target_row: t.target_row,
          target_col: t.target_col,
          start_row: t.start_row,
          start_col: t.start_col,
          optimal_path_length: t.optimal_path_length
        },
        on_finish: function (data) {
          data.efficiency = Math.min(1, data.optimal_path_length / Math.max(1, data.moves));
          data.extra_steps = Math.max(0, data.moves - data.optimal_path_length);
        }
      });
    });
    return trials;
  }

  function buildPhase3(design) {
    const trials = [];
    design.phase3_trials.forEach(function (t) {
      trials.push({
        type: window.jsPsychHtmlKeyboardResponse,
        stimulus: '<div class="mm-recall-study"><img class="mm-recall-study-img" src="' + t.image_url + '" /></div>',
        choices: 'NO_KEYS',
        trial_duration: MM.scaleMs(MM.config.image_display_duration),
        data: { phase: 'phase3_study', trial_index: t.trial_index, landmark_id: t.landmark_id }
      });
      trials.push({
        type: window.jsPsychMazeNav,
        mode: 'recall',
        start_cell: { row: t.start_row, col: t.start_col },
        true_cell: { row: t.true_row, col: t.true_col },
        see_this_far: MM.config.see_this_far,
        cell_px: MM.config.cell_px,
        max_moves: MM.config.max_moves,
        progress_label: 'Image ' + (t.trial_index + 1) + ' / ' + MM.config.n_phase3_trials,
        recall_image_url: t.image_url,
        data: {
          phase: 'phase3_recall',
          trial_index: t.trial_index,
          landmark_id: t.landmark_id,
          true_row: t.true_row,
          true_col: t.true_col,
          image_path: t.image_path,
          start_row: t.start_row,
          start_col: t.start_col
        }
      });
    });
    return trials;
  }

  function buildPhase4(design) {
    const trials = [];
    design.phase4_trials.forEach(function (t) {
      trials.push({
        type: window.jsPsychDirectionResponse,
        image_a_url: t.landmark_a_image_url,
        image_b_url: t.landmark_b_image_url,
        true_bearing_deg: t.true_bearing_deg,
        dial_radius_px: MM.config.dial_radius_px,
        require_movement: MM.config.require_movement,
        data: {
          phase: 'phase4_direction',
          trial_index: t.trial_index,
          landmark_a_id: t.landmark_a_id,
          landmark_a_row: t.landmark_a_row,
          landmark_a_col: t.landmark_a_col,
          landmark_b_id: t.landmark_b_id,
          landmark_b_row: t.landmark_b_row,
          landmark_b_col: t.landmark_b_col,
          true_bearing_deg: t.true_bearing_deg
        }
      });
    });
    return trials;
  }

  function buildDebrief(jsPsych) {
    return [{
      type: window.jsPsychHtmlButtonResponse,
      stimulus: function () {
        const summary = MM.data.computeBonusSummary(jsPsych);
        MM.data.lastSummary = summary;
        return MM.instructions.debriefHtml(summary);
      },
      choices: ['Submit and continue to Prolific'],
      data: { phase: 'debrief' },
      on_finish: function (data) {
        const summary = MM.data.lastSummary;
        data.phase2_score = summary.phase2_score;
        data.phase3_score = summary.phase3_score;
        data.phase4_score = summary.phase4_score;
        data.phase2_extra_steps = summary.phase2_extra_steps;
        data.phase3_error_cells = summary.phase3_error_cells;
        data.phase4_error_deg = summary.phase4_error_deg;
        data.overall_accuracy = summary.overall_accuracy;
        data.bonus_dollars = summary.bonus_dollars;
      }
    }];
  }

  MM.phases = {
    buildWelcomeConsent: buildWelcomeConsent,
    buildFullscreen: buildFullscreen,
    buildOverview: buildOverview,
    buildPartInstructionsAndQuiz: buildPartInstructionsAndQuiz,
    buildPhase1: buildPhase1,
    buildPhase2: buildPhase2,
    buildPhase3: buildPhase3,
    buildPhase4: buildPhase4,
    buildDebrief: buildDebrief
  };
})();
