// Núcleo lógico do cubo 3x3x3.
// Estado = array de 54 cores na ordem de faces U R F D L B (9 adesivos cada, leitura linha a linha).
// Eixos: x = direita (R), y = cima (U), z = frente (F).

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
export const NORMALS = {
  U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
  D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
};

// Esquema padrão segurando AMARELO em cima e VERDE de frente.
export const DEFAULT_SCHEME = { U: 'Y', R: 'O', F: 'G', D: 'W', L: 'R', B: 'B' };

export const COLOR_NAMES = {
  W: 'branco', Y: 'amarelo', G: 'verde', B: 'azul', R: 'vermelho', O: 'laranja', X: 'sem cor',
};

// Posição (cubinho) de cada adesivo, olhando a face de frente
// (U: visto de cima com a frente embaixo; D: visto de baixo com a frente em cima;
//  laterais: vistas de fora com U em cima).
function faceletPos(f, i) {
  const r = Math.floor(i / 3), c = i % 3;
  switch (f) {
    case 'U': return [c - 1, 1, r - 1];
    case 'R': return [1, 1 - r, 1 - c];
    case 'F': return [c - 1, 1 - r, 1];
    case 'D': return [c - 1, -1, 1 - r];
    case 'L': return [-1, 1 - r, c - 1];
    case 'B': return [1 - c, 1 - r, -1];
  }
}

const key = (p, n) => p.join(',') + '|' + n.join(',');
export const FACELETS = [];
const INDEX = new Map();
FACES.forEach((f, fi) => {
  for (let i = 0; i < 9; i++) {
    const p = faceletPos(f, i), n = NORMALS[f];
    FACELETS.push({ p, n, face: f, i });
    INDEX.set(key(p, n), fi * 9 + i);
  }
});
export const idxOf = (p, n) => INDEX.get(key(p, n));

// Gira vetor inteiro q quartos de volta (positivo = anti-horário pela regra da mão direita).
export function rotVec(v, axis, q) {
  q = ((q % 4) + 4) % 4;
  let [x, y, z] = v;
  for (let k = 0; k < q; k++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [x, z] = [z, -x];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

const BASE = {
  R: { axis: 0, layers: [1], q: -1 }, L: { axis: 0, layers: [-1], q: 1 },
  M: { axis: 0, layers: [0], q: 1 }, x: { axis: 0, layers: [-1, 0, 1], q: -1 },
  U: { axis: 1, layers: [1], q: -1 }, D: { axis: 1, layers: [-1], q: 1 },
  E: { axis: 1, layers: [0], q: 1 }, y: { axis: 1, layers: [-1, 0, 1], q: -1 },
  F: { axis: 2, layers: [1], q: -1 }, B: { axis: 2, layers: [-1], q: 1 },
  S: { axis: 2, layers: [0], q: -1 }, z: { axis: 2, layers: [-1, 0, 1], q: -1 },
};

export function parseMove(m) {
  const b = m[0];
  const d = BASE[b];
  if (!d) throw new Error('Movimento inválido: ' + m);
  const mult = m.endsWith('2') ? 2 : m.endsWith("'") ? -1 : 1;
  return { base: b, axis: d.axis, layers: d.layers, q: d.q * mult, mult };
}

// Converte (eixo, camada, sentido) em notação. Usado pelo arraste do mouse.
export function moveFromTurn(axis, layer, q) {
  for (const b of ['R', 'L', 'M', 'U', 'D', 'E', 'F', 'B', 'S']) {
    const d = BASE[b];
    if (d.axis === axis && d.layers.length === 1 && d.layers[0] === layer) {
      return d.q === q ? b : b + "'";
    }
  }
  return null;
}

const PERM = new Map();
function permFor(m) {
  let src = PERM.get(m);
  if (src) return src;
  const mv = parseMove(m);
  src = new Int8Array(54);
  for (let k = 0; k < 54; k++) src[k] = k;
  for (let k = 0; k < 54; k++) {
    const { p, n } = FACELETS[k];
    if (mv.layers.includes(p[mv.axis])) {
      src[idxOf(rotVec(p, mv.axis, mv.q), rotVec(n, mv.axis, mv.q))] = k;
    }
  }
  PERM.set(m, src);
  return src;
}

export const tokens = (s) => (Array.isArray(s) ? s : String(s).trim().split(/\s+/).filter(Boolean));

export function applyMove(state, m) {
  const src = permFor(m);
  const out = new Array(54);
  for (let j = 0; j < 54; j++) out[j] = state[src[j]];
  return out;
}

export function applyMoves(state, seq) {
  for (const m of tokens(seq)) state = applyMove(state, m);
  return state;
}

export function solvedState(scheme = DEFAULT_SCHEME) {
  const s = [];
  for (const f of FACES) for (let i = 0; i < 9; i++) s.push(scheme[f]);
  return s;
}

export function isSolved(s) {
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 9; i++) if (s[f * 9 + i] !== s[f * 9 + 4]) return false;
  }
  return true;
}

