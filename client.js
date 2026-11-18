// =====================================================================
//  client.js  -  Cliente del juego (three.js): escena, controles, interfaz, red
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  CROPS, MUTS, MUT_EMOJI, mutMult, WEATHER, EVENTS, EGGS, PETS, GEAR, RARITY, RAR, NPCS, NPC_RANGE, GRID, CELL, MAX_PLAYERS, MAX_EQUIPPED,
  plotInfo, cellWorld, worldToCell, fruitValue, stageOf, WORLD_RADIUS, priceOf,
} from './gamecore.js';

const CFG = window.GAME_CONFIG || {};
const YAW = +CFG.AVATAR_YAW_OFFSET || 0;
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('es-AR');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const COARSE = matchMedia('(pointer: coarse)').matches;
const QUALITY = store.get('jardin_q', COARSE ? 'low' : 'high');
const LOW = QUALITY === 'low';
let SESSION = null; try { SESSION = JSON.parse(store.get('jardin_session', 'null')); } catch {}

const AVATARS = [
  { id: 'farmer', label: 'Granjero', e: '🧑‍🌾' }, { id: 'farmerwoman', label: 'Granjera', e: '👩‍🌾' },
  { id: 'grandma', label: 'Abuela', e: '👵' }, { id: 'grandpa', label: 'Abuelo', e: '👴' },
  { id: 'rancher', label: 'Ranchero', e: '🤠' }, { id: 'shepherd', label: 'Pastor', e: '🧔' },
  { id: 'milkmaid', label: 'Lechera', e: '👱‍♀️' }, { id: 'beekeeper', label: 'Apicultor', e: '🐝' },
  { id: 'farmkid', label: 'Peque', e: '🧒' },
];
const PET_H = { hen: 0.8, duck: 0.7, sheep: 1.1, pig: 0.9, cow: 1.6, horse: 2.1, sheepdog: 1.0 };
const NPC_EMOJI = { seed: '🌱', gear: '🔧', egg: '🥚', sell: '💰' };
const PIXEL = new Set(['farmer', 'farmerwoman', 'grandma', 'grandpa', 'rancher', 'shepherd', 'milkmaid', 'beekeeper', 'gardener', 'farmkid', 'hen', 'duck', 'sheep', 'pig', 'cow', 'horse', 'sheepdog', 'farmhouse', 'windmill', 'well', 'mailbox', 'haybale', 'trough', 'wheelbarrow', 'appletree']);

// =====================================================================
//  Renderer / escena
// =====================================================================
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW ? 1.25 : 2));
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x8fd3ff);
scene.background = SKY.clone();
scene.fog = new THREE.Fog(0x8fd3ff, 70, 250);
const camera = new THREE.PerspectiveCamera(66, 9 / 16, 0.1, 500);
const hemi = new THREE.HemisphereLight(0xffffff, 0x77995a, 0.95); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0cc, 1.7); sun.position.set(50, 90, 30); scene.add(sun); scene.add(sun.target);
if (!LOW) {
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 220; sun.shadow.bias = -0.0006;
}
// El juego es SIEMPRE vertical (9:16). En pantallas más anchas se centra una "ventana de celular".
function layout() {
  const W = innerWidth, H = innerHeight; let w = W; const h = H;
  if (W / H > 9 / 16) w = Math.floor(H * 9 / 16);
  const app = $('app'); app.style.width = w + 'px'; app.style.height = h + 'px';
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  $('rotate').classList.toggle('hidden', !(COARSE && W > H));
}
addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 150)); layout();

// =====================================================================
//  Assets (models.pack = todos los .glb juntos)
// =====================================================================
const models = {};
async function loadPack(onProgress) {
  const res = await fetch('models.pack');
  if (!res.ok) throw new Error('models.pack ' + res.status);
  const total = +res.headers.get('content-length') || 8549978;
  let buf;
  if (res.body && res.body.getReader) {
    const rd = res.body.getReader(); const parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress(Math.min(0.9, got / total * 0.9)); }
    const all = new Uint8Array(got); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; } buf = all.buffer;
  } else buf = await res.arrayBuffer();
  const hl = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const base = 4 + hl; const loader = new GLTFLoader();
  const entries = Object.entries(header.files); let done = 0;
  await Promise.all(entries.map(([name, [o, l]]) => new Promise((ok) => {
    loader.parse(buf.slice(base + o, base + o + l), '', (g) => {
      if (PIXEL.has(name)) g.scene.traverse((m) => { if (m.material) [].concat(m.material).forEach((mt) => { if (mt.map) { mt.map.magFilter = THREE.NearestFilter; mt.map.minFilter = THREE.NearestFilter; mt.map.generateMipmaps = false; mt.map.needsUpdate = true; } }); });
      models[name] = g; onProgress(0.9 + 0.1 * (++done / entries.length)); ok();
    }, (e) => { console.warn('modelo falló', name, e); ok(); });
  })));
}
function fallbackObj(color = 0xcc8844) { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color })); m.position.y = 0.5; g.add(m); return g; }
function inst(name, color) {
  const g = models[name];
  if (!g) return { obj: fallbackObj(color), clips: [] };
  return { obj: SkeletonUtils.clone(g.scene), clips: g.animations || [] };
}
// Escala el modelo a una altura (h) o ancho (w) y lo apoya en y=0, centrado
function fitModel(obj, o = {}) {
  const wrap = new THREE.Group(); wrap.add(obj); obj.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3());
  const s = o.h ? o.h / (size.y || 1) : o.w ? o.w / (Math.max(size.x, size.z) || 1) : 1;
  obj.scale.multiplyScalar(s); obj.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(obj);
  obj.position.x -= (box.min.x + box.max.x) / 2; obj.position.z -= (box.min.z + box.max.z) / 2; obj.position.y -= box.min.y;
  return wrap;
}
function shadows(o, on = true) { if (LOW) return; o.traverse((m) => { if (m.isMesh) { m.castShadow = on; m.receiveShadow = true; } }); }
function placeModel(name, x, z, o = {}) {
  const a = inst(name, o.color); const w = fitModel(a.obj, o);
  w.position.set(x, 0, z); w.rotation.y = o.rot || 0; shadows(w); scene.add(w); return w;
}

// etapas de cultivo: cropProto[k][0..3]
const cropProto = {};
function buildCropProtos() {
  for (const k in CROPS) {
    const g = models[k]; if (!g) continue;
    const nodes = [];
    g.scene.children.forEach((o) => { const m = /Stage(\d)/.exec(o.name); if (m && !/Cobs|Basket/i.test(o.name)) nodes[+m[1] - 1] = o; });
    if (nodes.filter(Boolean).length < 4) continue;
    const clones = nodes.map((n) => { const c = n.clone(true); c.position.set(0, 0, 0); c.updateMatrixWorld(true); return c; });
    const h4 = new THREE.Box3().setFromObject(clones[3]).getSize(new THREE.Vector3()).y || 1;
    const s = CROPS[k].size / h4;
    cropProto[k] = clones.map((c) => {
      const w = new THREE.Group(); w.add(c); c.scale.multiplyScalar(s); c.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(c); c.position.x -= (b.min.x + b.max.x) / 2; c.position.z -= (b.min.z + b.max.z) / 2; c.position.y -= b.min.y; return w;
    });
  }
}

// =====================================================================
//  Utilidades 3D
// =====================================================================
function makeLabel(text, o = {}) {
  const fs = o.fs || 44, pad = 14;
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  ctx.font = `800 ${fs}px sans-serif`; const w = Math.ceil(ctx.measureText(text).width) + pad * 2; const h = fs + pad;
  c.width = w; c.height = h; ctx.font = `800 ${fs}px sans-serif`;
  ctx.fillStyle = o.bg || 'rgba(0,0,0,.5)';
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(0, 0, w, h, 16); ctx.fill(); } else ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = o.color || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: o.depthTest !== false }));
  const hh = o.h || 0.7; spr.scale.set(hh * w / h, hh, 1); spr.renderOrder = 5; spr.userData.dispose = () => { tex.dispose(); spr.material.dispose(); };
  return spr;
}
function disposeLabel(s) { if (s && s.userData.dispose) s.userData.dispose(); }
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); } return t;
}
function tint(obj, hex, intensity) {
  const col = new THREE.Color(hex);
  obj.traverse((m) => { if (m.isMesh && m.material) { m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone(); [].concat(m.material).forEach((mt) => { if (mt.emissive) { mt.emissive.copy(col); mt.emissiveIntensity = intensity || 0.45; } }); } });
}

// =====================================================================
//  Mundo: suelo, hub, parcelas, decoración
// =====================================================================
const world3d = new THREE.Group(); scene.add(world3d);
{
  const grass = canvasTex(128, (g, s) => {
    g.fillStyle = '#6fbf4a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(60,140,40,.35)' : 'rgba(150,220,90,.3)'; g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2 + Math.random() * 3); }
  }, 90);
  grass.magFilter = THREE.NearestFilter;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 48), new THREE.MeshLambertMaterial({ map: grass }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world3d.add(ground);
  // plaza central
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(30, 56), new THREE.MeshLambertMaterial({ color: 0xcfae78 })); dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.02; world3d.add(dirt);
  const stone = new THREE.Mesh(new THREE.RingGeometry(4.5, 6.2, 40), new THREE.MeshLambertMaterial({ color: 0xbfb9a9 })); stone.rotation.x = -Math.PI / 2; stone.position.y = 0.04; world3d.add(stone);
  // caminos hacia el anillo de parcelas
  const pathMat = new THREE.MeshLambertMaterial({ color: 0xcfae78 });
  for (let i = 0; i < MAX_PLAYERS; i++) { const q = plotInfo(i); const a = Math.atan2(q.x, q.z); const geo = new THREE.PlaneGeometry(6, 28); geo.rotateX(-Math.PI / 2); const p = new THREE.Mesh(geo, pathMat); p.rotation.y = a; p.position.set(Math.sin(a) * 28, 0.015, Math.cos(a) * 28); world3d.add(p); }
}
// Parcelas -------------------------------------------------------------
const plotViews = [];      // i -> { group, plants (Group), views: Map(cell->{group,key}), sign, owner, mine }
const plotData = [];       // i -> Map(cell -> plant)
const soilTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#7a4e2b'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 500; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(60,30,10,.35)' : 'rgba(150,100,60,.3)'; g.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
  g.strokeStyle = 'rgba(40,20,5,.55)'; g.lineWidth = 2; const c = s / GRID;
  for (let i = 0; i <= GRID; i++) { g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c, s); g.stroke(); g.beginPath(); g.moveTo(0, i * c); g.lineTo(s, i * c); g.stroke(); }
});
const PS = GRID * CELL / 2; // 8
const railGeo = new THREE.BoxGeometry(1, 0.22, 0.2), postGeo = new THREE.BoxGeometry(0.34, 1.25, 0.34);
const fMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const NR = 10, NP = 17;
const rails = new THREE.InstancedMesh(railGeo, fMat, MAX_PLAYERS * NR), posts = new THREE.InstancedMesh(postGeo, fMat, MAX_PLAYERS * NP);
rails.frustumCulled = false; posts.frustumCulled = false; world3d.add(rails, posts);
const WOOD = new THREE.Color(0x8a5a2f), MINE = new THREE.Color(0x58d04a), FREE = new THREE.Color(0xa99a82);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function buildFence(i) {
  const p = plotInfo(i), c = Math.cos(p.rot), sn = Math.sin(p.rot), H = PS + 0.3;
  const put = (mesh, idx, lx, ly, lz, sx, rotExtra) => {
    _v.set(p.x + lx * c + lz * sn, ly, p.z - lx * sn + lz * c);
    _q.setFromAxisAngle(_up, p.rot); if (rotExtra) { _q2.setFromAxisAngle(_up, rotExtra); _q.multiply(_q2); }
    _s.set(sx, 1, 1); _m.compose(_v, _q, _s); mesh.setMatrixAt(idx, _m);
  };
  let r = i * NR, k = i * NP;
  for (const y of [0.45, 0.9]) {
    put(rails, r++, 0, y, -H, H * 2); put(rails, r++, -H, y, 0, H * 2, Math.PI / 2); put(rails, r++, H, y, 0, H * 2, Math.PI / 2);
    put(rails, r++, -(H + 2) / 2, y, H, H - 2); put(rails, r++, (H + 2) / 2, y, H, H - 2);
  }
  for (const x of [-H, -H / 2, 0, H / 2, H]) put(posts, k++, x, 0.62, -H, 1);
  for (const z of [-H / 2, 0, H / 2]) { put(posts, k++, -H, 0.62, z, 1); put(posts, k++, H, 0.62, z, 1); }
  for (const x of [-H, -H / 2, -2, 2, H / 2, H]) put(posts, k++, x, 0.62, H, 1);
}
function colorFence(i, col) { for (let j = 0; j < NR; j++) rails.setColorAt(i * NR + j, col); for (let j = 0; j < NP; j++) posts.setColorAt(i * NP + j, col); rails.instanceColor.needsUpdate = true; posts.instanceColor.needsUpdate = true; }
for (let i = 0; i < MAX_PLAYERS; i++) {
  const p = plotInfo(i);
  const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = p.rot; world3d.add(g);
  const soil = new THREE.Mesh(new THREE.PlaneGeometry(PS * 2, PS * 2), new THREE.MeshLambertMaterial({ map: soilTex })); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.04; soil.receiveShadow = true; g.add(soil);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshLambertMaterial({ color: 0xcfae78 })); front.rotation.x = -Math.PI / 2; front.position.set(0, 0.03, PS + 2.8); g.add(front);
  const plants = new THREE.Group(); g.add(plants);
  buildFence(i);
  const sign = makeLabel('Libre', { bg: 'rgba(110,90,60,.8)', h: 1.1, fs: 52 }); sign.position.set(0, 3.2, PS + 0.8); g.add(sign);
  plotViews[i] = { group: g, plants, views: new Map(), sign, owner: null, mine: false, cx: p.x, cz: p.z };
  plotData[i] = new Map();
}
rails.instanceMatrix.needsUpdate = true; posts.instanceMatrix.needsUpdate = true;
for (let i = 0; i < MAX_PLAYERS; i++) colorFence(i, FREE);
function setPlotOwner(i, name, mine) {
  const v = plotViews[i]; if (!v) return;
  v.group.remove(v.sign); disposeLabel(v.sign);
  v.sign = makeLabel(name ? (mine ? '⭐ ' + name : name) : 'Libre', { bg: name ? (mine ? 'rgba(40,130,40,.9)' : 'rgba(80,50,20,.85)') : 'rgba(110,90,60,.7)', h: 1.1, fs: 52 });
  v.sign.position.set(0, 3.2, PS + 0.8); v.group.add(v.sign); v.owner = name; v.mine = !!mine;
  colorFence(i, name ? (mine ? MINE : WOOD) : FREE);
}

