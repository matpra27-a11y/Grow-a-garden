// =====================================================================
//  gamecore.js  -  Lógica del juego (la usa el SERVIDOR y el modo OFFLINE)
//  No depende de three.js ni del navegador. Es "autoritativa": el
//  servidor decide plantas, dinero, tiendas, clima, etc.
// =====================================================================

export const MAX_PLAYERS = 4;           // jugadores reales máximos = cantidad de parcelas
export const CELL = 2;                  // tamaño de una celda de siembra (m)
export const GRID = 16;                 // grilla MÁXIMA (el índice de celda es z*16 + x). La parcela empieza en 8x8 centrada.
export const PLOT_SIZE = CELL * GRID;   // 32 m (tamaño máximo)
// Mejoras de parcela: nivel 0..4 -> 8x8, 10x10, 12x12, 14x14, 16x16
export const PLOT_LEVELS = [{ n: 8, cost: 0 }, { n: 10, cost: 1500 }, { n: 12, cost: 12000 }, { n: 14, cost: 75000 }, { n: 16, cost: 400000 }];
export const levelSize = (lvl) => PLOT_LEVELS[Math.max(0, Math.min(PLOT_LEVELS.length - 1, lvl | 0))].n;
export function cellOk(lvl, c) { // ¿la celda c existe (está desbloqueada) en una parcela de nivel lvl?
  if (!Number.isInteger(c) || c < 0 || c >= GRID * GRID) return false;
  const n = levelSize(lvl), off = (GRID - n) / 2, gx = c % GRID, gz = (c / GRID) | 0;
  return gx >= off && gx < off + n && gz >= off && gz < off + n;
}
export const DAY_LEN = 720; // segundos que dura un día completo (día + noche)
// hora del día 0..24 (arranca a las 9:00) y nivel de oscuridad 0..1
export function dayInfo(t) {
  const hour = ((t / DAY_LEN) * 24 + 9) % 24;
  const sun = Math.sin((hour - 6) / 12 * Math.PI); // >0 de día
  const night = Math.max(0, Math.min(1, 0.5 - sun * 1.6));
  return { hour, night };
}
export const WORLD_RADIUS = 95;
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
  choco:   { name: 'Chocolate', mult: 15, color: '#7b3f00' },
  burnt:   { name: 'Quemada',  mult: 4,   color: '#e2551d' },
  moonlit: { name: 'Lunar',    mult: 3,   color: '#9aa8ff' },
  bloom:   { name: 'Florecida', mult: 6,  color: '#ff8fcf' },
  spooky:  { name: 'Embrujada', mult: 15, color: '#a04cff' },
  twisted: { name: 'Retorcida', mult: 5,  color: '#d04a6a' },
};
export const MUT_EMOJI = { wet: '💧', chilled: '❄️', frozen: '🧊', shocked: '⚡', gold: '🪙', rainbow: '🌈', choco: '🍫', burnt: '🔥', moonlit: '🌙', bloom: '🌸', spooky: '👻', twisted: '🌀' };
export function mutMult(ms) { let m = 1; for (const k of ms) m += MUTS[k].mult - 1; return m; }

// ---------- Clima (global para todo el servidor) ----------
export const WEATHER = {
  rain:    { name: 'Lluvia',      emoji: '🌧️', dur: 60, grow: 1.5, muts: { wet: 0.30 } },
  thunder: { name: 'Tormenta',    emoji: '⛈️', dur: 60, grow: 1.5, muts: { wet: 0.30, shocked: 0.002 } },
  frost:   { name: 'Helada',      emoji: '❄️', dur: 60, grow: 1.0, muts: { chilled: 0.25, frozen: 0.02 } },
  sunny:   { name: 'Día de sol',  emoji: '☀️', dur: 45, grow: 1.2, muts: { gold: 0.004 } },
  rainbow: { name: 'Arcoíris',    emoji: '🌈', dur: 45, grow: 1.0, muts: { rainbow: 0.003, gold: 0.004 } },
};
export const WEATHER_EVERY = [100, 200]; // seg entre eventos (aleatorio)

