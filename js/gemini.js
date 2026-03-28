const THEME_PROMPTS = {
    cyberpunk: {
        world: `WORLD: Neo-Tokyo 2087. Mega-corporations control everything. The player is a rogue operative navigating the neon-lit undercity. A mysterious signal called "The Oracle" promises to expose the truth. The player must find it.
TONE: Noir, gritty, morally gray. NPCs have hidden agendas. Trust no one fully.
NPC TYPES: hackers, street vendors, corporate spies, cyborg mercenaries, info brokers, rogue AIs, rebel leaders
ITEM TYPES: data_chip, keycard, neural_implant, credits, med_kit, hacking_tool, weapon_mod
ENEMY TYPES: security_drone, cyber_ninja, corrupt_cop, rival_hacker, corporate_soldier
ROOM TYPES: neon alley, underground club, hacker den, corporate lobby, abandoned factory, rooftop, cyber cafe, sewer tunnel
COLORS - backgrounds: #0a0a2e #0f0f1a #1a0a2e | walls: #1a1a3e #2a1a3e | accents: #00ffff #ff00ff #00ff00 #ff6600`,
        currency: 'credits'
    },
    medieval: {
        world: `WORLD: The Kingdom of Eldrath falls to a dark curse. The player is a wandering hero seeking the three Sacred Relics to vanquish the Shadow King before darkness consumes the land.
TONE: Epic fantasy, heroic, mysterious. Magic is real but rare. Betrayal lurks in courts.
NPC TYPES: knights, mages, merchants, peasants, priests, thieves, royalty, dwarven smiths, elven scouts
ITEM TYPES: sword, shield, potion, key, scroll, gold_coins, enchanted_gem, holy_water
ENEMY TYPES: goblin, skeleton, dark_knight, slime, fire_wolf, shadow_wraith, bandit
ROOM TYPES: castle hall, tavern, forest clearing, dungeon, village square, throne room, temple, cave, market
COLORS - backgrounds: #1a1008 #0a1a0a #1a0a1a | walls: #3a2a1a #2a3a2a | accents: #ffaa22 #44ff44 #ff4444 #ffd700`,
        currency: 'gold'
    },
    space: {
        world: `WORLD: Year 3247. The player is stranded on Station Omega-7, a derelict space station at the edge of known space. Strange signals pulse from deep within. Not all crew are what they seem.
TONE: Sci-fi horror meets exploration. Isolation, cosmic wonder, creeping dread.
NPC TYPES: astronauts, alien diplomats, rogue AIs, space pirates, scientists, alien creatures, holograms, androids
ITEM TYPES: fuel_cell, star_map, alien_artifact, plasma_weapon, oxygen_tank, repair_tool, data_log, med_pack
ENEMY TYPES: alien_parasite, rogue_drone, void_creature, space_pirate, infected_crew, cosmic_horror
ROOM TYPES: bridge, med bay, cargo hold, airlock, alien chamber, engine room, crew quarters, observation deck
COLORS - backgrounds: #0a0a1e #000a14 #0a0014 | walls: #1a2a3e #1a1a2e | accents: #4488ff #44ffaa #ff4444 #ffffff`,
        currency: 'credits'
    }
};

const ROOM_SCHEMA = `{
  "room_id": "unique_string",
  "name": "Room Name (2-4 words)",
  "narration": "One atmospheric sentence describing what the player sees on entry",
  "mood": "calm|tense|eerie|mysterious|dangerous|peaceful",
  "bg_color": "#hex_dark",
  "wall_color": "#hex",
  "obstacles": [{"x":0.0-1.0,"y":0.0-1.0,"w":0.05-0.2,"h":0.05-0.2,"color":"#hex","type":"rock|crystal|pillar|crate|rubble|machine|barrel|debris"}],
  "npcs": [{
    "id": "unique_id",
    "name": "Display Name",
    "x": 0.0-1.0, "y": 0.0-1.0,
    "color": "#hex", "accent_color": "#hex",
    "sprite_type": "merchant|warrior|mage|civilian|suspicious|royal|alien|robot",
    "emotion": "neutral|friendly|hostile|scared|mysterious|sad",
    "initial_dialogue": ["Line 1", "Line 2"],
    "initial_choices": [{"id":"choice_id","text":"Choice text"}],
    "has_quest": false
  }],
  "items": [{"id":"unique_id","name":"Item Name","x":0.0-1.0,"y":0.0-1.0,"color":"#hex","type":"quest_item|consumable|weapon|key","description":"Short desc"}],
  "interactables": [{
    "id": "unique_id",
    "type": "door|terminal|chest|sign|switch",
    "x": 0.0-1.0, "y": 0.0-1.0,
    "color": "#hex",
    "locked": false,
    "requires_item": null,
    "interact_text": ["What the player discovers"],
    "interact_effect": null
  }],
  "exits": [{
    "id": "unique_id",
    "direction": "left|right|top|bottom",
    "position": 0.2-0.8,
    "color": "#hex",
    "label": "Area Name",
    "blocked": false,
    "requires_item": null
  }],
  "enemies": [{
    "id": "unique_id",
    "name": "Enemy Name",
    "x": 0.0-1.0, "y": 0.0-1.0,
    "color": "#hex",
    "accent_color": "#hex",
    "hp": 15-40,
    "atk": 3-8,
    "patterns": [{"type":"horizontal_sweep|vertical_rain|aimed_shots|spiral|random_scatter","speed":1-4,"count":3-8,"duration":4000-6000}],
    "intro_dialogue": ["Enemy speaks..."],
    "defeat_dialogue": ["On defeat..."],
    "spare_dialogue": ["On spare..."],
    "spare_condition": "hp_below_half|after_3_turns|has_item:item_id|always",
    "rewards": {"gold":0-50,"item":null}
  }]
}`;

