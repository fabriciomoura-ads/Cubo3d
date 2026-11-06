// Solucionador pelo método de camadas (o método ensinado para iniciantes).
// Gera etapas com explicação em português, cada uma com seus movimentos.

import { applyMove, applyMoves, tokens, idxOf, FACELETS, isSolved, simplify, COLOR_NAMES } from './cube-core.js';

const V = { U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] };
const HORIZ = [V.F, V.R, V.B, V.L];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const faceName = (n) => Object.keys(V).find((k) => eq(V[k], n));

// Agrupa adesivos por cubinho.
const CUBIES = (() => {
  const map = new Map();
  FACELETS.forEach((f, k) => {
    const id = f.p.join(',');
    if (!map.has(id)) map.set(id, { p: f.p, facelets: [] });
    map.get(id).facelets.push(k);
  });
  return [...map.values()];
})();
export const EDGES = CUBIES.filter((c) => c.facelets.length === 2);
export const CORNERS = CUBIES.filter((c) => c.facelets.length === 3);

const col = (s, p, n) => s[idxOf(p, n)];
const center = (s, n) => col(s, n, n);
const faceOfColor = (s, c) => [V.U, V.D, ...HORIZ].find((n) => center(s, n) === c);
const nm = (c) => COLOR_NAMES[c] || c;

// Encontra a peça que tem exatamente estas cores. Retorna posição e normal de cada cor.
function locate(s, colors) {
  const list = CORNERS.length && colors.length === 3 ? CORNERS : EDGES;
  for (const cub of list) {
    const cs = cub.facelets.map((k) => s[k]);
    if (cs.length === colors.length && colors.every((c) => cs.includes(c))) {
      const normals = {};
      cub.facelets.forEach((k) => { normals[s[k]] = FACELETS[k].n; });
      return { p: cub.p, n: normals };
    }
  }
  return null;
}

export class SolveError extends Error {
  constructor(stage, message) { super(message); this.stage = stage; }
}

export const STAGES = [
  null,
  {
    id: 1, name: 'A margarida',
    goal: 'Quatro arestas brancas em volta do centro amarelo, com o branco para cima.',
    text: 'Começamos sem pressa: vamos juntar as 4 arestas que têm branco (peças de 2 cores) ao redor do centro amarelo, como pétalas de uma flor. O branco de cada pétala precisa olhar para cima. Ainda não importa a outra cor.',
  },
  {
    id: 2, name: 'Cruz branca',
    goal: 'Uma cruz branca embaixo, com cada aresta combinando com o centro do lado.',
    text: 'Agora cada pétala desce para a base. Gire o topo até a cor lateral da pétala ficar acima do centro da mesma cor (forma uma linha vertical de cor igual). Depois gire aquela face 2 vezes: a pétala vai parar embaixo, no lugar certo.',
  },
  {
    id: 3, name: 'Cantos brancos',
    goal: 'A primeira camada inteira pronta (a base branca + uma faixa em volta).',
    text: 'Cada canto branco tem 3 cores. Coloque o canto em cima, logo acima do lugar dele, com esse lugar na frente-direita. Aí é só repetir R U R\' U\' até o canto encaixar com o branco para baixo. Pode precisar de 1, 3 ou 5 repetições — confie no processo!',
  },
  {
    id: 4, name: 'Segunda camada',
    goal: 'As duas camadas de baixo completas.',
    text: 'Procure no topo uma aresta sem amarelo. Gire o topo até a cor da frente dela combinar com o centro (forma um "T" de cabeça para baixo). Se a cor de cima da aresta for igual ao centro da direita, ela vai para a direita; se for igual ao da esquerda, vai para a esquerda. Cada lado tem seu algoritmo.',
  },
  {
    id: 5, name: 'Cruz amarela',
    goal: 'Uma cruz amarela no topo (os cantos ainda não importam).',
    text: 'Olhe só para o topo e ignore os cantos. Você verá um ponto, um "L" ou uma linha de amarelo. Com o formato na posição certa, aplique F R U R\' U\' F\'. Repita até formar a cruz.',
  },
  {
    id: 6, name: 'Arestas amarelas no lugar',
    goal: 'As arestas da cruz amarela combinando com os centros laterais.',
    text: 'Gire o topo e veja quantas arestas da cruz combinam com o centro de baixo delas. Com o algoritmo R U R\' U R U2 R\' a gente troca as arestas de lugar até todas combinarem.',
  },
  {
    id: 7, name: 'Cantos amarelos no lugar',
    goal: 'Cada canto amarelo no seu lugar (mesmo que esteja virado).',
    text: 'Um canto está "no lugar" quando tem as mesmas 3 cores dos centros ao redor dele, mesmo que girado. Segure um canto certo na frente-direita e aplique U R U\' L\' U R\' U\' L até todos estarem no lugar.',
  },
  {
    id: 8, name: 'Girar os cantos amarelos',
    goal: 'Cubo resolvido!',
    text: 'Última etapa! Com o canto a girar na frente-direita do topo, repita R\' D\' R D até o amarelo dele ficar para cima. A base vai parecer bagunçada — é normal, NÃO gire o cubo. Depois gire só o topo (U) para trazer o próximo canto. No final tudo volta ao lugar.',
  },
];

