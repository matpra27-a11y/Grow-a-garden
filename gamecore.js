// =====================================================================
//  gamecore.js  -  Lógica del juego (la usa el SERVIDOR y el modo OFFLINE)
//  No depende de three.js ni del navegador. Es "autoritativa": el
//  servidor decide plantas, dinero, tiendas, clima, etc.
// =====================================================================

export const MAX_PLAYERS = 32;          // cantidad de parcelas = jugadores máximos
export const CELL = 2;                  // tamaño de una celda de siembra (m)
export const GRID = 8;                  // 8x8 celdas por parcela
export const PLOT_SIZE = CELL * GRID;   // 16 m
export const WORLD_RADIUS = 125;
export const GROW_SPEED = +(globalThis.process && globalThis.process.env && globalThis.process.env.GROW_SPEED) || 1; // 1 = normal (en el servidor: GROW_SPEED=10 para probar)

// ---------- Cultivos ----------
// seed: precio de la semilla | sell: valor base de la fruta | grow: segundos hasta madurar
// regrow: si >0 la planta vuelve a dar frutos cada N segundos | w: peso kg [min,max]
// chance: probabilidad de aparecer en la tienda | stock: [min,max] unidades por reposición
export const CROPS = {
  carrot:     { name: 'Zanahoria', emoji: '🥕', seed: 10,   sell: 20,   grow: 20,  regrow: 0,  w: [0.2, 0.5],  chance: 1.0,  stock: [4, 8],  size: 1.1 },
  strawberry: { name: 'Frutilla',  emoji: '🍓', seed: 50,   sell: 32,   grow: 40,  regrow: 25, w: [0.1, 0.3],  chance: 0.95, stock: [3, 6],  size: 1.2 },
  blueberry:  { name: 'Arándano',  emoji: '🫐', seed: 400,  sell: 70,   grow: 70,  regrow: 40, w: [0.05, 0.2], chance: 0.8,  stock: [2, 4],  size: 1.5 },
  tomato:     { name: 'Tomate',    emoji: '🍅', seed: 800,  sell: 110,  grow: 90,  regrow: 55, w: [0.3, 0.8],  chance: 0.6,  stock: [2, 4],  size: 1.7 },
  corn:       { name: 'Maíz',      emoji: '🌽', seed: 1300, sell: 190,  grow: 120, regrow: 80, w: [0.4, 1.0],  chance: 0.45, stock: [1, 3],  size: 2.3 },
  sunflower:  { name: 'Girasol',   emoji: '🌻', seed: 2000, sell: 520,  grow: 140, regrow: 0,  w: [1, 3],      chance: 0.3,  stock: [1, 2],  size: 2.4 },
  watermelon: { name: 'Sandía',    emoji: '🍉', seed: 2500, sell: 850,  grow: 180, regrow: 0,  w: [4, 10],     chance: 0.25, stock: [1, 2],  size: 1.8 },
  pumpkin:    { name: 'Calabaza',  emoji: '🎃', seed: 3000, sell: 1150, grow: 200, regrow: 0,  w: [4, 9],      chance: 0.2,  stock: [1, 2],  size: 1.8 },
  apple:      { name: 'Manzano',   emoji: '🍎', seed: 3250, sell: 280,  grow: 300, regrow: 150, w: [0.2, 0.5], chance: 0.15, stock: [1, 1],  size: 4.2 },
};

// ---------- Mutaciones (se suman: 1 + Σ(mult-1)) ----------
export const MUTS = {
  wet:     { name: 'Mojada',   mult: 2,   color: '#4aa8ff' },
  chilled: { name: 'Fría',     mult: 2,   color: '#9be7ff' },
  frozen:  { name: 'Congelada',mult: 10,  color: '#d6f6ff' },
  shocked: { name: 'Electrizada', mult: 100, color: '#ffe44a' },
  gold:    { name: 'Dorada',   mult: 20,  color: '#ffd23a' },
  rainbow: { name: 'Arcoíris', mult: 50,  color: '#ff6ad5' },
};

