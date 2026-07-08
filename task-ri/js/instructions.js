// instructions.js — participant-facing text (implicit framing) + comprehension specs.
// Framing rule: NEVER tell participants that the A–B pairings matter or that they should
// infer value across images. The association phase is purely a "gray-dot detection" task.
window.SP = window.SP || {};

(function () {
  const C = SP.config;
  const S = SP.stimuli;

  const UP = '<span class="key">↑ Up arrow</span>';
  const DOWN = '<span class="key">↓ Down arrow</span>';

  function wrap(html) { return '<div class="instr">' + html + '</div>'; }

  // ---- consent / welcome -------------------------------------------------------------
  function welcomeHtml() {
    return wrap(
      '<h1>Welcome</h1>' +
      '<p>Thank you for taking part in our study! The data in this study is for scientific research, so we really value your full attention.<\p>' +
      '<p>This study will take roughly <strong>15 minutes</strong>, and you\'ll earn <strong>$3</strong> with up to <strong>$2</strong> in bonus!</p>' +
      '<p>Please review the consent form below (you may also download a copy for your records).</p>' +
      '<iframe src="' + C.CONSENT_PDF_URL + '" width="100%" height="420" ' +
      'style="border:1px solid var(--border);border-radius:8px;margin:10px 0;"></iframe>' +
      'Please complete the study in one sitting, in a quiet place, on a desktop.' + 
      '<p><em>By clicking the button below, you voluntarily consent to participate.</em></p>'
    );
  }

  // ---- pre-rating --------------------------------------------------------------------
  function preRatingPages() {
    return [wrap(
      '<h2>Part 1</h2>' +
      '<p>First, please rate how much you like a series of images.</p>' +
      '<p>For each image, drag the slider to show <strong>how much you like it</strong>, anywhere from ' +
      '<em>strongly dislike</em> on the left to <em>strongly like</em> on the right.</p>' +
      '<p>There are no right answers, just whatever you like.</p>'
    )];
  }

  // ---- association (implicit gray-dot cover task) ------------------------------------
  function associationPages(design) {
    const exampleFile = design && design.example && design.example[0] ? design.example[0] : S.pool[0];
    return [
      wrap(
        '<h2>Part 2</h2>' +
        '<p>You’ll now see a sequence of images appear, one at a time.</p>' +
        '<p>To ensure you’re paying attention to the sequence, you’ll have a small task: decide whether each image has a <strong>small gray dot</strong> ' +
        'overlaid somewhere on it. The dot doesn’t mean anything — it just helps us check that ' +
        'you’re alert and watching each image.</p>' +
        '<p>Press ' + UP + ' when you <strong>see a gray dot</strong>.<br>' +
        'Press ' + DOWN + ' when there is <strong>no dot</strong>.</p>' +
        '<p>Respond as quickly and accurately as you can.</p>' +
        '<p>Your bonus will partially depend on your accuracy.</p>'
      ),
      wrap(
        '<h2>Here’s what a gray dot looks like</h2>' +
        '<div style="text-align:center;margin:18px 0;">' +
        S.card(exampleFile, { left: 180, top: 70 }) +
        '</div>' +
        '<p style="text-align:center;">This picture has a dot, so you would press ' + UP + '.</p>'
      ),
      wrap(
        '<h2>Ready?</h2>' +
        '<p><strong>Recap:</strong> press ' + UP + ' when you see a gray dot, ' + DOWN + ' when you don’t.</p>' +
        '<p>Keep your hands on the arrow keys. Click <em>Next</em> to answer a quick check, then begin.</p>'
      )
    ];
  }

  // ---- reward ------------------------------------------------------------------------
  function rewardPages() {
    return [
      wrap(
        '<h2>Part 3</h2>' +
        '<p>Now you’ll see some of those images again. In this phase, you’ll learn which ones are worth a <strong>reward</strong>.' +
        '<div style="display:flex;justify-content:center;gap:60px;margin:18px 0;align-items:center;">' +
        '<div style="text-align:center;"><img src="' + S.path(C.REWARD_IMG) + '" style="width:90px;height:90px;object-fit:contain;"><br><strong>quarter</strong> = reward</div>' +
        '<div style="text-align:center;"><img src="' + S.path(C.NOREWARD_IMG) + '" style="width:90px;height:90px;object-fit:contain;"><br><strong>black circle</strong> = nothing</div>' +
        '</div>'
      ),
      wrap(
        '<h2>Your task</h2>' +
        '<p>When the outcome appears:</p>' +
        '<strong>outcome</strong> appears.</p>' +
        '<p>Press ' + UP + ' when the outcome is a <strong>reward</strong> (quarter).<br>' +
        'Press ' + DOWN + ' when it is <strong>nothing</strong> (black circle).</p>' +
        '<p>You don’t need to press anything for the picture, just the outcome.</p>' +
        '<p>Respond as quickly and accurately as you can.</p>' +
        '<p>Your bonus will partially depend on your accuracy.</p>'
      ),
      wrap(
        '<h2>Ready?</h2>' +
        '<p><strong>Recap:</strong> press ' + UP + ' for a reward (quarter), ' + DOWN + ' for nothing ' +
        '(black circle). Click <em>Next</em> for a quick check, then begin.</p>'
      )
    ];
  }

  // ---- decision ----------------------------------------------------------------------
  function decisionPages() {
    return [
      wrap(
        '<h2>Part 4</h2>' +
        '<p>Now, you’ll make choices between images you’ve seen earlier.</p>' +
        '<p>On each trial, choose the image that is <strong>most likely to lead to a reward</strong>, ' +
        'based on everything you’ve seen so far. If you’re not sure, make your best guess.</p>'
      ),
      wrap(
        '<h2>How it works</h2>' +
        '<p>When the two images first appear, take a moment to consider them — you won’t be able to ' +
        'click right away. After a brief pause the images become active and you can <strong>click the one ' +
        'you choose</strong>.</p>' +
        '<p>Take your time; there’s no rush once the images are active.</p>' +
        '<p>Once again, your bonus will be determined by your performance on these choices.</p>'
      )
    ];
  }

  // ---- post-rating -------------------------------------------------------------------
  function postRatingPages() {
    return [wrap(
      '<h2>Part 5 of 5</h2>' +
      '<p>Almost done. Please once again rate how much you like each of these images.</p>' + 
      '<p>No right answers - drag the slider and click Submit.</p>'
    )];
  }

  // ---- debrief -----------------------------------------------------------------------
  // b: { part2Acc, part3Acc, part4Acc, overallAcc, bonus } from SP.data.computeBonusSummary().
  function debriefHtml(b) {
    b = b || { part2Acc: 0, part3Acc: 0, part4Acc: 0, bonus: 0 };
    const pct = function (x) { return Math.round(x * 100) + '%'; };
    return wrap(
      '<h1>Thank you!</h1>' +
      '<p>You’ve finished the task.</p>' +
      '<p>Part 2 accuracy (gray dot): <strong>' + pct(b.part2Acc) + '</strong></p>' +
      '<p>Part 3 accuracy (rewards): <strong>' + pct(b.part3Acc) + '</strong></p>' +
      '<p>Part 4 accuracy (choices): <strong>' + pct(b.part4Acc) + '</strong></p>' +
      '<p>Final bonus: <strong>$' + b.bonus.toFixed(2) + '</strong></p>' +
      '<p>On the next screen your data will be saved and you’ll be returned to Prolific. Please don’t ' +
      'close the window until then.</p>'
    );
  }

  // ---- comprehension question specs (correct = index into options) -------------------
  // Kept implicit: nothing here reveals that the A–B pairings matter.
  const comprehension = {
    association: [
      {
        prompt: 'When a picture has a small gray dot on it, which key do you press?',
        options: ['Down arrow', 'Up arrow', 'The spacebar'],
        correct: 1
      },
      {
        prompt: 'What are you watching for during this part?',
        options: ['Whether each picture has a gray dot', 'Which pictures are worth money', 'How fast the pictures change'],
        correct: 0
      }
    ],
    reward: [
      {
        prompt: 'A quarter shown after a picture means the picture is worth…',
        options: ['Nothing', 'A reward', 'A penalty'],
        correct: 1
      },
      {
        prompt: 'When you see a quarter (a reward), which key do you press?',
        options: ['Up arrow', 'Down arrow', 'Either one'],
        correct: 0
      }
    ],
    decision: [
      {
        prompt: 'On each choice, you should pick the image that is…',
        options: ['The one you personally like more', 'The one shown on the left', 'Most likely to lead to a reward'],
        correct: 2
      }
    ]
  };

  SP.instructions = {
    welcomeHtml: welcomeHtml,
    preRatingPages: preRatingPages,
    associationPages: associationPages,
    rewardPages: rewardPages,
    decisionPages: decisionPages,
    postRatingPages: postRatingPages,
    debriefHtml: debriefHtml,
    comprehension: comprehension
  };
})();
