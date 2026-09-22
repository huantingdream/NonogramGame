// Pure rules shared by the boards and regression tests.
export function move2048(board, direction) {
  const next = board.slice();
  let score = 0;
  for (let lane = 0; lane < 4; lane++) {
    const ids = Array.from({ length: 4 }, (_, k) => direction === 'left' ? lane * 4 + k : direction === 'right' ? lane * 4 + 3 - k : direction === 'up' ? k * 4 + lane : (3 - k) * 4 + lane);
    const values = ids.map(i => board[i]).filter(Boolean), merged = [];
    for (let k = 0; k < values.length; k++) {
      if (values[k] === values[k + 1]) { merged.push(values[k] * 2); score += values[k] * 2; k++; }
      else merged.push(values[k]);
    }
    ids.forEach((id, k) => { next[id] = merged[k] || 0; });
  }
  return { board: next, score, changed: next.some((v, i) => v !== board[i]) };
}
export function canMove2048(board) {
  return ['left', 'right', 'up', 'down'].some(d => move2048(board, d).changed);
}
function connected(nodes, edges) {
  if (!nodes.length) return false;
  const seen = new Set([nodes[0]]), queue = [nodes[0]];
  while (queue.length) {
    const node = queue.pop();
    for (const { a, b } of edges) {
      const other = a === node ? b : b === node ? a : null;
      if (other !== null && !seen.has(other)) { seen.add(other); queue.push(other); }
    }
  }
  return nodes.every(n => seen.has(n));
}
export function loopEdges(n) {
  const edges = [];
  for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) edges.push({ a: r * (n + 1) + c, b: r * (n + 1) + c + 1, x: c + .5, y: r, horizontal: true, cells: [r > 0 ? (r - 1) * n + c : -1, r < n ? r * n + c : -1] });
  for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) edges.push({ a: r * (n + 1) + c, b: (r + 1) * (n + 1) + c, x: c, y: r + .5, horizontal: false, cells: [c > 0 ? r * n + c - 1 : -1, c < n ? r * n + c : -1] });
  return edges;
}
export function checkLoop(puzzle, values) {
  const selected = puzzle.edges.filter((_, i) => values[i] === 1);
  const degrees = new Map();
  selected.forEach(e => [e.a, e.b].forEach(v => degrees.set(v, (degrees.get(v) || 0) + 1)));
  return selected.length > 0 && [...degrees.values()].every(d => d === 2) &&
    puzzle.clues.every((clue, c) => clue === null || selected.filter(e => e.cells.includes(c)).length === clue) && connected([...degrees.keys()], selected);
}
export function generateLoop(n, random) {
  const edges = loopEdges(n);
  // Grow one region, retaining only additions whose boundary is one simple loop.
  let region = Array(n * n).fill(false);
  region[Math.floor(random() * region.length)] = true;
  const boundary = cells => edges.map(e => Number(Boolean(cells[e.cells[0]]) !== Boolean(cells[e.cells[1]])));
  for (let attempt = 0; attempt < n * n * 8; attempt++) {
    const cell = Math.floor(random() * region.length);
    if (region[cell]) continue;
    const candidate = region.slice(); candidate[cell] = true;
    const solution = boundary(candidate);
    if (checkLoop({ edges, clues: Array(n * n).fill(null) }, solution)) region = candidate;
    if (region.filter(Boolean).length >= Math.floor(n * n * .6)) break;
  }
  const solution = boundary(region);
  const clues = region.map((_, cell) => edges.reduce((sum, e, i) => sum + (e.cells.includes(cell) ? solution[i] : 0), 0));
  return { n, edges, clues, solution };
}
export function crosses(e, f, islands) {
  if ([e.a, e.b].some(v => v === f.a || v === f.b)) return false;
  const a = islands[e.a], b = islands[e.b], c = islands[f.a], d = islands[f.b];
  if ((a.y === b.y) === (c.y === d.y)) return false;
  const [h1, h2, v1, v2] = a.y === b.y ? [a, b, c, d] : [c, d, a, b];
  return v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) && h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y);
}
export function bridgeCounts(puzzle, values) {
  return puzzle.islands.map((_, id) => puzzle.edges.reduce((sum, e, i) => sum + (e.a === id || e.b === id ? values[i] : 0), 0));
}
export function checkBridges(puzzle, values) {
  if (values.length !== puzzle.edges.length || values.some(v => !Number.isInteger(v) || v < 0 || v > 2)) return false;
  const selected = puzzle.edges.filter((_, i) => values[i] > 0);
  return bridgeCounts(puzzle, values).every((v, i) => v === puzzle.islands[i].clue) &&
    !selected.some((e, i) => selected.slice(i + 1).some(f => crosses(e, f, puzzle.islands))) && connected(puzzle.islands.map((_, i) => i), selected);
}
export function generateBridges(n, random) {
  for (let attempt = 0; attempt < 64; attempt++) {
    const puzzle = buildBridges(n, random);
    if (puzzle) return puzzle;
  }
  // A full lattice is always connected and its adjacent lanes never cross.
  return buildBridges(n, random, true);
}
function buildBridges(n, random, dense = false) {
  // A sparse lattice gives aligned islands with room for selectable bridge lanes.
  const islands = [];
  for (let y = 0; y < n; y += 2) for (let x = 0; x < n; x += 2) if (dense || random() > .25) islands.push({ x, y, clue: 0 });
  if (islands.length < 4) return null;
  const edges = [];
  islands.forEach((a, i) => islands.forEach((b, j) => {
    if (j <= i || (a.x !== b.x && a.y !== b.y)) return;
    if (islands.some((c, k) => k !== i && k !== j && (a.x === b.x ? c.x === a.x && c.y > Math.min(a.y, b.y) && c.y < Math.max(a.y, b.y) : c.y === a.y && c.x > Math.min(a.x, b.x) && c.x < Math.max(a.x, b.x)))) return;
    edges.push({ a: i, b: j });
  }));
  const solution = edges.map(() => 0), reached = new Set([0]);
  while (reached.size < islands.length) {
    const options = edges.map((e, i) => i).filter(i => reached.has(edges[i].a) !== reached.has(edges[i].b) && !edges.some((e, j) => solution[j] && crosses(edges[i], e, islands)));
    if (!options.length) return null;
    const i = options[Math.floor(random() * options.length)], e = edges[i];
    solution[i] = random() < .45 ? 2 : 1; reached.add(e.a); reached.add(e.b);
  }
  const puzzle = { n, islands, edges, solution };
  bridgeCounts(puzzle, solution).forEach((clue, i) => { islands[i].clue = clue; });
  return puzzle;
}
