const THEME_PROMPTS = {
    cyberpunk: {
        world: `WORLD: Neo-Tokyo 2087. Mega-corporations rule. The player is a rogue operative seeking "The Oracle", an AI that can expose the truth. The undercity is neon-lit, rain-soaked, and dangerous.
TONE: Noir, gritty, morally gray. NPCs have hidden agendas. Technology is both salvation and curse.
NPC TYPES: hackers, street vendors, corporate spies, cyborg mercs, info brokers, rogue AIs, rebel leaders, fixers, netrunners
ENEMY TYPES: security_drone, cyber_ninja, corrupt_cop, rival_hacker, corporate_soldier, mutant
ITEM TYPES: data_chip, keycard, neural_implant, med_kit, hacking_tool, stim_pack, EMP_grenade
DECORATION TYPES: neon_sign, pipe, vent, puddle, hologram, cable, screen, graffiti, dumpster, steam_vent
WALL_STYLE: panels (horizontal metal panels with glowing seams)
FLOOR_STYLE: neon_grid (dark tiles with cyan grid lines)
COLORS - bg: #08081e #0a0a28 #0c0820 | walls: #181840 #1c1c48 | accents: #00ffff #ff00ff #00ff88 #ff6600`,
        currency: 'credits'
    },
    medieval: {
        world: `WORLD: The Kingdom of Eldrath falls to a dark curse. The player seeks three Sacred Relics to vanquish the Shadow King. Villages burn, dungeons awaken, and allies are scarce.
TONE: Epic fantasy, heroic but dark. Magic is rare and feared. Courts hide betrayal.
NPC TYPES: knights, mages, merchants, peasants, priests, thieves, royalty, dwarven smiths, elven rangers, cursed villagers
ENEMY TYPES: goblin, skeleton, dark_knight, slime, fire_wolf, shadow_wraith, bandit, cursed_armor
ITEM TYPES: potion, key, scroll, enchanted_gem, holy_water, herb, antidote, torch
DECORATION TYPES: torch_bracket, barrel, chain, banner, cobweb, skull, bookshelf, armor_stand, moss, crack
WALL_STYLE: bricks (stone brick pattern)
FLOOR_STYLE: stone (irregular stone tiles)
COLORS - bg: #14100a #0c1408 #18100c | walls: #3a2a1a #2a3020 | accents: #ffaa22 #44dd44 #ff4444 #ffd700`,
        currency: 'gold'
    },
    space: {
        world: `WORLD: Year 3247. Player is stranded on Station Omega-7, a derelict space station. Strange signals pulse from deep within. The crew is fragmented—some infected, some hiding, some not human at all.
TONE: Sci-fi horror meets exploration. Isolation, cosmic wonder, creeping dread. Trust is earned slowly.
NPC TYPES: astronauts, alien_diplomats, rogue_AIs, space_pirates, scientists, alien_creatures, holograms, androids
ENEMY TYPES: alien_parasite, rogue_drone, void_creature, space_pirate, infected_crew, cosmic_horror
ITEM TYPES: fuel_cell, star_map, alien_artifact, plasma_charge, oxygen_tank, repair_tool, data_log, med_pack
DECORATION TYPES: console, cable_run, warning_light, viewport, specimen_tube, crate_stack, antenna, sparking_wire
WALL_STYLE: metal (riveted metal panels)
FLOOR_STYLE: grating (metal floor grating with underlight)
COLORS - bg: #060612 #080818 #0a0616 | walls: #1a2a3e #182030 | accents: #4488ff #44ffaa #ff4444 #ffffff`,
        currency: 'credits'
    }
};

const STORY_BEATS = {
    setup:  ['introduction', 'first_ally', 'main_quest_reveal', 'world_building'],
    rising: ['rising_danger', 'unexpected_ally', 'betrayal_or_twist', 'dark_secret', 'midpoint_crisis', 'moral_dilemma', 'loss_or_sacrifice'],
    climax: ['preparation', 'penultimate_confrontation', 'darkest_hour', 'revelation'],
    finale: ['final_confrontation'],
};

