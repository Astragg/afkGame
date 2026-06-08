# Aetherworld — Mega Prompt & Full Spec

## Mega Prompt (copy-paste ready)

Build **Aetherworld**, a zero-asset HTML5 canvas fantasy life simulation in vanilla JavaScript with procedural generation only—no external images, sprites, or asset packs. Evolve the existing **Hex Tile Lab** foundation (`hex.js`, `worldgen.js`, `textures.js`, `renderer.js`, `agents.js`) into a living world: heightmap hex tiles where darker green means higher elevation, 20+ biomes, uphill movement costs, water and swimming, day/night cycle, and weather. Populate the world with autonomous agents across multiple races (Human, Goblin, Orc, Elf, Dwarf, and more) where Humans have the deepest skill tree; each agent has personality traits, needs, memory, relationships, an event log, and utility-based AI decision-making. Implement a full economy with jobs, wages, unemployment, trade, taxes, and debt; a crime and justice system with crimes, guards, trials, prisons, bounties, and corruption; guilds (adventurers, thieves, mages, crafters) with join mechanics, ranks, quests, and guild halls; adventuring parties that explore dungeons, fight monsters, and collect loot; settlements scaling from homes to kingdoms with castles and functional buildings; a deep Human skill tree spanning crime, law, magic, craft, and leadership; social systems for romance, marriage, reproduction, birth, inheritance, and family; animals including wildlife, livestock, pets, hunting, and fishing; food and starvation with hunger, farming, eating, starvation death, and famine; magic schools with legal and illegal distinctions; and a divine player layer with hover/click inspect, crown designation, grant skills/jobs, pardon, bless/curse, and time control (pause, 0.25x–8x speed, step tick). Use an anime-inspired UI rendered on canvas or lightweight DOM overlays. Deliver in phases with clear acceptance criteria per phase. All visuals must be procedural (canvas fills, gradients, noise, geometric shapes, text labels)—never depend on imported art.

---

## 1. Technical Foundation

### Stack & constraints
- **Runtime:** Single-page HTML5 application, zero external assets.
- **Rendering:** HTML5 `<canvas>` for world map, agents, buildings, effects, and UI chrome where practical; minimal DOM for menus if needed.
- **Language:** Vanilla JavaScript (ES modules). No frameworks unless explicitly added later.
- **Art:** 100% procedural—`textures.js` generates biome fills, patterns, icons, and portraits from math, noise, and geometry.
- **Persistence:** Optional `localStorage` / export JSON for saves (phase-dependent).

### Hex Tile Lab modules to evolve
| Module | Responsibility |
|--------|----------------|
| `hex.js` | Axial/cube hex math, neighbors, distance, pathfinding hooks, coordinate conversion |
| `worldgen.js` | Heightmap, moisture, temperature, biome assignment, rivers, POI placement |
| `textures.js` | Procedural palette per biome/elevation/building/agent; anime-style color language |
| `renderer.js` | Layered draw order: terrain → water → structures → agents → weather → UI overlays |
| `agents.js` | Agent state, tick update, rendering glyph, selection hit-test |

### Architecture principles
- Fixed simulation tick (e.g. 1 in-game hour per tick at 1x); decouple render FPS from sim tick.
- Data-oriented agent arrays for hundreds+ agents.
- Event bus or queue for crimes, births, deaths, quest completions, market trades.
- Seeded RNG for reproducible worlds.

---

## 2. World Generation & Environment

### Heightmap hex terrain
- Each hex stores: `elevation`, `moisture`, `temperature`, `biomeId`, `walkability`, `waterDepth`.
- **Visual rule:** darker green = higher elevation; lower areas trend lighter green → blue for water.
- Cliff/steep rules: elevation delta ≥ threshold between neighbors increases movement cost or blocks land units.

### Biomes (20+)
Examples to include (procedural tints, not tile sprites): Deep Ocean, Shallow Sea, Beach, River, Marsh, Grassland, Savanna, Forest, Dense Forest, Taiga, Tundra, Snow, Desert, Dunes, Badlands, Volcanic, Highlands, Meadow, Swamp, Jungle, Crystal Cavern (subsurface), Corrupted Wasteland. Each biome modifies temperature comfort, forage, danger, and building eligibility.