// Decoración ------------------------------------------------------------
function ringAt(deg, r) { const a = deg * Math.PI / 180; return [Math.sin(a) * r, Math.cos(a) * r, a]; }
function buildDecor() {
  const D = (name, deg, r, o) => { const [x, z, a] = ringAt(deg, r); placeModel(name, x, z, { rot: a + Math.PI, ...o }); };
  D('barn', 20, 108, { h: 14 }); D('silo', 40, 106, { h: 17 }); D('farmhouse', 95, 108, { h: 11 }); D('windmill', 150, 112, { h: 20 });
  D('greenhouse', 205, 106, { h: 8 }); D('pond', 255, 100, { w: 16 }); D('barn', 300, 112, { h: 13 }); D('farmhouse', 335, 108, { h: 10 });
  placeModel('well', 0, 0, { h: 3.4, rot: 0 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; placeModel('haybale', Math.sin(a) * 25, Math.cos(a) * 25, { h: 1.3, rot: a }); }
  placeModel('mailbox', -4, 8, { h: 1.6 });
  // árboles alrededor del borde del mundo
  const types = []; const ft = models.fruittrees;
  if (ft) ['Tree_Cherry', 'Tree_Lemon', 'Tree_Orange', 'Tree_Peach'].forEach((n) => { const o = ft.scene.getObjectByName(n); if (o) types.push(o); });
  const n = LOW ? 70 : 130;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 128 + Math.random() * 90, x = Math.sin(a) * r, z = Math.cos(a) * r;
    let obj;
    if (types.length && Math.random() < 0.5) { const c = types[Math.floor(Math.random() * types.length)].clone(true); c.position.set(0, 0, 0); obj = c; }
    else obj = inst('appletree', 0x3a8a3a).obj;
    const w = fitModel(obj, { h: 6 + Math.random() * 5 }); w.position.set(x, 0, z); w.rotation.y = Math.random() * 6.28; scene.add(w);
  }
  // nubes
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false });
  for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), cm); c.scale.set(14 + Math.random() * 14, 3 + Math.random() * 2, 8 + Math.random() * 6); const a = Math.random() * 6.28, r = 40 + Math.random() * 220; c.position.set(Math.sin(a) * r, 75 + Math.random() * 25, Math.cos(a) * r); c.userData.cloud = true; scene.add(c); clouds.push(c); }
}
const clouds = [];

// NPCs --------------------------------------------------------------------
const npcGroups = []; const npcMixers = [];
function buildNPCs() {
  for (const [key, n] of Object.entries(NPCS)) {
    const root = new THREE.Group(); root.position.set(n.x, 0, n.z); root.rotation.y = n.rot; scene.add(root);
    const a = inst(n.model, 0xdd9955); const body = fitModel(a.obj, { h: 2.0 }); body.position.z = -1.4; root.add(body); shadows(body);
    if (a.clips.length) { const mx = new THREE.AnimationMixer(a.obj); const act = mx.clipAction(a.clips[0]); act.play(); act.timeScale = n.model === 'gardener' ? 1 : 0.3; npcMixers.push(mx); }
    const stallProps = { seed: [['seedshop', { w: 6.2 }, 0, -1.4]], gear: [['tools', { w: 3.2 }, 2.8, -1.8], ['pump', { h: 2.6 }, -3, -1.6]], egg: [['haybale', { h: 1.3 }, -2.8, -1.6], ['trough', { w: 2.6 }, 3, -1.2]], sell: [['crates', { w: 5.2 }, 3.8, -1.2]] }[key] || [];
    for (const [nm, o, lx, lz] of stallProps) { const w = fitModel(inst(nm, 0xaa7744).obj, o); w.position.set(lx, 0, lz); shadows(w); root.add(w); }
    const t1 = makeLabel(`${NPC_EMOJI[key]} ${n.name}`, { h: 0.9, fs: 56, bg: 'rgba(30,90,30,.85)', depthTest: false }); t1.position.set(0, 3.6, -1.4); root.add(t1);
    const t2 = makeLabel(n.title, { h: 0.6, fs: 40, depthTest: false }); t2.position.set(0, 2.85, -1.4); root.add(t2);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.1, 32), new THREE.MeshBasicMaterial({ color: 0xffd23a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.07, 1.6); root.add(ring);
    root.userData.pick = { type: 'npc', key }; npcGroups.push(root);
  }
}

// Clima ---------------------------------------------------------------------
const rainGeo = new THREE.BufferGeometry(); const RN = 700; const rp = new Float32Array(RN * 6);
for (let i = 0; i < RN; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; rp.set([x, y, z, x, y - 1.1, z], i * 6); }
rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.6, fog: false })); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
const snowGeo = new THREE.BufferGeometry(); const SN = 500; const sp = new Float32Array(SN * 3);
for (let i = 0; i < SN; i++) sp.set([(Math.random() - 0.5) * 60, Math.random() * 30, (Math.random() - 0.5) * 60], i * 3);
snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9, fog: false })); snow.frustumCulled = false; snow.visible = false; scene.add(snow);
const rainbowArc = new THREE.Group(); rainbowArc.visible = false; scene.add(rainbowArc);
['#ff4d4d', '#ff9a3c', '#ffe14a', '#5ad65a', '#4aa8ff', '#8a5aff'].forEach((c, i) => { const t = new THREE.Mesh(new THREE.TorusGeometry(70 - i * 2.2, 1.1, 6, 40, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, fog: false })); rainbowArc.add(t); });
rainbowArc.position.set(0, -2, -150);
const WX_LOOK = { null: { sky: 0x8fd3ff, hemi: 0.95, sun: 1.7, sunC: 0xfff0cc, fogN: 70, fogF: 250 }, sunny: { sky: 0x7fd0ff, hemi: 1.1, sun: 2.1, sunC: 0xffe39a, fogN: 90, fogF: 300 }, rainbow: { sky: 0x9ad9ff, hemi: 1.0, sun: 1.8, sunC: 0xfff0e0, fogN: 80, fogF: 280 }, rain: { sky: 0x7d8fa0, hemi: 0.65, sun: 0.7, sunC: 0xcfd8e0, fogN: 30, fogF: 150 }, thunder: { sky: 0x4d5663, hemi: 0.5, sun: 0.4, sunC: 0xb8c4dd, fogN: 20, fogF: 120 }, frost: { sky: 0xc9e6f5, hemi: 0.95, sun: 1.2, sunC: 0xdff3ff, fogN: 25, fogF: 140 } };
let weather = { k: null, until: 0 }; let flash = 0, nextFlash = 3;
function applyWeather() { const k = weather.k; rain.visible = k === 'rain' || k === 'thunder'; snow.visible = k === 'frost'; rainbowArc.visible = k === 'rainbow' || ev.k === 'rainbowgarden'; sfx.ambient(k); }

// =====================================================================
//  Estado del juego
// =====================================================================
let me = null, myId = null, myPlot = -1, stock = { seed: {}, gear: {}, egg: {}, next: 0 };
let srvT0 = 0, perf0 = 0; const srvNow = () => srvT0 + (performance.now() / 1000 - perf0);
const players = new Map(); let self = null;
let inGame = false, net = { send() {}, mode: '' }, sel = { type: 'can' }, openShopKey = null;
const tweens = [], fx = [];

