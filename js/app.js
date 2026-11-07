import {
  solvedState, applyMove, applyMoves, isSolved, scramble, invertMove, describeMove,
  COLOR_NAMES, FACES, DEFAULT_SCHEME,
} from './cube-core.js';
import { solve, validate, SolveError, STAGES, STAGE_FAIL_HINT } from './solver.js';
import { CubeView, PALETTE } from './cube-view.js';
import { createScanner } from './scanner.js';
import { fastSolve, warmUp } from './fast.js';

warmUp(); // monta as tabelas do solucionador rápido em segundo plano

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const view = new CubeView($('stage'));

let mode = 'play';

// =====================================================================
// MODO BRINCAR
// =====================================================================
const play = { state: solvedState(), count: 0, history: [], solving: false, token: 0 };
view.setColors(play.state);

const speedPlay = () => +$('speed-play').value;

function playRender() {
  $('move-count').textContent = play.count;
  const pill = $('state-pill');
  pill.className = 'state-pill';
  if (play.solving) { pill.textContent = 'resolvendo'; pill.classList.add('solving'); }
  else if (isSolved(play.state)) pill.textContent = 'montado';
  else { pill.textContent = 'embaralhado'; pill.classList.add('mixed'); }
  const last = play.history.slice(-28);
  $('seq').innerHTML = last.map((m, i) => `<span class="${i === last.length - 1 ? 'last' : ''}">${m}</span>`).join('');
  $('btn-scramble').disabled = play.solving;
  $('btn-solve').disabled = play.solving || isSolved(play.state);
}

function playMove(m, duration = speedPlay()) {
  play.state = applyMove(play.state, m);
  play.count++;
  play.history.push(m);
  playRender();
  return view.turn(m, duration);
}

view.onTurn = (m) => {
  if (mode !== 'play' || play.solving) return;
  playMove(m);
};

$('btn-scramble').onclick = async () => {
  if (play.solving) return;
  const seq = scramble(22);
  for (const m of seq) playMove(m, Math.min(speedPlay(), 140));
};

$('btn-solve').onclick = async () => {
  if (play.solving || isSolved(play.state)) return;
  play.solving = true;
  const token = ++play.token;
  view.interactive = false;
  playRender();
  const badge = $('stage-badge');
  badge.hidden = false;
  badge.textContent = 'Calculando…';
  // Solução rápida (~20 movimentos); se o solucionador rápido falhar, usa o método de camadas.
  let plan;
  try {
    const mv = await fastSolve(play.state);
    plan = [{ label: `Solução rápida · ${mv.length} movimentos`, moves: mv }];
  } catch (e) {
    console.warn(e);
    try {
      plan = solve(play.state).steps.map((step) => {
        const st = STAGES[step.stage];
        return { label: st ? `Etapa ${st.id} de 8 · ${st.name}` : 'Ajuste final', moves: step.moves };
      });
    } catch (e2) { console.error(e2); plan = []; }
  }
  if (token !== play.token) return;
  for (const step of plan) {
    badge.textContent = step.label;
    for (const m of step.moves) {
      if (token !== play.token) return;
      await playMove(m, Math.max(70, speedPlay() * 0.55));
    }
  }
  badge.textContent = 'Resolvido';
  play.solving = false;
  view.interactive = true;
  playRender();
  setTimeout(() => { if (!play.solving) badge.hidden = true; }, 2200);
};

$('btn-reset').onclick = () => {
  play.token++;
  view.clearQueue();
  play.state = solvedState();
  play.count = 0; play.history = []; play.solving = false;
  view.interactive = true;
  view.setColors(play.state);
  $('stage-badge').hidden = true;
  playRender();
};

