// maze.js — MM.maze: the fixed maze layout (identical for every participant) plus
// framework-free graph helpers (BFS, legality, fog visibility, bearing). Framework-free
// so it can be exercised outside jsPsych too (see dev/reproducibility.html).
//
// The layout below was generated once by dev/generate_maze.py (seed=42): a randomized-DFS
// spanning tree over an 8x8 grid, braided with ~12% extra loop edges so it isn't a single
// deterministic path. It is embedded here as static data and never regenerated at runtime —
// that's what makes it "the same maze across all people." If the maze ever needs to change,
// rerun generate_maze.py and replace MM.maze.DATA wholesale (do not hand-edit the arrays).
window.MM = window.MM || {};
MM.maze = {};

(function () {
  const ROWS = 8, COLS = 8;

  // hWalls[r][c] (1 = wall present) is the edge between (r,c) and (r,c+1).
  // vWalls[r][c] (1 = wall present) is the edge between (r,c) and (r+1,c).
  const hWalls = [
    [1,0,1,0,0,0,0],
    [1,1,1,1,1,0,1],
    [0,1,0,1,0,0,1],
    [0,1,0,1,0,1,1],
    [0,1,1,0,1,0,1],
    [1,0,1,1,0,1,0],
    [0,1,0,1,0,0,1],
    [0,1,0,0,0,0,0]
  ];
  const vWalls = [
    [0,0,0,0,0,0,1,0],
    [0,0,0,0,0,1,0,0],
    [1,0,1,1,0,0,1,0],
    [1,0,0,0,1,1,0,0],
    [0,1,0,0,1,0,0,0],
    [0,0,1,0,0,1,1,1],
    [0,1,0,1,1,1,0,0]
  ];

  const START = { row: 4, col: 4 };
  const LANDMARK_CELLS = [
    { row: 0, col: 0 },
    { row: 6, col: 4 },
    { row: 2, col: 6 },
    { row: 5, col: 1 },
    { row: 2, col: 2 },
    { row: 5, col: 7 }
  ];
  const MEAN_PAIRWISE_DISTANCE = 12.3486;
  const DIAMETER = 27;

  function inBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  // Legality of a one-step move from (r,c) in a given arrow-key direction.
  function isMoveLegal(r, c, dir) {
    if (dir === 'ArrowRight') return c + 1 < COLS && !hWalls[r][c];
    if (dir === 'ArrowLeft') return c > 0 && !hWalls[r][c - 1];
    if (dir === 'ArrowDown') return r + 1 < ROWS && !vWalls[r][c];
    if (dir === 'ArrowUp') return r > 0 && !vWalls[r - 1][c];
    return false;
  }

  function stepCell(r, c, dir) {
    if (dir === 'ArrowRight') return { row: r, col: c + 1 };
    if (dir === 'ArrowLeft') return { row: r, col: c - 1 };
    if (dir === 'ArrowDown') return { row: r + 1, col: c };
    if (dir === 'ArrowUp') return { row: r - 1, col: c };
    return { row: r, col: c };
  }

  function neighborsOpen(r, c) {
    const out = [];
    if (c + 1 < COLS && !hWalls[r][c]) out.push({ row: r, col: c + 1 });
    if (c > 0 && !hWalls[r][c - 1]) out.push({ row: r, col: c - 1 });
    if (r + 1 < ROWS && !vWalls[r][c]) out.push({ row: r + 1, col: c });
    if (r > 0 && !vWalls[r - 1][c]) out.push({ row: r - 1, col: c });
    return out;
  }

  // Full single-source BFS distance map (ROWS x COLS array of ints, -1 if unreachable —
  // never happens here since the base spanning tree guarantees full connectivity).
  function bfsDistances(src) {
    const dist = [];
    for (let r = 0; r < ROWS; r++) dist.push(new Array(COLS).fill(-1));
    dist[src.row][src.col] = 0;
    const queue = [src];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const nbrs = neighborsOpen(cur.row, cur.col);
      for (let i = 0; i < nbrs.length; i++) {
        const n = nbrs[i];
        if (dist[n.row][n.col] === -1) {
          dist[n.row][n.col] = dist[cur.row][cur.col] + 1;
          queue.push(n);
        }
      }
    }
    return dist;
  }

  // Shortest path from src to dst as an array of cells (inclusive), via BFS parent pointers.
  // Not used at runtime by the plugins (they only need distances/legality) — kept for
  // dev/QA tooling (e.g. verifying optimal_path_length by eye).
  function bfsPath(src, dst) {
    const parent = {};
    const key = (c) => c.row + ',' + c.col;
    const visited = new Set([key(src)]);
    const queue = [src];
    let head = 0;
    let found = false;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur.row === dst.row && cur.col === dst.col) { found = true; break; }
      const nbrs = neighborsOpen(cur.row, cur.col);
      for (let i = 0; i < nbrs.length; i++) {
        const n = nbrs[i];
        const k = key(n);
        if (!visited.has(k)) {
          visited.add(k);
          parent[k] = cur;
          queue.push(n);
        }
      }
    }
    if (!found) return null;
    const path = [];
    let cur = dst;
    while (key(cur) !== key(src)) {
      path.push(cur);
      cur = parent[key(cur)];
    }
    path.push(src);
    path.reverse();
    return path;
  }

  // All cells whose BFS distance from `src` falls in [minDist, maxDist] (inclusive).
  function cellsAtDistanceRange(src, minDist, maxDist) {
    const dist = bfsDistances(src);
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const d = dist[r][c];
        if (d >= minDist && d <= maxDist) out.push({ row: r, col: c });
      }
    }
    return out;
  }

  // Fog-of-war visibility: physical (wall-ignoring) proximity, NOT graph reachability —
  // "you can only see `radius` units in any given direction." Chebyshev distance so a
  // radius of 2 reveals a 5x5 square centered on the avatar.
  function chebyshevVisible(avatarCell, radius, targetCell) {
    return Math.abs(avatarCell.row - targetCell.row) <= radius &&
      Math.abs(avatarCell.col - targetCell.col) <= radius;
  }

  // Straight-line compass bearing from cellA to cellB, ignoring walls entirely (Phase 4
  // tests knowledge of the landmarks' true relative positions, not maze routes).
  // Convention: 0deg = north (row decreasing), clockwise-positive, matching the
  // direction-response dial in plugin-direction-response.js.
  function bearingDeg(cellA, cellB) {
    const dRow = cellB.row - cellA.row;
    const dCol = cellB.col - cellA.col;
    let deg = Math.atan2(dCol, -dRow) * (180 / Math.PI);
    if (deg < 0) deg += 360;
    return deg;
  }

  function cellsEqual(a, b) {
    return a.row === b.row && a.col === b.col;
  }

  MM.maze = {
    ROWS: ROWS,
    COLS: COLS,
    START: START,
    LANDMARK_CELLS: LANDMARK_CELLS,
    MEAN_PAIRWISE_DISTANCE: MEAN_PAIRWISE_DISTANCE,
    DIAMETER: DIAMETER,
    isMoveLegal: isMoveLegal,
    stepCell: stepCell,
    neighborsOpen: neighborsOpen,
    bfsDistances: bfsDistances,
    bfsPath: bfsPath,
    cellsAtDistanceRange: cellsAtDistanceRange,
    chebyshevVisible: chebyshevVisible,
    bearingDeg: bearingDeg,
    cellsEqual: cellsEqual,
    // exposed for the wall-overlay renderer (plugin-maze-nav.js on_load)
    hWalls: hWalls,
    vWalls: vWalls
  };
})();