// ---------- Jugadores ----------
function addPlayer(p) {
  if (players.has(p.id)) return players.get(p.id);
  const a = inst(AVATARS.some((x) => x.id === p.avatar) ? p.avatar : 'farmer', 0xdd9955);
  const body = fitModel(a.obj, { h: 2.0 }); shadows(body);
  const root = new THREE.Group(); root.add(body); root.position.set(p.x, 0, p.z); scene.add(root);
  const label = makeLabel((p.owner ? '👑 ' : '') + p.name, { h: 0.62, fs: 42, depthTest: false }); label.position.y = 2.75; root.add(label);
  let mixer = null, action = null;
  if (a.clips.length) { mixer = new THREE.AnimationMixer(a.obj); action = mixer.clipAction(a.clips[0]); action.play(); action.timeScale = 0; mixer.update(0); }
  const pl = { id: p.id, name: p.name, owner: !!p.owner, plot: p.plot, root, body, label, mixer, action, tx: p.x, tz: p.z, ry: p.ry || 0, mv: 0, moving: false, sh: p.sh || 0, pets: [], petKey: '' };
  body.rotation.y = pl.ry + YAW; players.set(p.id, pl); setPets(pl, p.pets || []); return pl;
}
function removePlayer(id) {
  const pl = players.get(id); if (!pl) return;
  scene.remove(pl.root); disposeLabel(pl.label); pl.pets.forEach((p) => scene.remove(p.root)); players.delete(id);
}
function setPets(pl, names) {
  const key = names.join(','); if (key === pl.petKey) return; pl.petKey = key;
  pl.pets.forEach((p) => scene.remove(p.root)); pl.pets = [];
  names.forEach((nm, i) => {
    if (!nm) return; const a = inst(nm, 0xeeeeee); const body = fitModel(a.obj, { h: PET_H[nm] || 1 }); shadows(body);
    const root = new THREE.Group(); root.add(body); root.position.set(pl.root.position.x + i, 0, pl.root.position.z - 1.5); scene.add(root);
    let mixer = null, action = null;
    if (a.clips.length) { mixer = new THREE.AnimationMixer(a.obj); action = mixer.clipAction(a.clips[0]); action.play(); action.timeScale = 0; }
    pl.pets.push({ root, body, mixer, action, i, ry: 0, moving: false });
  });
}
function updatePlayers(dt, camPos) {
  for (const pl of players.values()) {
    const p = pl.root.position;
    if (pl !== self) {
      if (Math.hypot(pl.tx - p.x, pl.tz - p.z) > 25) { p.x = pl.tx; p.z = pl.tz; }
      const k = Math.min(1, dt * 10); p.x += (pl.tx - p.x) * k; p.z += (pl.tz - p.z) * k;
      let d = pl.ry - (pl.body.rotation.y - YAW); d = Math.atan2(Math.sin(d), Math.cos(d)); pl.body.rotation.y += d * Math.min(1, dt * 12);
    }
    const near = Math.hypot(p.x - camPos.x, p.z - camPos.z) < 80; pl.root.visible = near || pl === self;
    if (pl.mixer && near) {
      if (pl.mv && !pl.moving) { pl.moving = true; pl.action.timeScale = 1; }
      else if (!pl.mv && pl.moving) { pl.moving = false; pl.action.timeScale = 0; pl.action.time = 0; }
      pl.mixer.update(dt); if (!pl.mv) pl.mixer.update(0);
    }
    // mascotas
    pl.pets.forEach((pt, i) => {
      const a = (pl.body.rotation.y - YAW) + Math.PI + (i - (pl.pets.length - 1) / 2) * 0.9;
      const tx = p.x + Math.sin(a) * 2.3, tz = p.z + Math.cos(a) * 2.3; const q = pt.root.position;
      const dx = tx - q.x, dz = tz - q.z, dist = Math.hypot(dx, dz);
      if (dist > 22) { q.x = tx; q.z = tz; }
      else if (dist > 0.4) { const s = Math.min(dist, (dist * 3 + 3) * dt); q.x += dx / dist * s; q.z += dz / dist * s; pt.ry = Math.atan2(dx, dz); }
      pt.root.visible = pl.root.visible;
      const mv = dist > 0.5; let d = pt.ry - pt.body.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); pt.body.rotation.y += d * Math.min(1, dt * 10);
      if (pt.mixer && pt.root.visible) { if (mv !== pt.moving) { pt.moving = mv; pt.action.timeScale = mv ? 1 : 0; if (!mv) pt.action.time = 0; } pt.mixer.update(dt); if (!mv) pt.mixer.update(0); }
    });
  }
}

// ---------- Plantas ----------
const stageOfPub = (pl) => pl.k.startsWith('egg:') ? (pl.p >= pl.g ? 1 : 0) : (pl.r ? 3 : stageOf(pl.p, pl.g));
const rainbowGroups = new Set();
function topMut(ms) { let b = null; for (const m of ms) if (!b || MUTS[m].mult > MUTS[b].mult) b = m; return b; }
function makePlantView(pl) {
  const g = new THREE.Group(); const stage = stageOfPub(pl);
  if (pl.k.startsWith('egg:')) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), new THREE.MeshLambertMaterial({ color: pl.k === 'egg:rare' ? 0xb9a2ff : 0xfff1cf, emissive: stage ? 0xffd25a : 0x000000, emissiveIntensity: 0.6 }));
    e.scale.set(0.85, 1.15, 0.85); e.position.y = 0.6; g.add(e); g.userData.egg = e;
  } else {
    const pr = cropProto[pl.k] && cropProto[pl.k][stage];
    if (pr) g.add(pr.clone(true));
    else { const h = 0.4 + stage * 0.45; const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, h, 6), new THREE.MeshLambertMaterial({ color: [0x7ac943, 0x5fb23a, 0x3f9a2a, 0xe0752b][stage] })); m.position.y = h / 2; g.add(m); }
    shadows(g);
    const mt = topMut(pl.m || []);
    if (mt) {
      tint(g, mt === 'rainbow' ? 0xff66cc : MUTS[mt].color, 0.5); if (mt === 'rainbow') rainbowGroups.add(g); pulseGroups.add(g);
      const badge = makeLabel(pl.m.map((x) => MUT_EMOJI[x]).join('') + ' x' + fmtMult(mutMult(pl.m)), { h: 0.5, fs: 40, bg: 'rgba(0,0,0,.55)', depthTest: false });
      badge.position.y = ((CROPS[pl.k] && CROPS[pl.k].size) || 1.5) + 0.7; g.add(badge); g.userData.badge = badge;
    }
  }
  g.userData.pick = { type: 'plant', cell: pl.c };
  return g;
}
function applyPlot(i, plants) {
  const pv = plotViews[i]; if (!pv) return;
  const data = new Map(plants.map((p) => [p.c, p])); plotData[i] = data;
  for (const [cell, v] of pv.views) if (!data.has(cell)) { dropView(pv, v); pv.views.delete(cell); mutEmit.delete(i + ':' + cell); }
  for (const [cell, pl] of data) {
    const key = pl.k + '|' + stageOfPub(pl) + '|' + (pl.m || []).join(',');
    const old = pv.views.get(cell); if (old && old.key === key) continue;
    if (old) dropView(pv, old);
    const g = makePlantView(pl);
    g.position.set(((cell % GRID) - (GRID - 1) / 2) * CELL, 0.05, (Math.floor(cell / GRID) - (GRID - 1) / 2) * CELL); g.rotation.y = (cell * 2.399) % 6.28;
    pv.plants.add(g); pv.views.set(cell, { group: g, key });
    { const w = cellWorld(i, cell); if (pl.m && pl.m.length && CROPS[pl.k]) mutEmit.set(i + ':' + cell, { x: w.x, y: CROPS[pl.k].size * 0.55, z: w.z, m: pl.m }); else mutEmit.delete(i + ':' + cell); }
    if (old || inGame) { g.scale.setScalar(0.3); tweens.push({ g, t: 0, dur: 0.45 }); }
  }
  if (i === myPlot) refreshHarvestBtn();
}
function ownPlantGroups() { const pv = plotViews[myPlot]; return pv ? [...pv.views.values()].map((v) => v.group) : []; }
function cellLocal(c) { return { x: ((c % GRID) - (GRID - 1) / 2) * CELL, z: (Math.floor(c / GRID) - (GRID - 1) / 2) * CELL }; }

// ---------- Efectos ----------
const fxGeo = new THREE.SphereGeometry(0.14, 6, 5);
function puff(x, y, z, color, n = 9) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(fxGeo, new THREE.MeshBasicMaterial({ color, transparent: true })); m.position.set(x, y, z); scene.add(m);
    const a = Math.random() * 6.28, s = 1.5 + Math.random() * 2.5; fx.push({ m, vx: Math.cos(a) * s, vy: 3 + Math.random() * 3, vz: Math.sin(a) * s, t: 0 });
  }
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; f.vy -= 12 * dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt; f.m.material.opacity = Math.max(0, 1 - f.t / 0.8); if (f.t > 0.8) { scene.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); } }
  for (let i = tweens.length - 1; i >= 0; i--) { const t = tweens[i]; t.t += dt; const k = Math.min(1, t.t / t.dur); const e = 1 - Math.pow(1 - k, 3); t.g.scale.setScalar(k >= 1 ? 1 : 0.3 + 0.7 * e + 0.12 * Math.sin(k * Math.PI)); if (k >= 1) tweens.splice(i, 1); }
}

// =====================================================================
//  UI
// =====================================================================
function toast(msg, kind) {
  const d = document.createElement('div'); d.className = 'toast ' + (kind || ''); d.textContent = msg; $('toasts').appendChild(d);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => d.remove(), 3100);
}
function chatLine(name, text) {
  const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = name + ': '; d.appendChild(b); d.appendChild(document.createTextNode(text));
  const log = $('chatlog'); log.appendChild(d); while (log.children.length > 6) log.firstChild.remove(); setTimeout(() => d.remove(), 12000);
}
const modals = ['shop', 'bag', 'pause', 'how', 'admin'];
function openModal(id) { modals.forEach((m) => $(m).classList.toggle('hidden', m !== id)); if (id === 'bag') renderBag(); if (id === 'pause') renderPause(); }
function closeModals() { modals.forEach((m) => $(m).classList.add('hidden')); openShopKey = null; }
const anyModal = () => modals.some((m) => !$(m).classList.contains('hidden'));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModals));

