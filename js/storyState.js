const storyState = {
    theme: null,
    playerName: 'Wanderer',
    hp: 20,
    maxHp: 20,
    atk: 5,
    def: 2,
    gold: 0,
    inventory: [],
    maxInventory: 8,
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

    reset(theme) {
        this.theme = theme;
        this.hp = 20;
        this.maxHp = 20;
        this.atk = 5;
        this.def = 2;
        this.gold = 0;
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
    },

    addItem(item) {
        if (this.inventory.length >= this.maxInventory) return false;
        this.inventory.push(item);
        this.logEvent(`picked_up:${item.id}`);
        return true;
    },

    removeItem(id) {
        const idx = this.inventory.findIndex(i => i.id === id);
        if (idx >= 0) {
            this.inventory.splice(idx, 1);
            return true;
        }
        return false;
    },

    hasItem(id) {
        return this.inventory.some(i => i.id === id);
    },

    getItem(id) {
        return this.inventory.find(i => i.id === id);
    },

    setFlag(key, value) {
        this.questFlags[key] = value;
    },

    getFlag(key) {
        return this.questFlags[key];
    },

    takeDamage(amount) {
        const actual = Math.max(1, amount - this.def);
        this.hp = Math.max(0, this.hp - actual);
        if (this.hp <= 0) this.gameOver = true;
        return actual;
    },

    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    },

    addGold(amount) {
        this.gold += amount;
    },

    meetNPC(npcId) {
        if (!this.npcsMet.includes(npcId)) this.npcsMet.push(npcId);
    },

    defeatEnemy(enemyId) {
        if (!this.npcsDefeated.includes(enemyId)) this.npcsDefeated.push(enemyId);
        this.logEvent(`defeated:${enemyId}`);
    },

    spareEnemy(enemyId) {
        if (!this.npcsSpared.includes(enemyId)) this.npcsSpared.push(enemyId);
        this.logEvent(`spared:${enemyId}`);
    },

    visitRoom(roomId) {
        this.currentRoomId = roomId;
        if (!this.roomsVisited.includes(roomId)) this.roomsVisited.push(roomId);
    },

    logEvent(event) {
        this.storyLog.push(event);
        if (this.storyLog.length > 30) this.storyLog.shift();
    },

    toContext() {
        return {
            theme: this.theme,
            chapter: this.chapter,
            hp: this.hp,
            max_hp: this.maxHp,
            atk: this.atk,
            def: this.def,
            gold: this.gold,
            inventory: this.inventory.map(i => ({ id: i.id, name: i.name, type: i.type })),
            quest_flags: this.questFlags,
            npcs_met: this.npcsMet.slice(-10),
            npcs_defeated: this.npcsDefeated,
            npcs_spared: this.npcsSpared,
            rooms_visited: this.roomsVisited.slice(-8),
            current_room: this.currentRoomId,
            recent_events: this.storyLog.slice(-10)
        };
    }
};

export default storyState;