function getStoryStructure(ctx) {
    const room = ctx.room_number || 1;
    const max = ctx.max_rooms || 10;
    const phase = ctx.story_phase || 'setup';
    const pct = Math.round((room / max) * 100);
    const remaining = max - room;

    const beats = STORY_BEATS[phase] || STORY_BEATS.setup;
    const beat = beats[Math.floor(Math.random() * beats.length)];

    let phaseInstr = '';
    switch (phase) {
        case 'setup':
            phaseInstr = `ACT 1 — SETUP (Room ${room}/${max}, ${pct}% through story)
Introduce the world. Let the player explore, meet key NPCs, discover the central conflict. Low danger. Plant seeds of mystery. Establish at least one main quest thread. Build atmosphere.
STORY BEAT for this room: "${beat}" — shape the room around this narrative function.`;
            break;
        case 'rising':
            phaseInstr = `ACT 2 — RISING ACTION (Room ${room}/${max}, ${pct}% through story)
Escalate conflict. Introduce antagonist forces. Betray expectations. Present hard moral choices. More enemies appear. Sub-quests branch. Reference earlier events/NPCs to build continuity.
STORY BEAT for this room: "${beat}" — shape the room around this narrative function.`;
            break;
        case 'climax':
            phaseInstr = `ACT 3 — CLIMAX (Room ${room}/${max}, ${pct}% through story, ${remaining} rooms left)
Build toward the final confrontation. Callback to earlier NPCs, items, and choices. High stakes — every room matters. Boss-tier enemies possible. Begin resolving quest lines. Create urgency.
STORY BEAT for this room: "${beat}" — shape the room around this narrative function.`;
            break;
        case 'finale':
            phaseInstr = `★ FINALE — FINAL ROOM (Room ${room}/${max}, THIS IS THE LAST ROOM)
This is the ENDING of the story. The player reaches the final destination. Include:
- A powerful final boss OR a climactic NPC confrontation that resolves the central conflict
- Callbacks to key NPCs and choices from earlier rooms
- NO EXITS — the story ends here
- The boss/confrontation outcome determines the ending
- Make it MEMORABLE and DRAMATIC — this is the payoff for the entire journey
- The room should feel like a culmination of everything that came before`;
            break;
    }

    return `NARRATIVE STRUCTURE:
The game has ${max} total rooms. This is room ${room}. The story MUST conclude by room ${max}.

${phaseInstr}

PACING RULES:
- The player's MORAL ALIGNMENT affects NPC reactions: pacifist players find more allies; violent players face more hostility
- Every room must advance the plot — no filler rooms
- Reference the story_summary in context to maintain continuity
- Build toward the ending: plant seeds early, pay them off later
- Vary the emotional tone between rooms (not all tense, not all calm)`;
}

function getAntiRepetitionRules(ctx) {
    const parts = [];
    if (ctx.used_room_names?.length) parts.push(`DO NOT reuse these room names: ${ctx.used_room_names.join(', ')}`);
    if (ctx.used_npc_names?.length) parts.push(`DO NOT reuse these NPC names: ${ctx.used_npc_names.join(', ')}`);
    if (ctx.used_enemy_names?.length) parts.push(`DO NOT reuse these enemy names: ${ctx.used_enemy_names.join(', ')}`);
    if (!parts.length) return '';
    return `\nANTI-REPETITION (CRITICAL — use COMPLETELY DIFFERENT names and concepts):\n${parts.join('\n')}`;
}

