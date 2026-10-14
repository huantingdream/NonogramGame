// 管道 / 点灯 / 数墙 / 聪明格的纯规则，供棋盘与回归测试共用（不依赖 DOM）。
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------------------------------------------------------------------------
// 管道 Netwalk：方向位 1 上、2 右、4 下、8 左
// ---------------------------------------------------------------------------

export function rotateMask(mask, times = 1) {
  let value = mask;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) value = ((value << 1) | (value >> 3)) & 15;
  return value;
}

const NETWALK_DIRECTIONS = [
  { bit: 1, dr: -1, dc: 0, opposite: 4 },
  { bit: 2, dr: 0, dc: 1, opposite: 8 },
  { bit: 4, dr: 1, dc: 0, opposite: 1 },
  { bit: 8, dr: 0, dc: -1, opposite: 2 }
];

// 随机 Prim 生成树：必然连通无环，每格得到接口位掩码
export function generateNetwalk(n, random) {
  const solution = Array(n * n).fill(0);
  const visited = new Set();
  const start = Math.floor(random() * n * n);
  visited.add(start);
  const frontier = [];
  const pushFrontier = (cell) => {
    const r = Math.floor(cell / n), c = cell % n;
    NETWALK_DIRECTIONS.forEach(({ bit, dr, dc, opposite }) => {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) return;
      const next = nr * n + nc;
      if (!visited.has(next)) frontier.push({ from: cell, to: next, bit, opposite });
    });
  };
  pushFrontier(start);
  while (frontier.length) {
    const pick = Math.floor(random() * frontier.length);
    const { from, to, bit, opposite } = frontier.splice(pick, 1)[0];
    if (visited.has(to)) continue;
    visited.add(to);
    solution[from] |= bit;
    solution[to] |= opposite;
    pushFrontier(to);
  }
  // 打乱：每格随机旋转 0-3 次；若过半格子原地不动则全体再转，避免开局即完成
  let scrambled = solution.map((mask) => rotateMask(mask, Math.floor(random() * 4)));
  const unchanged = scrambled.filter((mask, i) => mask === solution[i]).length;
  if (unchanged > (n * n) / 2) {
    scrambled = solution.map((mask) => rotateMask(mask, 1 + Math.floor(random() * 3)));
  }
  return { n, solution, scrambled };
}

// 胜利条件：每个接口都有对接，且所有格子连成一体（接受任意合法连法）
export function checkNetwalk(n, values) {
  for (let cell = 0; cell < n * n; cell++) {
    const r = Math.floor(cell / n), c = cell % n;
    for (const { bit, dr, dc, opposite } of NETWALK_DIRECTIONS) {
      const nr = r + dr, nc = c + dc;
      const inside = nr >= 0 && nr < n && nc >= 0 && nc < n;
      const hasPort = Boolean(values[cell] & bit);
      const neighborHasPort = inside && Boolean(values[nr * n + nc] & opposite);
      if (hasPort !== neighborHasPort) return false;
    }
  }
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const cell = queue.pop();
    const r = Math.floor(cell / n), c = cell % n;
    for (const { bit, dr, dc } of NETWALK_DIRECTIONS) {
      if (!(values[cell] & bit)) continue;
      const next = (r + dr) * n + (c + dc);
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen.size === n * n;
}

// ---------------------------------------------------------------------------
// 点灯 Akari：null 白格 / -1 黑格 / 0-4 数字黑格
// ---------------------------------------------------------------------------

// 随机撒黑格 → 贪心构造一组合法灯光（保证有解）→ 按解给部分黑格标数字
export function generateAkari(n, random) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const cells = Array(n * n).fill(null);
    for (let i = 0; i < n * n; i++) {
      if (random() < 0.2) cells[i] = -1;
    }
    const blackCount = cells.filter((v) => v !== null).length;
    if (blackCount < n || blackCount > n * n * 0.35) continue;

    const index = (r, c) => r * n + c;
    const isBlack = (r, c) => r < 0 || r >= n || c < 0 || c >= n || cells[index(r, c)] !== null;

    // 贪心放灯：随机顺序遍历白格，未被照亮就放灯（未照亮 ⇒ 看不到其他灯，必然合法）
    const lights = new Set();
    const lit = new Set();
    const illuminate = (r, c) => {
      DIRS.forEach(([dr, dc]) => {
        let nr = r + dr, nc = c + dc;
        while (!isBlack(nr, nc)) { lit.add(index(nr, nc)); nr += dr; nc += dc; }
      });
    };
    const whiteCells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!isBlack(r, c)) whiteCells.push(index(r, c));
    for (let i = whiteCells.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [whiteCells[i], whiteCells[j]] = [whiteCells[j], whiteCells[i]];
    }
    for (const cell of whiteCells) {
      if (lit.has(cell)) continue;
      lights.add(cell);
      lit.add(cell);
      illuminate(Math.floor(cell / n), cell % n);
    }
    // 给部分黑格标上「周围灯数」（取自构造出的解，必然可满足）
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (cells[index(r, c)] !== -1) continue;
        if (random() > 0.72) continue;
        let count = 0;
        DIRS.forEach(([dr, dc]) => {
          if (!isBlack(r + dr, c + dc) && lights.has(index(r + dr, c + dc))) count += 1;
        });
        cells[index(r, c)] = count;
      }
    }
    return { n, cells, solution: [...lights] };
  }
  // 兜底：无黑格全白棋盘（一行灯即可解）
  return { n, cells: Array(n * n).fill(null), solution: [0] };
}

