// Ponte para o solucionador rápido (Kociemba) que roda num Web Worker.
// As tabelas começam a ser montadas assim que o site abre; os pedidos esperam ficar pronto.
import { FACES } from './cube-core.js';

let worker = null, seq = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./fast-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, moves, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error)); else p.resolve(moves);
  };
  return worker;
}

// Converte cores em letras de face pelos centros atuais (funciona mesmo com o cubo inteiro girado).
function toFacelets(state) {
  const faceOfColor = {};
  FACES.forEach((f, fi) => { faceOfColor[state[fi * 9 + 4]] = f; });
  return state.map((c) => faceOfColor[c]).join('');
}

/** Promessa com a lista de movimentos (~20) que resolve o estado de 54 cores. */
export function fastSolve(state) {
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, facelets: toFacelets(state) });
  });
}

/** Começa a montar as tabelas em segundo plano. */
export function warmUp() {
  try { getWorker(); } catch { /* sem Worker: fastSolve vai falhar e o app usa o método de camadas */ }
}