// ---------- Clima (global para todo el servidor) ----------
export const WEATHER = {
  rain:    { name: 'Lluvia',      emoji: '🌧️', dur: 60, grow: 1.5, muts: { wet: 0.30 } },
  thunder: { name: 'Tormenta',    emoji: '⛈️', dur: 60, grow: 1.5, muts: { wet: 0.30, shocked: 0.002 } },
  frost:   { name: 'Helada',      emoji: '❄️', dur: 60, grow: 1.0, muts: { chilled: 0.25, frozen: 0.02 } },
  sunny:   { name: 'Día de sol',  emoji: '☀️', dur: 45, grow: 1.2, muts: { gold: 0.004 } },
  rainbow: { name: 'Arcoíris',    emoji: '🌈', dur: 45, grow: 1.0, muts: { rainbow: 0.003, gold: 0.004 } },
};
export const WEATHER_EVERY = [100, 200]; // seg entre eventos (aleatorio)

// ---------- Huevos y mascotas ----------
export const EGGS = {
  common: { name: 'Huevo común', emoji: '🥚', price: 150, hatch: 45, pets: { hen: 40, duck: 30, sheep: 18, pig: 12 }, chance: 1.0, stock: [2, 4] },
  rare:   { name: 'Huevo raro',  emoji: '🥚', price: 1500, hatch: 90, pets: { sheep: 30, pig: 30, cow: 25, horse: 8, sheepdog: 7 }, chance: 0.35, stock: [1, 2] },
};
export const PETS = {
  hen:      { name: 'Gallina',  emoji: '🐔', sell: 0.03 },
  duck:     { name: 'Pato',     emoji: '🦆', grow: 0.03 },
  sheep:    { name: 'Oveja',    emoji: '🐑', grow: 0.05 },
  pig:      { name: 'Chancho',  emoji: '🐖', sell: 0.06 },
  cow:      { name: 'Vaca',     emoji: '🐄', grow: 0.08 },
  horse:    { name: 'Caballo',  emoji: '🐴', sell: 0.10, grow: 0.05 },
  sheepdog: { name: 'Perro pastor', emoji: '🐕', sell: 0.05, grow: 0.05 },
};
export const MAX_EQUIPPED = 3;

// ---------- Equipo ----------
export const GEAR = {
  sprinkler: { name: 'Aspersor', emoji: '💦', price: 350, chance: 1.0, stock: [2, 4], desc: 'Acelera x1.6 las plantas cercanas por 3 min', radius: 5, dur: 180, boost: 1.6 },
};

// ---------- Mapa: parcelas en dos anillos alrededor del centro ----------
const RING1 = { n: 12, r: 46 }, RING2 = { n: 20, r: 74 };
export function plotInfo(i) {
  const ring = i < RING1.n ? RING1 : RING2;
  const k = i < RING1.n ? i : i - RING1.n;
  const a = (k / ring.n) * Math.PI * 2 + (i < RING1.n ? 0 : Math.PI / ring.n);
  const x = Math.cos(a) * ring.r, z = Math.sin(a) * ring.r;
  // rot: ángulo Y para que el "frente" de la parcela mire al centro
  const rot = Math.atan2(-x, -z);
  return { x, z, rot };
}
// Posición mundial del centro de la celda c (0..63) en la parcela i
export function cellWorld(i, c) {
  const p = plotInfo(i);
  const cx = (c % GRID) - (GRID - 1) / 2, cz = Math.floor(c / GRID) - (GRID - 1) / 2;
  const lx = cx * CELL, lz = cz * CELL;
  const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
  return { x: p.x + lx * cs + lz * sn, z: p.z - lx * sn + lz * cs };
}
// Convierte punto mundial -> celda de la parcela i (o -1 si cae fuera)
export function worldToCell(i, wx, wz) {
  const p = plotInfo(i);
  const dx = wx - p.x, dz = wz - p.z;
  const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const gx = Math.floor(lx / CELL + GRID / 2), gz = Math.floor(lz / CELL + GRID / 2);
  if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return -1;
  return gz * GRID + gx;
}
// Tiendas / NPCs en el centro
export const NPCS = {
  seed:  { x: -17, z: 4,  rot: Math.PI / 2,  name: 'Sam',   title: 'Tienda de semillas', shop: 'seed',  model: 'gardener' },
  gear:  { x: 17,  z: 4,  rot: -Math.PI / 2, name: 'Abuelo Tito', title: 'Tienda de equipo', shop: 'gear', model: 'grandpa' },
  egg:   { x: 0,   z: -17, rot: 0,           name: 'Abuela Rosa', title: 'Huevos de mascota', shop: 'egg', model: 'grandma' },
  sell:  { x: 0,   z: 17,  rot: Math.PI,     name: 'Steve', title: 'Vender cosecha', shop: 'sell',  model: 'rancher' },
};
export const NPC_RANGE = 13;
export const SPAWN = { x: 0, z: 0 };