// ---------- Eventos globales ----------
export const EVENTS = {
  rainbowgarden:  { name: 'Rainbow Garden', emoji: '🌈', dur: 120, grow: 1.5, muts: { rainbow: 0.006, gold: 0.01 }, color: '#ff6ad5', desc: 'Más mutaciones Arcoíris y Doradas · crecimiento +50%', reward: { sheckles: 400 } },
  megathunder:    { name: 'Mega Thunderstorm', emoji: '⚡', dur: 80, grow: 1.3, muts: { wet: 0.25, shocked: 0.012 }, color: '#4a5aa8', desc: '¡Rayos por todos lados! Electrizada x100 · crecimiento +30%', reward: { sheckles: 700 } },
  sheckle_rain:   { name: 'Sheckle Storm', emoji: '💰', dur: 90, grow: 1, muts: {}, tick: { every: 10, sheckles: 40 }, color: '#ffc928', desc: '¡Llueven Sheckles! Ganás plata cada 10 segundos', reward: { sheckles: 300 } },
  frozen_garden:  { name: 'Frozen Garden', emoji: '❄️', dur: 90, grow: 0.9, muts: { chilled: 0.2, frozen: 0.025 }, color: '#6ec6ff', desc: 'Jardín helado: Fría x2 y Congelada x10', reward: { sheckles: 500 } },
  heatwave:       { name: 'Heat Wave', emoji: '🔥', dur: 80, grow: 1.4, muts: { burnt: 0.02, gold: 0.004 }, color: '#ff6a2a', desc: 'Ola de calor: Quemada x4 · crecimiento +40%', reward: { sheckles: 350 } },
  moonlight:      { name: 'Moonlight Garden', emoji: '🌙', dur: 100, grow: 1.2, muts: { moonlit: 0.03, gold: 0.003 }, color: '#5a5ad8', desc: 'Noche de luna: mutación Lunar x3', reward: { eggs: { common: 1 } } },
  solar_blessing: { name: 'Solar Blessing', emoji: '☀️', dur: 90, grow: 1.8, muts: { gold: 0.012 }, color: '#ffb300', desc: 'Bendición solar: crecimiento +80% y más Doradas', reward: { sheckles: 450, gear: { sprinkler: 1 } } },
  nature_storm:   { name: 'Nature Storm', emoji: '🌿', dur: 90, grow: 1.5, muts: { wet: 0.2, bloom: 0.015 }, color: '#3fa34d', desc: 'La naturaleza despierta: Florecida x6 · crecimiento +50%', reward: { seeds: { carrot: 3, strawberry: 2 } } },
  flower_festival:{ name: 'Flower Festival', emoji: '🌸', dur: 100, grow: 1.2, muts: { bloom: 0.03 }, sellBonus: 0.25, color: '#ff8fcf', desc: 'Florecida x6 y vendés todo +25%', reward: { sheckles: 300, seeds: { sunflower: 1 } } },
  spooky_harvest: { name: 'Spooky Harvest', emoji: '🎃', dur: 100, grow: 1.1, muts: { spooky: 0.015 }, sellBonus: 0.3, color: '#8a3fd0', desc: 'Cosecha embrujada: Embrujada x15 y vendés +30%', reward: { seeds: { pumpkin: 1 }, sheckles: 250 } },
  golden_hour:    { name: 'Golden Hour', emoji: '✨', dur: 75, grow: 1.3, muts: { gold: 0.02 }, sellBonus: 0.2, color: '#ffc13a', desc: 'Hora dorada: muchas Doradas x20 y vendés +20%', reward: { sheckles: 600 } },
  mutation_frenzy:{ name: 'Mutation Frenzy', emoji: '🧬', dur: 70, grow: 1, muts: { wet: 0.1, chilled: 0.08, shocked: 0.006, gold: 0.01, rainbow: 0.004, twisted: 0.02 }, color: '#7a5ad8', desc: '¡Frenesí! Todas las mutaciones mucho más probables', reward: { eggs: { rare: 1 } } },
  mystery:        { name: 'Mystery Event', emoji: '❓', dur: 90, grow: 1, muts: {}, mystery: true, color: '#8f7ad8', desc: 'Un evento misterioso… ¿qué efecto tendrá? Se revela al final', reward: { sheckles: 800, eggs: { common: 1 } } },
  chocolate_rain: { name: 'Chocolate Rain', emoji: '🍫', dur: 90, grow: 1.2, muts: { choco: 0.03 }, color: '#8a4a12', desc: 'Mutación Chocolate x15 · crecimiento +20%', reward: { eggs: { common: 1 } } },
  laser_storm:    { name: 'Laser Storm', emoji: '🔮', dur: 75, grow: 1, muts: { shocked: 0.004, gold: 0.006 }, color: '#2ad4ff', desc: 'Rayos láser: Electrizada x100 y Dorada x20', reward: { sheckles: 600 } },
  harvest_fest:   { name: 'Fiesta de la Cosecha', emoji: '🍂', dur: 120, grow: 1.1, muts: {}, sellBonus: 0.5, color: '#ff8a1f', desc: 'Vendés todo +50% · evento de temporada', reward: { seeds: { pumpkin: 1 }, sheckles: 200 } },
};
export const EVENT_EVERY = [420, 780]; // seg entre eventos automáticos

