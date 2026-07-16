// instructions.js — MM.instructions: all participant-facing text (consent, overview,
// per-part instructions + comprehension quiz, ready screens, debrief), used by phases.js
// to build trials. Each of the 4 parts gets its own short instructions + a small
// comprehension check immediately before that part starts (rather than everything
// upfront), and none of it reveals in advance that this is a memory study.
window.MM = window.MM || {};
MM.instructions = {};

(function () {
  function money(x) {
    return '$' + x.toFixed(2);
  }

  function welcomeHtml() {
    return (
      '<div class="mm-instr-page">' +
      '<h2>Welcome</h2>' +
      '<p>Thank you for participating in this study! The study takes about 10 minutes, and you ' +
      'will receive a payment of ' + money(MM.config.base_pay) + ' plus a bonus of up to ' +
      money(MM.config.max_bonus) + ' depending on your accuracy.</p>' +
      '<p>Before you begin, please review the consent form below (and save a copy for your records ' +
      'if you like):</p>' +
      '<iframe class="mm-consent-frame" src="' + MM.config.CONSENT_PDF_URL + '"></iframe>' +
      '<p>By clicking "Begin" below, you confirm that you are at least 18 years old and consent to ' +
      'participate.</p>' +
      '</div>'
    );
  }

  function overviewHtml() {
    return (
      '<div class="mm-instr-page"><h2>Overview</h2>' +
      '<p>In this game, you will navigate a maze using the arrow keys on your keyboard. Your ' +
      'character is a small circle.</p></div>'
    );
  }

  const PART_TITLES = {
    1: 'Landmark Discovery',
    2: 'Navigate',
    3: 'Recall',
    4: 'Direction Test'
  };

  function partIntroHtml(partNum) {
    const bodies = {
      1:
        '<p>You can only see a small area around your character &mdash; the rest of the maze is ' +
        'hidden in fog. As you move, you\'ll be able to see nearby walls and any landmark markers.</p>' +
        '<p>Your goal is to explore the maze to find the location of all 6 landmark images. Navigate ' +
        'as efficiently as you can to learn the maze and all the landmarks!</p>',
      2:
        '<p>Now that you\'re familiar with the maze, you will be tested on it! Here, a star will ' +
        'appear somewhere in the maze &mdash; the star is always visible, even through the fog.</p>' +
        '<p>Your character will start at a random spot. Use the arrow keys to navigate to the star ' +
        'as efficiently as you can.</p>',
      3:
        '<p>Now, you will be tested on your memory for the landmark images. You will see a landmark ' +
        'image from before shown in the center of the screen for a couple of seconds.</p>' +
        '<p>Then your character will appear at a random spot in the maze. Navigate to where you ' +
        'believe that image used to be located, and click "Submit Location" when you\'re confident ' +
        'in your answer.</p>',
      4:
        '<p>In this final part, you will see two landmark images at a time. Imagine you are standing ' +
        'at the location of the first image, and asked to point &mdash; using a rotating arrow &mdash; ' +
        'in the direction of the second image, ignoring the maze walls (just the straight-line ' +
        'direction).</p>' +
        '<p>Drag inside the circle to set the direction, then click "Submit Direction".</p>'
    };
    return (
      '<div class="mm-instr-page"><h2>Part ' + partNum + ': ' + PART_TITLES[partNum] + '</h2>' +
      bodies[partNum] + '</div>'
    );
  }

  function partQuizQuestions(partNum) {
    const quizzes = {
      1: [
        {
          prompt: 'How do you move around the maze?',
          options: ['Arrow keys', 'Using the mouse'],
          correct: 0
        },
        {
          prompt: 'True or false? The maze has several landmark images in it for you to learn.',
          options: ['True', 'False'],
          correct: 0
        }
      ],
      2: [
        {
          prompt: 'You should navigate towards...',
          options: ['The star', 'The square'],
          correct: 0
        }
      ],
      3: [
        {
          prompt: 'True or False? You should navigate entirely randomly, and not towards the presented landmark image.',
          options: ['True', 'False'],
          correct: 1
        }
      ],
      4: [
        {
          prompt: 'True or False? You should imagine you are standing at the FIRST image, and point in the direction of the SECOND image.',
          options: ['True', 'False'],
          correct: 0
        }
      ]
    };
    return quizzes[partNum];
  }

  function quizFailHtml(partNum) {
    return (
      '<div class="mm-instr-page"><h2>Let\'s review</h2>' +
      '<p>One or more answers weren\'t quite right. Please look over the Part ' + partNum +
      ' instructions again before retrying the question' +
      (partQuizQuestions(partNum).length > 1 ? 's' : '') + '.</p></div>'
    );
  }

  function readyScreenHtml(partNum) {
    return (
      '<div class="mm-instr-page mm-ready-page">' +
      '<p>You are ready to begin part ' + partNum + '. Press any key to begin.</p>' +
      '</div>'
    );
  }

  function debriefHtml(summary) {
    const round1 = function (x) { return Math.round(x * 10) / 10; };
    return (
      '<div class="mm-instr-page"><h2>Well done!</h2>' +
      '<p>Your accuracies are below:</p>' +
      '<ul>' +
      '<li>Part 2 (navigation): your average path was ' + round1(summary.phase2_extra_steps) +
      ' steps longer than the optimal path</li>' +
      '<li>Part 3 (recall): your average response was ' + round1(summary.phase3_error_cells) +
      ' steps away from the true locations</li>' +
      '<li>Part 4 (direction test): your average response was ' + round1(summary.phase4_error_deg) +
      ' degrees away from the true direction</li>' +
      '</ul>' +
      '<p>Your bonus is ' + money(summary.bonus_dollars) + '.</p>' +
      '<p>Please press the button below to submit your data and be redirected to Prolific.</p>' +
      '</div>'
    );
  }

  MM.instructions = {
    welcomeHtml: welcomeHtml,
    overviewHtml: overviewHtml,
    partIntroHtml: partIntroHtml,
    partQuizQuestions: partQuizQuestions,
    quizFailHtml: quizFailHtml,
    readyScreenHtml: readyScreenHtml,
    debriefHtml: debriefHtml
  };
})();