// ---------- Utilidades ----------
const rr = (rng, a, b) => a + rng() * (b - a);
const ri = (rng, a, b) => Math.floor(rr(rng, a, b + 1));
function pickWeighted(rng, table) {
  let tot = 0; for (const k in table) tot += table[k];
  let r = rng() * tot;
  for (const k in table) { r -= table[k]; if (r <= 0) return k; }
  return Object.keys(table)[0];
}
export function stageOf(p, grow) {
  const f = p / grow;
  return f >= 1 ? 3 : f >= 0.5 ? 2 : f >= 0.2 ? 1 : 0; // 0..3 (3 = madura)
}
export function fruitValue(f) {
  const c = CROPS[f.k];
  const avg = (c.w[0] + c.w[1]) / 2;
  const sizeF = Math.min(4, Math.max(0.3, Math.pow(f.w / avg, 1.5)));
  let m = 1; for (const k of f.m) m += MUTS[k].mult - 1;
  return Math.max(1, Math.round(c.sell * sizeF * m));
}
const clampName = (s) => String(s || 'Granjero').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 14) || 'Granjero';

// =====================================================================
export class World {
  /**
   * @param opts.send(id,msg)   envía a un jugador
   * @param opts.broadcast(msg, exceptId)
   * @param opts.rng            función aleatoria
   */
  constructor(opts = {}) {
    this.send = opts.send || (() => {});
    this.broadcast = opts.broadcast || (() => {});
    this.rng = opts.rng || Math.random;
    this.players = new Map();       // id -> player
    this.profiles = new Map();      // uid -> perfil guardado
    this.plots = new Array(MAX_PLAYERS).fill(null); // plotIndex -> playerId
    this.nextId = 1;
    this.time = 0;                  // segundos de juego
    this.stock = { seed: {}, gear: {}, egg: {} };
    this.nextRestock = 0;
    this.restockEvery = 300;
    this.weather = null;            // {k, until}
    this.nextWeather = rr(this.rng, 40, 80);
    this.lbTimer = 0;
    this.restock();
  }