class Recorder {
  constructor(s) { this.s = s.slice(); this.steps = []; this.cur = null; this.stage = 0; }
  step(title, text) {
    this.cur = { stage: this.stage, title, text, moves: [] };
    this.steps.push(this.cur);
    return this.cur;
  }
  mv(seq) {
    for (const m of tokens(seq)) { this.s = applyMove(this.s, m); this.cur.moves.push(m); }
  }
  // Escolhe o menor giro (nada, X, X2, X') de `base` que deixe `pred` verdadeiro.
  setup(base, pred) {
    for (const m of ['', base, base + "'", base + '2']) {
      const t = m ? applyMove(this.s, m) : this.s;
      if (pred(t)) { if (m) this.mv(m); return true; }
    }
    return false;
  }
}

// Busca em profundidade iterativa sobre "macros" (giros de topo e algoritmos).
function macroSearch(s, macros, goal, maxDepth) {
  const path = [];
  function dfs(st, d, last) {
    if (d === 0) return goal(st);
    for (let i = 0; i < macros.length; i++) {
      const mac = macros[i];
      if (last >= 0 && mac.group && mac.group === macros[last].group) continue;
      path.push(i);
      if (dfs(applyMoves(st, mac.moves), d - 1, i)) return true;
      path.pop();
    }
    return false;
  }
  for (let d = 0; d <= maxDepth; d++) {
    path.length = 0;
    if (dfs(s, d, -1)) return path.map((i) => macros[i]);
  }
  return null;
}

const turns = (b, group) => [
  { name: b, moves: [b], group }, { name: b + "'", moves: [b + "'"], group }, { name: b + '2', moves: [b + '2'], group },
];

