// Solucionador rápido: algoritmo de duas fases de Herbert Kociemba (~20 movimentos).
// Fase 1 leva o cubo ao subgrupo <U, D, R2, L2, F2, B2>; a fase 2 termina dentro dele.
// Entrada: 54 letras de face na ordem U R F D L B (mesmo layout de cube-core.js).

const N_TWIST = 2187, N_FLIP = 2048, N_SLICE = 495, N_PERM8 = 40320, N_SP = 24;
const FACE = 'URFDLB';
const MOVE_NAMES = [];
for (const f of FACE) MOVE_NAMES.push(f, f + '2', f + "'");
const ALL = [...Array(18).keys()];
const P2 = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16]; // U U2 U' D D2 D' R2 F2 L2 B2
const IN_P2 = new Uint8Array(18);
P2.forEach((m) => { IN_P2[m] = 1; });

// Cantos: URF UFL ULB UBR DFR DLF DBL DRB · Arestas: UR UF UL UB DR DF DL DB FR FL BL BR
const BASIC = [
  { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // U
  { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // R
  { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] }, // F
  { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // D
  { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // L
  { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] }, // B
];

function mul(a, b) {
  const r = { cp: new Array(8), co: new Array(8), ep: new Array(12), eo: new Array(12) };
  for (let i = 0; i < 8; i++) { r.cp[i] = a.cp[b.cp[i]]; r.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3; }
  for (let i = 0; i < 12; i++) { r.ep[i] = a.ep[b.ep[i]]; r.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2; }
  return r;
}

const SOLVED = { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: Array(8).fill(0), ep: [...Array(12).keys()], eo: Array(12).fill(0) };
const MOVES = [];
for (const b of BASIC) { const m2 = mul(b, b); MOVES.push(b, m2, mul(m2, b)); }

// ---------------------------------------------------------------- coordenadas
function permRank(a) {
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    let c = 0;
    for (let j = i + 1; j < a.length; j++) if (a[j] < a[i]) c++;
    r = r * (a.length - i) + c;
  }
  return r;
}
const SLICE_IDX = new Int16Array(4096).fill(-1);
{ let n = 0; for (let m = 0; m < 4096; m++) { let b = 0; for (let x = m; x; x &= x - 1) b++; if (b === 4) SLICE_IDX[m] = n++; } }

const twistOf = (c) => { let t = 0; for (let i = 0; i < 7; i++) t = t * 3 + c.co[i]; return t; };
const flipOf = (c) => { let f = 0; for (let i = 0; i < 11; i++) f = f * 2 + c.eo[i]; return f; };
const sliceOf = (c) => { let m = 0; for (let i = 0; i < 12; i++) if (c.ep[i] >= 8) m |= 1 << i; return SLICE_IDX[m]; };
const cpOf = (c) => permRank(c.cp);
const udOf = (c) => permRank(c.ep.slice(0, 8));
const spOf = (c) => permRank(c.ep.slice(8).map((x) => x - 8));
const SLICE0 = sliceOf(SOLVED);

// Tabela de movimentos de uma coordenada: percorre a partir do cubo montado guardando
// um cubo representante de cada valor (o efeito do movimento só depende da coordenada).
function moveTable(coord, n, moves) {
  const t = new Int32Array(n * 18).fill(-1);
  const seen = new Uint8Array(n);
  const stack = [SOLVED];
  seen[coord(SOLVED)] = 1;
  while (stack.length) {
    const c = stack.pop(), x = coord(c);
    for (const m of moves) {
      const d = mul(c, MOVES[m]), y = coord(d);
      t[x * 18 + m] = y;
      if (!seen[y]) { seen[y] = 1; stack.push(d); }
    }
  }
  return t;
}

// Tabela de distância (BFS) para o par de coordenadas (a, b), índice a * nb + b.
function pruneTable(ta, na, a0, tb, nb, b0, moves) {
  const size = na * nb, d = new Int8Array(size).fill(-1), q = new Int32Array(size);
  let head = 0, tail = 0;
  d[a0 * nb + b0] = 0; q[tail++] = a0 * nb + b0;
  while (head < tail) {
    const i = q[head++], a = (i / nb) | 0, b = i - a * nb, nd = d[i] + 1;
    for (const m of moves) {
      const j = ta[a * 18 + m] * nb + tb[b * 18 + m];
      if (d[j] < 0) { d[j] = nd; q[tail++] = j; }
    }
  }
  return d;
}

let T = null;
export function initTables() {
  if (T) return;
  const twist = moveTable(twistOf, N_TWIST, ALL);
  const flip = moveTable(flipOf, N_FLIP, ALL);
  const slice = moveTable(sliceOf, N_SLICE, ALL);
  const cp = moveTable(cpOf, N_PERM8, P2);
  const ud = moveTable(udOf, N_PERM8, P2);
  const sp = moveTable(spOf, N_SP, P2);
  T = {
    twist, flip, slice, cp, ud, sp,
    pTwist: pruneTable(slice, N_SLICE, SLICE0, twist, N_TWIST, 0, ALL),
    pFlip: pruneTable(slice, N_SLICE, SLICE0, flip, N_FLIP, 0, ALL),
    pCp: pruneTable(cp, N_PERM8, 0, sp, N_SP, 0, P2),
    pUd: pruneTable(ud, N_PERM8, 0, sp, N_SP, 0, P2),
  };
}

// ---------------------------------------------------------------- adesivos -> peças
const CF = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
const CC = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const EF = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];
const EC = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