  // ---------------- Jugadores ----------------
  newProfile(name) {
    return {
      name, sheckles: 40,
      seeds: { carrot: 3, strawberry: 1 },
      eggs: {}, gear: {}, fruits: [], pets: [], equipped: [],
      plants: [], lastSeen: Date.now(), stats: { harvested: 0, earned: 0 },
    };
  }
  join(uid, info) {
    if (this.players.size >= MAX_PLAYERS) return { error: 'Servidor lleno (' + MAX_PLAYERS + ' jugadores)' };
    for (const p of this.players.values()) if (p.uid === uid) this.leave(p.id); // sesión duplicada
    const plot = this.plots.indexOf(null);
    const id = this.nextId++;
    const name = clampName(info.name);
    let prof = this.profiles.get(uid);
    if (!prof) { prof = this.newProfile(name); this.profiles.set(uid, prof); }
    prof.name = name;
    // crecimiento offline (máx 1 hora)
    const away = Math.min(3600, Math.max(0, (Date.now() - (prof.lastSeen || Date.now())) / 1000));
    if (away > 5) for (const pl of prof.plants) this.growPlant(pl, away, 1);
    const spawn = plotInfo(plot);
    const pl = {
      id, uid, plot, prof, name, avatar: String(info.avatar || 'farmer'),
      x: SPAWN.x + (this.rng() - 0.5) * 6, z: SPAWN.z + (this.rng() - 0.5) * 6, ry: 0, mv: 0,
      lastWater: 0, lastChat: 0, joinedAt: this.time,
    };
    this.plots[plot] = id;
    this.players.set(id, pl);
    this.broadcast({ t: 'pj', p: this.pub(pl) }, id);
    this.broadcast(this.plotMsg(plot), id);
    this.send(id, {
      t: 'welcome', id, plot, now: this.time, me: this.me(pl),
      players: [...this.players.values()].map((q) => this.pub(q)),
      plots: this.allPlots(), stock: this.stockMsg(), weather: this.weatherMsg(),
    });
    return { id };
  }
  leave(id) {
    const pl = this.players.get(id); if (!pl) return;
    pl.prof.lastSeen = Date.now();
    this.plots[pl.plot] = null;
    this.players.delete(id);
    this.broadcast({ t: 'pl', id, plot: pl.plot });
  }
  pub(p) { return { id: p.id, name: p.name, avatar: p.avatar, plot: p.plot, x: p.x, z: p.z, ry: p.ry, sh: p.prof.sheckles, pets: p.prof.equipped.map((i) => p.prof.pets[i]) }; }
  me(p) {
    const f = p.prof;
    return { name: p.name, sheckles: f.sheckles, seeds: f.seeds, eggs: f.eggs, gear: f.gear, fruits: f.fruits, pets: f.pets, equipped: f.equipped, stats: f.stats };
  }
  sendMe(p) { this.send(p.id, { t: 'me', me: this.me(p) }); }
  plotMsg(i) {
    const id = this.plots[i]; const pl = id && this.players.get(id);
    return { t: 'plot', i, plants: pl ? pl.prof.plants.map(pubPlant) : [] };
  }
  allPlots() { const o = {}; this.players.forEach((p) => { o[p.plot] = p.prof.plants.map(pubPlant); }); return o; }
  sendPlot(i) { this.broadcast(this.plotMsg(i)); }
  toast(p, msg, kind) { this.send(p.id, { t: 'toast', msg, kind: kind || '' }); }

  // ---------------- Tienda ----------------
  restock() {
    const r = this.rng;
    const s = {};
    for (const k in CROPS) { const c = CROPS[k]; if (k === 'carrot' || r() < c.chance) s[k] = ri(r, c.stock[0], c.stock[1]); }
    this.stock.seed = s;
    const g = {}; for (const k in GEAR) if (r() < GEAR[k].chance) g[k] = ri(r, GEAR[k].stock[0], GEAR[k].stock[1]);
    this.stock.gear = g;
    const e = {}; for (const k in EGGS) if (r() < EGGS[k].chance) e[k] = ri(r, EGGS[k].stock[0], EGGS[k].stock[1]);
    this.stock.egg = e;
    this.nextRestock = this.time + this.restockEvery;
  }
  stockMsg() { return { seed: this.stock.seed, gear: this.stock.gear, egg: this.stock.egg, next: this.nextRestock }; }
  weatherMsg() { return this.weather ? { k: this.weather.k, until: this.weather.until } : { k: null, until: 0 }; }

  near(p, shop) {
    const n = NPCS[shop]; if (!n) return false;
    return Math.hypot(p.x - n.x, p.z - n.z) <= NPC_RANGE;
  }