function hotItems() {
  const l = [{ type: 'can', e: '🚿', n: 'Regar' }, { type: 'shovel', e: '⛏️', n: 'Quitar' }];
  if (!me) return l;
  Object.keys(CROPS).forEach((k) => { if (me.seeds[k]) l.push({ type: 'seed', k, e: CROPS[k].emoji, n: CROPS[k].name, c: me.seeds[k] }); });
  Object.keys(EGGS).forEach((k) => { if (me.eggs[k]) l.push({ type: 'egg', k, e: EGGS[k].emoji, n: EGGS[k].name.replace('Huevo ', ''), c: me.eggs[k] }); });
  Object.keys(GEAR).forEach((k) => { if (me.gear[k]) l.push({ type: 'gear', k, e: GEAR[k].emoji, n: GEAR[k].name, c: me.gear[k] }); });
  return l;
}
function selKey(s) { return s.type + (s.k || ''); }
function renderHotbar() {
  const items = hotItems();
  if (!items.some((i) => selKey(i) === selKey(sel))) sel = { type: 'can' };
  const hb = $('hotbar'); hb.innerHTML = '';
  items.forEach((it, idx) => {
    const b = document.createElement('button'); if (selKey(it) === selKey(sel)) b.className = 'on';
    b.innerHTML = `<em>${idx + 1}</em>${it.e}${it.c ? `<i>${it.c}</i>` : ''}<span>${it.n}</span>`;
    b.addEventListener('click', () => { sel = { type: it.type, k: it.k }; renderHotbar(); }); hb.appendChild(b);
  });
}
function refreshHUD() {
  if (!me) return; $('moneyV').textContent = fmt(me.sheckles); renderHotbar();
  if (openShopKey) renderShop(); if (!$('bag').classList.contains('hidden')) renderBag();
  const sf = self; if (sf) { const names = me.equipped.map((i) => me.pets[i]); setPets(sf, names); }
}
function refreshHarvestBtn() { const d = plotData[myPlot]; let any = false; if (d) for (const p of d.values()) if (p.r && !p.k.startsWith('egg:')) { any = true; break; } $('bHarvest').classList.toggle('hidden', !any); }
let plistT = 0;
function renderPlayers() {
  const arr = [...players.values()].sort((a, b) => b.sh - a.sh);
  $('pcount').textContent = arr.length;
  $('plistBody').innerHTML = arr.map((p, i) => `<div class="pr ${p === self ? 'me' : ''}"><span>${i + 1}. ${p.owner ? '👑 ' : ''}${esc(p.name)}</span><span>💰${compact(p.sh)}</span></div>`).join('');
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const compact = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : fmt(n);
$('plist').querySelector('.hd').addEventListener('click', () => $('plist').classList.toggle('open'));
const tagHtml = (ms) => ms.map((m) => `<span class="tag" style="background:${MUTS[m].color}">${MUT_EMOJI[m]}${MUTS[m].name} x${MUTS[m].mult}</span>`).join('');

// ---------- Tiendas ----------
function tryOpenShop(key) {
  const n = NPCS[key]; if (!self) return; const d = Math.hypot(self.root.position.x - n.x, self.root.position.z - n.z);
  if (d > NPC_RANGE) return toast('Acercate a ' + n.name + ' (botón 🏪 para ir a las tiendas)', 'bad');
  openShopKey = n.shop; openModal('shop'); renderShop();
}
function updateShopSub() {
  if (!openShopKey || !me) return; const left = Math.max(0, stock.next - srvNow());
  $('shopSub').innerHTML = `Tenés 💰 <b>${fmt(me.sheckles)}</b>` + (openShopKey !== 'sell' ? ` · Reposición en <b>${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b>` : '');
}
function renderShop() {
  const key = openShopKey; if (!key || !me) return; const n = Object.values(NPCS).find((x) => x.shop === key);
  $('shopTitle').textContent = `${NPC_EMOJI[key]} ${n.name} – ${n.title}`;
  updateShopSub();
  const body = $('shopBody'); let h = '';
  if (key === 'sell') {
    let total = 0; me.fruits.forEach((f) => { total += fruitValue(f); });
    let bonus = 1; me.equipped.forEach((i) => { const p = PETS[me.pets[i]]; if (p && p.sell) bonus += p.sell; });
    h += `<div class="item"><div class="e">🧺</div><div class="t"><b>${me.fruits.length} frutas</b><small>Valor total: 💰${fmt(total * bonus)}${bonus > 1 ? ' (bonus mascotas +' + Math.round((bonus - 1) * 100) + '%)' : ''}</small></div><button class="btn sm" data-sellall>Vender todo</button></div>`;
    me.fruits.slice(0, 60).forEach((f, i) => { h += `<div class="item"><div class="e">${CROPS[f.k].emoji}</div><div class="t">${CROPS[f.k].name} ${f.w}kg ${tagHtml(f.m)}<small>💰${fmt(fruitValue(f))}</small></div><button class="btn alt sm" data-sell="${i}">Vender</button></div>`; });
    if (!me.fruits.length) h += '<p>No tenés frutas. ¡Cosechá tu jardín! 🌱</p>';
  } else {
    const defs = key === 'seed' ? CROPS : key === 'gear' ? GEAR : EGGS; const st = stock[key] || {}; const rk = key === 'seed' ? 'crop' : key;
    const keys = Object.keys(defs).sort((a, b) => priceOf(key, a) - priceOf(key, b));
    keys.forEach((k) => {
      const d = defs[k]; const price = priceOf(key, k, stock.deal); const have = st[k] || 0; const isDeal = !!(stock.deal && stock.deal.shop === key && stock.deal.k === k);
      const rar = RARITY[(RAR[rk] || {})[k]] || RARITY.common;
      const extra = key === 'seed' ? `Crece en ${Math.round(d.grow / 60 * 10) / 10 || 0.3} min · vende ~💰${d.sell}${d.regrow ? ' · da varias veces' : ''}` : key === 'gear' ? d.desc : `Eclosiona en ${d.hatch}s`;
      h += `<div class="item ${have ? '' : 'out'} ${isDeal ? 'deal' : ''}"><div class="e">${d.emoji}</div><div class="t"><b>${d.name}</b><span class="rar" style="background:${rar.color}">${rar.name}</span>${isDeal ? ' <b style="color:#e06000">🔥 -30%</b>' : ''}<small>${extra}</small><small>💰${fmt(price)}${isDeal ? ' <s>' + fmt(priceOf(key, k)) + '</s>' : ''} · Stock: ${have}</small></div>${have ? `<div style="display:flex;flex-direction:column;gap:4px"><button class="btn sm" data-buy="${k}" data-q="1">x1</button><button class="btn alt sm" data-buy="${k}" data-q="5">x5</button></div>` : '<small>Agotado</small>'}</div>`;
    });
  }
  body.innerHTML = h;
  body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => net.send({ t: 'buy', shop: key, k: b.dataset.buy, qty: +b.dataset.q })));
  body.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', () => net.send({ t: 'sell', mode: 'one', idx: +b.dataset.sell })));
  body.querySelectorAll('[data-sellall]').forEach((b) => b.addEventListener('click', () => net.send({ t: 'sell', mode: 'all' })));
}
let bagTab = 'fruit';
function renderBag() {
  $('tabFruit').classList.toggle('on', bagTab === 'fruit'); $('tabPets').classList.toggle('on', bagTab === 'pets');
  const b = $('bagBody'); if (!me) return; let h = '';
  if (bagTab === 'fruit') {
    if (!me.fruits.length) h = '<p>Todavía no tenés frutas.</p>';
    const grouped = {}; me.fruits.forEach((f) => { grouped[f.k] = (grouped[f.k] || 0) + 1; });
    h += Object.entries(grouped).map(([k, n]) => `<div class="item"><div class="e">${CROPS[k].emoji}</div><div class="t"><b>${CROPS[k].name}</b><small>x${n}</small></div></div>`).join('');
    h += `<p style="font-size:13px">Vendelas con 💰 Steve en el centro del mapa.</p>`;
  } else {
    h = `<p style="font-size:13px">Equipadas: ${me.equipped.length}/${MAX_EQUIPPED}. Tocá para equipar/desequipar.</p>`;
    if (!me.pets.length) h += '<p>No tenés mascotas. Comprá un huevo con la Abuela Rosa 🥚</p>';
    me.pets.forEach((nm, i) => { const p = PETS[nm]; const on = me.equipped.includes(i); const fx = [p.sell ? `💰 vende +${Math.round(p.sell * 100)}%` : '', p.grow ? `🌱 crece +${Math.round(p.grow * 100)}%` : ''].filter(Boolean).join(' · ');
      h += `<div class="item"><div class="e">${p.emoji}</div><div class="t"><b>${p.name}</b><span class="rar" style="background:${(RARITY[RAR.pet[nm]] || RARITY.common).color}">${(RARITY[RAR.pet[nm]] || RARITY.common).name}</span><small>${fx}</small></div><button class="btn sm ${on ? '' : 'dim'}" data-eq="${i}">${on ? 'Equipada' : 'Equipar'}</button></div>`; });
  }
  b.innerHTML = h; b.querySelectorAll('[data-eq]').forEach((x) => x.addEventListener('click', () => net.send({ t: 'equip', idx: +x.dataset.eq })));
}
$('tabFruit').onclick = () => { bagTab = 'fruit'; renderBag(); }; $('tabPets').onclick = () => { bagTab = 'pets'; renderBag(); };
function renderPause() {
  $('pQuality').textContent = '⚙️ Gráficos: ' + (LOW ? 'Bajos (rápido)' : 'Altos');
  $('pStats').textContent = me ? `Cosechadas: ${fmt(me.stats.harvested)} · Ganado total: 💰${fmt(me.stats.earned)} · Modo: ${net.mode === 'offline' ? 'sin conexión' : 'online'}` : '';
}

// =====================================================================
//  Acciones del jugador
// =====================================================================
function inRange(cell) { const w = cellWorld(myPlot, cell); return Math.hypot(self.root.position.x - w.x, self.root.position.z - w.z) <= 22; }
function cellFx(cell, color) { const w = cellWorld(myPlot, cell); puff(w.x, 0.8, w.z, color); }
function setNdc(cx, cy) { const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); }
const ray = new THREE.Raycaster(); const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); const ndc = new THREE.Vector2(); const hitPt = new THREE.Vector3();
function doTap(cx, cy) {
  if (!inGame || !self || anyModal()) return;
  setNdc(cx, cy); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([...npcGroups, ...ownPlantGroups()], true);
  let pick = null; if (hits.length) { let o = hits[0].object; while (o && !(o.userData && o.userData.pick)) o = o.parent; if (o) pick = o.userData.pick; }
  if (pick && pick.type === 'npc') return tryOpenShop(pick.key);
  let cell = -1;
  if (pick && pick.type === 'plant') cell = pick.cell;
  else if (ray.ray.intersectPlane(groundPlane, hitPt)) cell = worldToCell(myPlot, hitPt.x, hitPt.z);
  if (cell < 0) return;
  if (!inRange(cell)) return toast('Estás lejos de tu parcela. Usá el botón 🏡', 'bad');
  const pl = (plotData[myPlot] || new Map()).get(cell);
  if (pl) return plantTap(pl);
  if (sel.type === 'seed') { net.send({ t: 'plant', cell, k: sel.k }); cellFx(cell, 0x8be35a); sfx.pop(); }
  else if (sel.type === 'egg' || (sel.type === 'gear' && sel.k === 'sprinkler')) { net.send({ t: 'place', cell, k: sel.k }); cellFx(cell, 0xffe27a); sfx.pop(); }
  else if (sel.type === 'gear') toast('Usalo sobre una planta 🌱');
  else toast('Elegí una semilla 🌱 en la barra de abajo y tocá una celda libre', '');
}
function plantTap(pl) {
  const isEgg = pl.k.startsWith('egg:');
  if (sel.type === 'gear' && sel.k !== 'sprinkler') { net.send({ t: 'use', cell: pl.c, k: sel.k }); return cellFx(pl.c, 0xffe27a); }
  if (sel.type === 'shovel') { net.send({ t: 'shovel', cell: pl.c }); return cellFx(pl.c, 0xb08050); }
  if (isEgg) { if (pl.p >= pl.g) { net.send({ t: 'hatch', cell: pl.c }); return cellFx(pl.c, 0xff9ad5); } return toast('🥚 El huevo todavía no eclosiona…'); }
  if (pl.r) { net.send({ t: 'harvest', cell: pl.c }); return cellFx(pl.c, 0xffe27a); }
  if (sel.type === 'can') { net.send({ t: 'water', cell: pl.c }); sfx.water(); return; }
  const st = stageOfPub(pl); toast(`${CROPS[pl.k].emoji} ${CROPS[pl.k].name}: ${['Brotando', 'Creciendo', 'Casi lista'][st] || ''}${pl.m.length ? ' · ' + pl.m.map((m) => MUT_EMOJI[m] + MUTS[m].name).join(', ') + ' (x' + fmtMult(mutMult(pl.m)) + ')' : ''}`);
}
function teleport(x, z) { if (!self) return; self.root.position.x = x; self.root.position.z = z; self.tx = x; self.tz = z; net.send({ t: 'pos', x, z, ry: self.ry, mv: 0 }); }
function goGarden() { if (myPlot < 0) return; const p = plotInfo(myPlot); const d = Math.hypot(p.x, p.z); teleport(p.x - p.x / d * 11, p.z - p.z / d * 11); cam.yaw = Math.atan2(p.x, p.z); closeModals(); }
function goTown() { teleport(0, 7); cam.yaw = 0; closeModals(); }
$('bGarden').onclick = goGarden; $('bTown').onclick = goTown; $('pGarden').onclick = goGarden;
$('bHarvest').onclick = () => net.send({ t: 'harvestAll' });
$('bBag').onclick = () => openModal('bag'); $('bMenu').onclick = () => openModal('pause');
$('pHow').onclick = () => openModal('how'); $('btnHow').onclick = () => openModal('how');
$('pExit').onclick = () => { store.set('jardin_session', ''); location.reload(); };
$('pFull').onclick = () => { const e = document.documentElement; (e.requestFullscreen || e.webkitRequestFullscreen || (() => {})).call(e); };
const toggleQ = () => { store.set('jardin_q', LOW ? 'high' : 'low'); location.reload(); };
$('pQuality').onclick = toggleQ; $('btnQuality').onclick = toggleQ; $('btnQuality').textContent = '⚙️ Gráficos: ' + (LOW ? 'Bajos' : 'Altos');
function sendChat() { const i = $('chatInput'); const t = i.value.trim(); if (t) net.send({ t: 'chat', text: t }); i.value = ''; $('chatbox').classList.add('hidden'); i.blur(); }
$('bChat').onclick = () => { $('chatbox').classList.toggle('hidden'); if (!$('chatbox').classList.contains('hidden')) $('chatInput').focus(); };
$('chatSend').onclick = sendChat; $('chatInput').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') sendChat(); if (e.key === 'Escape') { $('chatbox').classList.add('hidden'); $('chatInput').blur(); } });