// =====================================================================
// MODO APRENDER — fase 1: pintar
// =====================================================================
const COLORS = ['W', 'Y', 'G', 'B', 'R', 'O'];
const FACE_ORDER = ['F', 'R', 'B', 'L', 'U', 'D'];
const FACE_INFO = {
  F: ['Lado verde', 'Olhe o lado com o centro verde, com o centro amarelo em cima. Pinte exatamente como você vê.'],
  R: ['Lado laranja', 'Vire o cubo para a esquerda até o centro laranja ficar virado para você (amarelo continua em cima). Pinte como você vê.'],
  B: ['Lado azul', 'Dê meia volta no cubo até o centro azul ficar virado para você (amarelo continua em cima). Pinte como você vê.'],
  L: ['Lado vermelho', 'Vire o cubo para a direita até o centro vermelho ficar virado para você (amarelo continua em cima). Pinte como você vê.'],
  U: ['Lado amarelo', 'Com o centro verde virado para você, incline o topo amarelo na sua direção. A fileira de baixo do desenho é a que encosta no lado verde.'],
  D: ['Lado branco', 'Com o centro verde virado para você, incline o cubo para ver a base branca. A fileira de cima do desenho é a que encosta no lado verde.'],
};
// Nome curto para as abas: só a cor do centro.
const tabName = (f) => FACE_INFO[f][0].replace('Lado ', '').replace(/^./, (c) => c.toUpperCase());
const fIndex = (f) => FACES.indexOf(f);

const paint = { state: null, face: 'F', color: 'W' };
function blankPaint() {
  const s = new Array(54).fill('X');
  FACES.forEach((f, fi) => { s[fi * 9 + 4] = DEFAULT_SCHEME[f]; });
  return s;
}
paint.state = blankPaint();
try {
  const saved = JSON.parse(localStorage.getItem('cubo.paint') || 'null');
  if (Array.isArray(saved) && saved.length === 54) paint.state = saved;
} catch { /* sem armazenamento */ }
const savePaint = () => { try { localStorage.setItem('cubo.paint', JSON.stringify(paint.state)); } catch { /* ignore */ } };

const isDark = (c) => ['G', 'B', 'R', 'X'].includes(c);

function buildPaintUI() {
  $('face-tabs').innerHTML = FACE_ORDER.map((f) =>
    `<button data-face="${f}"><i style="background:${PALETTE[DEFAULT_SCHEME[f]]}"></i>${tabName(f)}</button>`).join('');
  $('face-tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) selectFace(b.dataset.face); };

  $('palette').innerHTML = COLORS.map((c, i) =>
    `<button class="swatch" data-color="${c}" title="${COLOR_NAMES[c]} (tecla ${i + 1})"><i style="background:${PALETTE[c]}"></i><span>0/9</span></button>`).join('');
  $('palette').onclick = (e) => { const b = e.target.closest('button'); if (b) { paint.color = b.dataset.color; paintRender(); } };

  $('face-grid').innerHTML = Array.from({ length: 9 }, (_, i) => `<button class="cell" data-i="${i}" aria-label="quadrado ${i + 1}"></button>`).join('');
  $('face-grid').onclick = (e) => {
    const b = e.target.closest('.cell'); if (!b) return;
    setFacelet(fIndex(paint.face) * 9 + +b.dataset.i);
  };

  // Planificação: U em cima, L F R B no meio, D embaixo.
  const pos = { U: [0, 3], L: [3, 0], F: [3, 3], R: [3, 6], B: [3, 9], D: [6, 3] };
  const cells = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 12; c++) {
    let html = '<b class="gap"></b>';
    for (const [f, [r0, c0]] of Object.entries(pos)) {
      if (r >= r0 && r < r0 + 3 && c >= c0 && c < c0 + 3) {
        const k = fIndex(f) * 9 + (r - r0) * 3 + (c - c0);
        html = `<b data-k="${k}" data-face="${f}"></b>`;
      }
    }
    cells.push(html);
  }
  $('net').innerHTML = cells.join('');
  $('net').onclick = (e) => {
    const b = e.target.closest('b[data-k]'); if (!b) return;
    selectFace(b.dataset.face);
    setFacelet(+b.dataset.k);
  };
}

function setFacelet(k) {
  if (k % 9 === 4) return; // centros fixos
  paint.state[k] = paint.state[k] === paint.color ? 'X' : paint.color;
  savePaint();
  $('paint-errors').hidden = true;
  view.setColors(paint.state);
  paintRender();
}

function selectFace(f) {
  paint.face = f;
  view.setView(f);
  paintRender();
}