  // ---------------- Plantas ----------------
  growMult(p, plant) {
    let m = this.weather ? WEATHER[this.weather.k].grow : 1;
    const f = p.prof;
    for (const idx of f.equipped) { const pet = PETS[f.pets[idx]]; if (pet && pet.grow) m += pet.grow; }
    if (p.sprinklers) {
      const ci = plant.c;
      for (const s of p.sprinklers) {
        const a = cellWorldLocal(s.c), b = cellWorldLocal(ci);
        if (Math.hypot(a.x - b.x, a.z - b.z) <= GEAR.sprinkler.radius) { m *= GEAR.sprinkler.boost; break; }
      }
    }
    return m * GROW_SPEED;
  }
  growPlant(plant, dt, mult) {
    if (plant.k.startsWith('egg:')) { plant.p = Math.min(plant.g, plant.p + dt * mult); return; }
    if (plant.ready) return;
    plant.p += dt * mult;
    if (plant.p >= plant.g) { plant.p = plant.g; plant.ready = true; }
  }
  rollMutations(plant, w, dt) {
    const wd = WEATHER[w]; if (!wd) return;
    for (const m in wd.muts) {
      if (plant.m.includes(m)) continue;
      if (plant.m.length >= 3) break;
      if (this.rng() < wd.muts[m] * dt) {
        if (m === 'frozen') plant.m = plant.m.filter((x) => x !== 'chilled');
        plant.m.push(m);
      }
    }
  }

  tick(dt) {
    this.time += dt;
    // clima
    if (this.weather && this.time >= this.weather.until) { this.weather = null; this.nextWeather = this.time + rr(this.rng, WEATHER_EVERY[0], WEATHER_EVERY[1]); this.broadcast({ t: 'weather', ...this.weatherMsg() }); }
    else if (!this.weather && this.time >= this.nextWeather) {
      const k = pickWeighted(this.rng, { rain: 30, thunder: 15, frost: 20, sunny: 25, rainbow: 10 });
      this.weather = { k, until: this.time + WEATHER[k].dur };
      this.broadcast({ t: 'weather', ...this.weatherMsg() });
    }
    // restock
    if (this.time >= this.nextRestock) { this.restock(); this.broadcast({ t: 'stock', ...this.stockMsg() }); }
    // plantas
    const w = this.weather && this.weather.k;
    this.players.forEach((p) => {
      if (p.sprinklers) p.sprinklers = p.sprinklers.filter((s) => s.until > this.time);
      let changed = false;
      for (const pl of p.prof.plants) {
        const before = plantStage(pl);
        const wasReady = pl.ready;
        this.growPlant(pl, dt, this.growMult(p, pl));
        if (w && !pl.k.startsWith('egg:')) {
          const nm = pl.m.length; this.rollMutations(pl, w, dt); if (pl.m.length !== nm) changed = true;
        }
        if (plantStage(pl) !== before || wasReady !== pl.ready) changed = true;
      }
      if (changed) this.sendPlot(p.plot);
    });
    this.lbTimer += dt;
    if (this.lbTimer >= 4) { this.lbTimer = 0; this.broadcast({ t: 'lb', d: [...this.players.values()].map((p) => [p.id, p.prof.sheckles]) }); }
  }

