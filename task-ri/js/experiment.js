// experiment.js — initialize jsPsych, build the static prefix timeline (consent through
// pre-rating), then a generate-design node that computes the per-participant design from the
// pre-ratings and appends the remaining phases. Loaded last.
(function () {
  // Automation / bot detection — runs before anything else (before Turnstile even loads), so a
  // detected automation tool never reaches the study at all.
  const isAutomated = (
    navigator.webdriver === true ||
    !!window.__playwright ||
    !!window.__nightmare ||
    !!window._selenium ||
    !!window.__webdriver_script_fn ||
    !!window.domAutomation ||
    !!window.domAutomationController ||
    window.outerWidth === 0
  );
  if (isAutomated) {
    document.body.innerHTML =
      '<div class="instr" style="max-width:640px;margin:80px auto;text-align:center;">' +
      '<h2>Not Eligible</h2><p>Sorry! Your computer is not eligible for this study.</p>' +
      '<p>Please go back to Prolific and return the study. Thanks!</p>' +
      '<p style="margin-top:24px;color:#888;font-size:0.9em;">Code: BROWSERCHECK</p></div>';
    return;
  }

  const C = SP.config;

  // Optional dev URL toggles: ?dev=1 (fast), ?skipfs=1 (no fullscreen), ?skipts=1 (no Turnstile check)
  function getParam(n) { return new URLSearchParams(window.location.search).get(n); }
  if (getParam('dev') === '1') C.DEV.fast = true;
  if (getParam('skipfs') === '1') C.DEV.skipFullscreen = true;
  if (getParam('skipts') === '1') C.DEV.skipTurnstile = true;

  // Cloudflare Turnstile bot check: waits for a widget solve + server-side verification via
  // the Cloudflare Worker, then manually finishes the trial (no timeout, no keyboard response).
  function turnstileNode(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: '<div class="turnstile-page"><div id="turnstile-container"></div>' +
        '<div id="turnstile-status" class="turnstile-status"></div></div>',
      choices: 'NO_KEYS',
      trial_duration: null,
      response_ends_trial: false,
      data: { phase: 'turnstile' },
      on_load: function () {
        const wait = setInterval(function () {
          if (typeof turnstile === 'undefined') return;
          clearInterval(wait);
          turnstile.render('#turnstile-container', {
            sitekey: C.TURNSTILE_SITE_KEY,
            callback: function (token) {
              const statusEl = document.getElementById('turnstile-status');
              statusEl.textContent = 'Verifying…';
              statusEl.className = 'turnstile-status';
              fetch(C.TURNSTILE_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token })
              }).then(function (r) { return r.json(); }).then(function (d) {
                if (d.success) {
                  statusEl.textContent = 'Verified — continuing…';
                  statusEl.className = 'turnstile-status turnstile-success';
                  setTimeout(function () { jsPsych.finishTrial({ turnstile_passed: true }); }, 500);
                } else {
                  statusEl.textContent = 'Verification failed — please try again.';
                  statusEl.className = 'turnstile-status turnstile-fail';
                  turnstile.reset('#turnstile-container');
                }
              }).catch(function () {
                statusEl.textContent = 'Network error — please refresh and try again.';
                statusEl.className = 'turnstile-status turnstile-fail';
              });
            },
            'error-callback': function () {
              const statusEl = document.getElementById('turnstile-status');
              statusEl.textContent = 'Verification error — please refresh the page.';
              statusEl.className = 'turnstile-status turnstile-fail';
            }
          });
        }, 300);
      }
    };
  }

  const jsPsych = initJsPsych();
  SP.jsPsych = jsPsych;

  const pid = SP.data.initParams();

  const timeline = [];

  // 1. Cloudflare Turnstile bot check
  if (!C.DEV.skipTurnstile) timeline.push(turnstileNode(jsPsych));

  // 2. preload all images
  timeline.push({
    type: jsPsychPreload,
    images: SP.stimuli.preloadImages,
    show_progress_bar: true,
    message: '<div class="instr"><p>Loading the study…</p></div>',
    continue_after_error: false
  });

  // 3. welcome + consent (explicit action)
  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: SP.instructions.welcomeHtml(),
    choices: ['Begin'],
    data: { phase: 'consent' }
  });

  // 4. fullscreen
  if (!C.DEV.skipFullscreen) {
    timeline.push({
      type: jsPsychFullscreen,
      fullscreen_mode: true,
      message: '<div class="instr"><p>Click below to enter fullscreen and begin.</p></div>',
      button_label: 'Continue'
    });
  }

  // 5. pre-rating (32 sliders, seeded order)
  timeline.push(SP.phases.preRatingPhase(pid));

  // 6. generate the per-participant design from the pre-ratings, then run the rest.
  // jsPsych v8 removed addNodeToEndOfTimeline; instead a wrapper node holds a shared array
  // (by reference) that we populate in this call-function node. v8 reads the wrapper's nested
  // `timeline` lazily when entered, so the pushed nodes execute (verified empirically).
  // Seed the wrapper non-empty so no internal pass ever reduces over an empty timeline.
  const rest = [{ type: jsPsychCallFunction, func: function () {} }];
  timeline.push({
    type: jsPsychCallFunction,
    func: function () {
      const rated = jsPsych.data.get().filter({ phase: 'rating_pre' }).values().map(function (r) {
        return { filename: r.stimulus_filename, rating: r.rating };
      });
      const design = SP.design.buildDesign(rated, pid);
      if (C.DEV.quickN) {
        design.associationTrials = design.associationTrials.slice(0, C.DEV.quickN);
        design.rewardTrials = design.rewardTrials.slice(0, C.DEV.quickN);
        design.decisionTrials = design.decisionTrials.slice(0, C.DEV.quickN);
      }
      SP.design.current = design;
      jsPsych.data.addProperties({
        selected_roles: JSON.stringify(design.roles),
        task_stimuli: design.task.join('|'),
        example_stimuli: design.example.join('|')
      });
      rest.push(
        SP.phases.associationPhase(design),
        SP.phases.rewardPhase(design),
        SP.phases.decisionPhase(design),
        SP.phases.postRatingPhase(design),
        SP.phases.strategyAndDebrief(),
        SP.data.saveAndRedirect()
      );
    }
  });
  timeline.push({ timeline: rest });

  jsPsych.run(timeline);
})();