// ---------- Rarezas ----------
export const RARITY = {
  common: { name: 'Común', color: '#8d8d8d' }, uncommon: { name: 'Poco común', color: '#37a237' }, rare: { name: 'Raro', color: '#2f7fe0' },
  legendary: { name: 'Legendario', color: '#e09a00' }, mythic: { name: 'Mítico', color: '#c23ae0' },
};
export const RAR = {
  crop: { carrot: 'common', strawberry: 'common', blueberry: 'uncommon', tomato: 'uncommon', corn: 'rare', sunflower: 'rare', watermelon: 'legendary', pumpkin: 'legendary', apple: 'mythic' },
  pet: { hen: 'common', duck: 'common', sheep: 'uncommon', pig: 'uncommon', cow: 'rare', sheepdog: 'rare', horse: 'legendary' },
  egg: { common: 'common', rare: 'rare', mythic: 'mythic' },
  gear: { sprinkler: 'uncommon', fertilizer: 'rare', goldspray: 'legendary' },
};

// ---------- Huevos y mascotas ----------
export const EGGS = {
  common: { name: 'Huevo común', emoji: '🥚', price: 150, hatch: 45, pets: { hen: 40, duck: 30, sheep: 18, pig: 12 }, chance: 1.0, stock: [2, 4] },
  rare:   { name: 'Huevo raro',  emoji: '🥚', price: 1500, hatch: 90, pets: { sheep: 30, pig: 30, cow: 25, horse: 8, sheepdog: 7 }, chance: 0.35, stock: [1, 2] },
  mythic: { name: 'Huevo mítico', emoji: '🥚', price: 12000, hatch: 150, pets: { horse: 50, sheepdog: 30, cow: 20 }, chance: 0.08, stock: [1, 1] },
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
  sprinkler:  { name: 'Aspersor', emoji: '💦', price: 350, chance: 1.0, stock: [2, 4], desc: 'Acelera x1.6 las plantas cercanas por 3 min', radius: 5, dur: 180, boost: 1.6 },
  fertilizer: { name: 'Fertilizante', emoji: '🧪', price: 900, chance: 0.4, stock: [1, 3], desc: 'Hace madurar una planta o un huevo al instante' },
  goldspray:  { name: 'Rocío dorado', emoji: '✨', price: 6000, chance: 0.1, stock: [1, 1], desc: 'Agrega la mutación Dorada (x20) a una planta' },
};
export function priceOf(shop, k, deal) {
  const d = shop === 'seed' ? CROPS[k] : shop === 'gear' ? GEAR[k] : EGGS[k]; if (!d) return 0;
  let p = shop === 'seed' ? d.seed : d.price;
  if (deal && deal.shop === shop && deal.k === k) p = Math.round(p * 0.7);
  return p;
}

