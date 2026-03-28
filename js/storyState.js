const storyState = {
    theme: null,
    playerName: 'Wanderer',

    // Character identity (persists across reset)
    soulColor: '#ff0000',
    soulTrait: 'Determination',
    characterPresetId: null,
    characterPhotoUrl: null,
    enemyPresetIds: [],
    playerPortraitUrl: null,
    playerSpriteSheetUrl: null,

    // Stats
    hp: 20, maxHp: 20,
    atk: 5, def: 2,
    gold: 0,

    // Progression
    xp: 0, level: 1, xpToNext: 30,

    // Equipment
    equipment: { weapon: null, armor: null },

    // Inventory
    inventory: [],
    maxInventory: 8,

    // Quests
    activeQuests: [],
    completedQuests: [],

    // Story arc
    maxRooms: 10,
    roomNumber: 0,
    storySummary: [],
    uniqueNames: { rooms: [], npcs: [], enemies: [] },
    endingTriggered: false,

    // World tracking
    questFlags: {},
    npcsMet: [],
    npcsDefeated: [],
    npcsSpared: [],
    roomsVisited: [],
    currentRoomId: null,
    currentRoomData: null,
    storyLog: [],
    chapter: 1,
    gameOver: false,

    // Reputation
    reputation: { kills: 0, spares: 0, quests_done: 0 },

    setCharacterIdentity({ name, soulColor, soulTrait, characterPresetId,
                           characterPhotoUrl, enemyPresetIds, playerPortraitUrl,
                           playerSpriteSheetUrl }) {
        if (name) this.playerName = name;
        if (soulColor) this.soulColor = soulColor;
        if (soulTrait) this.soulTrait = soulTrait;
        if (characterPresetId !== undefined) this.characterPresetId = characterPresetId;
        if (characterPhotoUrl !== undefined) this.characterPhotoUrl = characterPhotoUrl;
        if (enemyPresetIds) this.enemyPresetIds = enemyPresetIds;
        if (playerPortraitUrl !== undefined) this.playerPortraitUrl = playerPortraitUrl;
        if (playerSpriteSheetUrl !== undefined) this.playerSpriteSheetUrl = playerSpriteSheetUrl;
    },

    reset(theme) {
        this.theme = theme;
        this.hp = 20; this.maxHp = 20;
        this.atk = 5; this.def = 2;
        this.gold = 0;
        this.xp = 0; this.level = 1; this.xpToNext = 30;
        this.equipment = { weapon: null, armor: null };
        this.inventory = [];
        this.questFlags = {};
        this.npcsMet = [];
        this.npcsDefeated = [];
        this.npcsSpared = [];
        this.roomsVisited = [];
        this.currentRoomId = null;
        this.currentRoomData = null;
        this.storyLog = [];
        this.chapter = 1;
        this.gameOver = false;
        this.endingTriggered = false;
        this.activeQuests = [];
        this.completedQuests = [];
        this.reputation = { kills: 0, spares: 0, quests_done: 0 };
        this.roomNumber = 0;
        this.storySummary = [];
        this.uniqueNames = { rooms: [], npcs: [], enemies: [] };
    },

    // --- Progression ---
    gainXP(amount) {
        this.xp += amount;
        let leveled = false;
        while (this.xp >= this.xpToNext) {
            this.xp -= this.xpToNext;
            this.level++;
            this.maxHp += 4;
            this.hp = this.maxHp;
            this.atk += 2;
            this.def += 1;
            this.xpToNext = Math.floor(this.xpToNext * 1.5);
            leveled = true;
        }
        return leveled;
    },

    getATK() { return this.atk + (this.equipment.weapon?.bonus || 0); },
    getDEF() { return this.def + (this.equipment.armor?.bonus || 0); },

    equip(item) {
        if (item.slot === 'weapon') {
            const old = this.equipment.weapon;
            this.equipment.weapon = item;
            this.removeItem(item.id);
            if (old) this.addItem(old);
        } else if (item.slot === 'armor') {
            const old = this.equipment.armor;
            this.equipment.armor = item;
            this.removeItem(item.id);
            if (old) this.addItem(old);
        }
    },

    // --- Inventory ---
    addItem(item) {
        if (this.inventory.length >= this.maxInventory) return false;
        this.inventory.push(item);
        this.logEvent(`picked_up:${item.id}`);
        return true;
    },

    removeItem(id) {
        const idx = this.inventory.findIndex(i => i.id === id);
        if (idx >= 0) { this.inventory.splice(idx, 1); return true; }
        return false;
    },

    hasItem(id) { return this.inventory.some(i => i.id === id); },
    getItem(id) { return this.inventory.find(i => i.id === id); },

    // --- Quests ---
    addQuest(quest) {
        if (this.activeQuests.some(q => q.id === quest.id)) return;
        if (this.completedQuests.includes(quest.id)) return;
        this.activeQuests.push(quest);
        this.logEvent(`quest_started:${quest.id}`);
    },

    completeQuest(questId) {
        const idx = this.activeQuests.findIndex(q => q.id === questId);
        if (idx < 0) return null;
        const quest = this.activeQuests.splice(idx, 1)[0];
        this.completedQuests.push(quest.id);
        this.reputation.quests_done++;
        this.logEvent(`quest_complete:${questId}`);
        this.addSummary(`Completed quest: "${quest.title || questId}"`);
        return quest;
    },

    checkQuestObjective(eventType, targetId) {
        for (const q of this.activeQuests) {
            if (!q.objective) continue;
            const [type, target] = q.objective.split(':');
            if (type === eventType && target === targetId) {
                return q.id;
            }
        }
        return null;
    },

    // --- Flags & NPCs ---
    setFlag(key, value) { this.questFlags[key] = value; },
    getFlag(key) { return this.questFlags[key]; },

    meetNPC(npcId) { if (!this.npcsMet.includes(npcId)) this.npcsMet.push(npcId); },

    defeatEnemy(enemyId) {
        if (!this.npcsDefeated.includes(enemyId)) this.npcsDefeated.push(enemyId);
        this.reputation.kills++;
        this.logEvent(`defeated:${enemyId}`);
        this.addSummary(`Defeated enemy "${enemyId}"`);
    },

    spareEnemy(enemyId) {
        if (!this.npcsSpared.includes(enemyId)) this.npcsSpared.push(enemyId);
        this.reputation.spares++;
        this.logEvent(`spared:${enemyId}`);
        this.addSummary(`Showed mercy to "${enemyId}"`);
    },

    // --- HP ---
    takeDamage(amount) {
        const actual = Math.max(1, amount - this.getDEF());
        this.hp = Math.max(0, this.hp - actual);
        if (this.hp <= 0) this.gameOver = true;
        return actual;
    },

    heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); },
    addGold(amount) { this.gold += amount; },

    // --- Room ---
    visitRoom(roomId) {
        this.currentRoomId = roomId;
        if (!this.roomsVisited.includes(roomId)) this.roomsVisited.push(roomId);
    },

    logEvent(event) {
        this.storyLog.push(event);
        if (this.storyLog.length > 40) this.storyLog.shift();
    },

    getStoryPhase() {
        const pct = this.roomNumber / this.maxRooms;
        if (pct >= 0.92) return 'finale';
        if (pct >= 0.65) return 'climax';
        if (pct >= 0.25) return 'rising';
        return 'setup';
    },

    isFinaleRoom() {
        return this.roomNumber >= this.maxRooms;
    },

    addSummary(text) {
        this.storySummary.push(text);
        if (this.storySummary.length > 20) this.storySummary.shift();
    },

    trackNames(roomSpec) {
        if (roomSpec.name) this.uniqueNames.rooms.push(roomSpec.name);
        for (const n of (roomSpec.npcs || [])) {
            if (n.name) this.uniqueNames.npcs.push(n.name);
        }
        for (const e of (roomSpec.enemies || [])) {
            if (e.name) this.uniqueNames.enemies.push(e.name);
        }
    },

    getEndingType() {
        const { kills, spares, quests_done } = this.reputation;
        const total = kills + spares;
        if (kills === 0 && spares >= 3) return { id: 'true_pacifist', title: 'TRUE PACIFIST', desc: 'You showed mercy to every soul.' };
        if (spares === 0 && kills >= 3) return { id: 'genocide', title: 'NO MERCY', desc: 'You left nothing alive.' };
        if (kills === 0 && quests_done >= 2) return { id: 'hero', title: 'HERO', desc: 'Protector of the innocent.' };
        if (spares > kills && quests_done >= 1) return { id: 'merciful', title: 'MERCIFUL', desc: 'Compassion guided your path.' };
        if (kills > spares * 2) return { id: 'violent', title: 'VIOLENT', desc: 'Fear follows in your wake.' };
        if (quests_done === 0 && total <= 1) return { id: 'wanderer', title: 'WANDERER', desc: 'You passed through like a ghost.' };
        return { id: 'neutral', title: 'NEUTRAL', desc: 'You walked the line between light and dark.' };
    },

    getMoralAlignment() {
        const { kills, spares } = this.reputation;
        if (kills === 0 && spares > 0) return 'pacifist';
        if (spares === 0 && kills > 0) return 'violent';
        if (kills > spares * 2) return 'aggressive';
        if (spares > kills * 2) return 'merciful';
        return 'neutral';
    },

    toContext() {
        return {
            theme: this.theme,
            chapter: this.chapter,
            room_number: this.roomNumber,
            max_rooms: this.maxRooms,
            story_phase: this.getStoryPhase(),
            is_finale: this.isFinaleRoom(),
            story_summary: this.storySummary.slice(-8),
            used_room_names: this.uniqueNames.rooms.slice(-10),
            used_npc_names: this.uniqueNames.npcs.slice(-15),
            used_enemy_names: this.uniqueNames.enemies.slice(-10),
            player_name: this.playerName,
            soul_trait: this.soulTrait,
            soul_color: this.soulColor,
            character_preset: this.characterPresetId,
            enemy_presets: this.enemyPresetIds,
            level: this.level,
            hp: this.hp, max_hp: this.maxHp,
            atk: this.getATK(), def: this.getDEF(),
            gold: this.gold,
            inventory: this.inventory.map(i => ({ id: i.id, name: i.name, type: i.type })),
            equipment: {
                weapon: this.equipment.weapon ? this.equipment.weapon.name : 'none',
                armor: this.equipment.armor ? this.equipment.armor.name : 'none'
            },
            active_quests: this.activeQuests.map(q => ({ id: q.id, title: q.title, objective: q.objective })),
            completed_quests: this.completedQuests.slice(-5),
            quest_flags: this.questFlags,
            npcs_met: this.npcsMet.slice(-12),
            npcs_defeated: this.npcsDefeated,
            npcs_spared: this.npcsSpared,
            rooms_visited: this.roomsVisited.slice(-8),
            current_room: this.currentRoomId,
            recent_events: this.storyLog.slice(-12),
            moral_alignment: this.getMoralAlignment(),
            reputation: this.reputation
        };
    }
};

export default storyState;
