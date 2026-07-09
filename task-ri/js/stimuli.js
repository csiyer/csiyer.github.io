// stimuli.js — image pool, preload manifest, and HTML builders. Every stimulus is rendered
// as HTML <img> (not the image plugins) so we can overlay the gray dot and fully control the
// decision lockout with one render path.
window.SP = window.SP || {};

(function () {
  const C = SP.config;
  const W = C.WHEEL;

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

  // ---- 8-slice ring / wheel --------------------------------------------------------
  // Ports ../associative-looking's ring: each stimulus owns a fixed wedge so a pair's A
  // and B always occupy the same two on-screen spots (the spatial pairing cue). The ring
  // scales to the viewport via the --wheel-* CSS vars (injected below from config), so we
  // emit positions as calc() over those vars rather than baking in pixels — the wheel then
  // reflows correctly if the window changes without rebuilding trials.

  // Size the ring to the viewport, once, from the config fractions (single source of truth).
  (function injectWheelVars() {
    const s = document.documentElement.style;
    s.setProperty('--wheel-half', 'min(50vw, 50vh)');               // half the smaller viewport side
    s.setProperty('--wheel-outer', 'calc(var(--wheel-half) * ' + (1 - W.EDGE_MARGIN_FRAC) + ')'); // outer radius
    s.setProperty('--wheel-r-img', 'calc(var(--wheel-outer) * ' + W.IMAGE_CENTER_FRAC + ')');     // image-center radius
    s.setProperty('--wheel-img', 'calc(var(--wheel-outer) * ' + W.IMAGE_SIZE_FRAC + ')');         // image side
    s.setProperty('--wheel-dot', 'calc(var(--wheel-img) * ' + W.DOT_FRAC + ')');                  // cover-dot diameter
  })();

  // Slice index -> unit (cos, -sin) direction from center (screen coords: y grows downward).
  // Matches slice_to_xy: angle = zero - slice*sliceAngle, position = (r cosθ, r sinθ) with y up.
  function sliceDir(slice) {
    const theta = (W.SLICE_ZERO_ANGLE_DEG - slice * (360 / W.N_SLICES)) * Math.PI / 180;
    return { kx: Math.cos(theta), ky: -Math.sin(theta) };
  }
  // Inline style placing an element's CENTER at its slice's ring position (the element itself
  // is translated -50%,-50% in CSS). Signs folded into the +/- so no negative calc literals.
  function slicePosStyle(slice) {
    const d = sliceDir(slice);
    function term(k) { return (k < 0 ? '- ' : '+ ') + 'var(--wheel-r-img) * ' + Math.abs(k).toFixed(4); }
    return 'left:calc(50% ' + term(d.kx) + ');top:calc(50% ' + term(d.ky) + ');';
  }

  // Ring background: thin outer circle + 8 radial spokes on the wedge boundaries + a small
  // empty central hub (bg-filled to cover the spokes' convergence). viewBox radius 100 == the
  // outer radius; the <svg> is sized to the outer diameter in CSS so 1 unit == outer/100 px.
  function ringSVG() {
    const n = W.N_SLICES, sliceAngle = 360 / n;
    let spokes = '';
    for (let i = 0; i < n; i++) {
      const bDeg = W.SLICE_ZERO_ANGLE_DEG + sliceAngle / 2 - i * sliceAngle; // boundary between slices
      const rad = bDeg * Math.PI / 180;
      const x2 = (100 * Math.cos(rad)).toFixed(3);
      const y2 = (-100 * Math.sin(rad)).toFixed(3);
      spokes += '<line x1="0" y1="0" x2="' + x2 + '" y2="' + y2 + '"/>';
    }
    const hubR = (W.HUB_RADIUS_FRAC * 100).toFixed(3);
    return '<svg class="wheel-ring" viewBox="-101 -101 202 202" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<g class="wheel-lines">' +
      '<circle cx="0" cy="0" r="100"/>' + spokes +
      '<circle class="wheel-hub" cx="0" cy="0" r="' + hubR + '"/>' +
      '</g></svg>';
  }

  // One image sitting in its wedge, optionally with a cover dot (dot = {lf,tf} image-fractions).
  function wheelItem(filename, slice, dot) {
    const dotHtml = dot
      ? '<div class="cover-dot wheel-dot" style="left:' + (dot.lf * 100).toFixed(2) + '%;top:' + (dot.tf * 100).toFixed(2) + '%;"></div>'
      : '';
    return '<div class="wheel-item" style="' + slicePosStyle(slice) + '">' +
      '<img class="wheel-img" src="' + path(filename) + '" alt="">' + dotHtml +
      '</div>';
  }

  // Full wheel scene. opts: { items:[{filename,slice,dot}], center:htmlString }.
  // With items=[] and no center it's the bare ring — the persistent background used for the
  // ISI/ITI/lead-in "blank" frames (the hub replaces the old fixation cross, as in the lab).
  // (Decision options are clickable, but those are rendered as jsPsych buttons, not wheelItems.)
  function wheel(opts) {
    opts = opts || {};
    const items = opts.items || [];
    let html = '<div class="wheel">' + ringSVG();
    for (let i = 0; i < items.length; i++) {
      html += wheelItem(items[i].filename, items[i].slice, items[i].dot);
    }
    if (opts.center) html += '<div class="wheel-center">' + opts.center + '</div>';
    return html + '</div>';
  }

  // Central-hub content for the reward outcome (icon shown centrally, B off-screen — as in lab).
  function wheelOutcomeCenter(isReward) {
    const file = isReward ? C.REWARD_IMG : C.NOREWARD_IMG;
    return '<img class="wheel-outcome-img" src="' + path(file) + '" alt="">';
  }

  // Missed-response flash on the wheel: "Too slow!" text at the ring center, so the ring stays
  // put instead of the whole screen swapping. (The center is the incidental cover-task nudge —
  // wordless red disk was replaced with text per request.)
  function wheelTooSlow() {
    return wheel({ center: '<div class="wheel-too-slow">Too slow!</div>' });
  }

  SP.stimuli = {
    pool: pool,
    path: path,
    preloadImages: preloadImages,
    card: card,
    slicePosStyle: slicePosStyle,
    wheel: wheel,
    wheelOutcomeCenter: wheelOutcomeCenter,
    wheelTooSlow: wheelTooSlow
  };
})();
