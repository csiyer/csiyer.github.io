// plugin-direction-response.js — custom jsPsych v8 plugin for Phase 4: shows two landmark
// images side by side ("you are here" / "point to this one"), each with its own prompt
// above it, and a continuous circular dial (drag only) below them to set a direction.
//
// Angle convention matches maze.js's bearingDeg: 0deg = north (up), clockwise-positive.
window.jsPsychDirectionResponse = (function (jspsych) {
  'use strict';
  const ParameterType = jspsych.ParameterType;

  const info = {
    name: 'direction-response',
    version: '1.0.0',
    parameters: {
      image_a_url: { type: ParameterType.STRING, default: null },
      image_b_url: { type: ParameterType.STRING, default: null },
      prompt_a: { type: ParameterType.HTML_STRING, default: 'You are in the location of this landmark:' },
      prompt_b: { type: ParameterType.HTML_STRING, default: 'Put the arrow in the direction of this landmark:' },
      dial_radius_px: { type: ParameterType.INT, default: null },
      require_movement: { type: ParameterType.BOOL, default: null },
      true_bearing_deg: { type: ParameterType.FLOAT, default: null },
      progress_label: { type: ParameterType.STRING, default: '' }
    },
    data: {
      response_deg: { type: ParameterType.FLOAT },
      angular_error_deg: { type: ParameterType.FLOAT },
      rt_ms: { type: ParameterType.INT },
      moved: { type: ParameterType.BOOL }
    }
  };

  function angularDiff(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  class DirectionResponsePlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const radius = trial.dial_radius_px || MM.config.dial_radius_px;
      const requireMovement = trial.require_movement != null ? trial.require_movement : MM.config.require_movement;
      const diameter = radius * 2;
      const startTime = performance.now();

      let angle = Math.random() * 360;
      let moved = !requireMovement;
      let dragging = false;
      let finished = false;

      let html = '<div class="mm-direction-trial">';
      if (trial.progress_label) html += '<div class="mm-progress-label">' + trial.progress_label + '</div>';
      html += '<div class="mm-direction-images-row">';
      html += '<div class="mm-direction-col">';
      html += '<div class="mm-direction-prompt">' + trial.prompt_a + '</div>';
      html += '<img class="mm-direction-image" src="' + trial.image_a_url + '" />';
      html += '</div>';
      html += '<div class="mm-direction-col">';
      html += '<div class="mm-direction-prompt">' + trial.prompt_b + '</div>';
      html += '<img class="mm-direction-image" src="' + trial.image_b_url + '" />';
      html += '</div>';
      html += '</div>';
      html += '<div class="mm-dial-container" id="mm-dial-container" style="width:' + diameter + 'px;height:' + diameter + 'px;">';
      html += '<div class="mm-dial-track"></div>';
      html += '<div class="mm-dial-handle" id="mm-dial-handle" style="width:' + radius + 'px;"></div>';
      html += '<div class="mm-dial-center-dot"></div>';
      html += '</div>';
      html += '<button id="mm-direction-submit-btn" class="mm-submit-btn" ' + (moved ? '' : 'disabled') + '>Submit Direction</button>';
      html += '</div>';

      display_element.innerHTML = html;

      const dialContainer = display_element.querySelector('#mm-dial-container');
      const handle = display_element.querySelector('#mm-dial-handle');
      const submitBtn = display_element.querySelector('#mm-direction-submit-btn');

      const renderHandle = () => {
        handle.style.transform = 'rotate(' + (angle - 90) + 'deg)';
      };
      renderHandle();

      const setMoved = () => {
        if (!moved) {
          moved = true;
          submitBtn.disabled = false;
        }
      };

      const angleFromPointer = (clientX, clientY) => {
        const rect = dialContainer.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
        if (deg < 0) deg += 360;
        return deg;
      };

      const onPointerDown = (event) => {
        if (finished) return;
        dragging = true;
        angle = angleFromPointer(event.clientX, event.clientY);
        renderHandle();
        setMoved();
      };
      const onPointerMove = (event) => {
        if (finished || !dragging) return;
        angle = angleFromPointer(event.clientX, event.clientY);
        renderHandle();
        setMoved();
      };
      const onPointerUp = () => { dragging = false; };

      const cleanup = () => {
        dialContainer.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        submitBtn.removeEventListener('click', onSubmit);
      };

      const onSubmit = () => {
        if (finished || !moved) return;
        finished = true;
        cleanup();
        const error = trial.true_bearing_deg != null ? angularDiff(angle, trial.true_bearing_deg) : null;
        this.jsPsych.finishTrial({
          response_deg: angle,
          angular_error_deg: error,
          rt_ms: Math.round(performance.now() - startTime),
          moved: moved
        });
      };

      dialContainer.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      submitBtn.addEventListener('click', onSubmit);
    }
  }
  DirectionResponsePlugin.info = info;

  return DirectionResponsePlugin;
})(window.jsPsychModule);
