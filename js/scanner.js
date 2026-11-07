// Leitor de cores pela câmera: o usuário mostra as 6 faces dentro da grade 3×3
// e cada adesivo é classificado usando os 6 centros (que nunca mudam) como referência.
import { FACES, DEFAULT_SCHEME, COLOR_NAMES } from './cube-core.js';
import { PALETTE } from './cube-view.js';
import { validate } from './solver.js';

const $ = (id) => document.getElementById(id);

// Mesma ordem e mesma orientação da pintura manual (ver FACE_INFO em app.js).
const ORDER = ['F', 'R', 'B', 'L', 'U', 'D'];
// Cada lado é chamado pela cor do centro, que nunca muda de lugar.
const NAMES = { F: 'Lado verde', R: 'Lado laranja', B: 'Lado azul', L: 'Lado vermelho', U: 'Lado amarelo', D: 'Lado branco' };
const TIPS = {
  F: 'Mostre o lado com <b>centro verde</b>, com o centro amarelo em cima',
  R: 'Gire o cubo para a esquerda: <b>centro laranja</b> para a câmera, amarelo em cima',
  B: 'Gire para a esquerda de novo: <b>centro azul</b> para a câmera, amarelo em cima',
  L: 'Mais uma vez para a esquerda: <b>centro vermelho</b> para a câmera, amarelo em cima',
  U: 'Verde virado para você e incline o <b>centro amarelo</b> para a câmera: o verde fica embaixo',
  D: 'Agora o outro lado: <b>centro branco</b> para a câmera, com o verde em cima',
};
// Face vizinha que aparece no mini ícone da dica, e de que lado ela fica.
const EDGE = { F: ['U', 'top'], R: ['U', 'top'], B: ['U', 'top'], L: ['U', 'top'], U: ['F', 'bottom'], D: ['F', 'top'] };
const COLS = ['W', 'Y', 'G', 'B', 'R', 'O'];
// Pares que a luz costuma confundir: não geram aviso de "face errada".
const GROUP = { W: 0, Y: 0, R: 1, O: 1, G: 2, B: 3 };

// ---------------------------------------------------------------- cores
function rgbToLab(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}

// Palpite rápido (sem calibração) — usado na prévia ao vivo e no aviso de face errada.
function guess([r, g, b]) {
  const [h, s] = rgbToHsv(r, g, b);
  if (s < 0.22) return 'W';
  if (h < 14 || h >= 330) return 'R';
  if (h < 42) return 'O';
  if (h < 75) return 'Y';
  if (h < 170) return 'G';
  if (h < 265) return 'B';
  return 'R';
}

const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// Distância em tom (ângulo no plano a*b*) + intensidade (croma), com o brilho pesando pouco:
// a exposição da câmera muda de uma foto para outra, mas o tom quase não muda.
// Pesos escolhidos por simulação (cubos aleatórios com ruído, exposição variável e luz quente).
const dist = (a, b) => {
  const ca = Math.hypot(a[1], a[2]), cb = Math.hypot(b[1], b[2]);
  let dh = Math.abs(Math.atan2(a[2], a[1]) - Math.atan2(b[2], b[1]));
  if (dh > Math.PI) dh = 2 * Math.PI - dh;
  const l = (a[0] - b[0]) * 0.15, c = (ca - cb) * 0.5, h = dh * Math.min(ca, cb);
  return l * l + c * c + h * h;
};

// Classificação balanceada: cada cor aparece exatamente 9 vezes. Começa pelos centros,
// distribui gulosamente, melhora com trocas par a par e recalcula as médias.
function classify(lab) {
  const centerOf = {};
  FACES.forEach((f, fi) => { centerOf[DEFAULT_SCHEME[f]] = fi * 9 + 4; });
  const idx = [...Array(54).keys()].filter((k) => k % 9 !== 4);
  let means = Object.fromEntries(COLS.map((c) => [c, lab[centerOf[c]]]));
  let assign = {};
  for (let it = 0; it < 4; it++) {
    assign = {};
    const cap = Object.fromEntries(COLS.map((c) => [c, 8]));
    const pairs = [];
    for (const k of idx) for (const c of COLS) pairs.push([dist(lab[k], means[c]), k, c]);
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [, k, c] of pairs) if (!assign[k] && cap[c]) { assign[k] = c; cap[c]--; }

    for (let pass = 0, better = true; better && pass < 8; pass++) {
      better = false;
      for (let i = 0; i < idx.length; i++) for (let j = i + 1; j < idx.length; j++) {
        const a = idx[i], b = idx[j], ca = assign[a], cb = assign[b];
        if (ca === cb) continue;
        if (dist(lab[a], means[cb]) + dist(lab[b], means[ca]) < dist(lab[a], means[ca]) + dist(lab[b], means[cb]) - 1e-6) {
          assign[a] = cb; assign[b] = ca; better = true;
        }
      }
    }

    const next = {};
    for (const c of COLS) {
      const members = [lab[centerOf[c]], lab[centerOf[c]], ...idx.filter((k) => assign[k] === c).map((k) => lab[k])];
      next[c] = [0, 1, 2].map((n) => members.reduce((s, m) => s + m[n], 0) / members.length);
    }
    means = next;
  }
  const state = new Array(54);
  FACES.forEach((f, fi) => { state[fi * 9 + 4] = DEFAULT_SCHEME[f]; });
  idx.forEach((k) => { state[k] = assign[k]; });
  return state;
}

