// Cubo 3D procedural (Three.js): corpo de plástico preto com quinas arredondadas,
// adesivos com leve verniz, giro de camadas animado e interação por arraste.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { parseMove, idxOf, moveFromTurn } from './cube-core.js';

export const PALETTE = {
  W: '#ffffff', Y: '#ffe600', G: '#00d060', B: '#0a5fff', R: '#f0102c', O: '#ff7a00', X: '#8b8e94',
};

const AXES = ['x', 'y', 'z'];

// Cursor "girar a vista" (fora do cubo): mãozinha padrão do sistema.
const ORBIT_CURSOR = 'grab';
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function roundedRect(size, radius) {
  const s = size / 2, r = radius;
  const sh = new THREE.Shape();
  sh.moveTo(-s + r, -s);
  sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r);
  sh.lineTo(s, s - r); sh.quadraticCurveTo(s, s, s - r, s);
  sh.lineTo(-s + r, s); sh.quadraticCurveTo(-s, s, -s, s - r);
  sh.lineTo(-s, -s + r); sh.quadraticCurveTo(-s, -s, -s + r, -s);
  return sh;
}

export class CubeView {
  constructor(container) {
    this.container = container;
    this.queue = [];
    this.anim = null;
    this.paintMode = false;
    this.interactive = true;
    this.onTurn = null;     // (move) => void   — usuário girou uma camada
    this.onPaint = null;    // (faceletIndex) => void
    this.theta = 0.62; this.phi = 0.5; this.tTheta = this.theta; this.tPhi = this.phi;
    this.dist = 12.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    const key = new THREE.DirectionalLight(0xfff4e6, 1.9);
    key.position.set(4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0005;
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e0d0, 0.9));
    const rim = new THREE.DirectionalLight(0xdfe8ff, 0.5);
    rim.position.set(-6, 3, -5);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.12 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.35;
    ground.receiveShadow = true;
    scene.add(ground);
    this.ground = ground;

    this.root = new THREE.Group();
    scene.add(this.root);
    this.buildCube();