export function invertMove(m) {
  if (m.endsWith('2')) return m;
  if (m.endsWith("'")) return m[0];
  return m + "'";
}

const amount = (m) => (m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1);

// Junta movimentos seguidos da mesma face (U U -> U2, R R' -> nada).
export function simplify(moves) {
  const out = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last[0] === m[0]) {
      out.pop();
      const t = (amount(last) + amount(m)) % 4;
      if (t === 1) out.push(m[0]);
      else if (t === 2) out.push(m[0] + '2');
      else if (t === 3) out.push(m[0] + "'");
    } else out.push(m);
  }
  return out;
}

// Embaralhamento estilo competição: sem repetir face nem eixo três vezes.
export function scramble(n = 22) {
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
  const axisOf = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
  const out = [];
  while (out.length < n) {
    const f = faces[Math.floor(Math.random() * 6)];
    const a = out[out.length - 1], b = out[out.length - 2];
    if (a && a[0] === f) continue;
    if (a && b && axisOf[a[0]] === axisOf[f] && axisOf[b[0]] === axisOf[f]) continue;
    out.push(f + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return out;
}

// Descrição em português de cada movimento (para quem está começando).
const DESC = {
  R: ['Direita', 'para cima'], "R'": ['Direita', 'para baixo'],
  L: ['Esquerda', 'para baixo'], "L'": ['Esquerda', 'para cima'],
  U: ['Topo', 'para a esquerda'], "U'": ['Topo', 'para a direita'],
  D: ['Base', 'para a direita'], "D'": ['Base', 'para a esquerda'],
  F: ['Frente', 'no sentido horário'], "F'": ['Frente', 'no sentido anti-horário'],
  B: ['Trás', 'com o topo indo para a esquerda'], "B'": ['Trás', 'com o topo indo para a direita'],
  M: ['Fatia do meio (vertical)', 'para baixo'], "M'": ['Fatia do meio (vertical)', 'para cima'],
  E: ['Fatia do meio (horizontal)', 'para a direita'], "E'": ['Fatia do meio (horizontal)', 'para a esquerda'],
  S: ['Fatia do meio (frontal)', 'no sentido horário'], "S'": ['Fatia do meio (frontal)', 'no sentido anti-horário'],
  x: ['Cubo inteiro', 'para cima (a frente vira o topo)'], "x'": ['Cubo inteiro', 'para baixo (o topo vira a frente)'],
  y: ['Cubo inteiro', 'para a esquerda (a direita vem para a frente)'], "y'": ['Cubo inteiro', 'para a direita (a esquerda vem para a frente)'],
  z: ['Cubo inteiro', 'tombando para a direita'], "z'": ['Cubo inteiro', 'tombando para a esquerda'],
};
const DOUBLE = {
  R: 'Direita', L: 'Esquerda', U: 'Topo', D: 'Base', F: 'Frente', B: 'Trás',
  M: 'Fatia do meio (vertical)', E: 'Fatia do meio (horizontal)', S: 'Fatia do meio (frontal)',
  x: 'Cubo inteiro (para cima)', y: 'Cubo inteiro (para a esquerda)', z: 'Cubo inteiro (tombando)',
};
const FACE_OF_MOVE = { R: 'R', L: 'L', U: 'U', D: 'D', F: 'F', B: 'B' };

export function describeMove(m, state) {
  const base = m[0];
  let face, how;
  if (m.endsWith('2')) {
    face = DOUBLE[base];
    // Leigo entende melhor "duas vezes, uma de cada vez" do que "meia volta".
    how = DESC[base] ? `${DESC[base][1]}, duas vezes (uma de cada vez)` : 'meia volta (180°): gire duas vezes, uma de cada vez';
  }
  else { [face, how] = DESC[m]; }
  let color = null;
  const f = FACE_OF_MOVE[base];
  if (f && state) color = state[FACES.indexOf(f) * 9 + 4];
  const whole = 'xyz'.includes(base);
  return { face, how, color, whole };
}