export class GeminiClient {
    constructor(apiKey, model = 'gemini-2.5-flash-lite') {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.theme = null;
    }

    setTheme(theme) {
        this.theme = theme;
    }

    getSystemPrompt() {
        const t = THEME_PROMPTS[this.theme] || THEME_PROMPTS.cyberpunk;
        return `You are the game master for "Unifactory", a 2D RPG with Undertale-style combat and dialogue.
You generate ALL game content as structured JSON. You are the story brain — every room, NPC, item, and enemy comes from you.

${t.world}

YOUR RULES:
1. Return ONLY valid JSON — never prose, markdown, or explanation
2. Maintain narrative consistency — reference previous rooms, NPCs, and player choices
3. NPCs have distinct personalities shown through SHORT dialogue (1-3 lines each)
4. Items must serve a purpose (keys unlock doors, quest items advance story, consumables heal)
5. Combat encounters should feel earned — enemies have motivations
6. The story should escalate: early rooms are exploratory, later rooms are climactic
7. React to player inventory and quest flags — if they have a key, put a locked door
8. Each room should have 2-4 NPCs, 1-3 exits, and optionally enemies/items
9. Keep the bottom of the room (y > 0.8) clear for player spawn
10. After chapter 6-8, start steering toward a climax/resolution
11. Currency is "${t.currency}"
12. All coordinates normalized 0.0-1.0, colors as hex strings`;
    }

    async callGemini(userMessage) {
        const body = {
            systemInstruction: {
                parts: [{ text: this.getSystemPrompt() }]
            },
            contents: [{
                role: 'user',
                parts: [{ text: userMessage }]
            }],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.85,
                maxOutputTokens: 8192
            }
        };

