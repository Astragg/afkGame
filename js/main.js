import { RNG, generateRandomSeed, seedFromUrl } from './rng.js';
import { generateWorld, WORLD_RADIUS } from './worldgen.js';
import { spawnAgents, getAgentCountForWorld, tickAgents } from './agents.js';
import { Renderer } from './renderer.js';
import { pixelToHex, hexToPixel } from './hex.js';
import { EventBus, EVENT } from './events.js';
import { tickEconomy, grantJob } from './economy.js?v=12';
import { tickCrime, pardonAgent } from './crime.js';
import { initGuilds, joinGuild, tickGuilds } from './guilds.js';
import { tickSocial, handleDeath } from './social.js';
import { initWildlife, initLivestock, tickAnimals } from './animals.js';
import { tickAdventuring } from './adventuring.js';
import { divineBless, divineCurse } from './magic.js';
import { grantSkill } from './skills.js';
import { saveGame, loadGame, exportSave, deserializeAgent, clearSave } from './save.js';
import { PauseMenu } from './pauseMenu.js';
import { tickConstruction, initSettlementConstruction, planNewBuildings, resolveBuildingAt } from './construction.js';
import { loadBuildingSprites } from './textures.js';
import { createWallet, creditWallet } from './currency.js';
import { initKingdoms, tickKingdoms } from './kingdoms.js';
import { getBuildingInspectData } from './settlementInfo.js';
import { getSeason, getYear, getDayInSeason, getSeasonLabel } from './seasons.js';
import { initCaravans, tickCaravans } from './caravans.js';
import { tickDisasters } from './disasters.js';
import { initDiplomacy, tickDiplomacy } from './diplomacy.js';
import { tickSimpleMagic } from './simpleMagic.js';
import { initQuests, tickQuests } from './quests.js';
import { initReligion, tickReligion } from './religion.js';
import { initPolitics, tickPolitics } from './politics.js';
import { tickDisease } from './disease.js';
import { initArtifacts, tickArtifacts } from './artifacts.js';
import { tickReputation } from './reputation.js';
import { initLanguage, tickLanguage } from './language.js';
import { initShips, tickShips } from './ships.js';
import { initAges, tickAges, getAgeLabel } from './ages.js';
import { initMilestones, tickMilestones, setupMilestoneListeners, MILESTONES } from './milestones.js';
import { initDynasties, tickDynasties, setupDynastyListeners } from './dynasties.js';
import { initChronicle, setupChronicleListeners, getAwaySummary, markVisit, getLastVisitTick } from './chronicle.js';

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
    this.rng = new RNG(generateRandomSeed());
    this.speedIndex = 3;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.paused = false;
    this.inspectAgent = null;
    this.inspectBuilding = null;
    this.crownedId = null;
    this.kingdoms = [];
    this.hoverAgent = null;
    this.hoverAnimal = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.keys = {};
    this.dragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.cameraStart = { x: 0, y: 0 };
    this.milestones = initMilestones();
    this.dynasties = initDynasties();
    this.chronicle = initChronicle();
    this.awaySummary = null;
    setupChronicleListeners(this.chronicle, this.bus);
    setupMilestoneListeners(this.milestones, this.bus);
    setupDynastyListeners(this.dynasties, this.bus);

    this.setupInput();
    this.setupEvents();
    this.setupAwayTracking();
    loadBuildingSprites();
    window.addEventListener('resize', () => this.renderer.resize());
    requestAnimationFrame(t => this.loop(t));
  }

  init(seed) {
    this.seed = seed ?? generateRandomSeed();
    this.rng = new RNG(this.seed);
    this.world = generateWorld(this.seed, WORLD_RADIUS);
    initSettlementConstruction(this.world.hexMap, this.world.settlements, this.rng, 0);
    const agentCount = getAgentCountForWorld(this.world.settlements);
    this.agents = spawnAgents(this.world, agentCount, this.rng);
    this.world._agents = this.agents;
    this.guilds = initGuilds(this.world);
    this.kingdoms = initDiplomacy(initKingdoms(this.world.settlements));
    this.caravans = initCaravans();
    this.animals = [...initWildlife(this.world, this.rng), ...initLivestock(this.world.settlements, this.rng)];
    this.world.animals = this.animals;
    this.world.dungeons = this.world.dungeons || [];
    this.quests = initQuests();
    this.artifacts = initArtifacts();
    this.ships = initShips(this.world, this.rng);
    initReligion(this.world, this.rng);
    initPolitics(this.world, this.rng);
    initLanguage(this.world, this.rng);
    initAges(this.world);
    this.milestones = initMilestones();
    this.dynasties = initDynasties();
    this.chronicle = initChronicle();
    this.awaySummary = null;
    markVisit(0);

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
    this.renderer.bakedFor = null;
  }

  newWorld(seed) {
    clearSave();
    this.inspectAgent = null;
    this.inspectBuilding = null;
    this.renderer.selectedAgent = null;
    this.renderer.selectedBuilding = null;
    this.pauseMenu.close();
    this.init(seed ?? generateRandomSeed());
    this.paused = false;
    this.speedIndex = 3;
  }

  loadFromSave(saved) {
    this.seed = saved.seed;
    this.tick = saved.tick;
    this.day = saved.day;
    this.timeOfDay = saved.timeOfDay;
    this.weather = saved.weather;
    this.rng = new RNG(this.seed);
    this.world = generateWorld(this.seed, WORLD_RADIUS);
    initSettlementConstruction(this.world.hexMap, this.world.settlements, this.rng, this.tick);
    this.agents = saved.agents.map(a => {
      const agent = deserializeAgent(a);
      if (!agent.wallet) agent.wallet = createWallet(0, agent.gold || 10, 0, 0, 0);
      return agent;
    });
    this.world._agents = this.agents;
    this.guilds = saved.guilds || initGuilds(this.world);
    this.kingdoms = initDiplomacy(initKingdoms(this.world.settlements));
    this.caravans = saved.caravans || initCaravans();
    this.animals = saved.animals || [...initWildlife(this.world, this.rng), ...initLivestock(this.world.settlements, this.rng)];
    this.world.animals = this.animals;
    this.quests = saved.quests || initQuests();
    this.artifacts = saved.artifacts || initArtifacts();
    this.ships = saved.ships || initShips(this.world, this.rng);
    initReligion(this.world, this.rng);
    initPolitics(this.world, this.rng);
    initLanguage(this.world, this.rng);
    initAges(this.world);
    this.milestones = saved.milestones || initMilestones();
    this.dynasties = saved.dynasties || initDynasties();
    this.chronicle = saved.chronicle || initChronicle();
    if (saved.worldAge != null) {
      this.world.age = saved.worldAge;
      this.world.ageName = saved.worldAgeName;
    }
    this.crownedId = saved.crownedId;
    for (const a of this.agents) if (a.id === this.crownedId) a.crowned = true;
    const first = this.world.settlements[0];
    if (first) this.renderer.centerOn(first.hex.q, first.hex.r);
    this.renderer.resize();
    this.renderer.bakedFor = null;
  }

  setupAwayTracking() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        markVisit(this.tick || 0);
      } else if (this.chronicle && this.tick) {
        const summary = getAwaySummary(this.chronicle, this.tick);
        if (summary) this.awaySummary = summary;
      }
    });
    window.addEventListener('focus', () => {
      if (this.chronicle && this.tick) {
        const summary = getAwaySummary(this.chronicle, this.tick);
        if (summary) this.awaySummary = summary;
      }
    });
  }

  dismissAwaySummary() {
    this.awaySummary = null;
    markVisit(this.tick || 0);
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
      this.hoverAnimal = this.hoverAgent ? null : this.renderer.hitTestAnimal(this.animals || [], e.clientX, e.clientY);
      if (this.dragging) {
        const dx = (e.clientX - this.dragStart.x) / this.renderer.camera.zoom;
        const dy = (e.clientY - this.dragStart.y) / this.renderer.camera.zoom;
        this.renderer.camera.x = this.cameraStart.x + dx;
        this.renderer.camera.y = this.cameraStart.y + dy;
      }
    });

    this.canvas.addEventListener('mousedown', e => {
      if (this.awaySummary) { this.dismissAwaySummary(); return; }
      if (this.pauseMenu.open) {
        const hit = this.pauseMenu.hitTest(e.clientX, e.clientY, this.canvas.width, this.canvas.height);
        this.pauseMenu.handleClick(hit, this);
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
      if (e.key === 'n' && e.ctrlKey && e.shiftKey) { e.preventDefault(); this.newWorld(); }
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
      milestones: this.milestones, dynasties: this.dynasties,
      chronicle: this.chronicle,
      worldAge: this.world?.age, worldAgeName: this.world?.ageName,
    };
  }

  getDivineButtons() {
    if (!this.inspectAgent) return [];
    return [
      { label: '♛ Crown',     action: 'crown' },
      { label: '✨ Bless',    action: 'bless' },
      { label: '💀 Smite',    action: 'smite' },
      { label: '🔮 Curse',    action: 'curse' },
      { label: '⚖ Pardon',   action: 'pardon' },
      { label: '📚 Skill+',   action: 'skill' },
      { label: '💰 Drop Gold',action: 'gold' },
      { label: '🏥 Heal',     action: 'heal' },
      { label: '⚔ Arm',      action: 'arm' },
      { label: '🌟 Make Hero',action: 'hero' },
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
      case 'bless':
        divineBless(agent, this.tick);
        agent.health = Math.min(100, (agent.health || 80) + 20);
        break;
      case 'smite':
        agent.health = Math.max(0, (agent.health || 80) - 60);
        agent.addEvent(this.tick, '⚡ Struck down by divine wrath!');
        if (agent.health <= 0) { agent.dead = true; agent.causeOfDeath = 'smited'; }
        this.bus.emit(EVENT.GOD_ACT, { action: 'smite', agent, tick: this.tick });
        break;
      case 'curse': divineCurse(agent, this.tick); break;
      case 'pardon':
        pardonAgent(agent, this.world);
        agent.wantedLevel = 0;
        agent.imprisoned = false;
        agent.addEvent(this.tick, 'Pardoned by divine decree');
        break;
      case 'skill': {
        const skillKeys = Object.keys(agent.skills || {});
        const key = skillKeys[Math.floor(Math.random() * skillKeys.length)] || 'leadership.govern';
        const [br, sk] = key.split('.');
        if (br && sk) grantSkill(agent, br, sk, (agent.skills[key] || 0) + 5);
        agent.addEvent(this.tick, `Divine gift: ${key} increased`);
        break;
      }
      case 'gold':
        creditWallet(agent.wallet, 100);
        agent.addEvent(this.tick, 'Gold rained from the heavens (+100s)');
        break;
      case 'heal':
        agent.health = 100;
        agent.disease = null;
        agent.starvationTicks = 0;
        agent.addEvent(this.tick, '✨ Healed by divine power');
        this.bus.emit(EVENT.GOD_ACT, { action: 'heal', agent, tick: this.tick });
        break;
      case 'arm':
        grantSkill(agent, 'combat', 'melee', Math.min(30, (agent.skills['combat.melee'] || 0) + 10));
        grantSkill(agent, 'combat', 'tactics', Math.min(30, (agent.skills['combat.tactics'] || 0) + 8));
        agent.addEvent(this.tick, '⚔ Armed and trained by divine will');
        break;
      case 'hero':
        agent.fame = (agent.fame || 0) + 200;
        agent.health = 100;
        for (const k of Object.keys(agent.skills || {})) agent.skills[k] = Math.max(agent.skills[k] || 0, 15);
        agent.addEvent(this.tick, '🌟 Ascended to legendary hero status!');
        this.bus.emit(EVENT.LEGEND_BORN, { agent, tick: this.tick });
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
    const season = getSeason(this.day);
    this._run('agents', () => tickAgents(this.agents, this.world, this.guilds, this.bus, this.tick, this.timeOfDay, this.weather));
    this._run('economy', () => tickEconomy(this.world, this.agents, this.bus, this.tick, season));
    this._run('construction', () => tickConstruction(this.world, this.agents, this.tick));
    this._run('planning', () => planNewBuildings(this.world, this.rng, this.tick));
    this._run('crime', () => tickCrime(this.agents, this.world, this.bus, this.tick, this.timeOfDay));
    this._run('guilds', () => tickGuilds(this.guilds, this.agents, this.bus, this.tick));
    this._run('social', () => tickSocial(this.agents, this.bus, this.tick, this.rng, this.world, season));
    this._run('animals', () => { this.animals = tickAnimals(this.animals, this.world, this.agents, this.tick); this.world.animals = this.animals; });
    this._run('adventuring', () => tickAdventuring(this.agents, this.world, this.world.dungeons, this.bus, this.tick));
    this._run('kingdoms', () => tickKingdoms(this.world, this.agents, this.kingdoms, this.bus, this.tick));
    this._run('diplomacy', () => tickDiplomacy(this.kingdoms, this.world, this.agents, this.bus, this.tick));
    this._run('caravans', () => { this.caravans = tickCaravans(this.caravans, this.world, this.agents, this.bus, this.tick); });
    this._run('disasters', () => tickDisasters(this.world, this.agents, this.bus, this.tick, this.rng, season));
    this._run('magic', () => tickSimpleMagic(this.agents, this.world, this.bus, this.tick));
    this._run('quests', () => { this.quests = tickQuests(this.quests, this.world, this.agents, this.bus, this.tick); });
    this._run('religion', () => tickReligion(this.world, this.agents, this.bus, this.tick, this.rng));
    this._run('politics', () => tickPolitics(this.world, this.agents, this.bus, this.tick, this.rng));
    this._run('disease', () => tickDisease(this.agents, this.world, this.bus, this.tick, this.rng));
    this._run('artifacts', () => tickArtifacts(this.artifacts, this.world, this.agents, this.bus, this.tick, this.rng));
    this._run('reputation', () => tickReputation(this.agents, this.world, this.bus, this.tick));
    this._run('language', () => tickLanguage(this.world, this.agents, this.bus, this.tick));
    this._run('ships', () => tickShips(this.ships, this.world, this.agents, this.bus, this.tick, this.rng));
    this._run('ages', () => tickAges(this.world, this.agents, this.kingdoms, this.artifacts, this.guilds, this.bus, this.tick, this.day));
    this._run('milestones', () => tickMilestones(this.milestones, this.world, this.agents, this.kingdoms, this.artifacts, this.guilds, this.bus, this.tick, this.day));
    this._run('dynasties', () => tickDynasties(this.dynasties, this.world, this.agents, this.bus, this.tick, this.milestones));

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

    // Handle camera-jump request from Almanac
    if (this.pauseMenu._pendingJump) {
      const jumpAgent = this.agents.find(a => a.id === this.pauseMenu._pendingJump);
      if (jumpAgent) {
        const p = hexToPixel(jumpAgent.q, jumpAgent.r, this.renderer.hexSize);
        this.renderer.camera.x = -p.x;
        this.renderer.camera.y = -p.y;
        this.inspectAgent = jumpAgent;
        this.renderer.selectedAgent = jumpAgent;
        this.paused = true;
        this.speedIndex = 0;
      }
      this.pauseMenu._pendingJump = null;
    }

    const divineButtons = this.inspectAgent ? this.getDivineButtons() : [];
    try {
    this.renderer.render(this.world, this.agents, this.timeOfDay, this.weather, {
      tick: this.tick,
      day: this.day,
      speedIndex: this.speedIndex,
      speedLabel: SPEED_LABELS[this.speedIndex],
      inspectAgent: this.inspectAgent,
      inspectBuilding: this.inspectBuilding,
      animals: this.animals,
      caravans: this.caravans,
      ships: this.ships,
      quests: this.quests,
      artifacts: this.artifacts,
      hoverAgent: this.hoverAgent,
      hoverAnimal: this.hoverAnimal,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      divineButtons,
      pauseMenu: this.pauseMenu,
      pauseMenuOpen: this.pauseMenu.open,
      season: getSeason(this.day),
      game: this,
    });
    } catch (err) {
      if (!this._renderErrorLogged) {
        this._renderErrorLogged = true;
        console.error('[Aetherworld] render error:', err);
      }
    }

    requestAnimationFrame(t => this.loop(t));
  }
}

const saved = loadGame();
const urlSeed = seedFromUrl();
const game = new Game();
if (urlSeed != null) {
  game.newWorld(urlSeed);
} else if (saved) {
  game.loadFromSave(saved);
} else {
  game.init();
}
markVisit(game.tick || 0);

window.aetherworld = game;