  // posiciones: se llama a ~10 Hz
  positionsMsg() {
    const d = [];
    this.players.forEach((p) => d.push([p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), p.mv]));
    return { t: 'ps', d };
  }

  // ---------------- Mensajes del cliente ----------------
  handle(id, m) {
    const p = this.players.get(id); if (!p || !m || typeof m !== 'object') return;
    const f = p.prof;
    switch (m.t) {
      case 'pos': {
        if (!isFinite(m.x) || !isFinite(m.z)) return;
        const r = Math.hypot(m.x, m.z);
        const k = r > WORLD_RADIUS ? WORLD_RADIUS / r : 1;
        p.x = m.x * k; p.z = m.z * k; p.ry = +m.ry || 0; p.mv = m.mv ? 1 : 0;
        break;
      }
      case 'plant': {
        const cell = m.cell | 0; const crop = CROPS[m.k];
        if (!crop || cell < 0 || cell >= GRID * GRID) return;
        if (!f.seeds[m.k] || f.seeds[m.k] <= 0) return this.toast(p, 'No tenés esa semilla', 'bad');
        if (f.plants.some((q) => q.c === cell)) return this.toast(p, 'Ya hay algo ahí', 'bad');
        if (!this.inPlotRange(p, cell)) return this.toast(p, 'Acercate más a tu parcela', 'bad');
        f.seeds[m.k]--; if (f.seeds[m.k] <= 0) delete f.seeds[m.k];
        const avg = rr(this.rng, crop.w[0], crop.w[1]);
        const muts = [];
        f.plants.push({ c: cell, k: m.k, p: 0, g: crop.grow, ready: false, m: muts, w: avg, n: 0 });
        this.sendPlot(p.plot); this.sendMe(p); break;
      }
      case 'place': { // huevos y aspersores
        const cell = m.cell | 0;
        if (cell < 0 || cell >= GRID * GRID || f.plants.some((q) => q.c === cell)) return this.toast(p, 'Ya hay algo ahí', 'bad');
        if (!this.inPlotRange(p, cell)) return this.toast(p, 'Acercate más a tu parcela', 'bad');
        if (m.k in EGGS) {
          if (!f.eggs[m.k]) return;
          f.eggs[m.k]--; if (f.eggs[m.k] <= 0) delete f.eggs[m.k];
          f.plants.push({ c: cell, k: 'egg:' + m.k, p: 0, g: EGGS[m.k].hatch, ready: false, m: [], w: 1, n: 0 });
          this.toast(p, '¡Huevo colocado! Eclosionará pronto', 'good');
        } else if (m.k === 'sprinkler') {
          if (!f.gear.sprinkler) return;
          f.gear.sprinkler--; if (f.gear.sprinkler <= 0) delete f.gear.sprinkler;
          (p.sprinklers = p.sprinklers || []).push({ c: cell, until: this.time + GEAR.sprinkler.dur });
          this.broadcast({ t: 'spr', plot: p.plot, c: cell, dur: GEAR.sprinkler.dur });
          this.toast(p, 'Aspersor activado 💦', 'good');
        } else return;
        this.sendPlot(p.plot); this.sendMe(p); break;
      }
      case 'water': {
        const now = this.time; if (now - p.lastWater < 0.35) return;
        const pl = f.plants.find((q) => q.c === (m.cell | 0)); if (!pl || pl.ready) return;
        if (!this.inPlotRange(p, pl.c)) return;
        if (pl.n >= 6) return this.toast(p, 'Ya está bien regada', 'bad');
        p.lastWater = now; pl.n++;
        pl.p = Math.min(pl.g, pl.p + pl.g * 0.07);
        if (pl.p >= pl.g) pl.ready = true;
        this.broadcast({ t: 'wet', plot: p.plot, c: pl.c });
        this.sendPlot(p.plot); break;
      }
      case 'shovel': {
        const i = f.plants.findIndex((q) => q.c === (m.cell | 0)); if (i < 0) return;
        if (!this.inPlotRange(p, f.plants[i].c)) return;
        f.plants.splice(i, 1); this.sendPlot(p.plot); break;
      }
      case 'harvest': case 'harvestAll': {
        const cells = m.t === 'harvestAll' ? f.plants.filter((q) => q.ready && !q.k.startsWith('egg:')).map((q) => q.c) : [m.cell | 0];
        let n = 0;
        for (const c of cells) {
          const pl = f.plants.find((q) => q.c === c); if (!pl || !pl.ready || pl.k.startsWith('egg:')) continue;
          if (!this.inPlotRange(p, c, m.t === 'harvestAll' ? 40 : undefined)) continue;
          const crop = CROPS[pl.k];
          const count = crop.regrow ? ri(this.rng, 1, 3) : 1;
          for (let i = 0; i < count; i++) {
            const mm = pl.m.slice();
            if (this.rng() < 0.01) mm.push('gold');
            f.fruits.push({ k: pl.k, w: +(pl.w * rr(this.rng, 0.85, 1.25)).toFixed(2), m: [...new Set(mm)] });
          }
          n += count; f.stats.harvested += count;
          if (crop.regrow) { pl.ready = false; pl.p = pl.g - crop.regrow; pl.m = []; pl.n = 0; }
          else f.plants.splice(f.plants.indexOf(pl), 1);
        }
        if (f.fruits.length > 400) f.fruits.splice(0, f.fruits.length - 400);
        if (n) { this.sendPlot(p.plot); this.sendMe(p); this.send(p.id, { t: 'harv', n }); }
        break;
      }
      case 'hatch': {
        const pl = f.plants.find((q) => q.c === (m.cell | 0)); if (!pl || !pl.k.startsWith('egg:') || pl.p < pl.g) return;
        const egg = EGGS[pl.k.slice(4)];
        const pet = pickWeighted(this.rng, egg.pets);
        f.plants.splice(f.plants.indexOf(pl), 1);
        f.pets.push(pet);
        if (f.equipped.length < MAX_EQUIPPED) f.equipped.push(f.pets.length - 1);
        this.send(p.id, { t: 'hatched', pet });
        this.broadcast({ t: 'pi', id: p.id, pets: f.equipped.map((i) => f.pets[i]) }, p.id);
        this.sendPlot(p.plot); this.sendMe(p); break;
      }
      case 'equip': {
        const i = m.idx | 0; if (i < 0 || i >= f.pets.length) return;
        const at = f.equipped.indexOf(i);
        if (at >= 0) f.equipped.splice(at, 1);
        else { if (f.equipped.length >= MAX_EQUIPPED) f.equipped.shift(); f.equipped.push(i); }
        this.broadcast({ t: 'pi', id: p.id, pets: f.equipped.map((j) => f.pets[j]) });
        this.sendMe(p); break;
      }
      case 'buy': {
        const shop = m.shop; if (!this.near(p, shop)) return this.toast(p, 'Acercate al vendedor', 'bad');
        const defs = shop === 'seed' ? CROPS : shop === 'gear' ? GEAR : shop === 'egg' ? EGGS : null; if (!defs) return;
        const d = defs[m.k]; const st = this.stock[shop]; if (!d) return;
        const qty = Math.max(1, Math.min(50, m.qty | 0 || 1));
        const have = st[m.k] || 0;
        if (have <= 0) return this.toast(p, 'Sin stock. Esperá la reposición', 'bad');
        const n = Math.min(qty, have);
        const price = (shop === 'seed' ? d.seed : d.price) * n;
        if (f.sheckles < price) return this.toast(p, 'No te alcanza el dinero 💸', 'bad');
        f.sheckles -= price; st[m.k] = have - n; if (st[m.k] <= 0) delete st[m.k];
        const inv = shop === 'seed' ? f.seeds : shop === 'gear' ? f.gear : f.eggs;
        inv[m.k] = (inv[m.k] || 0) + n;
        this.toast(p, 'Compraste ' + n + ' × ' + d.name, 'good');
        this.sendMe(p); this.broadcast({ t: 'stock', ...this.stockMsg() }); break;
      }
      case 'sell': {
        if (!this.near(p, 'sell')) return this.toast(p, 'Acercate a Steve para vender', 'bad');
        let list;
        if (m.mode === 'one') { const i = m.idx | 0; if (i < 0 || i >= f.fruits.length) return; list = [i]; }
        else list = f.fruits.map((_, i) => i);
        if (!list.length) return this.toast(p, 'No tenés frutas para vender', 'bad');
        let bonus = 1; for (const idx of f.equipped) { const pet = PETS[f.pets[idx]]; if (pet && pet.sell) bonus += pet.sell; }
        let total = 0; for (const i of list) total += fruitValue(f.fruits[i]);
        total = Math.round(total * bonus);
        const set = new Set(list); f.fruits = f.fruits.filter((_, i) => !set.has(i));
        f.sheckles += total; f.stats.earned += total;
        this.send(p.id, { t: 'sold', total, n: list.length });
        this.sendMe(p); break;
      }
      case 'chat': {
        const now = this.time; if (now - p.lastChat < 1.2) return; p.lastChat = now;
        const text = String(m.text || '').replace(/[<>]/g, '').trim().slice(0, 100); if (!text) return;
        this.broadcast({ t: 'chat', id: p.id, name: p.name, text });
        break;
      }
    }
  }
  inPlotRange(p, cell, max) {
    const w = cellWorld(p.plot, cell);
    return Math.hypot(p.x - w.x, p.z - w.z) <= (max || 24);
  }

  // ---------------- Persistencia ----------------
  exportProfiles() {
    const o = {};
    this.profiles.forEach((v, k) => { o[k] = v; });
    this.players.forEach((p) => { p.prof.lastSeen = Date.now(); });
    return o;
  }
  importProfiles(o) { for (const k in o || {}) this.profiles.set(k, o[k]); }
}