### Movement & traversal
- **Uphill:** Cost multiplier from elevation gain.
- **Water:** Shallow wade (slow); deep requires swimming skill or boat; drowning risk for non-swimmers.
- **Roads/paths:** Built over time, reduce cost.

### Day/night cycle
- Global `timeOfDay` 0–24; sky gradient and hex brightness shift; night reduces visibility radius and increases certain crimes.
- Agents sleep (need recovery); shops and guild halls have hours.

### Weather
- States: clear, cloudy, rain, storm, snow, fog, heatwave.
- Effects: movement penalty, crop growth modifier, fire risk, mood debuffs, visibility.

---

## 3. Races & Agents

### Playable / sim races
Human, Goblin, Orc, Elf, Dwarf (+ extensible race table). Each race has: base stat biases, lifespan, fertility, legal treatment modifiers, guild eligibility, and **skill tree depth** (Humans deepest; others narrower but specialized).

### Agent model
Per agent fields:
- **Identity:** name, race, age, sex, portrait seed, home hex, settlementId.
- **Personality:** Big-Five–style or trait tags (brave, greedy, loyal, vindictive…) affecting utility weights.
- **Needs:** hunger, rest, safety, social, esteem, fun—decay per tick, drive action selection.
- **Skills:** levels per branch (see §10); XP from practice and teaching.
- **Memory:** short episodic (last N events involving self) + long-term grudges/friendships.
- **Relationships:** directed edges with affinity, trust, romance, rivalry, family links.
- **Event log:** timestamped personal history (born, hired, married, arrested, leveled, etc.).
- **State:** job, guild rank, health, mana, gold, inventory, legal status, pregnancy, etc.

### Utility AI
Each tick, generate candidate actions (eat, work, sleep, socialize, commit crime, patrol, craft, travel, quest…). Score = Σ (weight × normalized utility); personality and needs modulate weights. Pick top action; tie-break with noise. No full GOAP required—transparent utility table is enough.

---

## 4. Jobs & Economy

### Employment
- Job types: farmer, fisher, guard, blacksmith, merchant, clerk, mage, priest, thief (covert), adventurer, noble, etc.
- Agents seek jobs by skill match and wage; employers hire until slots filled.
- **Wages** paid per tick/day from employer treasury or settlement budget.
- **Unemployment:** agents without jobs drift to odd jobs, crime, or misery; tracked per settlement.

### Trade
- Settlements produce/consume goods (food, ore, cloth, magic reagents).
- Caravans or abstract inter-settlement trade with prices from supply/demand.
- Player can bless markets or curse trade routes (divine powers).

### Fiscal policy
- **Taxes:** income or sales tax per settlement; revenue funds guards, roads, famine relief.
- **Debt:** agents and settlements can borrow; interest accrues; default triggers bankruptcy events, asset seizure, or exile.

---

## 5. Crime & Justice

### Crimes
Theft, assault, murder, trespass, smuggling, illegal magic, bribery, etc. Detection probability from witnesses, guard presence, light level.

### Law enforcement
- Guards patrol paths; respond to crime events in radius.
- **Bounties** posted for fugitives; adventurers or bounty hunters may pursue.

### Judicial pipeline
1. Arrest → 2. Detention → 3. **Trial** (evidence, witness credibility, defender skill) → 4. Verdict → 5. Sentence (fine, stocks, prison, exile, execution).

### Prisons
Capacity per settlement; prisoners consume food; rehabilitation skill training possible; escape attempts.

### Corruption
Guard/judge bribery chance from personality + thief guild pressure; reduces conviction rate; discoverable by player inspect or internal audits.

### Player powers
Grant pardon, commute sentence, or curse guilty parties.

---

## 6. Guilds

### Guild types
| Guild | Focus |
|-------|--------|
| Adventurers | Dungeons, monsters, escort, bounties |
| Thieves | Heists, fences, corruption networks |
| Mages | Schools, research, regulated vs illegal spells |
| Crafters | Smithing, alchemy, enchanting commissions |

### Mechanics
- Join requirements (skill, fee, sponsorship).
- **Ranks:** novice → member → veteran → master → guildmaster; perks per rank (quests, training discount, hall access).
- **Quests:** procedurally generated from settlement needs, guild board, or world threats.
- **Guild halls:** physical building on hex; meeting, training, storage.

---

## 7. Adventurers, Dungeons & Combat

### Parties
1–4 agents form party; leader utility decides target; shared loot split by agreement or leadership skill.