// =====================================================================
//  Entrada: teclado, joystick, cámara
// =====================================================================
const keys = new Set(); const joy = { x: 0, y: 0 }; const cam = { yaw: 0, pitch: 0.5, dist: 14 };
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (!inGame) return;
  if (k === 'escape') { anyModal() ? closeModals() : openModal('pause'); }
  else if (k === 'e') { if (!anyModal() && nearNpc) tryOpenShop(nearNpc); else if (openShopKey) closeModals(); }
  else if (k === 'enter') { $('chatbox').classList.remove('hidden'); $('chatInput').focus(); e.preventDefault(); }
  else if (k === 'b') openModal('bag');
  else if (k === 'h') net.send({ t: 'harvestAll' });
  else if (k === ' ') { jump(); e.preventDefault(); }
  else if (/^[1-9]$/.test(k)) { const it = hotItems()[+k - 1]; if (it) { sel = { type: it.type, k: it.k }; renderHotbar(); } }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
let vy = 0, py = 0; function jump() { if (py <= 0.001) vy = 8.5; }
$('bJump').addEventListener('pointerdown', (e) => { e.preventDefault(); jump(); });
// Joystick
{
  const el = $('joy'), knob = $('joyKnob'); let pid = null;
  const set = (e) => { const r = el.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const m = Math.hypot(dx, dy), R = 48; if (m > R) { dx *= R / m; dy *= R / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; joy.x = dx / R; joy.y = -dy / R; };
  el.addEventListener('pointerdown', (e) => { pid = e.pointerId; el.setPointerCapture(pid); set(e); e.preventDefault(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
  const end = (e) => { if (e.pointerId === pid) { pid = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  if (COARSE) el.classList.remove('hidden');
  addEventListener('touchstart', () => { if (inGame) el.classList.remove('hidden'); }, { once: true, passive: true });
}
// Cámara por arrastre + toque para interactuar + pellizco
{
  const ptrs = new Map(); let moved = 0, pinch = 0, downAt = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); if (ptrs.size === 1) { moved = 0; downAt = performance.now(); } pinch = 0; });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) { if (!COARSE) hoverMove(e.clientX, e.clientY); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) cam.dist = Math.min(30, Math.max(6, cam.dist - (d - pinch) * 0.05)); pinch = d; }
    else if (moved > 8) { cam.yaw -= dx * 0.006; cam.pitch = Math.min(1.25, Math.max(0.12, cam.pitch + dy * 0.005)); }
  });
  const up = (e) => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (p && ptrs.size === 0 && moved < 10 && performance.now() - downAt < 600 && e.type === 'pointerup' && e.button !== 2) doTap(e.clientX, e.clientY); pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { cam.dist = Math.min(30, Math.max(6, cam.dist + e.deltaY * 0.02)); e.preventDefault(); }, { passive: false });
}
// Marcador de celda (PC)
const cursor = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.95, CELL * 0.95), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })); cursor.rotation.x = -Math.PI / 2; cursor.visible = false; scene.add(cursor);
function hoverMove(cx, cy) {
  cursor.visible = false; if (!inGame || !self || anyModal() || !(sel.type === 'seed' || sel.type === 'egg' || sel.type === 'gear')) return;
  setNdc(cx, cy); ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(groundPlane, hitPt)) return; const c = worldToCell(myPlot, hitPt.x, hitPt.z); if (c < 0) return;
  const w = cellWorld(myPlot, c); cursor.position.set(w.x, 0.09, w.z); cursor.rotation.z = -plotInfo(myPlot).rot; cursor.visible = true;
  cursor.material.color.set((plotData[myPlot] || new Map()).has(c) ? 0xff5555 : 0x66ff66);
}

// =====================================================================
//  Red: mensajes del servidor
// =====================================================================
function onNet(m) {
  switch (m.t) {
    case 'welcome': {
      myId = m.id; myPlot = m.plot; me = m.me; srvT0 = m.now; perf0 = performance.now() / 1000;
      [...players.keys()].forEach(removePlayer);
      for (let i = 0; i < MAX_PLAYERS; i++) { setPlotOwner(i, null, false); applyPlot(i, []); }
      m.players.forEach((p) => { addPlayer(p); setPlotOwner(p.plot, p.name, p.id === myId); });
      self = players.get(myId); self.root.position.set(m.players.find((p) => p.id === myId).x, 0, m.players.find((p) => p.id === myId).z);
      for (const i in m.plots) applyPlot(+i, m.plots[i]);
      stock = m.stock; weather = m.weather; ev = m.event || { k: null, until: 0 }; isOwner = !!m.owner; $('bAdmin').classList.toggle('hidden', !isOwner); applyWeather(); applyEventFx(); enterGame(); refreshHUD(); renderPlayers(); if (ev.k) showBanner(ev.k, true);
      toast('¡Bienvenido, ' + me.name + '! Tu parcela es la que tiene ⭐ (botón 🏡)', 'good'); break;
    }
    case 'pj': addPlayer(m.p); setPlotOwner(m.p.plot, m.p.name, false); renderPlayers(); chatLine('🌱', m.p.name + ' se unió'); break;
    case 'pl': { const pl = players.get(m.id); if (pl) chatLine('🍂', pl.name + ' se fue'); removePlayer(m.id); setPlotOwner(m.plot, null, false); applyPlot(m.plot, []); renderPlayers(); break; }
    case 'ps': for (const [id, x, z, ry, mv] of m.d) { const p = players.get(id); if (p && p !== self) { p.tx = x; p.tz = z; p.ry = ry; p.mv = mv; } } break;
    case 'plot': applyPlot(m.i, m.plants); break;
    case 'me': me = m.me; refreshHUD(); break;
    case 'stock': stock = m; if (openShopKey) renderShop(); break;
    case 'weather': weather = m; applyWeather(); if (m.k) sfx.chime(); if (m.k) toast(WEATHER[m.k].emoji + ' ¡' + WEATHER[m.k].name + '! Mutaciones activas', 'gold'); break;
    case 'lb': for (const [id, sh] of m.d) { const p = players.get(id); if (p) p.sh = sh; } renderPlayers(); break;
    case 'pi': { const p = players.get(m.id); if (p) setPets(p, m.pets); break; }
    case 'toast': toast(m.msg, m.kind); if (/^Compraste/.test(m.msg)) sfx.buy(); break;
    case 'harv': sfx.pop(); toast('🧺 +' + m.n + (m.n > 1 ? ' frutas' : ' fruta'), 'good'); break;
    case 'sold': sfx.coin(); toast(`💰 Vendiste ${m.n} fruta${m.n > 1 ? 's' : ''} por ${fmt(m.total)} Sheckles`, 'gold'); if (self) puff(self.root.position.x, 2, self.root.position.z, 0xffd23a, 14); break;
    case 'hatched': sfx.hatch(); toast(`🎉 ¡Nació ${PETS[m.pet].emoji} ${PETS[m.pet].name}!`, 'gold'); if (self) puff(self.root.position.x, 2, self.root.position.z, 0xff9ad5, 16); break;
    case 'chat': chatLine(m.name, m.text); break;
    case 'wet': { const w = cellWorld(m.plot, m.c); puff(w.x, 1.2, w.z, 0x66bbff, 6); break; }
    case 'spr': addSprinkler(m.plot, m.c, m.dur); break;
    case 'event': setEvent(m); break;
    case 'evtick': toast('💰 +' + m.amt + ' Sheckles de la lluvia', 'gold'); sfx.coin(); if (self) puff(self.root.position.x, 2.5, self.root.position.z, 0xffd23a, 10); break;
    case 'evend': showEventEnd(m); break;
    case 'adm': renderAdmin(m.state); break;
    case 'error': lastErr = m.msg; break;
  }
}
const sprinklers = [];
function addSprinkler(plot, c, dur) {
  const g = new THREE.Group(); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.9, 8), new THREE.MeshLambertMaterial({ color: 0x8899aa })); base.position.y = 0.45; g.add(base);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshLambertMaterial({ color: 0x33aaff, emissive: 0x1166aa })); head.position.y = 1; g.add(head);
  const l = cellLocal(c); g.position.set(l.x, 0.05, l.z); plotViews[plot].plants.add(g); sprinklers.push({ g, plot, until: performance.now() + dur * 1000, c });
}

// =====================================================================
//  Conexión (online / offline) y flujo de menú
// =====================================================================
function serverUrl() {
  let u = (CFG.SERVER_URL || '').trim();
  if (u) { if (/^https?:/.test(u)) u = u.replace(/^http/, 'ws'); if (!/\/ws$/.test(u)) u = u.replace(/\/$/, '') + '/ws'; return u; }
  if (location.protocol === 'file:' || /\.github\.io$/.test(location.hostname)) return null;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}