// 校验一组灯光是否完整解出
export function checkAkari(puzzle, lightSet) {
  const { n, cells } = puzzle;
  const lights = lightSet instanceof Set ? lightSet : new Set(lightSet);
  const lit = new Set();
  const isBlack = (r, c) => r < 0 || r >= n || c < 0 || c >= n || cells[r * n + c] !== null;
  for (const cell of lights) {
    const r = Math.floor(cell / n), c = cell % n;
    if (isBlack(r, c)) return false;
    lit.add(cell);
    for (const [dr, dc] of DIRS) {
      let nr = r + dr, nc = c + dc;
      while (!isBlack(nr, nc)) {
        if (lights.has(nr * n + nc)) return false; // 两灯互照
        lit.add(nr * n + nc);
        nr += dr; nc += dc;
      }
    }
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const value = cells[r * n + c];
      if (value === null) {
        if (!lit.has(r * n + c)) return false; // 有白格没被照亮
      } else if (value >= 0) {
        let count = 0;
        for (const [dr, dc] of DIRS) {
          if (!isBlack(r + dr, c + dc) && lights.has((r + dr) * n + (c + dc))) count += 1;
        }
        if (count !== value) return false;
      }
    }
  }
  return true;
}

// UI 辅助：每格的照亮 / 冲突 / 数字满足状态
export function analyzeAkari(puzzle, lightSet) {
  const { n, cells } = puzzle;
  const lights = lightSet instanceof Set ? lightSet : new Set(lightSet);
  const lit = new Set();
  const conflicts = new Set();
  const isBlack = (r, c) => r < 0 || r >= n || c < 0 || c >= n || cells[r * n + c] !== null;
  for (const cell of lights) {
    const r = Math.floor(cell / n), c = cell % n;
    lit.add(cell);
    for (const [dr, dc] of DIRS) {
      let nr = r + dr, nc = c + dc;
      while (!isBlack(nr, nc)) {
        if (lights.has(nr * n + nc)) { conflicts.add(cell); conflicts.add(nr * n + nc); }
        lit.add(nr * n + nc);
        nr += dr; nc += dc;
      }
    }
  }
  const clueSatisfied = cells.map((value, cell) => {
    if (value === null || value === -1) return null;
    const r = Math.floor(cell / n), c = cell % n;
    let count = 0;
    for (const [dr, dc] of DIRS) {
      if (!isBlack(r + dr, c + dc) && lights.has((r + dr) * n + (c + dc))) count += 1;
    }
    return count === value;
  });
  return { lit, conflicts, clueSatisfied };
}

// ---------------------------------------------------------------------------
// 数墙 Nurikabe
// ---------------------------------------------------------------------------

