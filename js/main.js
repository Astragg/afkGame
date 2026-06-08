import { RNG, hashSeed } from './rng.js';
import { generateWorld, WORLD_RADIUS } from './worldgen.js';
import { spawnAgents, getAgentCountForWorld, tickAgents } from './agents.js';
import { Renderer } from './renderer.js';
import { pixelToHex } from './hex.js';
import { EventBus, EVENT } from './events.js';
import { tickEconomy, grantJob } from './economy.js';
import { tickCrime, pardonAgent } from './crime.js';
import { initGuilds, joinGuild, tickGuilds } from './guilds.js';
import { tickSocial, handleDeath } from './social.js';
import { initWildlife, initLivestock, tickAnimals } from './animals.js';
import { tickAdventuring } from './adventuring.js';
import { divineBless, divineCurse } from './magic.js';
import { grantSkill } from './skills.js';
import { saveGame, loadGame, exportSave, deserializeAgent } from './save.js';
import { PauseMenu } from './pauseMenu.js';
import { tickConstruction, initSettlementConstruction, planNewBuildings, resolveBuildingAt } from './construction.js';
import { loadBuildingSprites } from './textures.js';
import { createWallet } from './currency.js';
import { initKingdoms, tickKingdoms } from './kingdoms.js';
import { getBuildingInspectData } from './settlementInfo.js';