const httpBase = () => { const u = serverUrl(); return u ? u.replace(/^ws/, 'http').replace(/\/ws$/, '') : null; };
let ws = null, authMode = 'login', isOwner = false, lastErr = '', curAvatar = store.get('jardin_av', 'farmer');
function setBusy(b) { $('btnAuth').disabled = b; $('btnResume').disabled = b; $('btnAuth').textContent = b ? 'Conectando…' : (authMode === 'login' ? '▶ Entrar' : '✔ Crear cuenta y jugar'); $('btnResume').textContent = b ? 'Conectando…' : '▶ Jugar'; }
function showMenu(msg) { $('menu').classList.remove('hidden'); $('menuStatus').textContent = msg || ''; setBusy(false); }
function showAuth() { $('resumeBox').classList.add('hidden'); $('authBox').classList.remove('hidden'); }
let nameT = 0;
function checkName() {
  const st = $('nameState'), inp = $('user'); clearTimeout(nameT); st.className = ''; st.textContent = ''; inp.classList.remove('bad', 'good');
  if (authMode !== 'reg' || !inp.value.trim() || !httpBase()) return;
  nameT = setTimeout(async () => {
    try {
      const r = await (await fetch(httpBase() + '/api/name?u=' + encodeURIComponent(inp.value.trim()))).json();
      if (inp.value.trim() === '') return;
      st.className = r.ok ? 'good' : 'bad'; inp.classList.add(r.ok ? 'good' : 'bad');
      st.textContent = r.ok ? '✅ Nombre disponible' : (r.taken ? '❌ Este nombre de usuario ya está en uso' : '❌ ' + r.msg);
    } catch {}
  }, 350);
}
function setAuthMode(m) {
  authMode = m; $('tabLogin').classList.toggle('on', m === 'login'); $('tabReg').classList.toggle('on', m === 'reg');
  $('pass2').classList.toggle('hidden', m !== 'reg'); $('pass').autocomplete = m === 'reg' ? 'new-password' : 'current-password';
  $('authMsg').textContent = ''; setBusy(false); checkName();
}
function goFullPortrait() {
  if (!COARSE) return;
  try { const e = document.documentElement; const p = (e.requestFullscreen || e.webkitRequestFullscreen || (() => Promise.reject())).call(e); Promise.resolve(p).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait')).catch(() => {}); } catch {}
}
function connect(first) {
  const url = serverUrl();
  if (!url) return showMenu('Este sitio no tiene servidor multijugador configurado (ver config.js y el README).');
  goFullPortrait(); setBusy(true); lastErr = ''; $('menuStatus').textContent = '';
  const t0 = performance.now(); let joined = false, done = false;
  try { ws = new WebSocket(url); } catch (e) { return showMenu('Dirección de servidor inválida en config.js'); }
  const sock = ws;
  const tick = setInterval(() => {
    if (joined || done) return clearInterval(tick); const s = Math.floor((performance.now() - t0) / 1000);
    $('menuStatus').textContent = s < 6 ? 'Conectando al servidor…' : `Despertando el servidor… (${s}s, la primera vez puede tardar hasta 1 min)`;
    if (s > 90) { clearInterval(tick); done = true; try { sock.close(); } catch {} showMenu('No se pudo conectar. Probá de nuevo en un momento.'); }
  }, 500);
  sock.onopen = () => sock.send(JSON.stringify({ ...first, avatar: curAvatar }));
  sock.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'authok') { SESSION = { user: m.user, token: m.token }; store.set('jardin_session', JSON.stringify(SESSION)); isOwner = !!m.owner; return; }
    if (m.t === 'autherr') { clearInterval(tick); done = true; $('authMsg').textContent = m.msg; if (/vencida/.test(m.msg)) { SESSION = null; store.set('jardin_session', ''); showAuth(); } showMenu(''); try { sock.close(); } catch {} return; }
    if (m.t === 'full') { clearInterval(tick); done = true; showMenu('🚫 ' + m.msg); return; }
    if (m.t === 'welcome') { joined = true; clearInterval(tick); net.mode = 'online'; }
    onNet(m);
  };
  sock.onerror = () => { if (!joined && !done) { clearInterval(tick); done = true; showMenu('No se pudo conectar al servidor. ¿Está encendido?'); } };
  sock.onclose = () => {
    clearInterval(tick); if (done || sock !== ws) return;
    if (inGame) { inGame = false; closeModals(); $('hud').classList.add('hidden'); [...players.keys()].forEach(removePlayer); self = null; }
    showMenu(lastErr || (joined ? '⚠️ Se perdió la conexión con el servidor. Volvé a entrar.' : 'No se pudo conectar al servidor.'));
  };
  net.send = (o) => { if (sock.readyState === 1) sock.send(JSON.stringify(o)); };
}
function enterGame() {
  inGame = true; $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  cam.yaw = 0; cam.pitch = 0.55; cam.dist = 15; goTown(); sfx.init();
}
function submitAuth() {
  const user = $('user').value.trim(), pass = $('pass').value;
  if (!user || !pass) return void ($('authMsg').textContent = 'Completá usuario y contraseña');
  if (authMode === 'reg') {
    if (pass.length < 4) return void ($('authMsg').textContent = 'La contraseña debe tener al menos 4 caracteres');
    if (pass !== $('pass2').value) return void ($('authMsg').textContent = 'Las contraseñas no coinciden');
  }
  $('authMsg').textContent = ''; store.set('jardin_lastuser', user);
  connect({ t: authMode === 'reg' ? 'register' : 'login', user, pass });
}
// contador de jugadores del servidor en el menú
async function pollCount() {
  const el = $('srvCount'), b = httpBase(); if (!b) { el.textContent = '🖥️ Sin servidor configurado'; return; }
  try {
    const c = new AbortController(); const to = setTimeout(() => c.abort(), 5000);
    const r = await (await fetch(b + '/health', { signal: c.signal })).json(); clearTimeout(to);
    el.textContent = `🖥️ Servidor: ${r.players}/${r.max} jugadores` + (r.players >= r.max ? ' · LLENO' : '');
  } catch { el.textContent = '😴 Servidor dormido o apagado (entrar lo despierta)'; }
}
{
  const wrap = $('avatars');
  AVATARS.forEach((a) => { const b = document.createElement('button'); b.innerHTML = `<b>${a.e}</b>${a.label}`; if (a.id === curAvatar) b.className = 'on'; b.onclick = () => { curAvatar = a.id; store.set('jardin_av', curAvatar); [...wrap.children].forEach((c) => c.classList.remove('on')); b.classList.add('on'); }; wrap.appendChild(b); });
  $('user').value = store.get('jardin_lastuser', '');
  if (SESSION && SESSION.user && SESSION.token) { $('resumeBox').classList.remove('hidden'); $('authBox').classList.add('hidden'); $('resumeName').textContent = SESSION.user; }
  $('btnResume').onclick = () => connect({ t: 'resume', user: SESSION.user, token: SESSION.token });
  $('btnSwitch').onclick = () => { SESSION = null; store.set('jardin_session', ''); showAuth(); };
  $('tabLogin').onclick = () => setAuthMode('login'); $('tabReg').onclick = () => setAuthMode('reg');
  $('btnAuth').onclick = submitAuth; $('user').addEventListener('input', checkName);
  [$('user'), $('pass'), $('pass2')].forEach((i) => i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') submitAuth(); }));
  setAuthMode('login'); pollCount(); setInterval(() => { if (!inGame) pollCount(); }, 6000);
}

// =====================================================================
//  Bucle principal
// =====================================================================
const clock = new THREE.Clock(); let nearNpc = null, posT = 0, lastSent = { x: 1e9, z: 1e9 }, uiT = 0, cullT = 0, menuA = 0;
const fwd = new THREE.Vector3(), camPos = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()); const t = clock.elapsedTime;
  if (inGame && self) {
    // movimiento
    let ix = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + joy.x;
    let iz = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + joy.y;
    if (anyModal() || document.activeElement === $('chatInput')) { ix = 0; iz = 0; }
    const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
    const fx_ = -Math.sin(cam.yaw), fz_ = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const mx = fx_ * iz + rx * ix, mz = fz_ * iz + rz * ix; const p = self.root.position;
    const moving = len > 0.08; const speed = 11;
    if (moving) { p.x += mx * speed * dt; p.z += mz * speed * dt; self.ry = Math.atan2(mx, mz); }
    const r = Math.hypot(p.x, p.z); if (r > WORLD_RADIUS) { p.x *= WORLD_RADIUS / r; p.z *= WORLD_RADIUS / r; }
    vy -= 24 * dt; py += vy * dt; if (py < 0) { py = 0; vy = 0; } p.y = py;
    let d = self.ry - (self.body.rotation.y - YAW); d = Math.atan2(Math.sin(d), Math.cos(d)); self.body.rotation.y += d * Math.min(1, dt * 14);
    self.mv = moving ? 1 : 0; self.tx = p.x; self.tz = p.z;
    posT += dt; if (posT > 0.1 && (Math.hypot(p.x - lastSent.x, p.z - lastSent.z) > 0.05 || posT > 1)) { posT = 0; lastSent = { x: p.x, z: p.z }; net.send({ t: 'pos', x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +self.ry.toFixed(2), mv: self.mv }); }
    // cámara
    const cp = Math.cos(cam.pitch); camera.position.set(p.x + Math.sin(cam.yaw) * cp * cam.dist, p.y + 2 + Math.sin(cam.pitch) * cam.dist, p.z + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(p.x, p.y + 1.7, p.z);
    // NPC cercano
    nearNpc = null; let best = NPC_RANGE; for (const [k, n] of Object.entries(NPCS)) { const dd = Math.hypot(p.x - n.x, p.z - n.z); if (dd < best) { best = dd; nearNpc = k; } }
    const pr = $('prompt'); if (nearNpc && !anyModal()) { pr.textContent = `${NPC_EMOJI[nearNpc]} ${NPCS[nearNpc].title}${COARSE ? '' : ' (E)'}`; pr.classList.remove('hidden'); pr.onclick = () => tryOpenShop(nearNpc); } else pr.classList.add('hidden');
    sun.position.set(p.x + 50, 90, p.z + 30); sun.target.position.set(p.x, 0, p.z);
    // HUD cada 0.5 s
    uiT += dt; if (uiT > 0.5) { uiT = 0; hudTick(); }
  } else {
    menuA += dt * 0.08; camera.position.set(Math.sin(menuA) * 60, 24, Math.cos(menuA) * 60); camera.lookAt(0, 3, 0);
  }
  camera.getWorldPosition(camPos);
  updatePlayers(dt, camPos); npcMixers.forEach((m) => m.update(dt)); updateFx(dt); updateBolts(dt); updateSparks(dt); updateEmitters(dt, t, camPos); updateEventFx(dt, t, camPos);
  // culling de parcelas lejanas (solo plantas)
  cullT += dt; if (cullT > 0.4) { cullT = 0; for (const pv of plotViews) pv.plants.visible = Math.hypot(pv.cx - camPos.x, pv.cz - camPos.z) < 95; }
  // huevos listos tiemblan
  for (const pv of plotViews) if (pv.plants.visible) pv.views.forEach((v) => { const e = v.group.userData.egg; if (e) { const pl = (plotData[plotViews.indexOf(pv)] || new Map()).get(v.group.userData.pick.cell); e.rotation.z = pl && pl.p >= pl.g ? Math.sin(t * 14) * 0.25 : 0; } });
  // arcoíris en mutaciones
  if (rainbowGroups.size) { const c = new THREE.Color().setHSL((t * 0.4) % 1, 0.9, 0.55); rainbowGroups.forEach((g) => g.traverse((m) => { if (m.isMesh && m.material) [].concat(m.material).forEach((mt) => mt.emissive && mt.emissive.copy(c)); })); }
  // aspersores
  for (let i = sprinklers.length - 1; i >= 0; i--) { const s = sprinklers[i]; if (performance.now() > s.until) { plotViews[s.plot].plants.remove(s.g); sprinklers.splice(i, 1); continue; } if (Math.random() < dt * 12) { const w = cellWorld(s.plot, s.c); puff(w.x, 1.1, w.z, 0x66ccff, 1); } }
  // clima visual
  const look = Object.assign({}, WX_LOOK[weather.k] || WX_LOOK.null, evLook());
  scene.background.lerp(new THREE.Color(look.sky), Math.min(1, dt * 1.5)); scene.fog.color.copy(scene.background); { const kk = Math.min(1, dt * 1.5); scene.fog.near += (look.fogN - scene.fog.near) * kk; scene.fog.far += (look.fogF - scene.fog.far) * kk; sun.color.lerp(_tc.set(look.sunC), kk); }
  hemi.intensity += (look.hemi - hemi.intensity) * Math.min(1, dt * 1.5); sun.intensity += (look.sun + flash - sun.intensity) * Math.min(1, dt * 8);
  if (weather.k === 'thunder') { nextFlash -= dt; if (nextFlash < 0) { flash = 3; nextFlash = 3 + Math.random() * 6; strike(); } flash = Math.max(0, flash - dt * 9); } else flash = 0;
  if (rain.visible || snow.visible) {
    const pos = (rain.visible ? rainGeo : snowGeo).attributes.position, a = pos.array, rainy = rain.visible;
    const cx = camPos.x, cz = camPos.z; (rainy ? rain : snow).position.set(cx, 0, cz);
    if (rainy) for (let i = 0; i < RN; i++) { a[i * 6 + 1] -= 38 * dt; a[i * 6 + 4] -= 38 * dt; if (a[i * 6 + 4] < 0) { a[i * 6 + 1] += 30; a[i * 6 + 4] += 30; } }
    else for (let i = 0; i < SN; i++) { a[i * 3 + 1] -= 3 * dt; a[i * 3] += Math.sin(t + i) * dt; if (a[i * 3 + 1] < 0) a[i * 3 + 1] += 30; }
    pos.needsUpdate = true;
  }
  clouds.forEach((c) => { c.position.x += dt * 1.2; if (c.position.x > 260) c.position.x = -260; });
  renderer.render(scene, camera);
}

