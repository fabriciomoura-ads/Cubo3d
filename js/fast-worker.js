// Web Worker: monta as tabelas do solucionador rápido sem travar a tela e responde pedidos.
import { initTables, solveFacelets } from './kociemba.js';

initTables();
self.postMessage({ type: 'ready' });

self.onmessage = (e) => {
  const { id, facelets } = e.data;
  try {
    self.postMessage({ id, moves: solveFacelets(facelets) });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