const ROOM_SCHEMA = `{
  "room_id": "unique_string",
  "name": "Room Name (2-4 words)",
  "narration": "One vivid atmospheric sentence",
  "mood": "calm|tense|eerie|mysterious|dangerous|peaceful",
  "bg_color": "#hex_very_dark",
  "wall_color": "#hex",
  "decorations": [{"type":"string_from_theme_list","x":0.0-1.0,"y":0.0-1.0,"color":"#hex","text":"optional_for_signs"}],
  "obstacles": [{"x":0.0-1.0,"y":0.0-1.0,"w":0.05-0.2,"h":0.05-0.2,"color":"#hex","type":"rock|crystal|pillar|crate|rubble|machine|barrel|debris"}],
  "npcs": [{
    "id": "unique_id", "name": "Name",
    "x":0.0-1.0, "y":0.0-1.0,
    "color":"#hex", "accent_color":"#hex",
    "sprite_type": "merchant|warrior|mage|civilian|suspicious|royal|alien|robot",
    "emotion": "neutral|friendly|hostile|scared|mysterious|sad",
    "initial_dialogue": ["Line 1","Line 2 (max 3)"],
    "initial_choices": [{"id":"id","text":"Choice text"}],
    "has_quest": false,
    "quest": null,
    "shop_inventory": null
  }],
  "items": [{"id":"id","name":"Name","x":0.0-1.0,"y":0.0-1.0,"color":"#hex","type":"quest_item|consumable|weapon|armor|key","description":"desc","effect":null,"slot":null,"bonus":0,"price":0}],
  "interactables": [{"id":"id","type":"door|terminal|chest|sign|switch","x":0.0-1.0,"y":0.0-1.0,"color":"#hex","locked":false,"requires_item":null,"interact_text":["text"],"interact_effect":null}],
  "exits": [{"id":"id","direction":"left|right|top|bottom","position":0.2-0.8,"color":"#hex","label":"Area Name","blocked":false,"requires_item":null}],
  "enemies": [{
    "id":"id", "name":"Name",
    "x":0.0-1.0, "y":0.0-1.0,
    "color":"#hex", "accent_color":"#hex",
    "hp":15-50, "atk":3-10, "xp_reward":15-60, "gold_reward":5-30,
    "patterns":[{"type":"horizontal_sweep|vertical_rain|aimed_shots|spiral|random_scatter|wave","speed":1-4,"count":3-8,"duration":4000-6000}],
    "intro_dialogue":["text"],
    "act_options":[
      {"id":"check","text":"Check","response":"Stats and flavor text"},
      {"id":"unique_act","text":"Verb","response":"What happens","effect":"weaken|spare_progress|heal_self|none"}
    ],
    "spare_condition":"spare_progress:2|hp_below_half|after_3_turns|has_item:item_id",
    "defeat_dialogue":["text"], "spare_dialogue":["text"],
    "rewards":{"gold":0-50,"item":null}
  }]
}`;

const QUEST_SCHEMA = `When an NPC has has_quest=true, include a quest object:
"quest": {
  "id":"quest_id", "title":"Quest Title (3-5 words)",
  "description":"One sentence objective",
  "objective":"find:item_id|defeat:enemy_id|talk:npc_id|visit:room_keyword",
  "reward":{"xp":20-60,"gold":10-40,"item":null}
}`;

const SHOP_SCHEMA = `When an NPC is a merchant, include shop_inventory (3-5 items):
"shop_inventory": [
  {"id":"item_id","name":"Item Name","type":"consumable|weapon|armor","price":10-80,
   "description":"Short desc","effect":{"heal":0,"atk":0,"def":0},"slot":"weapon|armor|null","bonus":0}
]
Consumables: heal items (5-15 HP), stim packs, antidotes. Price 10-30.
Weapons: +2 to +5 ATK bonus. Price 30-70.
Armor: +1 to +3 DEF bonus. Price 25-60.`;

export class GeminiClient {
    constructor(apiKey, model = 'gemini-2.5-flash-lite') {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.theme = null;
    }

    setTheme(theme) { this.theme = theme; }