// 从随机种子格开始生长海：每步只在与海相邻且不会产生 2×2 海块的格子中扩张，
// 连通性由构造保证；海的补集自然分成互不相邻的岛，每座岛放大小相等的数字。
export function generateNurikabe(n, random) {
  const index = (r, c) => r * n + c;
  // 判断把 (r,c) 涂成海后是否会形成 2×2 海块（候选格本身视为海）
  const createsBlock = (sea, r, c) => {
    const self = index(r, c);
    for (const [dr, dc] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const br = r + dr, bc = c + dc; // 以 (br,bc) 为左上角的 2×2
      if (br < 0 || bc < 0 || br >= n - 1 || bc >= n - 1) continue;
      const cells = [index(br, bc), index(br + 1, bc), index(br, bc + 1), index(br + 1, bc + 1)];
      if (cells.every((cell) => sea[cell] || cell === self)) return true;
    }
    return false;
  };
  for (let attempt = 0; attempt < 200; attempt++) {
    const sea = Array(n * n).fill(false);
    const start = Math.floor(random() * n * n);
    sea[start] = true;
    let seaCount = 1;
    const target = Math.round(n * n * (0.45 + random() * 0.15));
    while (seaCount < target) {
      const candidates = [];
      for (let cell = 0; cell < n * n; cell++) {
        if (sea[cell]) continue;
        const r = Math.floor(cell / n), c = cell % n;
        const adjacent = DIRS.some(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          return nr >= 0 && nr < n && nc >= 0 && nc < n && sea[index(nr, nc)];
        });
        if (adjacent && !createsBlock(sea, r, c)) candidates.push(cell);
      }
      if (!candidates.length) break;
      sea[candidates[Math.floor(random() * candidates.length)]] = true;
      seaCount += 1;
    }
    if (seaCount < n) continue;

    // 海的补集连通分量：每个分量一座岛，数字 = 岛大小
    const clues = [];
    const visited = new Set();
    for (let i = 0; i < n * n; i++) {
      if (sea[i] || visited.has(i)) continue;
      const region = [];
      const stack = [i];
      visited.add(i);
      while (stack.length) {
        const cell = stack.pop();
        region.push(cell);
        const r = Math.floor(cell / n), c = cell % n;
        DIRS.forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) return;
          const next = index(nr, nc);
          if (!sea[next] && !visited.has(next)) { visited.add(next); stack.push(next); }
        });
      }
      clues.push({ cell: region[Math.floor(random() * region.length)], size: region.length });
    }
    // 岛的密度适中才有可玩性
    if (clues.length < 3 || clues.length > n * n / 3) continue;
    return { n, clues, solution: sea.map((v) => !v) };
  }
  return null;
}

// 校验作答：state 0 未定 / 1 海 / 2 岛
export function checkNurikabe(puzzle, state) {
  const { n, clues } = puzzle;
  if (state.some((v) => v === 0)) return false; // 每格都要有结论
  const index = (r, c) => r * n + c;
  const sea = state.map((v) => v === 1);

  // 海连通
  const seaCells = [];
  state.forEach((v, i) => { if (v === 1) seaCells.push(i); });
  if (!seaCells.length) return false;
  const seen = new Set([seaCells[0]]);
  const queue = [seaCells[0]];
  while (queue.length) {
    const cell = queue.pop();
    const r = Math.floor(cell / n), c = cell % n;
    DIRS.forEach(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) return;
      const next = index(nr, nc);
      if (sea[next] && !seen.has(next)) { seen.add(next); queue.push(next); }
    });
  }
  if (seen.size !== seaCells.length) return false;

  // 无 2×2 海块
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      if (sea[index(r, c)] && sea[index(r + 1, c)] && sea[index(r, c + 1)] && sea[index(r + 1, c + 1)]) return false;
    }
  }

  // 每片岛：恰好一个数字，大小等于数字
  const clueByCell = new Map(clues.map((clue) => [clue.cell, clue.size]));
  const visited = new Set();
  for (let i = 0; i < n * n; i++) {
    if (sea[i] || visited.has(i)) continue;
    const region = [];
    const stack = [i];
    visited.add(i);
    while (stack.length) {
      const cell = stack.pop();
      region.push(cell);
      const r = Math.floor(cell / n), c = cell % n;
      DIRS.forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= n || nc < 0 || nc >= n) return;
        const next = index(nr, nc);
        if (!sea[next] && !visited.has(next)) { visited.add(next); stack.push(next); }
      });
    }
    const clueCells = region.filter((cell) => clueByCell.has(cell));
    if (clueCells.length !== 1) return false;
    if (region.length !== clueByCell.get(clueCells[0])) return false;
  }
  // 所有数字格都必须属于岛（未被涂成海）
  return clues.every((clue) => state[clue.cell] !== 1);
}