const SPEEDS = [0, 0.25, 0.5, 1, 2, 4, 8, 'step'];
const SPEED_LABELS = ['Pause', '0.25x', '0.5x', '1x', '2x', '4x', '8x', 'Step'];
const WEATHER_STATES = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'heatwave'];
const TICK_MS = 100;
const HOURS_PER_TICK = 1;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.bus = new EventBus();
    this.pauseMenu = new PauseMenu();
    this.rng = new RNG(hashSeed('aetherworld'));
    this.speedIndex = 3;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.paused = false;
    this.inspectAgent = null;
    this.inspectBuilding = null;
    this.crownedId = null;
    this.kingdoms = [];
    this.hoverAgent = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.keys = {};
    this.dragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.cameraStart = { x: 0, y: 0 };

    this.init();
    this.setupInput();
    this.setupEvents();
    loadBuildingSprites();
    window.addEventListener('resize', () => this.renderer.resize());
    requestAnimationFrame(t => this.loop(t));
  }

  init(seed) {
    this.seed = seed ?? hashSeed(String(Date.now()));
    this.rng = new RNG(this.seed);
    this.world = generateWorld(this.seed, WORLD_RADIUS);
    initSettlementConstruction(this.world.hexMap, this.world.settlements, this.rng, 0);
    const agentCount = getAgentCountForWorld(this.world.settlements);
    this.agents = spawnAgents(this.world, agentCount, this.rng);
    this.world._agents = this.agents;
    this.guilds = initGuilds(this.world);
    this.kingdoms = initKingdoms(this.world.settlements);
    this.animals = [...initWildlife(this.world, this.rng), ...initLivestock(this.world.settlements, this.rng)];
    this.world.animals = this.animals;
    this.world.dungeons = this.world.dungeons || [];

    for (const agent of this.agents) {
      const guild = this.guilds.find(g => g.settlementId === agent.settlementId);
      if (guild && this.rng.next() < 0.12) joinGuild(agent, guild, this.bus, 0);
    }

    this.tick = 0;
    this.day = 1;
    this.timeOfDay = 8;
    this.weather = 'clear';
    this.weatherTicks = 0;
    this.stepPending = false;

    const first = this.world.settlements[0];
    if (first) this.renderer.centerOn(first.hex.q, first.hex.r);
    this.renderer.camera.zoom = 0.7;
    this.renderer.resize();
  }

  setupEvents() {
    this.bus.on(EVENT.DEATH, (evt) => {
      const agent = this.agents.find(a => a.id === evt.data.agent);
      if (agent) handleDeath(agent, this.agents, evt.data.tick, this.world, this.guilds);
    });
    this.bus.on(EVENT.FAMINE, (evt) => {
      for (const a of this.agents.filter(x => x.settlementId === evt.data.settlement.id)) {
        a.needs.safety -= 20;
        a.addEvent(evt.data.tick, 'Famine strikes the settlement');
      }
    });
    this.bus.on(EVENT.BANKRUPTCY, (evt) => {
      evt.data.settlement.taxRate = Math.min(0.25, evt.data.settlement.taxRate + 0.05);
    });
  }

  setupInput() {
    this.canvas.addEventListener('mousemove', e => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.pauseMenu.open) return;
      const world = this.renderer.screenToWorld(e.clientX, e.clientY);
      const hex = pixelToHex(world.x, world.y, this.renderer.hexSize);
      const tile = this.world.hexMap.get(`${hex.q},${hex.r}`) || null;
      this.renderer.hoverHex = tile;
      this.renderer.hoverBuilding = tile?.building || null;
      this.hoverAgent = tile?.building ? null : this.renderer.hitTestAgent(this.agents, e.clientX, e.clientY);
      if (this.dragging) {
        const dx = (e.clientX - this.dragStart.x) / this.renderer.camera.zoom;
        const dy = (e.clientY - this.dragStart.y) / this.renderer.camera.zoom;
        this.renderer.camera.x = this.cameraStart.x + dx;
        this.renderer.camera.y = this.cameraStart.y + dy;
      }
    });

    this.canvas.addEventListener('mousedown', e => {
      if (this.pauseMenu.open) {
        const hit = this.pauseMenu.hitTest(e.clientX, e.clientY, this.canvas.width, this.canvas.height);
        this.pauseMenu.handleClick(hit);
        return;
      }
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
        this.dragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.cameraStart = { ...this.renderer.camera };
        return;
      }
      if (e.button === 0) {
        const speedHit = this.renderer.hitTestSpeedControl(e.clientX, e.clientY);
        if (speedHit >= 0) {
          if (speedHit === 0) this.openPauseMenu();
          else this.setSpeed(speedHit);
          return;
        }
        if (this.inspectAgent) {
          const btn = this.hitDivineButton(e.clientX, e.clientY);
          if (btn) { this.handleDivine(btn); return; }
        }
        const buildingHit = this.renderer.hitTestBuildingHex(this.world, e.clientX, e.clientY);
        const resolved = buildingHit ? resolveBuildingAt(buildingHit.hex, this.world.hexMap) : null;
        if (resolved) {
          const settlement = this.world.settlements.find(s => s.id === resolved.building.settlementId);
          this.inspectBuilding = getBuildingInspectData(
            this.world, this.agents, settlement, resolved.hex
          );
          this.inspectAgent = null;
          this.renderer.selectedAgent = null;
          this.renderer.selectedBuilding = resolved.hex;
        } else {
          this.renderer.selectedBuilding = null;
          const agent = this.renderer.hitTestAgent(this.agents, e.clientX, e.clientY);
          if (agent) {
            this.inspectAgent = agent;
            this.inspectBuilding = null;
            this.renderer.selectedAgent = agent;
            this.paused = true;
            this.speedIndex = 0;
          } else {
            this.inspectAgent = null;
            this.inspectBuilding = null;
            this.renderer.selectedAgent = null;
          }
        }
      }
    });

    this.canvas.addEventListener('mouseup', () => { this.dragging = false; });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('wheel', e => {
      if (this.pauseMenu.open) {
        this.pauseMenu.scroll = Math.max(0, this.pauseMenu.scroll + (e.deltaY > 0 ? 24 : -24));
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.renderer.camera.zoom = Math.max(0.25, Math.min(3, this.renderer.camera.zoom * factor));
    }, { passive: false });

    window.addEventListener('keydown', e => {
      this.keys[e.key] = true;
      if (e.key === ' ') {
        e.preventDefault();
        if (this.pauseMenu.open) this.pauseMenu.close();
        else this.openPauseMenu();
      }
      if (e.key === 'Escape') {
        if (this.pauseMenu.open) this.pauseMenu.close();
        else { this.inspectAgent = null; this.inspectBuilding = null; this.renderer.selectedAgent = null; }
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (!this.pauseMenu.open) this.openPauseMenu();
      }
      if (e.key === '1') this.setSpeed(3);
      if (e.key === 's' && e.ctrlKey) { e.preventDefault(); saveGame(this.getState()); }
      if (e.key === 'e' && e.ctrlKey) { e.preventDefault(); exportSave(this.getState()); }
    });
    window.addEventListener('keyup', e => { this.keys[e.key] = false; });
  }

  openPauseMenu() {
    this.pauseMenu.open = true;
    this.paused = true;
    this.speedIndex = 0;
  }

  setSpeed(index) {
    this.speedIndex = index;
    if (index === 0) { this.paused = true; }
    else if (index === 7) { this.stepPending = true; this.paused = false; }
    else { this.paused = false; this.stepPending = false; this.pauseMenu.close(); }
  }

  getState() {
    return {
      seed: this.seed, tick: this.tick, day: this.day,
      timeOfDay: this.timeOfDay, weather: this.weather,
      agents: this.agents, world: this.world,
      guilds: this.guilds, crownedId: this.crownedId,
    };
  }

  getDivineButtons() {
    if (!this.inspectAgent) return [];
    return [
      { label: 'Crown', action: 'crown' },
      { label: 'Bless', action: 'bless' },
      { label: 'Curse', action: 'curse' },
      { label: 'Pardon', action: 'pardon' },
      { label: 'Skill+', action: 'skill' },
      { label: 'Grant Job', action: 'job' },
    ];
  }

  hitDivineButton(mx, my) {
    for (const btn of this.getDivineButtons()) {
      const b = btn.bounds;
      if (b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return btn.action;
    }
    return null;
  }

  handleDivine(action) {
    const agent = this.inspectAgent;
    if (!agent) return;
    switch (action) {
      case 'crown':
        for (const a of this.agents) a.crowned = false;
        agent.crowned = true;
        this.crownedId = agent.id;
        agent.addEvent(this.tick, 'Crowned by divine will');
        break;
      case 'bless': divineBless(agent, this.tick); break;
      case 'curse': divineCurse(agent, this.tick); break;
      case 'pardon':
        pardonAgent(agent, this.world);
        agent.addEvent(this.tick, 'Pardoned by divine decree');
        break;
      case 'skill':
        grantSkill(agent, 'leadership', 'govern', Math.min(10, (agent.skills['leadership.govern'] || 0) + 1));
        agent.addEvent(this.tick, 'Granted leadership skill');
        break;
      case 'job': {
        const s = this.world.settlements.find(x => x.id === agent.settlementId);
        if (s) grantJob(agent, s, 'guard');
        agent.addEvent(this.tick, 'Granted guard job');
        break;
      }
    }
  }

  simTick() {
    this.tick++;
    this.timeOfDay += HOURS_PER_TICK;
    if (this.timeOfDay >= 24) {
      this.timeOfDay -= 24;
      this.day++;
    }

    this.weatherTicks++;
    if (this.weatherTicks > 48 + Math.floor(Math.random() * 48)) {
      this.weather = WEATHER_STATES[Math.floor(Math.random() * WEATHER_STATES.length)];
      this.weatherTicks = 0;
      this.bus.emit(EVENT.WEATHER, { weather: this.weather, tick: this.tick });
    }

    this.world._agents = this.agents;
    this._run('agents', () => tickAgents(this.agents, this.world, this.guilds, this.bus, this.tick, this.timeOfDay, this.weather));
    this._run('economy', () => tickEconomy(this.world, this.agents, this.bus, this.tick));
    this._run('construction', () => tickConstruction(this.world, this.agents, this.tick));
    this._run('planning', () => planNewBuildings(this.world, this.rng, this.tick));
    this._run('crime', () => tickCrime(this.agents, this.world, this.bus, this.tick, this.timeOfDay));
    this._run('guilds', () => tickGuilds(this.guilds, this.agents, this.bus, this.tick));
    this._run('social', () => tickSocial(this.agents, this.bus, this.tick, this.rng, this.world));
    this._run('animals', () => { this.animals = tickAnimals(this.animals, this.world, this.agents, this.tick); this.world.animals = this.animals; });
    this._run('adventuring', () => tickAdventuring(this.agents, this.world, this.world.dungeons, this.bus, this.tick));
    this._run('kingdoms', () => tickKingdoms(this.world, this.agents, this.kingdoms, this.bus, this.tick));

    // periodically remove dead agents so arrays don't grow without bound
    if (this.tick % 240 === 0) this.purgeDead();
  }

  _run(label, fn) {
    try {
      fn();
    } catch (err) {
      this.errorCount = (this.errorCount || 0) + 1;
      if (!this._loggedErrors) this._loggedErrors = new Set();
      if (!this._loggedErrors.has(label)) {
        this._loggedErrors.add(label);
        console.error(`[Aetherworld] error in ${label} subsystem (suppressed after first):`, err);
      }
      // if something is catastrophically wrong, stop the clock so the user can inspect
      if (this.errorCount > 500) { this.paused = true; this.speedIndex = 0; }
    }
  }

  purgeDead() {
    const keep = this.inspectAgent;
    const before = this.agents.length;
    this.agents = this.agents.filter(a => !a.dead || a === keep);
    this.world._agents = this.agents;
    if (this.agents.length !== before) {
      // refresh settlement populations after purge
      for (const s of this.world.settlements) {
        s.population = this.agents.reduce((n, a) => n + (!a.dead && a.settlementId === s.id ? 1 : 0), 0);
      }
    }
  }

  loop(timestamp) {
    const dt = timestamp - this.lastFrame;
    this.lastFrame = timestamp;

    const simPaused = this.paused || this.inspectAgent || this.pauseMenu.open;
    if (!simPaused) {
      const speed = typeof SPEEDS[this.speedIndex] === 'number' ? SPEEDS[this.speedIndex] : 1;
      if (this.stepPending) {
        this.simTick();
        this.stepPending = false;
        this.paused = true;
        this.speedIndex = 0;
      } else {
        this.accumulator += dt * speed;
        while (this.accumulator >= TICK_MS) {
          this.accumulator -= TICK_MS;
          this.simTick();
        }
      }
    }

    const divineButtons = this.inspectAgent ? this.getDivineButtons() : [];
    this.renderer.render(this.world, this.agents, this.timeOfDay, this.weather, {
      tick: this.tick,
      day: this.day,
      speedIndex: this.speedIndex,
      speedLabel: SPEED_LABELS[this.speedIndex],
      inspectAgent: this.inspectAgent,
      inspectBuilding: this.inspectBuilding,
      animals: this.animals,
      hoverAgent: this.hoverAgent,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      divineButtons,
      pauseMenu: this.pauseMenu,
      pauseMenuOpen: this.pauseMenu.open,
      game: this,
    });

    requestAnimationFrame(t => this.loop(t));
  }
}

const saved = loadGame();
const game = new Game();
if (saved) {
  game.seed = saved.seed;
  game.tick = saved.tick;
  game.day = saved.day;
  game.timeOfDay = saved.timeOfDay;
  game.weather = saved.weather;
  game.world = generateWorld(saved.seed, WORLD_RADIUS);
  game.agents = saved.agents.map(a => {
    const agent = deserializeAgent(a);
    if (!agent.wallet) agent.wallet = createWallet(0, agent.gold || 10, 0, 0, 0);
    return agent;
  });
  game.world._agents = game.agents;
  game.guilds = saved.guilds || initGuilds(game.world);
  game.kingdoms = initKingdoms(game.world.settlements);
  game.crownedId = saved.crownedId;
  for (const a of game.agents) if (a.id === game.crownedId) a.crowned = true;
}

window.aetherworld = game;
