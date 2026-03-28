# Unifactory

**An AI-powered 2D RPG where every playthrough is unique.** Built for GlitchHacks — Unifactory uses Google's Gemini API as a real-time game master, generating every room, NPC, quest, enemy, and story beat on the fly. No two games are ever the same.

Choose a world. Explore it. Talk to characters. Fight or show mercy. The AI remembers your choices and shapes the story around them.

> Inspired by Undertale, Earthbound, AI Dungeon, and Infinite-JRPG.

---

## How It Works

```
Player picks a theme (Cyberpunk / Medieval / Space)
        ↓
Gemini generates the first room as structured JSON
  → NPCs with dialogue, shops, quests
  → Enemies with unique combat patterns and ACT options
  → Items, interactable objects, locked doors
  → Environmental decorations, mood, atmosphere
        ↓
Player explores, talks, fights, collects items
        ↓
Each action feeds back into Gemini as context
  → NPC dialogue choices trigger Gemini for dynamic responses
  → Story state (inventory, quests, moral alignment) shapes future rooms
        ↓
Player exits the room → Gemini generates the next one
  → Consistent world, escalating narrative, reactive NPCs
        ↓
Loop continues through a 3-act story structure
```

The game has **zero hardcoded content**. Every room, every conversation, every enemy — generated live by Gemini based on the player's history.

---

## Features

### Three Themed Worlds
- **Cyberpunk** — Neon-lit streets of Neo-Tokyo 2087. Corporate espionage, rogue AIs, and the search for "The Oracle."
- **Medieval** — The cursed Kingdom of Eldrath. Sacred relics, shadow kings, and dungeon crawling.
- **Space** — Derelict Station Omega-7. Alien signals, infected crew, and cosmic horror.

Each theme has its own NPC types, enemy types, item types, color palettes, wall/floor patterns, and environmental decorations.

### AI-Driven Storytelling
- **3-Act Structure** — Gemini follows a narrative arc: setup → rising conflict → climax
- **Moral Alignment** — The game tracks kills vs. spares and labels you pacifist, merciful, neutral, aggressive, or violent. NPCs react accordingly.
- **Quest System** — NPCs assign quests (fetch items, defeat enemies, talk to characters, explore areas). Quests auto-complete when objectives are met, awarding XP and gold.
- **Persistent State** — Gemini receives the full game state with every request: inventory, quest flags, rooms visited, NPCs met, recent events, moral alignment. It uses this to generate contextually appropriate content.

### Undertale-Style Combat
- **Bullet-dodge phase** — Your soul (heart) appears in a box. Dodge enemy projectiles using arrow keys.
- **6 attack patterns** — horizontal sweep, vertical rain, aimed shots, spiral, wave, random scatter. Each enemy uses different patterns.
- **4 combat actions:**
  - **FIGHT** — Deal damage based on your ATK stat
  - **ACT** — Unique context-sensitive actions per enemy (Hack, Compliment, Intimidate, etc.) that can weaken enemies or progress toward sparing them
  - **ITEM** — Use consumables from your inventory mid-combat
  - **MERCY** — Spare the enemy when conditions are met (e.g. used enough ACT options, enemy HP is low, you have a specific item)
- **XP + Leveling** — Enemies give XP on defeat (and a mercy bonus for sparing). Level up grants +4 HP, +2 ATK, +1 DEF.

### RPG Systems
- **Equipment** — Weapons boost ATK, armor boosts DEF. Buy from shops or find in the world.
- **Inventory** — 8-slot inventory for consumables, quest items, keys, equipment.
- **Shop System** — Merchant NPCs sell healing items, weapons, and armor. Prices are theme-appropriate.
- **Gold Economy** — Earn gold from combat, quests, and NPC interactions. Spend it at shops.
- **Journal** — Press X to open a full journal overlay showing stats, equipment, active quests, completed quests, inventory, and moral alignment.

### Rich Environment
- **Theme-specific rendering** — Cyberpunk rooms have neon grid floors and panel walls. Medieval rooms have stone tiles and brick walls. Space rooms have metal grating and riveted panels.
- **Gemini-generated decorations** — Each room has 4-8 decorations (neon signs, torches, consoles, puddles, steam vents, viewports, etc.) rendered with glow and animation effects.
- **Ambient particles** — Floating colored particles themed to the world (neon sparks, dust motes, drifting stars).
- **Mood system** — Rooms have moods (calm, tense, eerie, dangerous, mysterious, peaceful) that affect visual overlays and atmosphere.
- **Vignette + lighting** — Dark edge vignette, NPC glow auras, item sparkles, exit portal effects.