    getSystemPrompt(storyContext) {
        const t = THEME_PROMPTS[this.theme] || THEME_PROMPTS.cyberpunk;
        const ctx = storyContext || {};
        return `You are the game master for "Unifactory", an AI-powered 2D RPG with Undertale-style combat.
You generate ALL game content as structured JSON. You drive the narrative, world, NPCs, enemies, quests, and shops.

${t.world}

${getStoryStructure(ctx)}
${getAntiRepetitionRules(ctx)}

STORY SO FAR:
${(ctx.story_summary || []).join(' → ') || 'The adventure is just beginning.'}

GAME RULES:
1. Return ONLY valid JSON — never prose, markdown, or explanation
2. Maintain narrative consistency — reference previous rooms, NPCs, choices, and quest progress
3. NPCs have DISTINCT personalities through VERY SHORT dialogue (1-2 lines, under 80 chars each)
4. Each room needs 2-4 NPCs with meaningful dialogue choices (2-3 choices max, under 30 chars each)
5. At least 1 NPC per room should have a quest OR shop (alternate between rooms)
6. Enemies have unique ACT options (2-3 per enemy) — these should be creative and theme-appropriate
7. ACT effects: "weaken" reduces enemy ATK, "spare_progress" moves toward spare condition, "heal_self" heals player, "none" just flavor
8. Items serve purposes: keys unlock doors, consumables heal, weapons/armor boost stats
9. The world reacts to player's moral alignment, soul trait, and quest progress
10. Keep y > 0.8 clear for player spawn. All coords 0.0-1.0
11. Include 4-8 decorations per room for visual atmosphere
12. Currency is "${t.currency}"
13. Use the DECORATION TYPES listed for this theme
14. Enemies give XP rewards (15-60 based on difficulty)
15. Make quest objectives achievable within 1-3 rooms
16. The player has a SOUL TRAIT (in story_context). NPCs may occasionally reference it — e.g. sensing the player's bravery or patience. Weave it subtly into dialogue.
17. The player's chosen enemy_presets should bias which enemy types appear`;
    }