        const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API error ${response.status}: ${err}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty response from Gemini');
        return JSON.parse(text);
    }

    async generateRoom(storyContext, trigger) {
        const triggerDesc = trigger
            ? `The player just: ${trigger}`
            : 'The adventure begins. Generate the FIRST room — atmospheric, intriguing, with NPCs to meet.';

        const prompt = `ACTION: generate_room

STORY STATE:
${JSON.stringify(storyContext, null, 1)}

${triggerDesc}

Generate a rich room following this JSON schema EXACTLY:
${ROOM_SCHEMA}

Requirements for THIS room:
- 2-4 NPCs with personality and initial dialogue (each NPC gets 1-3 lines + 2-3 choices)
- 3-5 obstacles for navigation challenge
- 1-3 exits to different areas (use different directions)
- 0-2 items to discover
- 0-1 interactable objects (doors, terminals, chests)
- 0-1 enemies (more likely in later chapters)
- Room should advance the story based on player's recent actions
- Use dark background colors, bright accent colors
- Make it feel alive and connected to the world`;

        const spec = await this.callGemini(prompt);
        return this.validateRoom(spec);
    }

    async talkToNPC(npcId, npcName, choiceId, storyContext) {
        const prompt = `ACTION: npc_dialogue_response

The player is talking to NPC "${npcName}" (id: ${npcId}).
The player chose: "${choiceId}"

STORY STATE:
${JSON.stringify(storyContext, null, 1)}

Return JSON with the NPC's response:
{
  "dialogue": ["Line 1", "Line 2 (max 3 lines)"],
  "choices": [{"id":"choice_id","text":"Choice text"}],
  "effects": {
    "give_item": null or {"id":"item_id","name":"Item Name","type":"quest_item|consumable|key","color":"#hex","description":"desc"},
    "take_item": null or "item_id",
    "set_flag": null or {"key":"flag_name","value":"flag_value"},
    "heal": 0,
    "give_gold": 0,
    "trigger_combat": null or "enemy_id_from_room",
    "open_path": null or "exit_id or interactable_id to unlock"
  }
}

If the conversation is ending, return empty choices [].
Keep dialogue SHORT and in-character. Make effects meaningful.`;

        return await this.callGemini(prompt);
    }

    async interactObject(objectId, objectInfo, storyContext) {
        const prompt = `ACTION: interact_object

The player interacts with: ${JSON.stringify(objectInfo)}

STORY STATE:
${JSON.stringify(storyContext, null, 1)}

Return JSON:
{
  "dialogue": ["What happens (1-3 lines)"],
  "effects": {
    "give_item": null or {"id":"id","name":"Name","type":"type","color":"#hex","description":"desc"},
    "set_flag": null or {"key":"name","value":"value"},
    "heal": 0,
    "give_gold": 0,
    "unlock": null or "exit_id or interactable_id",
    "trigger_combat": null
  }
}`;

        return await this.callGemini(prompt);
    }

    validateRoom(spec) {
        if (!spec.room_id) spec.room_id = `room_${Date.now()}`;
        if (!spec.name) spec.name = 'Unknown Place';
        if (!spec.narration) spec.narration = 'You enter a new area...';
        if (!spec.bg_color || !spec.bg_color.startsWith('#')) spec.bg_color = '#0a0a1e';
        if (!spec.wall_color || !spec.wall_color.startsWith('#')) spec.wall_color = '#2a2a3e';
        if (!spec.mood) spec.mood = 'mysterious';
        if (!spec.obstacles) spec.obstacles = [];
        if (!spec.npcs) spec.npcs = [];
        if (!spec.items) spec.items = [];
        if (!spec.interactables) spec.interactables = [];
        if (!spec.exits) spec.exits = [];
        if (!spec.enemies) spec.enemies = [];

        for (const obs of spec.obstacles) {
            obs.x = clamp(obs.x, 0.05, 0.95);
            obs.y = clamp(obs.y, 0.05, 0.75);
            obs.w = clamp(obs.w || 0.08, 0.04, 0.25);
            obs.h = clamp(obs.h || 0.08, 0.04, 0.25);
            if (!obs.color?.startsWith('#')) obs.color = '#3a3a4e';
        }

        for (const npc of spec.npcs) {
            npc.x = clamp(npc.x, 0.1, 0.9);
            npc.y = clamp(npc.y, 0.1, 0.75);
            if (!npc.color?.startsWith('#')) npc.color = '#aaaaff';
            if (!npc.accent_color?.startsWith('#')) npc.accent_color = '#ffffff';
            if (typeof npc.initial_dialogue === 'string') npc.initial_dialogue = [npc.initial_dialogue];
            if (!npc.initial_dialogue || !Array.isArray(npc.initial_dialogue)) npc.initial_dialogue = ['...'];
            if (!Array.isArray(npc.initial_choices)) npc.initial_choices = [];
            if (!npc.name) npc.name = npc.id;
        }

        for (const item of spec.items) {
            item.x = clamp(item.x, 0.1, 0.9);
            item.y = clamp(item.y, 0.1, 0.75);
            if (!item.color?.startsWith('#')) item.color = '#ffdd44';
        }

        for (const inter of spec.interactables) {
            inter.x = clamp(inter.x, 0.05, 0.95);
            inter.y = clamp(inter.y, 0.05, 0.8);
            if (!inter.color?.startsWith('#')) inter.color = '#888888';
            if (typeof inter.interact_text === 'string') inter.interact_text = [inter.interact_text];
            if (!inter.interact_text || !Array.isArray(inter.interact_text)) inter.interact_text = ['Nothing happens.'];
        }

        const dirMap = { north: 'top', south: 'bottom', east: 'right', west: 'left', up: 'top', down: 'bottom' };
        const usedDirs = new Set();
        for (const exit of spec.exits) {
            const normalized = dirMap[exit.direction?.toLowerCase()] || exit.direction?.toLowerCase();
            exit.direction = ['left', 'right', 'top', 'bottom'].includes(normalized) ? normalized : 'right';
            if (usedDirs.has(exit.direction)) {
                const avail = ['left', 'right', 'top', 'bottom'].find(d => !usedDirs.has(d));
                if (avail) exit.direction = avail;
            }
            usedDirs.add(exit.direction);
            exit.position = clamp(exit.position || 0.5, 0.2, 0.8);
            if (!exit.color?.startsWith('#')) exit.color = '#4488ff';
            if (!exit.label) exit.label = exit.direction;
        }

        for (const enemy of spec.enemies) {
            enemy.x = clamp(enemy.x, 0.2, 0.8);
            enemy.y = clamp(enemy.y, 0.2, 0.6);
            enemy.hp = clamp(enemy.hp || 20, 10, 60);
            enemy.atk = clamp(enemy.atk || 5, 2, 12);
            if (!enemy.color?.startsWith('#')) enemy.color = '#ff4444';
            if (!enemy.patterns || !enemy.patterns.length) {
                enemy.patterns = [{ type: 'horizontal_sweep', speed: 2, count: 5, duration: 5000 }];
            }
            if (typeof enemy.intro_dialogue === 'string') enemy.intro_dialogue = [enemy.intro_dialogue];
            if (!enemy.intro_dialogue || !Array.isArray(enemy.intro_dialogue)) enemy.intro_dialogue = ['...'];
            if (typeof enemy.defeat_dialogue === 'string') enemy.defeat_dialogue = [enemy.defeat_dialogue];
            if (typeof enemy.spare_dialogue === 'string') enemy.spare_dialogue = [enemy.spare_dialogue];
            if (!enemy.spare_condition) enemy.spare_condition = 'hp_below_half';
        }

        return spec;
    }
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v || min));
}