function pubPlant(p) { return { c: p.c, k: p.k, p: +p.p.toFixed(1), g: p.g, r: p.ready ? 1 : 0, m: p.m, w: p.w }; }
export function plantStage(p) { return p.ready ? 3 : stageOf(p.p, p.g); }
function cellWorldLocal(c) { return { x: ((c % GRID) - (GRID - 1) / 2) * CELL, z: (Math.floor(c / GRID) - (GRID - 1) / 2) * CELL }; }

// =====================================================================
//  Bots (para ver el mundo lleno aunque no haya gente conectada)
// =====================================================================
const BOT_NAMES = ['Lucía', 'Tomás', 'Valen', 'Mica', 'Joaquín', 'Sofi', 'Nico', 'Cami', 'Fede', 'Agus', 'Pipa', 'Rocío', 'Santi', 'Bauti', 'Mora', 'Lola', 'Thiago', 'Emma', 'Facu', 'Juli', 'Brenda', 'Maxi', 'Nahuel', 'Abril', 'Ian', 'Delfi', 'Gonza', 'Zoe', 'Lauti', 'Mili', 'Ramiro', 'Pili'];
const BOT_AVATARS = ['farmer', 'farmerwoman', 'grandma', 'grandpa', 'rancher', 'shepherd', 'milkmaid', 'beekeeper', 'farmkid'];
export class Bots {
  constructor(world, count) {
    this.world = world; this.bots = [];
    for (let i = 0; i < count; i++) {
      const r = world.join('bot-' + i, { name: BOT_NAMES[i % BOT_NAMES.length], avatar: BOT_AVATARS[i % BOT_AVATARS.length] });
      if (r.error) break;
      const p = world.players.get(r.id); p.isBot = true;
      p.prof.sheckles = Math.floor(Math.random() * 3000);
      this.bots.push({ id: r.id, tx: p.x, tz: p.z, wait: Math.random() * 3, act: null });
    }
  }
  tick(dt) {
    const w = this.world;
    for (const b of this.bots) {
      const p = w.players.get(b.id); if (!p) continue;
      const dx = b.tx - p.x, dz = b.tz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.5) { const s = Math.min(d, 7 * dt); p.x += dx / d * s; p.z += dz / d * s; p.ry = Math.atan2(dx, dz); p.mv = 1; continue; }
      p.mv = 0;
      if (b.act) { const a = b.act; b.act = null; w.handle(p.id, a); b.wait = 0.6; continue; }
      b.wait -= dt; if (b.wait > 0) continue;
      const f = p.prof, r = Math.random();
      const ripe = f.plants.find((q) => q.ready && !q.k.startsWith('egg:'));
      if (ripe) { const c = cellWorld(p.plot, ripe.c); b.tx = c.x; b.tz = c.z; b.act = { t: 'harvest', cell: ripe.c }; }
      else if (r < 0.4) {
        const free = []; for (let c = 0; c < GRID * GRID; c++) if (!f.plants.some((q) => q.c === c)) free.push(c);
        let k = Object.keys(f.seeds)[0];
        if (!k && f.sheckles >= 10) { f.sheckles -= 10; f.seeds.carrot = 1; k = 'carrot'; }
        if (k && free.length) { const cell = free[Math.floor(Math.random() * free.length)]; const c = cellWorld(p.plot, cell); b.tx = c.x; b.tz = c.z; b.act = { t: 'plant', cell, k }; }
      } else if (r < 0.6 && f.fruits.length) { b.tx = NPCS.sell.x + (Math.random() - 0.5) * 8; b.tz = NPCS.sell.z - 6; b.act = { t: 'sell', mode: 'all' }; }
      else { const a = Math.random() * Math.PI * 2, rad = Math.random() * 28; b.tx = Math.cos(a) * rad; b.tz = Math.sin(a) * rad; b.wait = 1 + Math.random() * 4; }
    }
  }
}