function paintRender() {
  const s = paint.state;
  const fi = fIndex(paint.face);
  [...$('face-tabs').children].forEach((b) => {
    const f = b.dataset.face, i0 = fIndex(f) * 9;
    b.classList.toggle('is-on', f === paint.face);
    b.classList.toggle('full', s.slice(i0, i0 + 9).every((c) => c !== 'X'));
  });
  [...$('face-grid').children].forEach((b, i) => {
    const c = s[fi * 9 + i];
    b.style.background = PALETTE[c];
    b.classList.toggle('empty', c === 'X');
    b.classList.toggle('center', i === 4);
    b.classList.toggle('dark', isDark(c));
  });
  $('face-title').textContent = FACE_INFO[paint.face][0];
  $('face-how').textContent = FACE_INFO[paint.face][1];
  const counts = {};
  s.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  [...$('palette').children].forEach((b) => {
    const c = b.dataset.color, n = counts[c] || 0;
    b.classList.toggle('is-on', c === paint.color);
    b.classList.toggle('done', n === 9);
    b.classList.toggle('over', n > 9);
    b.querySelector('span').textContent = `${n}/9`;
  });
  [...$('net').querySelectorAll('b[data-k]')].forEach((b) => {
    b.style.background = PALETTE[s[+b.dataset.k]];
    b.classList.toggle('cur', b.dataset.face === paint.face);
  });
}

view.onPaint = (k) => {
  if (mode !== 'learn' || learn.phase !== 'paint') return;
  paint.face = FACES[Math.floor(k / 9)];
  setFacelet(k);
};

$('btn-clear').onclick = () => { paint.state = blankPaint(); savePaint(); view.setColors(paint.state); $('paint-errors').hidden = true; paintRender(); };
$('btn-demo').onclick = () => {
  paint.state = applyMoves(solvedState(), scramble(25));
  savePaint(); view.setColors(paint.state); $('paint-errors').hidden = true; paintRender();
};

// Escanear pela câmera: o resultado entra na pintura (dá para corrigir) ou vai direto para a solução.
const scanner = createScanner({
  onApply(state, solveNow) {
    paint.state = state;
    savePaint();
    $('paint-errors').hidden = true;
    view.setColors(paint.state);
    selectFace('F');
    if (solveNow) $('btn-check').click();
  },
});
$('btn-scan').onclick = () => scanner.open();

function showErrors(title, list) {
  const box = $('paint-errors');
  box.hidden = false;
  box.innerHTML = `<strong>${title}</strong>${list.length ? '<ul>' + list.map((e) => `<li>${e}</li>`).join('') + '</ul>' : ''}`;
}

$('btn-check').onclick = async () => {
  const btn = $('btn-check');
  if (btn.disabled) return;
  const v = validate(paint.state);
  if (!v.ok) { showErrors('Tem algo estranho na pintura:', v.errors); return; }
  if (isSolved(paint.state)) { showErrors('Seu cubo já está resolvido!', []); return; }
  // O método de camadas também serve de conferência: ele aponta em que etapa a pintura é impossível.
  let result;
  try {
    result = solve(paint.state);
  } catch (e) {
    if (e instanceof SolveError) {
      showErrors('Esse cubo não pode existir do jeito que foi pintado.', [STAGE_FAIL_HINT[e.stage] || e.message, 'Confira com calma face por face — um único adesivo trocado já impede a solução.']);
    } else { console.error(e); showErrors('Erro inesperado.', [String(e.message || e)]); }
    return;
  }
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Calculando…';
  let fast = null;
  try { fast = await fastSolve(paint.state); } catch (e) { console.warn(e); }
  btn.disabled = false;
  btn.textContent = label;
  startLesson(result, fast);
};

// =====================================================================
// MODO APRENDER — fase 2: resolver passo a passo
// =====================================================================
const learn = { phase: 'paint', initial: null, cur: null, steps: [], flat: [], pos: 0, auto: false };
// Barra lateral: 0 (embaixo) = bem devagar, 100 (em cima) = rápido. Devolve a duração do giro em ms.
const speedLearn = () => 2200 - +$('speed-learn').value * 19.5;

// Solução rápida em partes de 5 movimentos, para o usuário ter pontos de parada.
const FAST_PART = 5;
function fastSteps(moves) {
  const n = Math.ceil(moves.length / FAST_PART);
  return Array.from({ length: n }, (_, i) => ({
    stage: 'fast',
    title: `Parte ${i + 1} de ${n}`,
    text: 'Faça um movimento de cada vez, seguindo a seta no cubo da tela.',
    moves: moves.slice(i * FAST_PART, (i + 1) * FAST_PART),
  }));
}
const fastStage = () => ({
  name: 'Solução rápida',
  goal: `Montar o seu cubo em só ${learn.flat.length} movimentos.`,
  text: 'Este é um caminho curto calculado pelo computador. Os movimentos parecem aleatórios, mas confie: copie um por vez e, no último, o cubo fica montado.',
});