### Dungeons
Procedural entrance hexes (ruins, caves); interior as abstract depth levels or sub-map with rooms, traps, treasure, boss.

### Monsters
Level-scaled procedural creatures per biome/dungeon tier; drop loot and XP.

### Loot & equipment
Weapons, armor, trinkets, gold, reagents—modify combat utilities and economic value.

### Combat resolution
Phase 1: abstract exchange (power vs defense + variance); later: tactical optional. Death, injury, retreat outcomes logged.

---

## 8. Settlements & Buildings

### Settlement tiers
Homestead → Hamlet → Village → Town → City → **Kingdom** capital. Promotion by population, economy, and prestige.

### Structures
Homes, farms, fisheries, markets, taverns, temples, barracks, prisons, guild halls, wizard towers, castles, walls, roads, wells, granaries.

### Castles & kingdoms
Castle anchors region defense; lord/king role (agent or title); vassal settlements pay tribute; succession on death (inheritance rules).

### Building placement
Hex occupancy; procedural footprint in `renderer.js`; provides job slots and services.

---

## 9. Social Systems

### Romance & marriage
Affinity from social interactions; courtship; marriage contract linking families, dowries, and inheritance rights.

### Reproduction & birth
Fertility from age/race/health; pregnancy duration in ticks; child agent spawned with parents recorded.

### Family & inheritance
Household unit; on death, assets pass by will, primogeniture, or settlement law; orphans need guardians.

### Reputation & gossip
Events propagate limited hops; affects hiring, prices, romance.

---

## 10. Skills (Human-deep tree)

Humans access full tree; other races get compressed branches with racial bonuses.

### Branches (expand each to 5–10 tiers)
- **Crime:** pickpocket, lockpick, stealth, fence, assassinate.
- **Law:** investigate, prosecute, defend, judge, legislate.
- **Magic:** elemental, healing, illusion, necromancy (often illegal), enchant.
- **Craft:** smith, tailor, cook, alchemist, engineer.
- **Leadership:** persuade, command, govern, trade, teach.
- **Survival:** hunt, fish, farm, swim, forage.
- **Combat:** melee, ranged, dodge, tactics.

Skills gate jobs, quest success, trial outcomes, and crafting quality. Player can **grant skill levels** to crowned champions or punished agents.

---

## 11. Animals

### Wildlife
Biome-specific populations (deer, wolf, bear, fish schools); roam and flee; hunting yields food and materials.

### Livestock
Cows, chickens, etc. in settlements; require feed; produce milk/eggs/meat.

### Pets
Bond to agent; mood bonus; optional combat assist.

### Hunting & fishing
Actions tied to Survival skills; over-harvest depletes local stocks until regen.

---

## 12. Food, Farming & Starvation

### Hunger need
Decays every tick; eating restores from inventory or communal stores.

### Farming
Plant/harvest cycles on farm hexes; weather and season affect yield.

### Starvation & famine
Sustained zero food → health drain → death. Settlement granary empty + crop failure → **famine** event: mortality, unrest, migration.

---

## 13. Magic

### Schools
Elemental, divine, arcane, nature, necromancy, etc.; taught at guild/mage tower; mana cost and skill requirement per spell.

### Legal status
Licensed magic vs **illegal** (necromancy, mind control, plague); detection and trial like other crimes.

### Effects
Combat, healing, blessing, cursing, weather nudge, construction aid—logged in agent event log.

### Player divine powers
**Bless** (restore needs, buff skills) / **Curse** (debuff, illness, bad luck) on inspected agent or hex region.

---

## 14. Player (Divine Observer)

### Inspection
- **Hover:** tooltip—name, race, job, needs bars, mood, current action.
- **Click:** detail panel—full stats, relationships, skills, event log, inventory.

### Crown
Designate one agent as crowned ruler/champion; boosted loyalty path; player interventions target them preferentially.

### Interventions
| Power | Effect |
|-------|--------|
| Grant skill | Set or boost skill node |
| Grant job | Force employer slot or title |
| Pardon | Clear legal record / free prisoner |
| Bless / Curse | Divine buff or debuff |
| Time control | Pause, 0.25x, 0.5x, 1x, 2x, 4x, 8x, single-step tick |

Simulation **pauses** while inspection modal open (configurable).

---

## 15. UI & Aesthetic

