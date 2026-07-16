"""
One-off offline maze generator. NOT loaded by index.html / any participant-facing page.

Generates a single fixed 13x13 maze (randomized-DFS spanning tree + a loop-adding
braiding pass), picks 6 landmark cells via farthest-point sampling, computes BFS
distance stats, and prints a literal JS object to paste verbatim into
task/js/maze.js's static data block (MM.maze.DATA). Run once; the maze must stay
identical across all participants, so this script is never invoked at runtime.

Usage: python3 generate_maze.py
"""
import json
import random
from collections import deque

R, C = 8, 8             # grid rows/cols
SEED = 42              # fixed seed -> deterministic maze, reproducible if regenerated
LOOP_PROB = 0.12       # fraction of non-tree edges re-opened to braid the maze
N_LANDMARKS = 6


def all_edges():
    edges = []
    for r in range(R):
        for c in range(C):
            if c + 1 < C:
                edges.append(("h", r, c))  # between (r,c)-(r,c+1)
            if r + 1 < R:
                edges.append(("v", r, c))  # between (r,c)-(r+1,c)
    return edges


def generate_spanning_tree(rng):
    """Randomized DFS (recursive backtracker) over the grid; returns the set of
    open edges (as (type,r,c) tuples) forming a spanning tree."""
    visited = [[False] * C for _ in range(R)]
    open_edges = set()
    stack = [(0, 0)]
    visited[0][0] = True
    while stack:
        r, c = stack[-1]
        neighbors = []
        if r > 0 and not visited[r - 1][c]:
            neighbors.append(("v", r - 1, c, r - 1, c))
        if r + 1 < R and not visited[r + 1][c]:
            neighbors.append(("v", r, c, r + 1, c))
        if c > 0 and not visited[r][c - 1]:
            neighbors.append(("h", r, c - 1, r, c - 1))
        if c + 1 < C and not visited[r][c + 1]:
            neighbors.append(("h", r, c, r, c + 1))
        if not neighbors:
            stack.pop()
            continue
        edge_type, er, ec, nr, nc = rng.choice(neighbors)
        open_edges.add((edge_type, er, ec))
        visited[nr][nc] = True
        stack.append((nr, nc))
    return open_edges


def braid(open_edges, rng, loop_prob):
    for e in all_edges():
        if e not in open_edges and rng.random() < loop_prob:
            open_edges.add(e)
    return open_edges


def build_wall_arrays(open_edges):
    # hWalls[r][c] = wall present between (r,c)-(r,c+1); vWalls[r][c] = wall between (r,c)-(r+1,c)
    hWalls = [[True] * (C - 1) for _ in range(R)]
    vWalls = [[True] * C for _ in range(R - 1)]
    for edge_type, r, c in open_edges:
        if edge_type == "h":
            hWalls[r][c] = False
        else:
            vWalls[r][c] = False
    return hWalls, vWalls


def neighbors_open(hWalls, vWalls, r, c):
    out = []
    if c + 1 < C and not hWalls[r][c]:
        out.append((r, c + 1))
    if c > 0 and not hWalls[r][c - 1]:
        out.append((r, c - 1))
    if r + 1 < R and not vWalls[r][c]:
        out.append((r + 1, c))
    if r > 0 and not vWalls[r - 1][c]:
        out.append((r - 1, c))
    return out


def bfs_distances(hWalls, vWalls, src):
    dist = [[-1] * C for _ in range(R)]
    sr, sc = src
    dist[sr][sc] = 0
    q = deque([src])
    while q:
        r, c = q.popleft()
        for nr, nc in neighbors_open(hWalls, vWalls, r, c):
            if dist[nr][nc] == -1:
                dist[nr][nc] = dist[r][c] + 1
                q.append((nr, nc))
    return dist


def farthest_point_sample(hWalls, vWalls, k, start):
    picked = [start]
    all_cells = [(r, c) for r in range(R) for c in range(C)]
    dist_to_set = {cell: bfs_distances(hWalls, vWalls, start)[cell[0]][cell[1]] for cell in all_cells}
    while len(picked) < k:
        best_cell, best_dist = None, -1
        for cell in all_cells:
            if cell in picked:
                continue
            d = dist_to_set[cell]
            if d > best_dist:
                best_dist, best_cell = d, cell
        picked.append(best_cell)
        new_dist = bfs_distances(hWalls, vWalls, best_cell)
        for cell in all_cells:
            if cell not in picked:
                dist_to_set[cell] = min(dist_to_set[cell], new_dist[cell[0]][cell[1]])
    return picked


def main():
    rng = random.Random(SEED)
    tree_edges = generate_spanning_tree(rng)
    n_tree = len(tree_edges)
    open_edges = braid(set(tree_edges), rng, LOOP_PROB)
    n_extra = len(open_edges) - n_tree
    hWalls, vWalls = build_wall_arrays(open_edges)

    start = (R // 2, C // 2)  # (6,6), grid center

    landmarks = farthest_point_sample(hWalls, vWalls, N_LANDMARKS, start)
    # drop the seed point itself from consideration as a landmark if it got picked first;
    # farthest_point_sample always includes `start` at index 0, so re-sample landmarks
    # starting from a corner instead, keeping `start` free for the avatar's Phase-1 spawn.
    landmarks = farthest_point_sample(hWalls, vWalls, N_LANDMARKS + 1, (0, 0))
    landmarks = [cell for cell in landmarks if cell != start][:N_LANDMARKS]

    # BFS stats across all cells (diameter, mean pairwise distance) for sanity-checking
    all_cells = [(r, c) for r in range(R) for c in range(C)]
    all_dists = []
    diameter = 0
    for cell in all_cells:
        d = bfs_distances(hWalls, vWalls, cell)
        for other in all_cells:
            dv = d[other[0]][other[1]]
            all_dists.append(dv)
            diameter = max(diameter, dv)
    mean_pairwise_distance = sum(all_dists) / len(all_dists)

    # pairwise distances among the 6 landmarks (for sanity-check reporting)
    landmark_pairwise = []
    for i in range(len(landmarks)):
        d = bfs_distances(hWalls, vWalls, landmarks[i])
        for j in range(i + 1, len(landmarks)):
            landmark_pairwise.append(d[landmarks[j][0]][landmarks[j][1]])

    data = {
        "rows": R,
        "cols": C,
        "seed": SEED,
        "hWalls": hWalls,
        "vWalls": vWalls,
        "start": {"row": start[0], "col": start[1]},
        "landmarks": [{"row": r, "col": c} for r, c in landmarks],
        "meanPairwiseDistance": round(mean_pairwise_distance, 4),
        "diameter": diameter,
    }

    print("// ---- Auto-generated by task/dev/generate_maze.py (seed=%d). Paste verbatim into ----" % SEED)
    print("// ---- task/js/maze.js's MM.maze.DATA block. Do not hand-edit; rerun the script ----")
    print("// ---- and re-paste instead if the maze ever needs to change.                    ----")
    print("MM.maze.DATA = " + json.dumps(data, indent=2) + ";")
    print()
    print("// sanity check (not part of the pasted block):")
    print("// tree edges: %d, braided extra edges: %d, total open edges: %d" % (n_tree, n_extra, len(open_edges)))
    print("// diameter: %d, mean pairwise distance: %.2f" % (diameter, mean_pairwise_distance))
    print("// landmark pairwise BFS distances: min=%d max=%d mean=%.2f" % (
        min(landmark_pairwise), max(landmark_pairwise), sum(landmark_pairwise) / len(landmark_pairwise)
    ))


if __name__ == "__main__":
    main()