function startLesson(result, fastMoves) {
  learn.initial = paint.state.slice();
  learn.methods = { fast: fastMoves && fastMoves.length ? fastSteps(fastMoves) : null, learn: result.steps };
  learn.method = learn.methods.fast ? 'fast' : 'learn';
  setPhase('solve');
  view.setView('home');
  loadMethod();
}

// Troca entre "Rápido" e "Passo a passo"; recomeça do cubo embaralhado.
function loadMethod() {
  const count = (k) => (learn.methods[k] || []).reduce((s, st) => s + st.moves.length, 0);
  learn.steps = learn.methods[learn.method];
  learn.flat = [];
  learn.steps.forEach((st, si) => st.moves.forEach((m, mi) => learn.flat.push({ m, si, mi })));
  learn.pos = 0;
  learn.auto = false;
  learn.cur = learn.initial.slice();
  view.clearQueue();
  view.setColors(learn.cur);

  $('method').hidden = !learn.methods.fast;
  [...$('method').children].forEach((b) => {
    b.classList.toggle('is-on', b.dataset.method === learn.method);
    b.querySelector('small').textContent = `${count(b.dataset.method)} mov.`;
  });

  const isLearn = learn.method === 'learn';
  $('stage-list').hidden = !isLearn;
  $('done-text').textContent = isLearn
    ? 'Se o cubo na sua mão está igual ao da tela, parabéns: você acabou de resolver um cubo mágico. Na próxima vez, tente lembrar das etapas: são só 8, e os algoritmos se repetem.'
    : 'Se o cubo na sua mão está igual ao da tela, parabéns: está montado! Quer aprender a fazer sozinho? Escolha "Passo a passo" lá em cima.';
  if (isLearn) {
    const present = new Set(learn.steps.map((s) => s.stage));
    $('stage-list').innerHTML = STAGES.slice(1).map((st) =>
      `<button data-stage="${st.id}" class="${present.has(st.id) ? '' : 'skip'}" title="${st.name}"><div class="fill"></div><span>${st.id}</span></button>`).join('');
    $('stage-list').onclick = (e) => {
      const b = e.target.closest('button'); if (!b || view.busy) return;
      const i = learn.flat.findIndex((f) => learn.steps[f.si].stage === +b.dataset.stage);
      if (i >= 0) jumpTo(i);
    };
  }
  startIntro();
  lessonRender();
}

// Sai da fase resolver: some com aviso e brilho sem redesenhar a lição.
function cancelIntro() {
  learn.intro = false;
  clearTimeout(learn.introTimer);
  hideToast();
  view.stopFlash();
}

$('method').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || b.dataset.method === learn.method || view.busy) return;
  learn.method = b.dataset.method;
  loadMethod();
};

function jumpTo(i) {
  learn.auto = false;
  learn.pos = i;
  learn.cur = applyMoves(learn.initial, learn.flat.slice(0, i).map((f) => f.m));
  view.setColors(learn.cur);
  lessonRender();
}