// ---------------------------------------------------------------------------
// 聪明格 KenKen
// ---------------------------------------------------------------------------

// 随机拉丁方：回溯填充，候选顺序随机
export function generateLatin(n, random) {
  const grid = Array(n * n).fill(0);
  const used = (cell, value) => {
    const r = Math.floor(cell / n), c = cell % n;
    for (let i = 0; i < n; i++) {
      if (grid[r * n + i] === value || grid[i * n + c] === value) return true;
    }
    return false;
  };
  const fill = (cell) => {
    if (cell === n * n) return true;
    const candidates = [];
    for (let v = 1; v <= n; v++) if (!used(cell, v)) candidates.push(v);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const value of candidates) {
      grid[cell] = value;
      if (fill(cell + 1)) return true;
      grid[cell] = 0;
    }
    return false;
  };
  fill(0);
  return grid;
}

// 切分笼子并生成算式（1 格为明示，2 格加减乘除，3 格加或乘）
export function generateKenken(n, random) {
  const solution = generateLatin(n, random);
  const cageOf = Array(n * n).fill(-1);
  const cages = [];
  for (let cell = 0; cell < n * n; cell++) {
    if (cageOf[cell] !== -1) continue;
    const id = cages.length;
    const targetSize = random() < 0.22 ? 1 : random() < 0.6 ? 2 : 3;
    const members = [cell];
    cageOf[cell] = id;
    while (members.length < targetSize) {
      const options = [];
      for (const member of members) {
        const r = Math.floor(member / n), c = member % n;
        DIRS.forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) return;
          const next = nr * n + nc;
          if (cageOf[next] === -1 && !options.includes(next)) options.push(next);
        });
      }
      if (!options.length) break;
      const next = options[Math.floor(random() * options.length)];
      cageOf[next] = id;
      members.push(next);
    }
    const values = members.map((member) => solution[member]);
    let op, result;
    if (members.length === 1) {
      op = 'eq'; result = values[0];
    } else if (members.length === 2) {
      const [a, b] = values;
      const choices = ['add', 'sub', 'mul'];
      if (Math.max(a, b) % Math.min(a, b) === 0) choices.push('div');
      op = choices[Math.floor(random() * choices.length)];
      result = op === 'add' ? a + b : op === 'sub' ? Math.abs(a - b) : op === 'mul' ? a * b : Math.max(a, b) / Math.min(a, b);
    } else {
      op = random() < 0.5 ? 'add' : 'mul';
      result = values.reduce((acc, v) => (op === 'add' ? acc + v : acc * v), op === 'add' ? 0 : 1);
    }
    cages.push({ cells: members, op, target: result });
  }
  return { n, cages, solution };
}

// 校验：每格已填、行列各为 1..n 不重复、每个笼满足算式
export function checkKenken(n, cages, grid) {
  if (grid.some((v) => !Number.isInteger(v) || v < 1 || v > n)) return false;
  for (let i = 0; i < n; i++) {
    const row = new Set(), col = new Set();
    for (let j = 0; j < n; j++) {
      row.add(grid[i * n + j]);
      col.add(grid[j * n + i]);
    }
    if (row.size !== n || col.size !== n) return false;
  }
  return cages.every((cage) => {
    const values = cage.cells.map((cell) => grid[cell]);
    switch (cage.op) {
      case 'eq': return values[0] === cage.target;
      case 'add': return values.reduce((a, b) => a + b, 0) === cage.target;
      case 'mul': return values.reduce((a, b) => a * b, 1) === cage.target;
      case 'sub': return values.length === 2 && Math.abs(values[0] - values[1]) === cage.target;
      case 'div': {
        if (values.length !== 2) return false;
        const [a, b] = values;
        return Math.max(a, b) / Math.min(a, b) === cage.target;
      }
      default: return false;
    }
  });
}