// =====================================================================
//  Efectos nuevos: partículas, mutaciones, sonido, eventos, rayos, panel admin
// =====================================================================
const _tc = new THREE.Color();
const fmtMult = (n) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
const pulseGroups = new Set(); const mutEmit = new Map();
function dropView(pv, v) {
  pv.plants.remove(v.group); rainbowGroups.delete(v.group); pulseGroups.delete(v.group);
  if (v.group.userData.badge) disposeLabel(v.group.userData.badge);
}
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ---------- Chispas: un solo Points para miles de partículas ----------
const SPN = 700;
const spGeo = new THREE.BufferGeometry(); const spPos = new Float32Array(SPN * 3), spCol = new Float32Array(SPN * 3);
spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3)); spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
const spTex = canvasTex(64, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
const sparkPts = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.5, map: spTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
sparkPts.frustumCulled = false; scene.add(sparkPts);
const sps = []; for (let i = 0; i < SPN; i++) { sps.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, cr: 0, cg: 0, cb: 0 }); spPos[i * 3 + 1] = -999; }
let spI = 0;
function spark(x, y, z, color, vx, vy, vz, life, g = 0) {
  const i = spI; spI = (spI + 1) % SPN; const s = sps[i]; _tc.set(color);
  s.life = s.max = life; s.vx = vx; s.vy = vy; s.vz = vz; s.g = g; s.cr = _tc.r; s.cg = _tc.g; s.cb = _tc.b;
  spPos[i * 3] = x; spPos[i * 3 + 1] = y; spPos[i * 3 + 2] = z;
}
function updateSparks(dt) {
  for (let i = 0; i < SPN; i++) {
    const s = sps[i]; if (s.life <= 0) continue; s.life -= dt;
    if (s.life <= 0) { spPos[i * 3 + 1] = -999; spCol[i * 3] = spCol[i * 3 + 1] = spCol[i * 3 + 2] = 0; continue; }
    s.vy -= s.g * dt; spPos[i * 3] += s.vx * dt; spPos[i * 3 + 1] += s.vy * dt; spPos[i * 3 + 2] += s.vz * dt;
    const k = Math.min(1, s.life / s.max * 1.6); spCol[i * 3] = s.cr * k; spCol[i * 3 + 1] = s.cg * k; spCol[i * 3 + 2] = s.cb * k;
  }
  spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
}
const R = (a = 1) => (Math.random() - 0.5) * a;
const MUT_RATE = { wet: 5, chilled: 4, frozen: 6, shocked: 9, gold: 6, rainbow: 9, choco: 4 };
function updateEmitters(dt, t, camPos) {
  for (const e of mutEmit.values()) {
    if (Math.hypot(e.x - camPos.x, e.z - camPos.z) > 50) continue;
    for (const m of e.m) {
      if (Math.random() > dt * (MUT_RATE[m] || 3)) continue;
      const x = e.x + R(1.1), z = e.z + R(1.1);
      switch (m) {
        case 'wet': spark(x, e.y + 1.4, z, '#58b4ff', 0, -1.5, 0, 0.9, 2); break;
        case 'chilled': spark(x, e.y + 1.5, z, '#c4f1ff', R(0.5), -0.8, R(0.5), 1.4, 0); break;
        case 'frozen': spark(x, e.y + 0.4 + Math.random(), z, '#ffffff', R(0.3), 0.3, R(0.3), 1.1, 0); spark(x, e.y + 1.4, z, '#8fe3ff', 0, -1, 0, 1, 0); break;
        case 'shocked': spark(e.x + R(0.6), e.y + Math.random() * 1.6, e.z + R(0.6), '#fff25a', R(5), R(5), R(5), 0.22, 0); break;
        case 'gold': spark(x, e.y, z, '#ffd23a', 0, 1.4, 0, 1.3, 0); break;
        case 'rainbow': _tc.setHSL((t * 0.7 + Math.random() * 0.3) % 1, 1, 0.6); spark(e.x + Math.sin(t * 4) * 0.5, e.y + 0.2, e.z + Math.cos(t * 4) * 0.5, _tc.getHex(), R(0.6), 1.6, R(0.6), 1.2, 0); break;
        case 'choco': spark(x, e.y + 1.3, z, '#9a5a22', 0, -1.4, 0, 0.9, 3); break;
      }
    }
  }
  pulseGroups.forEach((g) => { const v = 0.45 + 0.3 * Math.sin(t * 3 + g.id); g.traverse((m) => { if (m.isMesh && m.material) [].concat(m.material).forEach((mt) => { if (mt.emissive) mt.emissiveIntensity = v; }); }); });
}

// ---------- Sonido (sintetizado, sin archivos) ----------
const sfx = (() => {
  let ctx = null, master = null, amb = null, ambGain = null, noiseBuf = null, ambKind = null;
  let vol = parseFloat(store.get('jardin_vol', '0.7')); if (!isFinite(vol)) vol = 0.7;
  let muted = store.get('jardin_mute', '0') === '1';
  const level = () => (muted ? 0 : vol);
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = level(); master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      ambGain = ctx.createGain(); ambGain.gain.value = 0; ambGain.connect(master); ambient(ambKind);
    } catch (e) { ctx = null; }
  }
  function tone(f, dur, type = 'sine', v = 0.2, slide = 0, delay = 0) {
    if (!ctx || !level()) return; const t = ctx.currentTime + delay; const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, v, type = 'lowpass', delay = 0) {
    if (!ctx || !level()) return; const t = ctx.currentTime + delay; const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ctx.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  function ambient(kind) {
    ambKind = kind; if (!ctx) return; if (amb) { try { amb.stop(); } catch {} amb = null; }
    const cfg = { rain: [3200, 'bandpass', 0.5], thunder: [2400, 'bandpass', 0.6], frost: [450, 'lowpass', 0.45] }[kind];
    if (cfg) { amb = ctx.createBufferSource(); amb.buffer = noiseBuf; amb.loop = true; const f = ctx.createBiquadFilter(); f.type = cfg[1]; f.frequency.value = cfg[0]; amb.connect(f); f.connect(ambGain); amb.start(); ambGain.gain.setTargetAtTime(cfg[2], ctx.currentTime, 0.8); }
    else ambGain.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
  }
  return {
    init, ambient, tone, noise,
    get muted() { return muted; }, get vol() { return vol; },
    setVol(v) { vol = v; store.set('jardin_vol', String(v)); if (master) master.gain.value = level(); },
    toggleMute() { muted = !muted; store.set('jardin_mute', muted ? '1' : '0'); if (master) master.gain.value = level(); return muted; },
    pop() { tone(520, 0.12, 'triangle', 0.25, 300); }, click() { tone(700, 0.04, 'square', 0.05); },
    coin() { tone(988, 0.08, 'square', 0.09); tone(1319, 0.22, 'square', 0.09, 0, 0.07); },
    buy() { tone(660, 0.08, 'square', 0.09); tone(880, 0.12, 'square', 0.09, 0, 0.08); },
    hatch() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.2, 0, i * 0.1)); },
    chime() { [784, 988, 1175].forEach((f, i) => tone(f, 0.4, 'sine', 0.18, 0, i * 0.12)); },
    horn() { tone(220, 0.55, 'sawtooth', 0.14, 40); tone(330, 0.55, 'sawtooth', 0.11, 60, 0.05); },
    thunder() { noise(2, 180, 0.9, 'lowpass', 0.25); tone(55, 1.3, 'sine', 0.4, -20, 0.25); },
    zap() { noise(0.2, 3500, 0.3, 'highpass'); tone(1400, 0.16, 'sawtooth', 0.08, -900); },
    water() { noise(0.18, 1800, 0.1, 'bandpass'); },
    chirp() { const f = 2400 + Math.random() * 900; tone(f, 0.09, 'sine', 0.07, 500); tone(f + 300, 0.09, 'sine', 0.07, 400, 0.12); },
  };
})();
['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, () => sfx.init(), { passive: true }));
$('pMute').onclick = () => { const m = sfx.toggleMute(); $('pMute').textContent = m ? '🔇 Sonido: no' : '🔊 Sonido: sí'; };
$('pVol').value = Math.round(sfx.vol * 100); $('pVol').oninput = (e) => sfx.setVol(e.target.value / 100);
$('pMute').textContent = sfx.muted ? '🔇 Sonido: no' : '🔊 Sonido: sí';

// ---------- Rayos de tormenta ----------
const bolts = [];
function strike() {
  const cx = camera.position.x + R(90), cz = camera.position.z + R(90); const pts = []; let x = cx, z = cz;
  for (let y = 60; y >= 0; y -= 6) { pts.push(new THREE.Vector3(x, y, z)); x += R(7); z += R(7); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf4f8ff, fog: false }));
  scene.add(l); bolts.push({ l, t: 0 }); puff(cx, 1, cz, 0xffffcc, 6); sfx.thunder();
}
function updateBolts(dt) { for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; b.t += dt; if (b.t > 0.22) { scene.remove(b.l); b.l.geometry.dispose(); b.l.material.dispose(); bolts.splice(i, 1); } } }