    async callGemini(userMessage, storyContext) {
        const body = {
            systemInstruction: { parts: [{ text: this.getSystemPrompt(storyContext) }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.88,
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
        const isFinale = storyContext.is_finale;
        const phase = storyContext.story_phase || 'setup';
        const room = storyContext.room_number || 1;
        const max = storyContext.max_rooms || 10;

        const triggerDesc = trigger
            ? `The player just: ${trigger}`
            : 'The adventure begins. Generate the FIRST room — atmospheric, intriguing, with NPCs to meet and a quest to start.';

        let finaleBlock = '';
        if (isFinale) {
            finaleBlock = `
★★★ THIS IS THE FINALE ROOM — THE LAST ROOM IN THE GAME ★★★
CRITICAL REQUIREMENTS:
- Set "is_finale": true in the JSON
- Include a POWERFUL final boss enemy with high stats (hp: 40-80, atk: 8-15)
- The boss should be thematically tied to the central conflict
- Include 0-1 NPCs who provide final context or callbacks to earlier story
- Include NO EXITS — the exits array MUST be empty []
- The narration should feel like a climactic moment
- Add a "finale_narration" field: a 2-3 sentence dramatic description of reaching the end
- Boss defeat_dialogue and spare_dialogue should feel like ENDINGS, not just combat outro
- Reference the player's journey and choices in dialogue`;
        }

        let phaseHints = '';
        switch (phase) {
            case 'setup':
                phaseHints = `- This early room should establish atmosphere and introduce key NPCs
- Include a quest that plants seeds for the larger conflict
- Keep danger low but hint at darker things ahead`;
                break;
            case 'rising':
                phaseHints = `- Escalate tension and danger — more enemies, higher stakes
- Subvert expectations — an ally betrays, a safe place turns dangerous
- Reference NPCs/events from earlier rooms for continuity`;
                break;
            case 'climax':
                phaseHints = `- High stakes — every encounter matters
- Resolve earlier quest threads where possible
- NPCs should reference the approaching endgame`;
                break;
        }

        const enemyGuidance = phase === 'setup'
            ? '- 0-1 enemies (low danger)'
            : phase === 'rising'
                ? '- 1-2 enemies (escalating threat)'
                : '- 1-2 enemies (powerful, significant)';

        const prompt = `ACTION: generate_room

STORY STATE:
${JSON.stringify(storyContext, null, 1)}

${triggerDesc}
${finaleBlock}

Generate a room using this schema:
${ROOM_SCHEMA}
${isFinale ? '"is_finale": true, "finale_narration": "dramatic 2-3 sentence ending setup"' : ''}

${QUEST_SCHEMA}

${SHOP_SCHEMA}

THIS ROOM MUST HAVE (Room ${room}/${max}, phase: ${phase}):
- 2-4 NPCs (at least one merchant OR quest-giver)${isFinale ? ' — UNLESS this is the finale (0-1 NPCs)' : ''}
- 4-8 decorations for atmosphere (use theme decoration types)
- 3-5 obstacles
${isFinale ? '- 0 exits (THIS IS THE LAST ROOM)' : '- 1-3 exits'}
- 0-2 items
- 0-1 interactables
${enemyGuidance}
${phaseHints}
- Each enemy needs 2-3 creative ACT options with effects
- Dark bg colors, vivid accent colors
- Narration should set the mood immediately
- ALL names must be UNIQUE — never reuse names from previous rooms`;

        const spec = await this.callGemini(prompt, storyContext);
        return this.validateRoom(spec);
    }

    async talkToNPC(npcId, npcName, choiceId, storyContext) {
        const prompt = `ACTION: npc_dialogue_response

Player talks to "${npcName}" (id: ${npcId}), chose: "${choiceId}"

STORY STATE:
${JSON.stringify(storyContext, null, 1)}

Return JSON:
{
  "dialogue": ["Line 1","Line 2"],
  "choices": [{"id":"id","text":"Short text"}],
  "effects": {
    "give_item": null or {"id":"id","name":"Name","type":"consumable|quest_item|weapon|armor|key","color":"#hex","description":"desc","effect":null,"slot":null,"bonus":0},
    "take_item": null or "item_id",
    "set_flag": null or {"key":"name","value":"value"},
    "heal": 0, "give_gold": 0,
    "give_xp": 0,
    "trigger_combat": null or "enemy_id",
    "open_path": null or "exit_id_or_interactable_id",
    "complete_quest": null or "quest_id",
    "add_quest": null or {"id":"id","title":"Title","description":"desc","objective":"type:target","reward":{"xp":30,"gold":20,"item":null}}
  }
}

STRICT RULES:
- dialogue: MAX 2 lines, each under 80 characters. Be punchy.
- choices: MAX 2-3. Keep choice text under 30 characters.
- Return choices: [] to END the conversation. Most exchanges should end after 1-2 replies.
- Do NOT create open-ended loops. Conversations should resolve quickly.
- If the player is just chatting, wrap it up in 1 reply with choices: [].`;

        return await this.callGemini(prompt, storyContext);
    }

    async interactObject(objectId, objectInfo, storyContext) {
        const prompt = `ACTION: interact_object

Player interacts with: ${JSON.stringify(objectInfo)}

STORY STATE:
${JSON.stringify(storyContext, null, 1)}

Return JSON:
{
  "dialogue": ["What happens (1-3 lines)"],
  "effects": {
    "give_item": null or {"id":"id","name":"Name","type":"type","color":"#hex","description":"desc"},
    "set_flag": null or {"key":"name","value":"value"},
    "heal": 0, "give_gold": 0, "give_xp": 0,
    "unlock": null or "exit_or_interactable_id",
    "complete_quest": null,
    "trigger_combat": null
  }
}`;

        return await this.callGemini(prompt, storyContext);
    }

    async generateEndingNarration(storyContext, endingType) {
        const prompt = `ACTION: generate_ending

The game is over. Generate a poetic ending narration for the player.

STORY STATE:
${JSON.stringify(storyContext, null, 1)}

ENDING TYPE: ${endingType.id} — "${endingType.title}"
${endingType.desc}

Return JSON:
{
  "title": "A dramatic ending title (3-6 words)",
  "narration": ["Line 1 (poetic, atmospheric)", "Line 2", "Line 3", "Line 4 (final reflection)"],
  "epilogue": "A single sentence about what happened after (bittersweet or triumphant based on ending type)"
}

RULES:
- Reference specific events, NPCs, and choices from the story_summary
- The tone should match the ending type (pacifist = hopeful, violent = dark, etc.)
- Make the player FEEL something — this is the last thing they read
- 3-5 narration lines, each under 100 characters
- The epilogue hints at what comes next (but the story is over)`;

        return await this.callGemini(prompt, storyContext);
    }

    validateRoom(spec) {
        if (!spec.room_id) spec.room_id = `room_${Date.now()}`;
        if (!spec.name) spec.name = 'Unknown Place';
        if (!spec.narration) spec.narration = 'You enter a new area...';
        if (!spec.bg_color?.startsWith('#')) spec.bg_color = '#0a0a1e';
        if (!spec.wall_color?.startsWith('#')) spec.wall_color = '#2a2a3e';
        if (!spec.mood) spec.mood = 'mysterious';
        if (!spec.obstacles) spec.obstacles = [];
        if (!spec.npcs) spec.npcs = [];
        if (!spec.items) spec.items = [];
        if (!spec.interactables) spec.interactables = [];
        if (!spec.exits) spec.exits = [];
        if (!spec.enemies) spec.enemies = [];
        if (!spec.decorations) spec.decorations = [];

        for (const obs of spec.obstacles) {
            obs.x = clamp(obs.x, 0.05, 0.95);
            obs.y = clamp(obs.y, 0.05, 0.75);
            obs.w = clamp(obs.w || 0.08, 0.04, 0.25);
            obs.h = clamp(obs.h || 0.08, 0.04, 0.25);
            if (!obs.color?.startsWith('#')) obs.color = '#3a3a4e';
        }

        for (const d of spec.decorations) {
            d.x = clamp(d.x, 0.02, 0.98);
            d.y = clamp(d.y, 0.02, 0.95);
            if (!d.color?.startsWith('#')) d.color = '#444466';
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
            if (npc.shop_inventory && !Array.isArray(npc.shop_inventory)) npc.shop_inventory = null;
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
            enemy.y = clamp(enemy.y, 0.15, 0.6);
            enemy.hp = clamp(enemy.hp || 20, 10, 80);
            enemy.atk = clamp(enemy.atk || 5, 2, 15);
            enemy.xp_reward = clamp(enemy.xp_reward || 20, 10, 80);
            enemy.gold_reward = clamp(enemy.gold_reward || 10, 0, 50);
            if (!enemy.color?.startsWith('#')) enemy.color = '#ff4444';
            if (!enemy.patterns?.length) {
                enemy.patterns = [{ type: 'horizontal_sweep', speed: 2, count: 5, duration: 5000 }];
            }
            if (typeof enemy.intro_dialogue === 'string') enemy.intro_dialogue = [enemy.intro_dialogue];
            if (!enemy.intro_dialogue || !Array.isArray(enemy.intro_dialogue)) enemy.intro_dialogue = ['...'];
            if (typeof enemy.defeat_dialogue === 'string') enemy.defeat_dialogue = [enemy.defeat_dialogue];
            if (typeof enemy.spare_dialogue === 'string') enemy.spare_dialogue = [enemy.spare_dialogue];
            if (!enemy.act_options?.length) {
                enemy.act_options = [
                    { id: 'check', text: 'Check', response: `${enemy.name}. ATK ${enemy.atk}.`, effect: 'none' }
                ];
            }
            if (!enemy.spare_condition) enemy.spare_condition = 'spare_progress:2';
        }

        return spec;
    }
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v || min));
}
