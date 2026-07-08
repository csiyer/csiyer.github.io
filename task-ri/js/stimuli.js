// stimuli.js — image pool, preload manifest, and HTML builders. Every stimulus is rendered
// as HTML <img> (not the image plugins) so we can overlay the gray dot and fully control the
// decision lockout with one render path.
window.SP = window.SP || {};

(function () {
  const C = SP.config;

  // Candidate pool 01.jpg .. 32.jpg
  const pool = [];
  for (let i = 1; i <= C.N_POOL; i++) {
    pool.push((i < 10 ? '0' + i : '' + i) + '.jpg');
  }

  function path(filename) { return C.IMG_DIR + filename; }

  const preloadImages = pool.map(path)
    .concat([path(C.REWARD_IMG), path(C.NOREWARD_IMG)]);

  // A single centered image, optionally with a gray cover dot overlaid at dotXY {left,top}.
  function card(filename, dotXY) {
    const dot = dotXY
      ? '<div class="cover-dot" style="left:' + dotXY.left + 'px;top:' + dotXY.top + 'px;"></div>'
      : '';
    return '<div class="stim-wrap">' +
      '<img class="stim-img" src="' + path(filename) + '" alt="">' +
      dot +
      '</div>';
  }

  // Centered outcome icon (quarter / black circle).
  function outcome(isReward) {
    const file = isReward ? C.REWARD_IMG : C.NOREWARD_IMG;
    return '<div class="outcome-wrap"><img class="outcome-img" src="' + path(file) + '" alt=""></div>';
  }

  // Gray fixation cross.
  function fixation() {
    return '<div class="fixation">+</div>';
  }

  // Shown briefly after any missed response.
  function tooSlow() {
    return '<div class="too-slow">Too Slow!</div>';
  }

  SP.stimuli = {
    pool: pool,
    path: path,
    preloadImages: preloadImages,
    card: card,
    outcome: outcome,
    fixation: fixation,
    tooSlow: tooSlow
  };
})();