export function solve(input) {
  const r = new Recorder(input);
  const top = center(r.s, V.U);
  const base = center(r.s, V.D);
  const front0 = center(r.s, V.F);

  const U_EDGES = HORIZ.map((d) => [d[0], 1, d[2]]);
  const daisyCount = (s) => U_EDGES.filter((p) => col(s, p, V.U) === base).length;
  const crossSolved = (s) => HORIZ.every((d) => {
    const p = [d[0], -1, d[2]];
    return col(s, p, V.D) === base && col(s, p, d) === center(s, d);
  });
  const freeAbove = (dir) => r.setup('U', (t) => col(t, [dir[0], 1, dir[2]], V.U) !== base);

  // ---------- 1. Margarida ----------
  if (!crossSolved(r.s)) {
    r.stage = 1;
    let guard = 0;
    while (daisyCount(r.s) < 4) {
      if (++guard > 12) throw new SolveError(1, 'Não foi possível montar a margarida.');
      const whites = EDGES.map((e) => e.facelets.map((k) => r.s[k])).filter((cs) => cs.includes(base));
      const pending = whites.find((cs) => {
        const other = cs.find((c) => c !== base);
        const L = locate(r.s, [base, other]);
        return !(L.p[1] === 1 && L.n[base][1] === 1);
      });
      const other = pending.find((c) => c !== base);
      r.step(`Pétala ${nm(base)} e ${nm(other)}`,
        `Leve a aresta ${nm(base)}-${nm(other)} para o topo, com o ${nm(base)} virado para cima, sem tirar as pétalas que já estão lá.`);
      for (let k = 0; k < 6; k++) {
        const L = locate(r.s, [base, other]);
        const nw = L.n[base], no = L.n[other];
        if (L.p[1] === 1 && nw[1] === 1) break;
        if (L.p[1] === -1) {
          const side = [L.p[0], 0, L.p[2]];
          freeAbove(side);
          r.mv(nw[1] === -1 ? faceName(side) + '2' : faceName(side));
        } else if (L.p[1] === 0) {
          freeAbove(no);
          const f = faceName(no);
          const t = applyMove(r.s, f);
          r.mv(locate(t, [base, other]).p[1] === 1 ? f : f + "'");
        } else {
          r.mv(faceName(nw));
        }
      }
    }

    // ---------- 2. Cruz ----------
    r.stage = 2;
    for (let k = 0; k < 4; k++) {
      const p = U_EDGES.find((q) => col(r.s, q, V.U) === base);
      if (!p) break;
      const other = col(r.s, p, [p[0], 0, p[2]]);
      r.step(`Descer ${nm(base)} e ${nm(other)}`,
        `Gire o topo até o ${nm(other)} da pétala ficar em cima do centro ${nm(other)}. Depois gire essa face duas vezes.`);
      r.setup('U', (t) => {
        const L = locate(t, [base, other]);
        return eq(L.n[other], faceOfColor(t, other));
      });
      r.mv(faceName(faceOfColor(r.s, other)) + '2');
    }
    if (!crossSolved(r.s)) throw new SolveError(2, 'A cruz não fechou.');
  }

  // ---------- 3. Cantos brancos ----------
  r.stage = 3;
  const whiteCorners = CORNERS.map((c) => c.facelets.map((k) => r.s[k])).filter((cs) => cs.includes(base));
  const slotOf = (s, cs) => {
    const [a, b] = cs.filter((c) => c !== base).map((c) => faceOfColor(s, c));
    return [a[0] + b[0], -1, a[2] + b[2]];
  };
  const cornerOk = (s, cs) => {
    const L = locate(s, cs);
    if (!eq(L.p, slotOf(s, cs)) || L.n[base][1] !== -1) return false;
    return cs.every((c) => center(s, L.n[c]) === c);
  };
  const FRD = [1, -1, 1], FRU = [1, 1, 1];
  let guard = 0;
  while (true) {
    const pending = whiteCorners.filter((cs) => !cornerOk(r.s, cs));
    if (!pending.length) break;
    if (++guard > 16) throw new SolveError(3, 'Um canto branco não encaixou.');
    const cs = pending.find((c) => locate(r.s, c).p[1] === 1) || pending[0];
    const [a, b] = cs.filter((c) => c !== base);
    const label = `Canto ${nm(base)}, ${nm(a)} e ${nm(b)}`;
    let L = locate(r.s, cs);
    if (L.p[1] === -1 && !eq(L.p, slotOf(r.s, cs))) {
      r.step(label, 'Este canto está embaixo, no lugar errado. Gire o cubo para ele ficar na frente-direita e aplique R U R\' U\' uma vez para soltá-lo para o topo.');
      r.setup('y', (t) => eq(locate(t, cs).p, FRD));
      r.mv("R U R' U'");
    }
    r.step(label, `Gire o cubo inteiro até o lugar deste canto (entre os centros ${nm(a)} e ${nm(b)}) ficar na frente-direita, embaixo.`);
    r.setup('y', (t) => eq(slotOf(t, cs), FRD));
    L = locate(r.s, cs);
    if (L.p[1] === 1) {
      r.step(label, 'Gire o topo até o canto ficar bem em cima do lugar dele (frente-direita, em cima).');
      r.setup('U', (t) => eq(locate(t, cs).p, FRU));
    }
    const st = r.step(label, '');
    let n = 0;
    while (!cornerOk(r.s, cs)) {
      if (++n > 6) throw new SolveError(3, 'Canto branco girado de forma impossível.');
      r.mv("R U R' U'");
    }
    st.text = `Repita R U R' U' ${n === 1 ? 'uma vez' : n + ' vezes'} até o canto encaixar com o ${nm(base)} para baixo.`;
    st.repeat = { alg: "R U R' U'", times: n };
  }

  // ---------- 4. Segunda camada ----------
  r.stage = 4;
  const mids = EDGES.map((e) => e.facelets.map((k) => r.s[k])).filter((cs) => !cs.includes(base) && !cs.includes(top));
  const edgeOk = (s, cs) => {
    const L = locate(s, cs);
    return L.p[1] === 0 && cs.every((c) => center(s, L.n[c]) === c);
  };
  const RIGHT = "U R U' R' U' F' U F", LEFT = "U' L' U L U F U' F'";
  guard = 0;
  while (true) {
    const pending = mids.filter((cs) => !edgeOk(r.s, cs));
    if (!pending.length) break;
    if (++guard > 16) throw new SolveError(4, 'Uma aresta do meio não encaixou.');
    const cs = pending.find((c) => locate(r.s, c).p[1] === 1);
    if (cs) {
      const L = locate(r.s, cs);
      const S = cs.find((c) => L.n[c][1] === 0); // cor lateral
      const T = cs.find((c) => c !== S); // cor de cima
      const label = `Aresta ${nm(S)} e ${nm(T)}`;
      r.step(label, `Gire o topo até o ${nm(S)} da aresta ficar em cima do centro ${nm(S)}, formando um "T" invertido.`);
      r.setup('U', (t) => { const l = locate(t, cs); return center(t, l.n[S]) === S; });
      r.step(label, `Gire o cubo inteiro para deixar o centro ${nm(S)} de frente para você.`);
      r.setup('y', (t) => eq(locate(t, cs).p, [0, 1, 1]));
      const toRight = center(r.s, V.R) === T;
      r.step(label, toRight
        ? `A cor de cima (${nm(T)}) é igual ao centro da DIREITA: a aresta vai para a direita. Aplique o algoritmo da direita.`
        : `A cor de cima (${nm(T)}) é igual ao centro da ESQUERDA: a aresta vai para a esquerda. Aplique o algoritmo da esquerda.`);
      r.mv(toRight ? RIGHT : LEFT);
    } else {
      const e = pending[0];
      r.step('Soltar aresta presa', `A aresta ${nm(e[0])}-${nm(e[1])} está no meio, mas no lugar errado (ou invertida). Gire o cubo para ela ficar na frente-direita e aplique o algoritmo da direita para soltá-la para o topo.`);
      r.setup('y', (t) => eq(locate(t, e).p, [1, 0, 1]));
      r.mv(RIGHT);
    }
  }

  // ---------- 5. Cruz amarela ----------
  r.stage = 5;
  const topEdgesUp = (s) => U_EDGES.filter((p) => col(s, p, V.U) === top);
  const shape = (s) => {
    const up = topEdgesUp(s);
    if (up.length === 0) return 'ponto';
    if (up.length === 4) return 'cruz';
    if (up.length === 2) return up[0][0] === -up[1][0] && up[0][2] === -up[1][2] ? 'linha' : 'L';
    return '?';
  };
  const OLL1 = "F R U R' U' F'";
  const crossPlan = macroSearch(r.s, [...turns('U', 'u'), { name: 'alg', moves: tokens(OLL1) }], (s) => topEdgesUp(s).length === 4, 6);
  if (!crossPlan) throw new SolveError(5, 'Cruz amarela impossível.');
  for (const mac of crossPlan) {
    if (mac.name === 'alg') {
      const sh = shape(r.s);
      const msg = sh === 'ponto'
        ? 'Você tem só o ponto amarelo no centro. Aplique F R U R\' U\' F\' (depois vai virar um "L" ou uma linha).'
        : sh === 'L'
          ? 'Você tem um "L" amarelo. Com ele na posição mostrada, aplique F R U R\' U\' F\'.'
          : 'Você tem uma linha amarela. Deixe-a deitada (da esquerda para a direita) e aplique F R U R\' U\' F\'.';
      r.step(`Formato: ${sh}`, msg);
    } else {
      r.step('Posicione o topo', 'Gire o topo para deixar o desenho amarelo na posição certa antes do algoritmo.');
    }
    r.mv(mac.moves);
  }

  // ---------- 6. Arestas amarelas ----------
  r.stage = 6;
  const edgesMatched = (s) => topEdgesUp(s).length === 4 && HORIZ.every((d) => col(s, [d[0], 1, d[2]], d) === center(s, d));
  const SUNE = "R U R' U R U2 R'";
  const plan6 = macroSearch(r.s, [...turns('U', 'u'), { name: 'alg', moves: tokens(SUNE) }], edgesMatched, 9);
  if (!plan6) throw new SolveError(6, 'Arestas amarelas impossíveis de posicionar.');
  for (const mac of plan6) {
    if (mac.name === 'alg') r.step('Trocar arestas', `Aplique R U R' U R U2 R'. Ele troca arestas do topo de lugar sem estragar o resto.`);
    else r.step('Gire o topo', 'Gire o topo para posicionar as arestas (compare cada aresta com o centro logo abaixo dela).');
    r.mv(mac.moves);
  }

  // ---------- 7. Posicionar cantos ----------
  r.stage = 7;
  const U_CORNERS = [[1, 1, 1], [-1, 1, 1], [1, 1, -1], [-1, 1, -1]];
  const cornerPlaced = (s, p) => {
    const want = [top, center(s, [p[0], 0, 0]), center(s, [0, 0, p[2]])];
    const cub = CORNERS.find((c) => eq(c.p, p));
    const have = cub.facelets.map((k) => s[k]);
    return want.every((c) => have.includes(c));
  };
  const cornersPlaced = (s) => edgesMatched(s) && U_CORNERS.every((p) => cornerPlaced(s, p));
  const NIKLAS = "U R U' L' U R' U' L";
  const plan7 = macroSearch(r.s, [...turns('y', 'y'), { name: 'alg', moves: tokens(NIKLAS) }], cornersPlaced, 5);
  if (!plan7) throw new SolveError(7, 'Cantos amarelos impossíveis de posicionar.');
  for (const mac of plan7) {
    if (mac.name === 'alg') r.step('Trocar cantos', 'Aplique U R U\' L\' U R\' U\' L. O canto da frente-direita fica parado e os outros três trocam de lugar.');
    else r.step('Gire o cubo', 'Gire o cubo inteiro (mantendo o amarelo em cima) para deixar o canto que já está no lugar na frente-direita.');
    r.mv(mac.moves);
  }

  // ---------- 8. Orientar cantos ----------
  r.stage = 8;
  const allUp = (s) => U_CORNERS.every((p) => col(s, p, V.U) === top);
  guard = 0;
  while (!allUp(r.s)) {
    if (++guard > 8) throw new SolveError(8, 'Canto girado impossível.');
    r.step('Próximo canto', 'Gire SÓ o topo até um canto com o amarelo virado para o lado ficar na frente-direita (em cima). Não gire o cubo inteiro!');
    r.setup('U', (t) => col(t, FRU, V.U) !== top);
    const st = r.step('Girar o canto', '');
    let n = 0;
    while (col(r.s, FRU, V.U) !== top) {
      if (++n > 5) throw new SolveError(8, 'Canto girado impossível.');
      r.mv("R' D' R D");
    }
    st.text = `Repita R' D' R D ${n} vezes até o amarelo deste canto ficar para cima. A base vai se bagunçar — é normal, ela se arruma sozinha no fim.`;
    st.repeat = { alg: "R' D' R D", times: n };
  }
  r.step('Último giro', 'Gire o topo até todas as cores combinarem.');
  r.setup('U', isSolved);
  if (!isSolved(r.s)) throw new SolveError(8, 'Um canto está girado (isso não acontece num cubo montado de fábrica).');
  r.step('Volte à posição inicial', `Gire o cubo inteiro para o ${nm(front0)} voltar para a frente.`);
  r.setup('y', (t) => center(t, V.F) === front0);

  const steps = r.steps.filter((s) => s.moves.length).map((s) => (s.repeat ? s : { ...s, moves: simplify(s.moves) })).filter((s) => s.moves.length);
  return { steps, final: r.s };
}