// ---------- Mapa: parcelas en dos anillos alrededor del centro ----------
// 4 parcelas en las diagonales alrededor de la plaza central
export function plotInfo(i) {
  const a = Math.PI / 4 + (i % 4) * Math.PI / 2;
  const x = Math.cos(a) * 44, z = Math.sin(a) * 44;
  // rot: ángulo Y para que el "frente" de la parcela mire al centro
  return { x, z, rot: Math.atan2(-x, -z) };
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
// Círculo de interacción: delante de cada NPC. Hay que estar DENTRO para abrir la tienda / comprar / vender.
export const NPC_CIRCLE_DIST = 4.6, NPC_CIRCLE_R = 3.0, NPC_CIRCLE_TOL = 1.6;
export function npcCircle(key) { const n = NPCS[key]; return n ? { x: n.x + Math.sin(n.rot) * NPC_CIRCLE_DIST, z: n.z + Math.cos(n.rot) * NPC_CIRCLE_DIST, r: NPC_CIRCLE_R } : null; }
export const MAX_SPEED = 22; // m/s tolerados por el servidor (el cliente camina a 11)
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
  const m = mutMult(f.m);
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
    this.kick = opts.kick || (() => {});
    this.extra = opts.extra || (() => ({}));
    this.event = null;
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
    this.nextEvent = rr(this.rng, 240, 420);
    this.lastEvent = null; this.noticed = false;
    this.lbTimer = 0;
    this.restock();
  }

  // ---------------- Jugadores ----------------
  newProfile(name) {
    return {
      v: 2, lvl: 0, name, sheckles: 40,
      seeds: { carrot: 3, strawberry: 1 },
      eggs: {}, gear: {}, fruits: [], pets: [], equipped: [],
      plants: [], lastSeen: Date.now(), stats: { harvested: 0, earned: 0, upgrades: 0 },
    };
  }
  join(uid, info) {
    if (this.players.size >= MAX_PLAYERS) return { error: 'Servidor lleno (' + MAX_PLAYERS + ' jugadores)' };
    for (const p of this.players.values()) if (p.uid === uid) this.leave(p.id); // sesión duplicada
    this.migrate(this.profiles.get(uid));
    const plot = this.plots.indexOf(null);
    const id = this.nextId++;
    const name = clampName(info.name);
    let prof = this.profiles.get(uid);
    if (!prof) { prof = this.newProfile(name); this.profiles.set(uid, prof); }
    prof.name = name; if (info.avatar) prof.avatar = String(info.avatar).slice(0, 20);
    // crecimiento offline (máx 1 hora)
    const away = Math.min(3600, Math.max(0, (Date.now() - (prof.lastSeen || Date.now())) / 1000));
    if (away > 5) for (const pl of prof.plants) this.growPlant(pl, away, 1);
    const pl = {
      id, uid, plot, prof, name, avatar: String(info.avatar || prof.avatar || 'farmer'), owner: !!info.owner,
      x: SPAWN.x + (this.rng() - 0.5) * 6, z: SPAWN.z + (this.rng() - 0.5) * 6, ry: 0, mv: 0,
      lastWater: 0, lastChat: 0, joinedAt: this.time, posAt: Date.now(),
    };
    this.plots[plot] = id;
    this.players.set(id, pl);
    this.broadcast({ t: 'pj', p: this.pub(pl) }, id);
    this.broadcast(this.plotMsg(plot), id);
    this.send(id, {
      t: 'welcome', id, plot, now: this.time, me: this.me(pl),
      players: [...this.players.values()].map((q) => this.pub(q)),
      plots: this.allPlots(), stock: this.stockMsg(), weather: this.weatherMsg(), owner: pl.owner, event: this.eventMsg(), max: MAX_PLAYERS,
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
  pub(p) { return { id: p.id, name: p.name, avatar: p.avatar, owner: !!p.owner, plot: p.plot, x: p.x, z: p.z, ry: p.ry, sh: p.prof.sheckles, pets: p.prof.equipped.map((i) => p.prof.pets[i]) }; }
  me(p) {
    const f = p.prof;
    return { lvl: f.lvl | 0, name: p.name, sheckles: f.sheckles, seeds: f.seeds, eggs: f.eggs, gear: f.gear, fruits: f.fruits, pets: f.pets, equipped: f.equipped, stats: f.stats };
  }
  sendMe(p) { this.send(p.id, { t: 'me', me: this.me(p) }); }
  plotMsg(i) {
    const id = this.plots[i]; const pl = id && this.players.get(id);
    return { t: 'plot', i, lvl: pl ? pl.prof.lvl | 0 : 0, plants: pl ? pl.prof.plants.map(pubPlant) : [] };
  }
  allPlots() { const o = {}; this.players.forEach((p) => { o[p.plot] = { lvl: p.prof.lvl | 0, plants: p.prof.plants.map(pubPlant) }; }); return o; }
  // perfiles viejos (grilla 8x8, índice z*8+x) -> grilla 16x16 centrada
  migrate(prof) {
    if (!prof || prof.v >= 2) return prof;
    for (const pl of prof.plants || []) { const gx = (pl.c % 8) + 4, gz = Math.floor(pl.c / 8) + 4; pl.c = gz * GRID + gx; }
    prof.v = 2; prof.lvl = prof.lvl | 0; prof.stats = prof.stats || { harvested: 0, earned: 0 }; prof.stats.upgrades = prof.stats.upgrades | 0; return prof;
  }
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
    const cand = [];
    for (const k in s) if (k !== 'carrot' && k !== 'strawberry') cand.push({ shop: 'seed', k });
    for (const k in g) cand.push({ shop: 'gear', k }); for (const k in e) if (k !== 'common') cand.push({ shop: 'egg', k });
    this.stock.deal = cand.length ? cand[Math.floor(r() * cand.length)] : null; // oferta especial -30%
    this.nextRestock = this.time + this.restockEvery;
  }
  stockMsg() { return { seed: this.stock.seed, gear: this.stock.gear, egg: this.stock.egg, deal: this.stock.deal || null, next: this.nextRestock }; }
  weatherMsg() { return this.weather ? { k: this.weather.k, until: this.weather.until } : { k: null, until: 0 }; }

  // ¿está el jugador DENTRO del círculo de interacción de ese NPC? (se comprueba en el servidor)
  near(p, shop) {
    const c = npcCircle(shop); if (!c) return false;
    return Math.hypot(p.x - c.x, p.z - c.z) <= c.r + NPC_CIRCLE_TOL;
  }
  // definición efectiva del evento (el Mystery usa el efecto oculto)
  effEv(ev = this.event) { if (!ev) return null; return ev.inner ? EVENTS[ev.inner] : EVENTS[ev.k]; }

  // ---------------- Plantas ----------------
  growMult(p, plant) {
    let m = this.weather ? WEATHER[this.weather.k].grow : 1;
    if (this.event) m *= this.effEv().grow || 1;
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
  rollMutations(plant, muts, dt) {
    for (const m in muts) {
      if (plant.m.includes(m)) continue;
      if (plant.m.length >= 4) break;
      if (this.rng() < muts[m] * dt) {
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
    // eventos globales
    if (this.event) {
      const ev = this.effEv();
      if (this.time >= this.event.until) this.endEvent(true);
      else if (ev.tick && this.time >= this.event.nextTick) {
        this.event.nextTick = this.time + ev.tick.every;
        this.players.forEach((p) => { this.grant(p, { sheckles: ev.tick.sheckles }); this.sendMe(p); this.send(p.id, { t: 'evtick', amt: ev.tick.sheckles }); });
      }
    } else if (this.time >= this.nextEvent && this.players.size) { const ks = Object.keys(EVENTS).filter((k) => k !== this.lastEvent); this.startEvent(ks[Math.floor(this.rng() * ks.length)]); }
    else if (!this.noticed && this.players.size && this.nextEvent - this.time <= 30) { this.noticed = true; this.broadcast({ t: 'notice', msg: '⏳ ¡Un evento global empieza en 30 segundos!' }); }
    // restock
    if (this.time >= this.nextRestock) { this.restock(); this.broadcast({ t: 'stock', ...this.stockMsg() }); }
    // plantas
    const w = this.weather && this.weather.k, ev = this.event && this.effEv();
    this.players.forEach((p) => {
      if (p.sprinklers) p.sprinklers = p.sprinklers.filter((s) => s.until > this.time);
      let changed = false;
      for (const pl of p.prof.plants) {
        const before = plantStage(pl);
        const wasReady = pl.ready;
        this.growPlant(pl, dt, this.growMult(p, pl));
        if ((w || ev) && !pl.k.startsWith('egg:')) {
          const nm = pl.m.length;
          if (w) this.rollMutations(pl, WEATHER[w].muts, dt); if (ev) this.rollMutations(pl, ev.muts, dt);
          if (pl.m.length !== nm) changed = true;
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
        const now = Date.now(), el = Math.min(3, Math.max(0.05, (now - (p.posAt || now)) / 1000)); p.posAt = now;
        const r = Math.hypot(m.x, m.z), k = r > WORLD_RADIUS ? WORLD_RADIUS / r : 1;
        const nx = m.x * k, nz = m.z * k;
        // anti-teletransporte: el servidor no acepta movimientos más rápidos que MAX_SPEED
        if (Math.hypot(nx - p.x, nz - p.z) > MAX_SPEED * el + 3) { this.send(p.id, { t: 'fix', x: p.x, z: p.z }); return; }
        p.x = nx; p.z = nz; p.ry = +m.ry || 0; p.mv = m.mv ? 1 : 0;
        break;
      }
      case 'tp': { // teletransporte permitido: solo a la plaza o a la entrada de MI parcela
        let x = 0, z = 7;
        if (m.to === 'garden') { const q = plotInfo(p.plot), d = Math.hypot(q.x, q.z), H = levelSize(f.lvl) * CELL / 2; x = q.x - q.x / d * (H + 4); z = q.z - q.z / d * (H + 4); }
        p.x = x; p.z = z; p.posAt = Date.now(); p.mv = 0; this.send(p.id, { t: 'fix', x, z, tp: 1 }); break;
      }
      case 'upgrade': {
        const lvl = f.lvl | 0; if (lvl >= PLOT_LEVELS.length - 1) return this.toast(p, 'Tu parcela ya está al máximo (16×16)', 'bad');
        const cost = PLOT_LEVELS[lvl + 1].cost; if (f.sheckles < cost) return this.toast(p, 'Te faltan 💰' + (cost - f.sheckles) + ' para mejorar la parcela', 'bad');
        f.sheckles -= cost; f.lvl = lvl + 1; f.stats.upgrades = (f.stats.upgrades | 0) + 1;
        this.sendPlot(p.plot); this.sendMe(p); this.send(p.id, { t: 'upg', lvl: f.lvl });
        this.broadcast({ t: 'notice', msg: '🏡 ' + p.name + ' amplió su parcela a ' + levelSize(f.lvl) + '×' + levelSize(f.lvl) }); break;
      }
      case 'plant': {
        const cell = m.cell | 0; const crop = CROPS[m.k];
        if (!crop || !cellOk(f.lvl, cell)) return this.toast(p, 'Esa celda todavía no está desbloqueada', 'bad');
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
        if (!cellOk(f.lvl, cell)) return this.toast(p, 'Esa celda todavía no está desbloqueada', 'bad');
        if (f.plants.some((q) => q.c === cell)) return this.toast(p, 'Ya hay algo ahí', 'bad');
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
        if (!this.inPlotRange(p, pl.c)) return this.toast(p, 'Acercate más al huevo', 'bad');
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
        const price = priceOf(shop, m.k, this.stock.deal) * n;
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
        if (this.event) bonus += this.effEv().sellBonus || 0;
        let total = 0; for (const i of list) total += fruitValue(f.fruits[i]);
        total = Math.round(total * bonus);
        const set = new Set(list); f.fruits = f.fruits.filter((_, i) => !set.has(i));
        f.sheckles += total; f.stats.earned += total;
        this.send(p.id, { t: 'sold', total, n: list.length });
        this.sendMe(p); break;
      }
      case 'use': { // fertilizante / rocío dorado sobre una planta
        const k = m.k; if (k !== 'fertilizer' && k !== 'goldspray') return;
        const pl = f.plants.find((q) => q.c === (m.cell | 0)); if (!pl) return;
        if (!f.gear[k]) return this.toast(p, 'No tenés ese ítem', 'bad');
        if (!this.inPlotRange(p, pl.c)) return this.toast(p, 'Acercate más a tu parcela', 'bad');
        const isEgg = pl.k.startsWith('egg:');
        if (k === 'fertilizer') { if (isEgg ? pl.p >= pl.g : pl.ready) return this.toast(p, 'Ya está lista', 'bad'); pl.p = pl.g; if (!isEgg) pl.ready = true; }
        else { if (isEgg || pl.m.includes('gold')) return this.toast(p, 'No se puede usar acá', 'bad'); if (pl.m.length >= 4) pl.m.shift(); pl.m.push('gold'); }
        f.gear[k]--; if (f.gear[k] <= 0) delete f.gear[k];
        this.sendPlot(p.plot); this.sendMe(p); this.toast(p, k === 'fertilizer' ? '🧪 ¡Madurado!' : '✨ ¡Mutación Dorada!', 'gold'); break;
      }
      case 'adm': return this.admin(p, m);
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

  // ---------------- Eventos / clima / administración ----------------
  eventMsg() { return this.event ? { k: this.event.k, until: this.event.until } : { k: null, until: 0 }; }
  grant(p, r) {
    const f = p.prof;
    if (r.sheckles) { f.sheckles += r.sheckles; f.stats.earned += r.sheckles; }
    for (const [inv, key] of [['seeds', 'seeds'], ['eggs', 'eggs'], ['gear', 'gear']]) for (const k in r[key] || {}) f[inv][k] = (f[inv][k] || 0) + r[key][k];
  }
  startEvent(k, by) {
    if (!EVENTS[k]) return; if (this.event) this.endEvent(false);
    const ev = EVENTS[k]; let inner = null;
    if (ev.mystery) { const ks = Object.keys(EVENTS).filter((x) => !EVENTS[x].mystery); inner = ks[Math.floor(this.rng() * ks.length)]; }
    const eff = inner ? EVENTS[inner] : ev;
    this.event = { k, inner, until: this.time + ev.dur, nextTick: this.time + ((eff.tick && eff.tick.every) || 1e9) };
    this.noticed = false;
    this.broadcast({ t: 'event', ...this.eventMsg(), by: by || null });
  }
  endEvent(reward) {
    if (!this.event) return; const k = this.event.k, inner = this.event.inner || null, ev = EVENTS[k]; this.event = null; this.lastEvent = k;
    if (reward && ev.reward) this.players.forEach((p) => { this.grant(p, ev.reward); this.sendMe(p); this.send(p.id, { t: 'evend', k, inner, reward: ev.reward }); });
    this.broadcast({ t: 'event', k: null, until: 0, ended: k, inner });
    this.noticed = false; this.nextEvent = this.time + rr(this.rng, EVENT_EVERY[0], EVENT_EVERY[1]);
  }
  setWeather(k) {
    this.weather = k ? { k, until: this.time + WEATHER[k].dur } : null;
    this.nextWeather = this.time + (k ? WEATHER[k].dur : 0) + rr(this.rng, WEATHER_EVERY[0], WEATHER_EVERY[1]);
    this.broadcast({ t: 'weather', ...this.weatherMsg() });
  }
  adminState() {
    const players = [...this.players.values()].map((q) => {
      const crops = {}, muts = {}; let ready = 0, mut = 0, eggs = 0;
      for (const x of q.prof.plants) { if (x.k.startsWith('egg:')) { eggs++; continue; } crops[x.k] = (crops[x.k] || 0) + 1; if (x.ready) ready++; if (x.m.length) mut++; for (const mm of x.m) muts[mm] = (muts[mm] || 0) + 1; }
      return { lvl: q.prof.lvl | 0, size: levelSize(q.prof.lvl), muts, id: q.id, name: q.name, owner: !!q.owner, plot: q.plot, sh: q.prof.sheckles, plants: q.prof.plants.length, ready, mut, eggs, crops, pets: q.prof.pets.length, fruits: q.prof.fruits.length, x: Math.round(q.x), z: Math.round(q.z) };
    });
    return { players, max: MAX_PLAYERS, weather: this.weatherMsg(), event: this.eventMsg(), nextRestock: this.nextRestock, nextEvent: this.nextEvent, now: this.time, ...this.extra() };
  }
  // TODAS las acciones de admin se validan acá, en el servidor: solo si el jugador es owner (según su cuenta).
  admin(p, m) {
    if (!p.owner) return this.toast(p, 'No tenés permisos de administrador', 'bad');
    switch (m.cmd) {
      case 'weather': this.setWeather(WEATHER[m.k] ? m.k : null); break;
      case 'event': if (EVENTS[m.k]) this.startEvent(m.k, p.name); break;
      case 'stopEvent': this.endEvent(false); break;
      case 'restock': this.restock(); this.broadcast({ t: 'stock', ...this.stockMsg() }); break;
      case 'kick': { const q = this.players.get(m.target | 0); if (q && !q.owner) this.kick(q.id, 'Fuiste expulsado por el owner'); break; }
      case 'give': {
        const targets = m.target === 'all' ? [...this.players.values()] : [this.players.get(m.target | 0)].filter(Boolean);
        const qty = Math.max(1, Math.min(m.what === 'money' ? 100000000 : 1000, Math.floor(+m.qty) || 1));
        for (const q of targets) {
          const f = q.prof;
          if (m.what === 'money') f.sheckles += qty;
          else if (m.what === 'seed' && CROPS[m.k]) f.seeds[m.k] = (f.seeds[m.k] || 0) + qty;
          else if (m.what === 'egg' && EGGS[m.k]) f.eggs[m.k] = (f.eggs[m.k] || 0) + qty;
          else if (m.what === 'gear' && GEAR[m.k]) f.gear[m.k] = (f.gear[m.k] || 0) + qty;
          else if (m.what === 'pet' && PETS[m.k]) for (let i = 0; i < Math.min(qty, 20); i++) f.pets.push(m.k);
          else continue;
          this.sendMe(q); this.toast(q, '🎁 Recibiste un regalo del owner', 'gold');
        }
        console.log('[ADMIN]', p.name, 'give', m.what, m.k || '', qty, '->', m.target); break;
      }
      case 'state': break;
      default: return;
    }
    this.send(p.id, { t: 'adm', state: this.adminState() });
  }

  // ---------------- Persistencia ----------------
  exportProfiles() {
    const o = {};
    this.profiles.forEach((v, k) => { o[k] = v; });
    this.players.forEach((p) => { p.prof.lastSeen = Date.now(); });
    return o;
  }
  importProfiles(o) { for (const k in o || {}) this.profiles.set(k, this.migrate(o[k])); }
}

function pubPlant(p) { return { c: p.c, k: p.k, p: +p.p.toFixed(1), g: p.g, r: p.ready ? 1 : 0, m: p.m, w: p.w }; }
export function plantStage(p) { return p.ready ? 3 : stageOf(p.p, p.g); }
function cellWorldLocal(c) { return { x: ((c % GRID) - (GRID - 1) / 2) * CELL, z: (Math.floor(c / GRID) - (GRID - 1) / 2) * CELL }; }