function toCubie(f) {
  const c = { cp: [], co: [], ep: [], eo: [] };
  for (let i = 0; i < 8; i++) {
    const ori = [0, 1, 2].find((o) => f[CF[i][o]] === 'U' || f[CF[i][o]] === 'D');
    if (ori === undefined) throw new Error('canto inválido');
    const c1 = f[CF[i][(ori + 1) % 3]], c2 = f[CF[i][(ori + 2) % 3]];
    const j = CC.findIndex((n) => n[1] === c1 && n[2] === c2);
    if (j < 0) throw new Error('canto inválido');
    c.cp[i] = j; c.co[i] = ori;
  }
  for (let i = 0; i < 12; i++) {
    const a = f[EF[i][0]], b = f[EF[i][1]];
    let j = EC.findIndex((n) => n[0] === a && n[1] === b);
    if (j >= 0) { c.ep[i] = j; c.eo[i] = 0; continue; }
    j = EC.findIndex((n) => n[0] === b && n[1] === a);
    if (j < 0) throw new Error('aresta inválida');
    c.ep[i] = j; c.eo[i] = 1;
  }
  if (new Set(c.cp).size !== 8 || new Set(c.ep).size !== 12) throw new Error('peça repetida');
  if (c.co.reduce((s, x) => s + x, 0) % 3 || c.eo.reduce((s, x) => s + x, 0) % 2) throw new Error('peça girada');
  const parity = (p) => { let s = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) s ^= 1; return s; };
  if (parity(c.cp) !== parity(c.ep)) throw new Error('paridade');
  return c;
}

// ---------------------------------------------------------------- busca
const faceOf = (m) => (m / 3) | 0;
// Evita giros redundantes: mesma face seguida, e faces opostas fora de ordem (ex.: D depois U).
const skip = (last, m) => last >= 0 && (faceOf(m) === faceOf(last) || faceOf(m) === faceOf(last) - 3);

/** Resolve um cubo dado como 54 letras de face. Devolve a lista de movimentos (ex.: ["R", "U'", "F2"]). */
export function solveFacelets(facelets, { maxMs = 400 } = {}) {
  initTables();
  const cube = toCubie(facelets);
  const t0 = Date.now();
  let best = null, nodes = 0, stop = false;
  const p1 = [], p2 = [];

  function phase2(cp, ud, sp, togo, last) {
    if (togo === 0) return cp === 0 && ud === 0 && sp === 0;
    for (const m of P2) {
      if (skip(last, m)) continue;
      const a = T.cp[cp * 18 + m], b = T.ud[ud * 18 + m], c = T.sp[sp * 18 + m];
      if (Math.max(T.pCp[a * 24 + c], T.pUd[b * 24 + c]) >= togo) continue;
      p2.push(m);
      if (phase2(a, b, c, togo - 1, m)) return true;
      p2.pop();
    }
    return false;
  }

  function startPhase2() {
    let c = cube;
    for (const m of p1) c = mul(c, MOVES[m]);
    const cp = cpOf(c), ud = udOf(c), sp = spOf(c);
    const limit = (best ? best.length - 1 : 30) - p1.length;
    const h = Math.max(T.pCp[cp * 24 + sp], T.pUd[ud * 24 + sp]);
    for (let d = h; d <= limit; d++) {
      p2.length = 0;
      if (phase2(cp, ud, sp, d, p1.length ? p1[p1.length - 1] : -1)) { best = [...p1, ...p2]; return; }
    }
  }

  function phase1(tw, fl, sl, togo, last) {
    if (stop) return;
    if (++nodes % 2048 === 0 && best && Date.now() - t0 > maxMs) { stop = true; return; }
    if (togo === 0) {
      // Último giro da fase 1 dentro do subgrupo significa que existe fase 1 mais curta.
      if (tw === 0 && fl === 0 && sl === SLICE0 && (last < 0 || !IN_P2[last])) startPhase2();
      return;
    }
    for (let m = 0; m < 18; m++) {
      if (skip(last, m)) continue;
      const a = T.twist[tw * 18 + m], b = T.flip[fl * 18 + m], c = T.slice[sl * 18 + m];
      if (Math.max(T.pTwist[c * N_TWIST + a], T.pFlip[c * N_FLIP + b]) >= togo) continue;
      p1.push(m);
      phase1(a, b, c, togo - 1, m);
      p1.pop();
      if (stop) return;
    }
  }

  const tw = twistOf(cube), fl = flipOf(cube), sl = sliceOf(cube);
  const h0 = Math.max(T.pTwist[sl * N_TWIST + tw], T.pFlip[sl * N_FLIP + fl]);
  for (let d = h0; d <= 20 && !stop; d++) {
    if (best && d >= best.length) break;
    if (d === 0) { startPhase2(); continue; }
    phase1(tw, fl, sl, d, -1);
  }
  return (best || []).map((m) => MOVE_NAMES[m]);
}