const median = (arr) => { arr.sort((a, b) => a - b); return arr[arr.length >> 1]; };

// ---------------------------------------------------------------- interface
export function createScanner({ onApply }) {
  const dlg = $('scan'), video = $('scan-video'), guide = $('scan-guide');
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  let stream = null, raf = 0, lastT = 0, cur = 'F', force = false, shots = {}, result = null;

  guide.innerHTML = '<span><i></i></span>'.repeat(9);
  const dots = [...guide.querySelectorAll('i')];
  $('scan-faces').innerHTML = ORDER.map((f) => `<button data-face="${f}" aria-label="${NAMES[f]}">${'<i></i>'.repeat(9)}</button>`).join('');

  // Lê a área da grade no vídeo (que está com object-fit: cover) e devolve a cor mediana do miolo de cada quadrado.
  function sample(size) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const el = video.getBoundingClientRect(), g = guide.getBoundingClientRect();
    const sc = Math.max(el.width / vw, el.height / vh);
    const ox = el.left + (el.width - vw * sc) / 2, oy = el.top + (el.height - vh * sc) / 2;
    cv.width = cv.height = size;
    ctx.drawImage(video, (g.left - ox) / sc, (g.top - oy) / sc, g.width / sc, g.height / sc, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const cell = size / 3, inner = Math.max(2, Math.round(cell * 0.4)), pad = Math.round((cell - inner) / 2);
    const out = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const R = [], G = [], B = [];
      const x0 = Math.round(c * cell) + pad, y0 = Math.round(r * cell) + pad;
      for (let y = y0; y < y0 + inner; y++) for (let x = x0; x < x0 + inner; x++) {
        const p = (y * size + x) * 4;
        R.push(data[p]); G.push(data[p + 1]); B.push(data[p + 2]);
      }
      out.push([median(R), median(G), median(B)]);
    }
    return out;
  }

  function loop(t = 0) {
    raf = requestAnimationFrame(loop);
    if (t - lastT < 110 || video.readyState < 2) return;
    lastT = t;
    const s = sample(48);
    if (s) s.forEach((rgb, i) => { dots[i].style.background = PALETTE[guess(rgb)]; });
  }

  function msg(text, isError = false) {
    const box = $('scan-msg');
    box.hidden = !text;
    box.innerHTML = text ? `<p>${text}</p>${isError ? '<button class="btn btn-line scan-msg-btn" id="scan-manual">Pintar manualmente</button>' : ''}` : '';
    if (isError) $('scan-manual').onclick = () => dlg.close();
    $('scan-shutter').disabled = !!text;
  }

  function warn(text) {
    $('scan-warn').hidden = !text;
    $('scan-warn').textContent = text;
  }

  async function startCamera() {
    msg('Abrindo a câmera…');
    if (!navigator.mediaDevices?.getUserMedia) {
      msg('Este navegador não liberou a câmera. Abra o site pelo endereço https ou pinte manualmente.', true);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      });
      if (!dlg.open) { stopCamera(); return; }
      video.srcObject = stream;
      await video.play();
      msg('');
      cancelAnimationFrame(raf);
      loop();
    } catch (e) {
      msg(e && e.name === 'NotAllowedError'
        ? 'Sem permissão para usar a câmera. Libere o acesso nas configurações do navegador e tente de novo.'
        : 'Não foi possível abrir a câmera.', true);
    }
  }

  function stopCamera() {
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }

  function render() {
    const n = ORDER.indexOf(cur);
    $('scan-step').textContent = `${n + 1} de 6 · ${NAMES[cur]}`;
    // O quadrado do meio da grade ganha a borda da cor esperada: é por ele que o lado é reconhecido.
    guide.style.setProperty('--center', PALETTE[DEFAULT_SCHEME[cur]]);
    guide.dataset.center = `centro ${COLOR_NAMES[DEFAULT_SCHEME[cur]]}`;
    const [ef, side] = EDGE[cur];
    $('scan-tip').innerHTML =
      `<span class="mini" aria-hidden="true"><span class="mini-f" style="background:${PALETTE[DEFAULT_SCHEME[cur]]}"></span><span class="mini-e is-${side}" style="background:${PALETTE[DEFAULT_SCHEME[ef]]}"></span></span><span>${TIPS[cur]}</span>`;
    [...$('scan-faces').children].forEach((b) => {
      const f = b.dataset.face, shot = shots[f];
      b.classList.toggle('is-cur', f === cur);
      b.classList.toggle('is-done', !!shot);
      [...b.children].forEach((i, k) => {
        i.style.background = shot ? PALETTE[guess(shot.rgb[k])] : k === 4 ? PALETTE[DEFAULT_SCHEME[f]] : '';
      });
    });
  }

  function shoot() {
    if (!stream || video.readyState < 2 || result) return;
    const rgb = sample(150);
    if (!rgb) return;
    const lab = rgb.map((c) => rgbToLab(...c));
    const exp = DEFAULT_SCHEME[cur], got = guess(rgb[4]);
    if (!force) {
      let w = '';
      if (GROUP[got] !== GROUP[exp]) {
        w = `O centro parece ${COLOR_NAMES[got]}, mas agora é a vez do lado com centro ${COLOR_NAMES[exp]}. Toque de novo para usar assim mesmo.`;
      } else {
        const dup = ORDER.find((f) => f !== cur && shots[f] && dE(shots[f].lab[4], lab[4]) < 10);
        if (dup) w = `Parece o mesmo lado que você já mostrou (${NAMES[dup].toLowerCase()}). Toque de novo para usar assim mesmo.`;
      }
      if (w) { warn(w); force = true; return; }
    }
    force = false;
    warn('');
    shots[cur] = { rgb, lab };
    if (navigator.vibrate) navigator.vibrate(25);
    guide.classList.remove('snap'); void guide.offsetWidth; guide.classList.add('snap');
    const next = ORDER.find((f) => !shots[f]);
    if (next) { cur = next; render(); } else finish();
  }

  function finish() {
    render();
    stopCamera();
    const lab = new Array(54);
    ORDER.forEach((f) => { const fi = FACES.indexOf(f); shots[f].lab.forEach((v, i) => { lab[fi * 9 + i] = v; }); });
    result = classify(lab);
    showResult();
  }

  function showResult() {
    const pos = { U: [0, 3], L: [3, 0], F: [3, 3], R: [3, 6], B: [3, 9], D: [6, 3] };
    const cells = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 12; c++) {
      let html = '<b class="gap"></b>';
      for (const [f, [r0, c0]] of Object.entries(pos)) {
        if (r >= r0 && r < r0 + 3 && c >= c0 && c < c0 + 3) {
          html = `<b style="background:${PALETTE[result[FACES.indexOf(f) * 9 + (r - r0) * 3 + (c - c0)]]}"></b>`;
        }
      }
      cells.push(html);
    }
    $('scan-net').innerHTML = cells.join('');
    const ok = validate(result).ok;
    $('scan-r-title').innerHTML = ok ? 'Tudo <em>lido.</em>' : 'Quase <em>lá.</em>';
    $('scan-r-text').textContent = ok
      ? 'Confira se o desenho bate com o seu cubo. Se algum quadradinho estiver diferente, é só corrigir na pintura.'
      : 'Algumas cores foram lidas errado, geralmente por reflexo ou luz amarelada. Corrija tocando nos quadradinhos ou escaneie de novo com luz mais clara.';
    const p = $('scan-primary'), s = $('scan-secondary');
    if (ok) {
      p.textContent = 'Resolver agora'; p.onclick = () => apply(true);
      s.textContent = 'Corrigir cores'; s.onclick = () => apply(false);
    } else {
      p.textContent = 'Corrigir cores'; p.onclick = () => apply(false);
      s.textContent = 'Escanear de novo'; s.onclick = restart;
    }
    $('scan-result').hidden = false;
  }

  function apply(solveNow) {
    const state = result;
    dlg.close();
    onApply(state, solveNow);
  }

  function reset() {
    shots = {}; cur = 'F'; force = false; result = null;
    $('scan-result').hidden = true;
    warn('');
    dots.forEach((d) => { d.style.background = ''; });
    render();
  }

  function restart() { reset(); startCamera(); }

  $('scan-shutter').onclick = shoot;
  $('scan-close').onclick = () => dlg.close();
  $('scan-faces').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || result) return;
    cur = b.dataset.face; force = false; warn(''); render();
  };
  dlg.addEventListener('close', stopCamera);
  dlg.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { if (!result && e.target === dlg) { e.preventDefault(); shoot(); } } });

  return {
    open() { reset(); dlg.showModal(); startCamera(); },
  };
}
