// experiment.js — bootstraps jsPsych, builds the participant's design, assembles the full
// timeline, and runs it. Loaded last (after every other js/ module has attached to window.MM).
(function () {
  const jsPsych = initJsPsych({
    show_progress_bar: false
  });

  // Generated once, reused both to seed the whole design (design.js) and as the DataPipe
  // subject_id at save time (data.js).
  const pid = MM.data.getParticipantId(jsPsych);
  const design = MM.design.buildDesign(pid);

  jsPsych.data.addProperties({
    participant_id: pid,
    condition: design.condition,
    experiment: 'maze_memorability'
  });

  const preloadTrial = {
    type: window.jsPsychPreload,
    images: MM.stimuli.buildPreloadList(design.landmarks),
    data: { phase: 'preload' }
  };

  const timeline = [preloadTrial];
  timeline.push.apply(timeline, MM.phases.buildWelcomeConsent());
  timeline.push.apply(timeline, MM.phases.buildFullscreen());
  timeline.push.apply(timeline, MM.phases.buildOverview());
  timeline.push.apply(timeline, MM.phases.buildPartInstructionsAndQuiz(1));
  timeline.push.apply(timeline, MM.phases.buildPhase1(design));
  timeline.push.apply(timeline, MM.phases.buildPartInstructionsAndQuiz(2));
  timeline.push.apply(timeline, MM.phases.buildPhase2(design));
  timeline.push.apply(timeline, MM.phases.buildPartInstructionsAndQuiz(3));
  timeline.push.apply(timeline, MM.phases.buildPhase3(design));
  timeline.push.apply(timeline, MM.phases.buildPartInstructionsAndQuiz(4));
  timeline.push.apply(timeline, MM.phases.buildPhase4(design));
  timeline.push.apply(timeline, MM.phases.buildDebrief(jsPsych));
  timeline.push(MM.data.buildSaveNode(jsPsych));

  jsPsych.run(timeline);
})();