function lessonRender() {
  const { flat, pos, steps } = learn;
  const finished = pos >= flat.length;
  const item = flat[Math.min(pos, flat.length - 1)];
  const step = steps[item.si];
  const isFast = step.stage === 'fast';
  const stage = isFast ? fastStage() : STAGES[step.stage];

  // etapas (só no passo a passo)
  if (!isFast) [...$('stage-list').children].forEach((b) => {
    const id = +b.dataset.stage;
    const idxs = flat.map((f, i) => (steps[f.si].stage === id ? i : -1)).filter((i) => i >= 0);
    const doneN = idxs.filter((i) => i < pos).length;
    b.classList.toggle('done', idxs.length > 0 && doneN === idxs.length);
    b.classList.toggle('cur', !finished && id === stage.id);
    b.querySelector('.fill').style.width = idxs.length ? `${(doneN / idxs.length) * 100}%` : '0';
  });

  $('lesson-num').textContent = isFast ? `${flat.length} movimentos` : `Etapa ${stage.id} de 8`;
  $('lesson-title').innerHTML = stage.name.replace(/(\S+)$/, '<em>$1</em>');
  $('lesson-goal').textContent = stage.goal;
  $('lesson-text').textContent = stage.text;

  $('step-title').textContent = step.title;
  $('step-text').textContent = step.text;
  $('step-moves').innerHTML = step.moves.map((m, i) => {
    const cls = finished || i < item.mi ? 'done' : i === item.mi ? 'cur' : '';
    return `<span class="${cls}">${m}</span>`;
  }).join('') + (step.repeat ? `<span style="background:none;border:0">= ${step.repeat.times}× ${step.repeat.alg}</span>` : '');

  if (finished) {
    $('now-key').textContent = '✓';
    $('now-face').textContent = 'Cubo resolvido';
    $('now-how').textContent = 'Todas as faces com uma cor só.';
    view.hideArrow();
  } else {
    const d = describeMove(item.m, learn.cur);
    $('now-key').textContent = item.m;
    $('now-face').innerHTML = d.face + (d.color ? `<i style="background:${PALETTE[d.color]}" title="centro ${COLOR_NAMES[d.color]}"></i>` : '');
    $('now-how').textContent = d.how.charAt(0).toUpperCase() + d.how.slice(1) + (d.color ? ` · face do centro ${COLOR_NAMES[d.color]}` : '') + '.';
    if (!view.busy && !learn.intro) view.showArrow(item.m);
  }
  $('counter').textContent = `${Math.min(pos, flat.length)} / ${flat.length} movimentos`;
  $('bar').style.width = `${(pos / flat.length) * 100}%`;
  $('btn-prev').disabled = pos === 0;
  $('btn-next').disabled = finished || !!learn.intro;
  $('btn-auto').disabled = finished || !!learn.intro;
  $('btn-next').textContent = finished ? 'Pronto!' : 'Fiz este movimento →';
  $('done').hidden = !finished;
  $('phases').children[1].classList.toggle('is-done', finished);
  setAutoIcon();
}

// ---------- Avisos didáticos: centros piscando + texto sobre o cubo ----------
const isRotation = (m) => 'xyz'.includes(m[0]);
const chip = (c) => `<i style="background:${PALETTE[c]}"></i>`;
let toastTimer = 0;
function showToast(html, ms) {
  const t = $('stage-toast');
  clearTimeout(toastTimer);
  t.innerHTML = html;
  t.hidden = false;
  toastTimer = setTimeout(hideToast, ms);
}
function hideToast() {
  clearTimeout(toastTimer);
  $('stage-toast').hidden = true;
}
// Mostra como segurar o cubo: pisca o centro de cima e o da frente e explica em texto.
function showOrientation(title, ms) {
  const up = learn.cur[4], front = learn.cur[2 * 9 + 4];
  view.flashCenters(['U', 'F'], ms);
  showToast(
    `<strong>${title}</strong>` +
    `<span>${chip(up)} Centro <b>${COLOR_NAMES[up]}</b> para cima</span>` +
    `<span>${chip(front)} Centro <b>${COLOR_NAMES[front]}</b> virado para você</span>`, ms);
}
const INTRO_MS = 3400;
function startIntro() {
  learn.intro = true;
  showOrientation('Segure o seu cubo assim', INTRO_MS);
  clearTimeout(learn.introTimer);
  learn.introTimer = setTimeout(endIntro, INTRO_MS);
}
function endIntro() {
  if (!learn.intro) return;
  learn.intro = false;
  clearTimeout(learn.introTimer);
  hideToast();
  view.stopFlash();
  lessonRender();
}
$('stage-toast').onclick = () => { if (learn.intro) endIntro(); else hideToast(); };

// Pausa no meio dos giros duplos (R2, y2…) para o leigo ver que são dois giros.
const SPLIT = () => ({ split: true, pause: Math.max(450, speedLearn() * 0.45) });

async function next() {
  if (learn.intro || view.busy || learn.pos >= learn.flat.length) return false;
  const m = learn.flat[learn.pos].m;
  view.hideArrow();
  hideToast();
  const p = view.turn(m, speedLearn(), SPLIT());
  learn.cur = applyMove(learn.cur, m);
  learn.pos++;
  await p;
  if (isRotation(m) && mode === 'learn') showOrientation('Você girou o cubo inteiro. Agora:', 3000);
  lessonRender();
  return true;
}

async function prev() {
  if (learn.intro || view.busy || learn.pos === 0) return;
  learn.auto = false;
  const m = invertMove(learn.flat[learn.pos - 1].m);
  view.hideArrow();
  hideToast();
  const p = view.turn(m, speedLearn(), SPLIT());
  learn.cur = applyMove(learn.cur, m);
  learn.pos--;
  await p;
  if (isRotation(m) && mode === 'learn') showOrientation('Cubo inteiro de volta. Agora:', 3000);
  lessonRender();
}