// Confere se a pintura faz sentido como um cubo real.
export function validate(s) {
  const errors = [];
  const missing = s.filter((c) => c === 'X').length;
  if (missing) return { ok: false, errors: [`Faltam ${missing} quadradinho${missing > 1 ? 's' : ''} para pintar.`] };
  const counts = {};
  s.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  for (const [c, n] of Object.entries(counts)) {
    if (n !== 9) errors.push(`A cor ${nm(c)} aparece ${n} vezes — deveria aparecer 9.`);
  }
  const centers = [V.U, V.R, V.F, V.D, V.L, V.B].map((n) => center(s, n));
  if (new Set(centers).size !== 6) errors.push('Os 6 centros precisam ter cores diferentes.');
  if (errors.length) return { ok: false, errors };

  const dirOf = (c) => faceOfColor(s, c);
  const describe = (p) => {
    const parts = [];
    if (p[1] === 1) parts.push('topo'); if (p[1] === -1) parts.push('base');
    if (p[2] === 1) parts.push('frente'); if (p[2] === -1) parts.push('trás');
    if (p[0] === 1) parts.push('direita'); if (p[0] === -1) parts.push('esquerda');
    return parts.join('-');
  };
  const seen = new Set();
  for (const e of EDGES) {
    const cs = e.facelets.map((k) => s[k]);
    const [a, b] = cs.map(dirOf);
    if (cs[0] === cs[1] || eq(a, b.map((v) => -v))) {
      errors.push(`A aresta ${describe(e.p)} tem ${nm(cs[0])} e ${nm(cs[1])} — essa peça não existe.`);
    } else {
      const k = [...cs].sort().join('');
      if (seen.has(k)) errors.push(`Existem duas arestas ${nm(cs[0])}-${nm(cs[1])}.`);
      seen.add(k);
    }
  }
  for (const c of CORNERS) {
    const cs = c.facelets.map((k) => s[k]);
    const ds = cs.map(dirOf);
    const axes = ds.map((d) => d.findIndex((v) => v !== 0));
    if (new Set(axes).size !== 3) {
      errors.push(`O canto ${describe(c.p)} tem ${cs.map(nm).join(', ')} — esse canto não existe.`);
      continue;
    }
    const k = [...cs].sort().join('');
    if (seen.has(k)) errors.push(`Existem dois cantos ${cs.map(nm).join('-')}.`);
    seen.add(k);
    // Quiralidade: a ordem das cores em volta do canto precisa ser a mesma do cubo montado.
    const ns = c.facelets.map((k2) => FACELETS[k2].n);
    const triple = (a, b, cc) => a[0] * (b[1] * cc[2] - b[2] * cc[1]) - a[1] * (b[0] * cc[2] - b[2] * cc[0]) + a[2] * (b[0] * cc[1] - b[1] * cc[0]);
    if (Math.sign(triple(...ns)) !== Math.sign(triple(...ds))) {
      errors.push(`No canto ${describe(c.p)} duas cores parecem trocadas entre si.`);
    }
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 4) };
  return { ok: true, errors: [] };
}

export const STAGE_FAIL_HINT = {
  1: 'Confira as arestas brancas.',
  2: 'Confira as arestas brancas.',
  3: 'Confira os cantos brancos.',
  4: 'Confira as arestas do meio.',
  5: 'Parece que uma aresta foi pintada invertida (as duas cores trocadas).',
  6: 'Parece que duas peças foram pintadas trocadas.',
  7: 'Parece que duas peças foram pintadas trocadas de lugar.',
  8: 'Parece que um canto foi pintado girado (cores na ordem errada).',
};