    this.arrow = null;
    this.raycaster = new THREE.Raycaster();
    this.bindPointer();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);

    this.clock = performance.now();
    renderer.setAnimationLoop(() => this.tick());
  }

  buildCube() {
    const bodyGeo = new RoundedBoxGeometry(0.985, 0.985, 0.985, 4, 0.1);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x0d0d0f, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.5,
      envMapIntensity: 0.7,
    });
    const stickerGeo = new THREE.ExtrudeGeometry(roundedRect(0.84, 0.11), {
      depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 6,
    });
    this.cubies = [];
    this.stickers = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      const home = [x, y, z];
      const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      for (const n of faces) {
        if ((n[0] && n[0] !== x) || (n[1] && n[1] !== y) || (n[2] && n[2] !== z)) continue;
        const mat = new THREE.MeshPhysicalMaterial({
          color: PALETTE.X, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.25, emissive: 0x000000,
          emissiveIntensity: 0.22, envMapIntensity: 0.2,
        });
        const st = new THREE.Mesh(stickerGeo, mat);
        const nv = new THREE.Vector3(...n);
        st.position.copy(nv).multiplyScalar(0.4925);
        st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nv);
        st.userData = { home, normal: n, sticker: true };
        st.receiveShadow = true;
        g.add(st);
        this.stickers.push(st);
      }
      g.userData.home = home;
      this.root.add(g);
      this.cubies.push(g);
    }
  }

  // Redefine todos os cubinhos para a posição inicial e pinta conforme o estado.
  setColors(state) {
    this.queue.length = 0;
    if (this.anim) { this.finishAnim(true); }
    for (const g of this.cubies) {
      g.position.set(...g.userData.home);
      g.quaternion.identity();
    }
    for (const st of this.stickers) {
      const c = state[idxOf(st.userData.home, st.userData.normal)];
      st.material.color.set(PALETTE[c] || PALETTE.X);
      st.material.emissive.set(PALETTE[c] || PALETTE.X);
      st.userData.glow = st.material.emissive.getHex();
    }
    this.hideArrow();
  }

  get busy() { return !!this.anim || this.queue.length > 0; }

  turn(move, duration = 220) {
    return new Promise((resolve) => { this.queue.push({ move, duration, resolve }); });
  }

  clearQueue() {
    for (const q of this.queue) q.resolve(false);
    this.queue.length = 0;
  }

  startAnim(job) {
    const mv = parseMove(job.move);
    const pivot = new THREE.Object3D();
    this.root.add(pivot);
    const axisName = AXES[mv.axis];
    for (const g of this.cubies) {
      if (mv.layers.includes(Math.round(g.position[axisName]))) pivot.attach(g);
    }
    this.anim = { ...job, mv, pivot, axisName, t0: performance.now(), target: (mv.q * Math.PI) / 2 };
  }

  finishAnim(silent = false) {
    const a = this.anim;
    a.pivot.rotation[a.axisName] = a.target;
    a.pivot.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    for (const g of [...a.pivot.children]) {
      this.root.attach(g);
      g.position.set(Math.round(g.position.x), Math.round(g.position.y), Math.round(g.position.z));
      m.makeRotationFromQuaternion(g.quaternion);
      const e = m.elements;
      for (let i = 0; i < 16; i++) e[i] = Math.round(e[i]);
      g.quaternion.setFromRotationMatrix(m);
    }
    this.root.remove(a.pivot);
    this.anim = null;
    if (!silent) a.resolve(true); else a.resolve(false);
  }

  // ---------- Seta indicando o próximo movimento ----------
  showArrow(move, color = '#e3000f') {
    this.hideArrow();
    const mv = parseMove(move);
    const axis = new THREE.Vector3(...[0, 1, 2].map((i) => (i === mv.axis ? 1 : 0)));
    const whole = mv.layers.length === 3;
    const layer = whole ? 0 : mv.layers[0];
    const radius = whole ? 2.55 : 2.2;
    const u = new THREE.Vector3(...[0, 1, 2].map((i) => (i === (mv.axis + 1) % 3 ? 1 : 0)));
    const v = new THREE.Vector3().crossVectors(axis, u);
    const cam = this.camera.position.clone().normalize();
    const mid = Math.atan2(cam.dot(v), cam.dot(u));
    const span = Math.PI * 0.62;
    const dir = Math.sign(mv.q);
    const c0 = axis.clone().multiplyScalar(layer);
    const pt = (t) => c0.clone().add(u.clone().multiplyScalar(Math.cos(t) * radius)).add(v.clone().multiplyScalar(Math.sin(t) * radius));
    const t0 = mid - (span / 2) * dir, t1 = mid + (span / 2) * dir;
    const pts = [];
    for (let i = 0; i <= 40; i++) pts.push(pt(t0 + ((t1 - t0) * i) / 40));
    const curve = new THREE.CatmullRomCurve3(pts);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.35 });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.055, 10, false), mat));
    const end = pt(t1), before = pt(t1 - 0.05 * dir);
    const tangent = end.clone().sub(before).normalize();
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 18), mat);
    head.position.copy(end);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    group.add(head);
    if (Math.abs(mv.q) === 2) {
      const head2 = head.clone();
      const e2 = pt(t1 - 0.32 * dir), b2 = pt(t1 - 0.37 * dir);
      head2.position.copy(e2);
      head2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), e2.clone().sub(b2).normalize());
      group.add(head2);
    }
    this.scene.add(group);
    this.arrow = group;
    this.arrowT = performance.now();
  }

  hideArrow() {
    if (!this.arrow) return;
    this.scene.remove(this.arrow);
    this.arrow.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.arrow = null;
  }

  // ---------- Câmera ----------
  setView(name) {
    const V = {
      home: [0.62, 0.5], F: [0, 0.12], R: [Math.PI / 2, 0.12], B: [Math.PI, 0.12], L: [-Math.PI / 2, 0.12],
      U: [0, 1.32], D: [0, -1.32],
    }[name];
    if (!V) return;
    // Caminho mais curto no ângulo horizontal.
    let t = V[0];
    while (t - this.tTheta > Math.PI) t -= Math.PI * 2;
    while (t - this.tTheta < -Math.PI) t += Math.PI * 2;
    this.tTheta = t; this.tPhi = V[1];
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.dist = w / h < 0.9 ? 15 : 12.5;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    const now = performance.now();
    if (!this.anim && this.queue.length) this.startAnim(this.queue.shift());
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.t0) / a.duration);
      a.pivot.rotation[a.axisName] = a.target * ease(t);
      if (t >= 1) this.finishAnim();
    }
    this.theta += (this.tTheta - this.theta) * 0.14;
    this.phi += (this.tPhi - this.phi) * 0.14;
    const cp = Math.cos(this.phi);
    this.camera.position.set(this.dist * cp * Math.sin(this.theta), this.dist * Math.sin(this.phi), this.dist * cp * Math.cos(this.theta));
    this.camera.lookAt(0, -0.45, 0); // mira abaixo do centro: cubo sobe na tela e libera espaço p/ os textos de baixo
    if (this.arrow) {
      const k = 1 + Math.sin((now - this.arrowT) / 260) * 0.025;
      this.arrow.scale.setScalar(k);
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- Interação ----------
  pick(ev) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.cubies, true);
    return hits[0] || null;
  }

  faceletOf(mesh) {
    // Posição e normal atuais do adesivo dentro do cubo.
    const g = mesh.parent;
    const n = new THREE.Vector3(...mesh.userData.normal).applyQuaternion(g.quaternion);
    const p = [Math.round(g.position.x), Math.round(g.position.y), Math.round(g.position.z)];
    return idxOf(p, [Math.round(n.x), Math.round(n.y), Math.round(n.z)]);
  }

  setHover(mesh) {
    if (this.hovered === mesh) return;
    if (this.hovered) { this.hovered.material.emissive.setHex(this.hovered.userData.glow ?? 0); this.hovered.material.emissiveIntensity = 0.22; }
    this.hovered = mesh;
    if (mesh) { mesh.material.emissive.setHex(0xffffff); mesh.material.emissiveIntensity = 0.25; }
  }

  bindPointer() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.style.cursor = ORBIT_CURSOR;
    let drag = null;
    // Cursor conforme o que está sob o mouse: fora do cubo = mãozinha com setas (girar a vista).
    const updateCursor = (hit) => {
      if (this.paintMode) el.style.cursor = hit ? 'crosshair' : ORBIT_CURSOR;
      else el.style.cursor = hit && this.interactive ? 'grab' : ORBIT_CURSOR;
    };
    el.addEventListener('pointerdown', (ev) => {
      el.setPointerCapture(ev.pointerId);
      const hit = this.pick(ev);
      drag = { x: ev.clientX, y: ev.clientY, hit, mode: null, moved: false };
    });
    el.addEventListener('pointermove', (ev) => {
      if (!drag) {
        if (this.paintMode || ev.pointerType === 'mouse') {
          const hit = this.pick(ev);
          if (this.paintMode) this.setHover(hit && hit.object.userData.sticker ? hit.object : null);
          updateCursor(hit);
        }
        return;
      }
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.mode && Math.hypot(dx, dy) > 8) {
        drag.moved = true;
        drag.mode = drag.hit && !this.paintMode && this.interactive ? 'turn' : 'orbit';
        if (drag.mode === 'turn') el.style.cursor = 'grabbing';
        if (drag.mode === 'turn') this.dragTurn(drag.hit, dx, dy);
        drag.lx = ev.clientX; drag.ly = ev.clientY;
      }
      if (drag.mode === 'orbit') {
        this.tTheta -= (ev.clientX - drag.lx) * 0.008;
        this.tPhi = Math.max(-1.35, Math.min(1.35, this.tPhi + (ev.clientY - drag.ly) * 0.008));
        drag.lx = ev.clientX; drag.ly = ev.clientY;
      }
    });
    const end = (ev) => {
      if (drag && !drag.moved && this.paintMode && drag.hit && drag.hit.object.userData.sticker && this.onPaint) {
        this.onPaint(this.faceletOf(drag.hit.object));
      }
      drag = null;
      if (ev.pointerType === 'mouse') updateCursor(this.pick(ev));
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { drag = null; });
    el.addEventListener('pointerleave', () => this.setHover(null));
  }

  dragTurn(hit, dx, dy) {
    const g = hit.object.parent;
    const cub = [Math.round(g.position.x), Math.round(g.position.y), Math.round(g.position.z)];
    // Normal da face tocada (no espaço do cubo), arredondada para o eixo principal.
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const ai = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    const ni = ai.indexOf(Math.max(...ai));
    const normal = [0, 0, 0]; normal[ni] = Math.sign(n.getComponent(ni));
    if (cub[ni] !== normal[ni]) return; // tocou numa face interna
    // Projeta os dois eixos tangentes na tela e escolhe o mais alinhado com o arraste.
    const p0 = hit.point.clone();
    const s0 = p0.clone().project(this.camera);
    const drag = new THREE.Vector2(dx, -dy).normalize();
    let best = null;
    for (let t = 0; t < 3; t++) {
      if (t === ni) continue;
      const dirV = new THREE.Vector3(); dirV.setComponent(t, 1);
      const s1 = p0.clone().add(dirV).project(this.camera);
      const sv = new THREE.Vector2((s1.x - s0.x) * this.camera.aspect, s1.y - s0.y).normalize();
      const d = sv.dot(drag);
      if (!best || Math.abs(d) > Math.abs(best.d)) best = { t, d };
    }
    const d = [0, 0, 0]; d[best.t] = Math.sign(best.d);
    // Eixo de rotação = normal × direção do arraste.
    const a = [normal[1] * d[2] - normal[2] * d[1], normal[2] * d[0] - normal[0] * d[2], normal[0] * d[1] - normal[1] * d[0]];
    const axis = a.findIndex((v) => v !== 0);
    const move = moveFromTurn(axis, cub[axis], a[axis]);
    if (move && this.onTurn) this.onTurn(move);
  }
}