async function autoplay() {
  learn.auto = !learn.auto;
  setAutoIcon();
  while (learn.auto && learn.pos < learn.flat.length && mode === 'learn') {
    const prevStep = learn.flat[learn.pos].si;
    await sleep(speedLearn() * 0.5);
    if (!learn.auto) break;
    const done = learn.flat[learn.pos] && learn.flat[learn.pos].m;
    await next();
    // depois de girar o cubo inteiro, tempo para ver os centros piscando
    if (done && isRotation(done)) await sleep(2600);
    // pausa maior ao trocar de passo, para dar tempo de ler
    if (learn.pos < learn.flat.length && learn.flat[learn.pos].si !== prevStep) await sleep(900);
  }
  learn.auto = false;
  setAutoIcon();
}

function setAutoIcon() {
  $('btn-auto').innerHTML = learn.auto
    ? '<svg viewBox="0 0 24 24" class="ic-play"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24" class="ic-play"><path d="M8 5v14l11-7z"/></svg>';
}

$('btn-next').onclick = () => { learn.auto = false; next(); };
$('btn-prev').onclick = prev;
$('btn-auto').onclick = autoplay;
$('btn-edit').onclick = () => { learn.auto = false; setPhase('paint'); };

function setPhase(ph) {
  learn.phase = ph;
  $('phase-paint').hidden = ph !== 'paint';
  $('phase-solve').hidden = ph !== 'solve';
  const [p1, p2] = $('phases').children;
  p1.classList.toggle('is-on', ph === 'paint');
  p1.classList.toggle('is-done', ph === 'solve');
  p2.classList.toggle('is-on', ph === 'solve');
  if (ph === 'paint') cancelIntro();
  view.paintMode = ph === 'paint';
  view.interactive = false;
  $('speed-rail').hidden = ph !== 'solve';
  view.hideArrow();
  if (ph === 'paint') {
    view.setColors(paint.state);
    view.setView(paint.face);
    paintRender();
    $('stage-hint').textContent = 'Clique num quadradinho (aqui ou no painel) para pintar com a cor escolhida';
  } else {
    $('stage-hint').textContent = 'Faça no seu cubo o movimento indicado pela seta · arraste o fundo para ver de outro ângulo';
  }
}

// =====================================================================
// Troca de modo, teclado, diálogo
// =====================================================================
function setMode(m) {
  if (m === mode) return;
  mode = m;
  learn.auto = false;
  cancelIntro();
  play.token++;
  if (play.solving) { play.solving = false; }
  view.clearQueue();
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-on', t.dataset.mode === m));
  $('panel-play').hidden = m !== 'play';
  $('panel-learn').hidden = m !== 'learn';
  $('view-pad').hidden = m !== 'learn';
  $('speed-rail').hidden = true;
  $('stage-badge').hidden = true;
  if (m === 'play') {
    view.paintMode = false;
    view.interactive = true;
    view.setColors(play.state);
    view.setView('home');
    $('stage-hint').textContent = 'Arraste uma face para girar a camada · arraste o fundo para ver de outro ângulo';
    playRender();
  } else {
    if (learn.phase === 'solve') { view.setColors(learn.cur); view.setView('home'); setPhase('solve'); lessonRender(); }
    else setPhase('paint');
  }
}
document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => setMode(t.dataset.mode); });
document.querySelectorAll('#view-pad button').forEach((b) => { b.onclick = () => view.setView(b.dataset.view); });
$('btn-notation').onclick = () => $('notation').showModal();

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
  if (mode === 'play') {
    if (play.solving) return;
    const k = e.key.toLowerCase();
    const map = { r: 'R', l: 'L', u: 'U', d: 'D', f: 'F', b: 'B', m: 'M', e: 'E', s: 'S', x: 'x', y: 'y', z: 'z' };
    if (map[k]) { e.preventDefault(); playMove(map[k] + (e.shiftKey ? "'" : '')); }
  } else if (learn.phase === 'paint') {
    const n = +e.key;
    if (n >= 1 && n <= 6) { paint.color = COLORS[n - 1]; paintRender(); }
  } else {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); learn.auto = false; next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  }
});

buildPaintUI();
playRender();
