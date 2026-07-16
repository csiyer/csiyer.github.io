// plugin-maze-nav.js — custom jsPsych v8 plugin: one reusable grid-maze trial type with
// three modes, since arrow-key-driven, many-keypress, live-redraw navigation can't be built
// from jsPsych's stock single-response plugins.
//
//   'explore'  (Phase 1) — find all landmark images; fog-of-war; auto-finishes when found.
//   'navigate' (Phase 2) — walk to an always-visible star; auto-finishes on arrival.
//   'recall'   (Phase 3) — walk to a remembered location, then click Submit (button only;
//              enabled only after at least one move).
//
// Rendering: a CSS grid of plain divs (all 169 cells always mounted; fog toggles a class
// rather than mounting/unmounting, so there's no camera/scroll logic). Movement: one
// document-level keydown listener per trial; event.repeat is ignored so one keypress is
// always exactly one grid step regardless of OS key-repeat behavior.
window.jsPsychMazeNav = (function (jspsych) {
  'use strict';
  const ParameterType = jspsych.ParameterType;

  const info = {
    name: 'maze-nav',
    version: '1.0.0',
    parameters: {
      mode: { type: ParameterType.STRING, default: 'explore' },
      start_cell: { type: ParameterType.OBJECT, default: null },
      see_this_far: { type: ParameterType.INT, default: null },
      cell_px: { type: ParameterType.INT, default: null },
      max_moves: { type: ParameterType.INT, default: null },
      landmarks: { type: ParameterType.OBJECT, default: [] },      // explore mode only
      target_cell: { type: ParameterType.OBJECT, default: null },   // navigate mode only
      true_cell: { type: ParameterType.OBJECT, default: null },     // recall mode only (never rendered)
      recall_image_url: { type: ParameterType.STRING, default: null }, // recall mode only: small persistent reminder image
      image_display_duration: { type: ParameterType.INT, default: null },
      progress_label: { type: ParameterType.STRING, default: '' },
      hint_text: { type: ParameterType.HTML_STRING, default: '' }
    },
    data: {
      mode: { type: ParameterType.STRING },
      moves: { type: ParameterType.INT },
      move_log_json: { type: ParameterType.STRING },
      rt_total_ms: { type: ParameterType.INT },
      timed_out: { type: ParameterType.BOOL }
    }
  };

  class MazeNavPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    trial(display_element, trial) {
      const maze = MM.maze;
      const cellPx = trial.cell_px || MM.config.cell_px;
      const seeThisFar = trial.see_this_far != null ? trial.see_this_far : MM.config.see_this_far;
      const maxMoves = trial.max_moves || MM.config.max_moves;

      let cur = { row: trial.start_cell.row, col: trial.start_cell.col };
      let moves = 0;
      let inputLocked = false;
      let finished = false;
      const moveLog = [];
      const startTime = performance.now();

      const landmarks = trial.mode === 'explore' ? trial.landmarks : [];
      const foundIds = new Set();
      const foundOrder = [];
      const foundTimes = [];
      const landmarkByCell = {};
      landmarks.forEach(function (lm) { landmarkByCell[lm.row + ',' + lm.col] = lm; });

      // ---- render scaffolding ----
      const gridWidthPx = maze.COLS * cellPx;
      const gridHeightPx = maze.ROWS * cellPx;

      let html = '<div class="mm-maze-wrap">';
      if (trial.progress_label) html += '<div class="mm-progress-label">' + trial.progress_label + '</div>';
      if (trial.mode === 'recall' && trial.recall_image_url) {
        html += '<img class="mm-recall-image" src="' + trial.recall_image_url + '" />';
      } else if (trial.hint_text) {
        html += '<div class="mm-hint">' + trial.hint_text + '</div>';
      }
      if (trial.mode === 'explore') {
        html += '<div class="mm-progress-bar" id="mm-progress-bar">0/' + landmarks.length + ' landmark images found</div>';
      }
      html += '<div class="mm-maze-grid" id="mm-maze-grid" style="width:' + gridWidthPx + 'px;height:' + gridHeightPx + 'px;">';
      html += '<div class="mm-wall-layer" id="mm-wall-layer"></div>';
      html += '<div class="mm-cell-layer" id="mm-cell-layer"></div>';
      html += '</div>';
      if (trial.mode === 'recall') {
        html += '<button id="mm-submit-btn" class="mm-submit-btn" disabled>Submit Location</button>';
      }
      html += '</div>';
      html += '<div id="mm-landmark-overlay" class="mm-landmark-overlay"><img id="mm-landmark-overlay-img" /></div>';

      display_element.innerHTML = html;

      const wallLayer = display_element.querySelector('#mm-wall-layer');
      const cellLayer = display_element.querySelector('#mm-cell-layer');
      const overlay = display_element.querySelector('#mm-landmark-overlay');
      const overlayImg = display_element.querySelector('#mm-landmark-overlay-img');
      const progressBarEl = display_element.querySelector('#mm-progress-bar');
      const submitBtn = display_element.querySelector('#mm-submit-btn');

      // wall bars: redrawn on every visibility update, and only for segments touching a
      // currently-visible cell — a wall's presence/absence is itself maze information, so
      // it must stay hidden in the fog just like everything else (only the outer border,
      // which conveys nothing beyond "this is the edge of the play area," stays static).
      const wallBarThickness = 4;
      const renderWalls = (visibleSet) => {
        let wallHtml = '<div class="mm-wall-border" style="width:' + gridWidthPx + 'px;height:' + gridHeightPx + 'px;"></div>';
        for (let r = 0; r < maze.ROWS; r++) {
          for (let c = 0; c < maze.COLS - 1; c++) {
            if (maze.hWalls[r][c] && (visibleSet.has(r + ',' + c) || visibleSet.has(r + ',' + (c + 1)))) {
              const left = (c + 1) * cellPx - wallBarThickness / 2;
              const top = r * cellPx;
              wallHtml += '<div class="mm-wall mm-wall-v" style="left:' + left + 'px;top:' + top + 'px;height:' + cellPx + 'px;width:' + wallBarThickness + 'px;"></div>';
            }
          }
        }
        for (let r = 0; r < maze.ROWS - 1; r++) {
          for (let c = 0; c < maze.COLS; c++) {
            if (maze.vWalls[r][c] && (visibleSet.has(r + ',' + c) || visibleSet.has((r + 1) + ',' + c))) {
              const top = (r + 1) * cellPx - wallBarThickness / 2;
              const left = c * cellPx;
              wallHtml += '<div class="mm-wall mm-wall-h" style="left:' + left + 'px;top:' + top + 'px;width:' + cellPx + 'px;height:' + wallBarThickness + 'px;"></div>';
            }
          }
        }
        wallLayer.innerHTML = wallHtml;
      };

      // cell divs, one per grid cell
      const cellEls = [];
      let cellHtml = '';
      for (let r = 0; r < maze.ROWS; r++) {
        for (let c = 0; c < maze.COLS; c++) {
          cellHtml += '<div class="mm-cell mm-cell-hidden" id="mm-cell-' + r + '-' + c + '" style="left:' + (c * cellPx) + 'px;top:' + (r * cellPx) + 'px;width:' + cellPx + 'px;height:' + cellPx + 'px;"></div>';
        }
      }
      cellLayer.innerHTML = cellHtml;
      for (let r = 0; r < maze.ROWS; r++) {
        const row = [];
        for (let c = 0; c < maze.COLS; c++) row.push(display_element.querySelector('#mm-cell-' + r + '-' + c));
        cellEls.push(row);
      }

      const renderCellContent = (r, c) => {
        const el = cellEls[r][c];
        el.innerHTML = '';
        if (cur.row === r && cur.col === c) {
          const av = document.createElement('div');
          av.className = 'mm-avatar';
          el.appendChild(av);
          return;
        }
        if (trial.mode === 'navigate' && trial.target_cell && trial.target_cell.row === r && trial.target_cell.col === c) {
          const star = document.createElement('div');
          star.className = 'mm-star';
          star.textContent = '★';
          el.appendChild(star);
          return;
        }
        if (trial.mode === 'explore') {
          const lm = landmarkByCell[r + ',' + c];
          if (lm) {
            if (!foundIds.has(lm.landmark_id)) {
              const marker = document.createElement('div');
              marker.className = 'mm-landmark-marker';
              el.appendChild(marker);
            } else {
              const thumb = document.createElement('img');
              thumb.className = 'mm-landmark-thumb';
              thumb.src = lm.image_url;
              el.appendChild(thumb);
            }
          }
        }
      };

      const updateVisibility = () => {
        const visibleSet = new Set();
        for (let r = 0; r < maze.ROWS; r++) {
          for (let c = 0; c < maze.COLS; c++) {
            const isTarget = trial.mode === 'navigate' && trial.target_cell && trial.target_cell.row === r && trial.target_cell.col === c;
            const visible = isTarget || maze.chebyshevVisible(cur, seeThisFar, { row: r, col: c });
            const el = cellEls[r][c];
            if (visible) {
              visibleSet.add(r + ',' + c);
              el.classList.remove('mm-cell-hidden');
              el.classList.add('mm-cell-visible');
              renderCellContent(r, c);
            } else {
              el.classList.remove('mm-cell-visible');
              el.classList.add('mm-cell-hidden');
              el.innerHTML = '';
            }
          }
        }
        renderWalls(visibleSet);
      };
      updateVisibility();

      const updateProgressBar = () => {
        if (progressBarEl) progressBarEl.textContent = foundIds.size + '/' + landmarks.length + ' landmark images found';
      };

      const cleanupListeners = () => {
        document.removeEventListener('keydown', onKeydown);
        if (submitBtn) submitBtn.removeEventListener('click', onSubmitClick);
      };

      const finish = (extraData) => {
        if (finished) return;
        finished = true;
        cleanupListeners();
        const data = Object.assign({
          mode: trial.mode,
          moves: moves,
          move_log_json: JSON.stringify(moveLog),
          rt_total_ms: Math.round(performance.now() - startTime),
          timed_out: false
        }, extraData || {});
        this.jsPsych.finishTrial(data);
      };

      const showLandmarkOverlay = (lm, onDone) => {
        overlayImg.src = lm.image_url;
        overlay.classList.add('mm-landmark-overlay-visible');
        window.setTimeout(function () {
          overlay.classList.remove('mm-landmark-overlay-visible');
          onDone();
        }, MM.scaleMs(trial.image_display_duration || MM.config.image_display_duration));
      };

      const submitRecall = () => {
        if (finished) return;
        inputLocked = true;
        const errCells = maze.bfsDistances(trial.true_cell)[cur.row][cur.col];
        finish({ submitted_row: cur.row, submitted_col: cur.col, recall_error_cells: errCells });
      };

      const onSubmitClick = () => { if (!finished && !inputLocked && moves > 0) submitRecall(); };

      const onKeydown = (event) => {
        if (finished || inputLocked) return;

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(event.key) === -1) return;
        if (event.repeat) return;
        event.preventDefault();

        const dir = event.key;
        const legal = maze.isMoveLegal(cur.row, cur.col, dir);
        const from = { row: cur.row, col: cur.col };
        const to = legal ? maze.stepCell(cur.row, cur.col, dir) : from;
        moveLog.push({ t_ms: Math.round(performance.now() - startTime), key: dir, valid: legal, from: from, to: to });
        if (!legal) return;

        cur = to;
        moves += 1;
        updateVisibility();

        if (trial.mode === 'recall' && submitBtn && moves === 1) {
          submitBtn.disabled = false;
        }

        if (trial.mode === 'explore') {
          const lm = landmarkByCell[cur.row + ',' + cur.col];
          if (lm && !foundIds.has(lm.landmark_id)) {
            inputLocked = true;
            foundIds.add(lm.landmark_id);
            foundOrder.push(lm.landmark_id);
            foundTimes.push(Math.round(performance.now() - startTime));
            updateProgressBar();
            showLandmarkOverlay(lm, () => {
              inputLocked = false;
              updateVisibility();
              if (foundIds.size >= landmarks.length) {
                finish({
                  landmark_found_order_json: JSON.stringify(foundOrder),
                  landmark_found_times_ms_json: JSON.stringify(foundTimes)
                });
              } else if (moves >= maxMoves) {
                finish({
                  timed_out: true,
                  landmark_found_order_json: JSON.stringify(foundOrder),
                  landmark_found_times_ms_json: JSON.stringify(foundTimes)
                });
              }
            });
            return;
          }
        } else if (trial.mode === 'navigate') {
          if (trial.target_cell && cur.row === trial.target_cell.row && cur.col === trial.target_cell.col) {
            inputLocked = true;
            const flash = document.createElement('div');
            flash.className = 'mm-reached-flash';
            flash.textContent = 'Reached!';
            display_element.querySelector('.mm-maze-wrap').appendChild(flash);
            window.setTimeout(function () { finish({}); }, MM.scaleMs(MM.config.reached_flash_ms));
            return;
          }
        }

        if (!finished && moves >= maxMoves) {
          finish({ timed_out: true });
        }
      };

      document.addEventListener('keydown', onKeydown);
      if (submitBtn) submitBtn.addEventListener('click', onSubmitClick);
    }
  }
  MazeNavPlugin.info = info;

  return MazeNavPlugin;
})(window.jsPsychModule);