### Anime-inspired language
- Saturated biome palettes, soft gradients, clean outlined hex borders.
- Agent portraits: procedural face circles (hair color, eye style from seed).
- Speech bubbles for notable events optional phase 2+.
- Typography: crisp sans-serif; JP-adjacent accent colors for guild/quest panels (not licensed IP).

### HUD
Minimap, clock, weather icon, settlement summary, selected agent panel, speed controls, pause/step.

---

## 16. Phased Delivery & Acceptance Criteria

### Phase 1 — World & render foundation
**Deliver:** Evolved hex engine, heightmap worldgen, 20+ biomes, procedural textures, day/night visual, camera pan/zoom, hover hex inspect.

**Acceptance criteria:**
- [ ] New seeded world generates in &lt;3s at 10k hexes scale (or documented smaller default).
- [ ] Elevation visibly correlates with darker green; water renders on low elevation.
- [ ] Uphill path costs more than flat in pathfinder test.
- [ ] Day/night cycle completes and changes sky/hex shading.
- [ ] Zero image assets loaded; all terrain from canvas procedures.

---

### Phase 2 — Agents & utility AI
**Deliver:** Spawn populations by race; needs decay; utility chooser; movement across terrain/water; relationship stubs; event log.

**Acceptance criteria:**
- [ ] ≥50 agents simulate at 1x without frame drop (&gt;30 FPS render on mid hardware).
- [ ] Agents path home to eat when hunger critical.
- [ ] Personality changes action distribution (greedy agent steals more in test scenario).
- [ ] Click agent opens inspect with needs, skills, log entries.

---

### Phase 3 — Economy & settlements
**Deliver:** Jobs, wages, unemployment, basic trade, taxes, buildings, settlement tier promotion.

**Acceptance criteria:**
- [ ] Farmer job produces food into settlement store over N ticks.
- [ ] Unemployed agents register in settlement stats.
- [ ] Tax tick reduces agent gold and increases treasury.
- [ ] New building placement unlocks job slots.

---

### Phase 4 — Crime, justice, guilds
**Deliver:** Crime types, guards, trials, prisons, bounties, corruption; four guild types with join, ranks, quests, halls.

**Acceptance criteria:**
- [ ] Theft creates crime record; guard arrests thief within patrol range.
- [ ] Trial produces guilty/not guilty from evidence + skills.
- [ ] Agent joins guild, completes quest, ranks up.
- [ ] Player pardon clears sentence.

---

### Phase 5 — Social, skills, food depth
**Deliver:** Romance, marriage, birth, inheritance; full Human skill tree; farming, hunger, starvation death, famine event.

**Acceptance criteria:**
- [ ] Married pair can produce child agent with correct parent links.
- [ ] Death distributes inventory per inheritance rules.
- [ ] Starvation kills agent after configurable ticks without food.
- [ ] Famine triggers when granary empty + crop failure condition met.

---

### Phase 6 — Adventuring, magic, animals, divine player
**Deliver:** Parties, dungeons, monsters, loot; magic schools legal/illegal; wildlife/livestock/hunt/fish; bless/curse, crown, time 0.25x–8x + step.

**Acceptance criteria:**
- [ ] Party clears dungeon level and returns with loot.
- [ ] Illegal spell detection can trigger arrest.
- [ ] Wildlife repopulates after hunt cooldown.
- [ ] Player sets 8x speed and single-step advances exactly one sim tick.
- [ ] Crowned agent receives player grant skill/job successfully.

---

### Phase 7 — Polish & integration
**Deliver:** Weather gameplay effects, debt bankruptcy, kingdom vassals, UI polish, save/load export.

**Acceptance criteria:**
- [ ] Storm reduces movement and visible in UI.
- [ ] Settlement bankruptcy fires event chain documented in design.
- [ ] Save/load round-trip restores world + all agents without drift.
- [ ] Full play session 2+ in-game years stable with no uncaught exceptions.

---

## 17. Glossary

| Term | Meaning |
|------|---------|
| Tick | One discrete simulation step (time advances when not paused) |
| Utility AI | Scoring possible actions by weighted needs/personality |
| Crowned | Agent designated by player for focused governance |
| Zero-asset | No PNG/SVG/external media; procedural draw only |
| Hex Tile Lab | Existing module set this project extends |

---

*End of Aetherworld spec — use the mega prompt paragraph at the top to kick off implementation; use sections below as authoritative reference during build.*