### Dialogue System
- **Undertale-style text boxes** — Name plate, typewriter text with sound, asterisk narration prefix.
- **Branching choices** — NPC dialogue includes 2-3 choices. Each choice triggers a Gemini API call for a dynamic, context-aware response.
- **Effects** — Dialogue can give items, set quest flags, heal the player, give gold/XP, unlock paths, trigger combat, assign quests, or complete quests.

---

## Quick Start

Serve the project with any static HTTP server:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .

# PHP
php -S localhost:8000
```

Open `http://localhost:8000` in your browser.

### Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key" → "Create API Key"
3. Copy the key and paste it into the game's start screen
4. Select a model (Flash Lite is faster, Flash is smarter)

---

## Controls

| Key | Action |
|-----|--------|
| Arrow keys | Move character / Navigate menus |
| Z | Interact / Confirm / Advance dialogue |
| X | Open journal / Close menus / Back |
| Enter | Confirm on setup screen / Retry on error |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Game Engine | Phaser 3 (loaded via CDN) |
| AI Backend | Google Gemini API (gemini-2.5-flash-lite / gemini-2.5-flash) |
| Audio | Web Audio API (procedural retro sounds) |
| Sprites | Programmatically generated pixel art (no external assets) |
| Fonts | Press Start 2P (Google Fonts) |
| Hosting | Any static file server |

### File Structure

```
├── index.html              # Entry point, setup screen
├── style.css               # UI styling
├── js/
│   ├── main.js             # Game initialization
│   ├── storyState.js       # Player state, progression, quests
│   ├── gemini.js           # Gemini API client, prompts, validation
│   ├── BootScene.js        # Programmatic sprite generation
│   ├── ThemeSelectScene.js  # Theme selection screen
│   ├── TransitionScene.js   # Loading screen with progress bar
│   ├── GameScene.js         # Core gameplay, dialogue, shop, environment
│   └── CombatScene.js       # Undertale-style combat system
```

---

## Architecture

### Gemini as Game Master

Every Gemini request includes:
1. **System prompt** — World lore, NPC types, item types, color palettes, narrative structure rules, and the JSON schema
2. **Story state** — Full player context: HP, level, inventory, equipment, quest flags, rooms visited, NPCs met, moral alignment, recent events
3. **Action trigger** — What the player just did (exited a room, talked to an NPC, interacted with an object)

Gemini returns structured JSON that the game engine renders. The system prompt enforces a 3-act story structure based on the chapter number, and instructs Gemini to react to the player's moral alignment and quest progress.

### Room Generation Flow

```
TransitionScene
  → Sends story context + trigger to Gemini
  → Receives room spec JSON (NPCs, enemies, items, decorations, exits, quests)
  → Validates and normalizes the spec (clamps coordinates, fixes colors, normalizes directions)
  → Passes to GameScene for rendering

GameScene
  → Builds walls, floor, decorations based on theme
  → Places NPCs, enemies, items, interactables, exits
  → Registers quests from NPCs
  → Handles all player interaction
```

### NPC Interaction Flow

```
Player presses Z near NPC
  → Shows initial dialogue (pre-generated in room spec)
  → Player picks a choice
  → Sends choice + full state to Gemini
  → Gemini returns new dialogue + choices + effects
  → Effects applied (items, flags, gold, quests, combat triggers)
  → Loop continues until conversation ends
```

---

## Inspirations

- **Undertale** — Combat system, dialogue style, moral choice mechanics, visual aesthetic
- **Earthbound** — Quirky world-building, emotional storytelling through simple visuals
- **AI Dungeon** — LLM as game master concept
- **Infinite-JRPG** — Gemini-powered procedural RPG with journal and quest flags
- **AI Roguelite 2D** — Theme-based AI world generation, multi-act structure
- **Sciasy** — Reputation system affecting NPC behavior

---

## Future Plans

- **Nano Banana** integration for AI-generated character sprites
- **Veo** integration for animated cutscenes and backgrounds
- **Real-world impact layer** — Ground stories in real social issues (climate data, refugee experiences, mental health scenarios) with a post-game impact screen
- **Save/Load** system using localStorage
- **Crafting** system with AI-generated recipes
- **World map** showing connected rooms and player path
- **Multiplayer** — Shared worlds where players' choices affect each other

---

## License

Built for [GlitchHacks](https://glitchhacks.devfolio.co/). Based on [Unifactory](https://devfolio.co/projects/unifactory-a553).