// ---------- Eventos globales ----------
let ev = { k: null, until: 0 };
const emojiTexCache = {};
function emojiTex(e) {
  if (!emojiTexCache[e]) emojiTexCache[e] = canvasTex(64, (g, s) => { g.font = '46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, s / 2, s / 2 + 3); });
  return emojiTexCache[e];
}
const EVN = 260; const evGeo = new THREE.BufferGeometry(); const evArr = new Float32Array(EVN * 3);
for (let i = 0; i < EVN; i++) evArr.set([R(70), Math.random() * 32, R(70)], i * 3);
evGeo.setAttribute('position', new THREE.BufferAttribute(evArr, 3));
const evPts = new THREE.Points(evGeo, new THREE.PointsMaterial({ size: 1.5, map: emojiTex('💰'), transparent: true, alphaTest: 0.1, depthWrite: false, fog: false }));
evPts.visible = false; evPts.frustumCulled = false; scene.add(evPts);
const EV_FX = { rainbowgarden: { e: '✨', speed: -1.2, size: 1.2 }, sheckle_rain: { e: '💰', speed: 7, size: 1.6 }, chocolate_rain: { e: '🍫', speed: 6, size: 1.6 }, harvest_fest: { e: '🍂', speed: 2.5, size: 1.5 } };
const EV_LOOK = {
  rainbowgarden: { sky: 0xb8e8ff, hemi: 1.1, sun: 1.9, sunC: 0xfff0f8 }, sheckle_rain: { sky: 0xffe9a0, hemi: 1.05, sun: 1.9, sunC: 0xffe08a },
  chocolate_rain: { sky: 0xb98a62, hemi: 0.8, sun: 1.2, sunC: 0xffd2a0 }, laser_storm: { sky: 0x1a1038, hemi: 0.5, sun: 0.5, sunC: 0xb080ff, fogN: 25, fogF: 160 },
  harvest_fest: { sky: 0xffc98a, hemi: 1.0, sun: 1.7, sunC: 0xffc070 },
};
const evLook = () => (ev.k && EV_LOOK[ev.k]) || {};
function applyEventFx() {
  const f = ev.k && EV_FX[ev.k]; evPts.visible = !!f;
  if (f) { evPts.material.map = emojiTex(f.e); evPts.material.size = f.size; evPts.material.needsUpdate = true; }
  rainbowArc.visible = weather.k === 'rainbow' || ev.k === 'rainbowgarden';
}
function showBanner(k, quiet) {
  const e = EVENTS[k]; const b = $('banner'); b.style.background = `linear-gradient(${e.color},#222c)`;
  b.querySelector('b').textContent = `${e.emoji} ¡${e.name}!`; b.querySelector('span').textContent = e.desc;
  b.classList.add('show'); clearTimeout(showBanner.t); showBanner.t = setTimeout(() => b.classList.remove('show'), quiet ? 3500 : 7000);
}
function setEvent(m) {
  if (m.k) {
    ev = { k: m.k, until: m.until }; showBanner(m.k); sfx.horn(); sfx.chime();
    toast(`${EVENTS[m.k].emoji} ¡Evento: ${EVENTS[m.k].name}!` + (m.by ? ' (activado por ' + m.by + ')' : ''), 'gold'); chatLine('🎉', 'Evento: ' + EVENTS[m.k].name);
  } else { ev = { k: null, until: 0 }; if (m.ended && EVENTS[m.ended]) { toast('🎉 Terminó: ' + EVENTS[m.ended].name); chatLine('🎉', 'Terminó ' + EVENTS[m.ended].name); } }
  applyEventFx();
}
function showEventEnd(m) {
  const r = m.reward || {}, parts = [];
  if (r.sheckles) parts.push('💰' + fmt(r.sheckles));
  for (const k in r.seeds || {}) parts.push(r.seeds[k] + '× ' + CROPS[k].name);
  for (const k in r.eggs || {}) parts.push(r.eggs[k] + '× ' + EGGS[k].name);
  for (const k in r.gear || {}) parts.push(r.gear[k] + '× ' + GEAR[k].name);
  toast('🎁 Premio del evento: ' + parts.join(' · '), 'gold'); sfx.chime(); if (self) puff(self.root.position.x, 2.5, self.root.position.z, 0xffd23a, 16);
}
let laserT = 0, sparkleT = 0;
const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 50, 6);
const LASER_COLS = [0x2ad4ff, 0xff3dd0, 0x7dff3d, 0xffe83d];
const beams = [];
function updateEventFx(dt, t, camPos) {
  if (evPts.visible) {
    const f = EV_FX[ev.k]; evPts.position.set(camPos.x, 0, camPos.z);
    for (let i = 0; i < EVN; i++) { evArr[i * 3 + 1] -= f.speed * dt; evArr[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.8; if (f.speed > 0 ? evArr[i * 3 + 1] < 0 : evArr[i * 3 + 1] > 32) evArr[i * 3 + 1] = f.speed > 0 ? 32 : 0; }
    evGeo.attributes.position.needsUpdate = true;
  }
  if (ev.k === 'laser_storm') {
    laserT -= dt;
    if (laserT <= 0) {
      laserT = 0.25 + Math.random() * 0.4; const a = Math.random() * 6.28, r = Math.random() * 70; const x = Math.sin(a) * r, z = Math.cos(a) * r; const c = LASER_COLS[Math.floor(Math.random() * 4)];
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set(x, 25, z); m.rotation.z = R(0.5); scene.add(m); beams.push({ m, t: 0 }); puff(x, 0.5, z, c, 7); sfx.zap();
    }
  }
  for (let i = beams.length - 1; i >= 0; i--) { const b = beams[i]; b.t += dt; b.m.material.opacity = Math.max(0, 1 - b.t / 0.35); if (b.t > 0.35) { scene.remove(b.m); b.m.material.dispose(); beams.splice(i, 1); } }
  // motitas de luz en clima lindo
  const wk = weather.k;
  if (wk === 'sunny' || wk === 'rainbow' || ev.k === 'rainbowgarden') {
    sparkleT += dt; if (sparkleT > 0.06) { sparkleT = 0; _tc.setHSL((t * 0.2 + Math.random() * 0.2) % 1, wk === 'sunny' ? 0.2 : 1, 0.7); spark(camPos.x + R(36), 0.5 + Math.random() * 7, camPos.z + R(36), wk === 'sunny' ? '#fff3a0' : _tc.getHex(), R(0.8), 0.4, R(0.8), 2.5, 0); }
  }
}

// ---------- Info de la interfaz ----------
function hudTick() {
  const wk = weather.k;
  $('wx').textContent = wk ? `${WEATHER[wk].emoji} ${WEATHER[wk].name} · ${mmss(weather.until - srvNow())}` : '☀️ Despejado';
  $('rs').textContent = '🛒 Reposición ' + mmss(stock.next - srvNow());
  const evEl = $('ev');
  if (ev.k) { evEl.classList.remove('hidden'); evEl.textContent = `${EVENTS[ev.k].emoji} ${EVENTS[ev.k].name} · ${mmss(ev.until - srvNow())}`; } else evEl.classList.add('hidden');
  const d = plotData[myPlot]; let n = 0, ready = 0; if (d) for (const p of d.values()) { n++; if (p.r && !p.k.startsWith('egg:')) ready++; }
  $('plotchip').textContent = `🌾 Parcela ${n}/${GRID * GRID}` + (ready ? ` · 🧺 ${ready} listas` : '');
  updateShopSub();
  if ((wk === 'sunny' || wk === 'rainbow') && Math.random() < 0.25) sfx.chirp();
}

// ---------- Panel de administración (el servidor valida cada comando) ----------
let admBuilt = false, admKey = '';
const ADM_ITEMS = { seed: CROPS, egg: EGGS, gear: GEAR, pet: PETS };
function buildAdmin() {
  if (admBuilt) return; admBuilt = true;
  const wBtns = Object.keys(WEATHER).map((k) => `<button class="btn alt sm" data-w="${k}">${WEATHER[k].emoji} ${WEATHER[k].name}</button>`).join('') + '<button class="btn sm" data-w="">☀️ Despejar</button>';
  const eBtns = Object.keys(EVENTS).map((k) => `<button class="btn alt sm" data-e="${k}">${EVENTS[k].emoji} ${EVENTS[k].name}</button>`).join('') + '<button class="btn red sm" data-adm="stopEvent">⏹ Detener evento</button>';
  $('admBody').innerHTML = `<div class="sec">🖥️ Servidor</div><div id="admInfo" style="font-size:13px;line-height:1.5"></div>
    <div class="grid" style="margin-top:6px"><button class="btn sm" data-adm="restock">🛒 Reponer tiendas ya</button></div>
    <div class="sec">🌦️ Clima</div><div class="grid">${wBtns}</div>
    <div class="sec">🎉 Eventos</div><div class="grid">${eBtns}</div>
    <div class="sec">🎁 Dar recompensas</div>
    <div class="admrow"><select id="gTarget"></select><select id="gWhat"><option value="money">💰 Sheckles</option><option value="seed">🌱 Semilla</option><option value="egg">🥚 Huevo</option><option value="gear">🔧 Equipo</option><option value="pet">🐾 Mascota</option></select></div>
    <div class="admrow"><select id="gItem" class="hidden"></select><input id="gQty" type="number" value="1000" min="1"><button class="btn sm" id="gGo">Dar</button></div>
    <div class="sec">👥 Jugadores y parcelas</div><div id="admPlayers"></div>`;
  const fillItems = () => { const w = $('gWhat').value, it = $('gItem'); if (w === 'money') { it.classList.add('hidden'); return; } it.classList.remove('hidden'); it.innerHTML = Object.entries(ADM_ITEMS[w]).map(([k, d]) => `<option value="${k}">${d.emoji} ${d.name}</option>`).join(''); };
  $('gWhat').onchange = fillItems; fillItems();
  $('gGo').onclick = () => { const what = $('gWhat').value; net.send({ t: 'adm', cmd: 'give', target: $('gTarget').value === 'all' ? 'all' : +$('gTarget').value, what, k: what === 'money' ? null : $('gItem').value, qty: +$('gQty').value || 1 }); toast('🎁 Enviado', 'good'); };
  $('admBody').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.w !== undefined) net.send({ t: 'adm', cmd: 'weather', k: b.dataset.w || null });
    else if (b.dataset.e) net.send({ t: 'adm', cmd: 'event', k: b.dataset.e });
    else if (b.dataset.adm) net.send({ t: 'adm', cmd: b.dataset.adm });
    else if (b.dataset.kick) net.send({ t: 'adm', cmd: 'kick', target: +b.dataset.kick });
    else if (b.dataset.give) net.send({ t: 'adm', cmd: 'give', target: +b.dataset.give, what: 'money', qty: 1000 });
  });
}
function openAdmin() { if (!isOwner) return; buildAdmin(); openModal('admin'); net.send({ t: 'adm', cmd: 'state' }); }
setInterval(() => { if (isOwner && inGame && !$('admin').classList.contains('hidden')) net.send({ t: 'adm', cmd: 'state' }); }, 3000);
function renderAdmin(st) {
  if (!admBuilt || !st) return;
  const upt = st.uptime ? Math.floor(st.uptime / 3600) + 'h ' + Math.floor(st.uptime % 3600 / 60) + 'm' : '–';
  $('admInfo').innerHTML = `Jugadores: <b>${st.players.length}/${st.max}</b> · Cuentas: <b>${st.accounts ?? '?'}</b> · Encendido: <b>${upt}</b><br>
    Clima: <b>${st.weather.k ? WEATHER[st.weather.k].emoji + ' ' + WEATHER[st.weather.k].name + ' (' + mmss(st.weather.until - st.now) + ')' : 'despejado'}</b><br>
    Evento: <b>${st.event.k ? EVENTS[st.event.k].emoji + ' ' + EVENTS[st.event.k].name + ' (' + mmss(st.event.until - st.now) + ')' : 'ninguno'}</b> · próximo automático en ${mmss(st.nextEvent - st.now)}<br>
    Reposición de tiendas en <b>${mmss(st.nextRestock - st.now)}</b> · Owners: ${(st.owners || []).join(', ') || '–'}`;
  const key = st.players.map((p) => p.id + p.name).join('|');
  if (key !== admKey) { admKey = key; const cur = $('gTarget').value; $('gTarget').innerHTML = '<option value="all">👥 Todos</option>' + st.players.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join(''); if ([...$('gTarget').options].some((o) => o.value === cur)) $('gTarget').value = cur; }
  $('admPlayers').innerHTML = st.players.map((p) => {
    const crops = Object.entries(p.crops).map(([k, n]) => CROPS[k].emoji + n).join(' ') || '—';
    return `<div class="item"><div class="e">${p.owner ? '👑' : '🧑‍🌾'}</div><div class="t"><b>${esc(p.name)}</b> <small>Parcela ${p.plot + 1} · 💰${fmt(p.sh)} · 🐾${p.pets} · 🧺${p.fruits}</small><small>🌱 ${p.plants} plantas (${p.ready} listas, ${p.mut} mutadas, ${p.eggs} huevos): ${crops}</small></div><div style="display:flex;flex-direction:column;gap:4px"><button class="btn sm" data-give="${p.id}">+💰1000</button>${p.owner ? '' : `<button class="btn red sm" data-kick="${p.id}">Expulsar</button>`}</div></div>`;
  }).join('');
}
$('bAdmin').onclick = openAdmin;
$('bPets').onclick = () => { bagTab = 'pets'; openModal('bag'); };

// =====================================================================
//  Arranque
// =====================================================================
(async function boot() {
  const bar = $('loadbar'), txt = $('loadtext');
  try { txt.textContent = 'Descargando modelos 3D…'; await loadPack((p) => { bar.style.width = Math.round(p * 100) + '%'; }); }
  catch (e) { console.warn(e); txt.textContent = 'No se encontró models.pack: se usarán formas simples.'; await new Promise((r) => setTimeout(r, 1200)); }
  buildCropProtos(); buildDecor(); buildNPCs();
  $('loading').classList.add('hidden'); $('menu').classList.remove('hidden');
  if (!serverUrl()) $('menuStatus').textContent = 'Este sitio no tiene servidor multijugador: configurá config.js (ver README)';
  frame();
})();
window.__game = { scene, camera, players, plotData, get me() { return me; }, get weather() { return weather; } };
