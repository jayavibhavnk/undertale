import storyState from './storyState.js';

const WALL = 16, DOOR_GAP = 48, SPEED = 155;
const THEME_PARTICLES = {
    cyberpunk: { colors: [0x00ffff, 0xff00ff, 0x00ff88, 0xff6600], style: 'neon' },
    medieval:  { colors: [0xffaa44, 0xff8822, 0xffcc66, 0xffffaa], style: 'dust' },
    space:     { colors: [0x4488ff, 0x44ffaa, 0xffffff, 0x8888ff], style: 'stars' }
};

export default class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    init(data) {
        this.roomSpec = data.roomSpec;
        this.entryDirection = data.entryDirection || 'bottom';
        this.combatResult = data.combatResult || null;
    }

    create() {
        const spec = this.roomSpec;
        const W = this.scale.width, H = this.scale.height;
        this.playW = W - WALL * 2;
        this.playH = H - WALL * 2;
        this.cameras.main.setBackgroundColor(spec.bg_color || '#0a0a1e');

        storyState.visitRoom(spec.room_id);

        this.walls = this.physics.add.staticGroup();
        this.obstacleGroup = this.physics.add.staticGroup();
        this.exitZones = this.physics.add.staticGroup();
        this.itemGroup = this.physics.add.group();
        this.npcGroup = this.physics.add.staticGroup();
        this.interactGroup = this.physics.add.staticGroup();
        this.enemyGroup = this.physics.add.staticGroup();

        this.npcDataMap = {};
        this.enemyDataMap = {};
        this.buildWalls(spec);
        this.drawFloor(spec);
        this.addDecorations(spec);
        this.addAmbientParticles(spec);
        this.buildObstacles(spec.obstacles || []);
        this.buildExits(spec.exits || []);
        this.buildItems(spec.items || []);
        this.buildInteractables(spec.interactables || []);
        this.buildNPCs(spec.npcs || []);
        this.buildEnemies(spec.enemies || []);
        this.addVignette();

        // Register quests from NPCs
        for (const npc of (spec.npcs || [])) {
            if (npc.quest) storyState.addQuest(npc.quest);
        }

        // Remove defeated enemies
        if (this.combatResult) {
            const eid = this.combatResult.enemyId;
            if (this.enemyDataMap[eid]) {
                this.enemyDataMap[eid].sprite.destroy();
                if (this.enemyDataMap[eid].label) this.enemyDataMap[eid].label.destroy();
                delete this.enemyDataMap[eid];
            }
        }

        // Player
        const start = this.getStartPos();
        this.player = this.physics.add.sprite(start.x, start.y, 'player_down').setDepth(10).setCollideWorldBounds(true);
        this.player.body.setSize(14, 18).setOffset(3, 10);
        this.playerShadow = this.add.ellipse(start.x, start.y + 14, 16, 6, 0x000000, 0.3).setDepth(9);

        this.physics.add.collider(this.player, this.walls);
        this.physics.add.collider(this.player, this.obstacleGroup);
        this.physics.add.collider(this.player, this.npcGroup);
        this.physics.add.collider(this.player, this.interactGroup);
        this.physics.add.overlap(this.player, this.exitZones, this.onExit, null, this);
        this.physics.add.overlap(this.player, this.itemGroup, this.onItem, null, this);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.xKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

        this.buildHUD();
        this.initDialogue();
        this.initQuestLog();

        this.mode = 'explore';
        this.nearTarget = null;
        this.transitioning = false;
        this.walkTimer = 0;
        this.shopData = null;

        this.setupAudio();
        this.cameras.main.fadeIn(500);

        const music = this.registry.get('musicManager');
        if (music) {
            const theme = storyState.theme || 'cyberpunk';
            const mood = spec.mood || 'calm';
            const cat = ['calm', 'peaceful'].includes(mood) ? 'calm' : 'tense';
            music.play(`explore_${theme}_${cat}`);
        }

        if (spec.narration && !this.combatResult) {
            this.time.delayedCall(600, () => this.showDialogue('', [spec.narration], [], null));
        }

        this.preloadEnemyCutscenes();
    }

    preloadEnemyCutscenes() {
        const cutsceneClient = this.registry.get('cutsceneClient');
        if (!cutsceneClient?.ready) return;

        const alive = (this.roomSpec.enemies || []).filter(e =>
            !storyState.npcsDefeated.includes(e.id) &&
            !storyState.npcsSpared.includes(e.id)
        );
        if (alive.length === 0) return;

        const sorted = [...alive].sort((a, b) => (b.hp || 0) - (a.hp || 0));
        const requests = [];

        for (const enemy of sorted) {
            const ctx = {
                enemy_name: enemy.name, enemy_color: enemy.color || '',
                room_name: this.roomSpec.name || '', room_mood: this.roomSpec.mood || '',
            };
            requests.push({ cache_key: `boss_intro_${enemy.id}`, trigger_type: 'boss_intro', context: ctx });
        }

        const strongest = sorted[0];
        const sCtx = {
            enemy_name: strongest.name, enemy_color: strongest.color || '',
            room_name: this.roomSpec.name || '', room_mood: this.roomSpec.mood || '',
        };
        requests.push({ cache_key: `boss_victory_${strongest.id}`, trigger_type: 'boss_outcome_victory', context: sCtx });
        requests.push({ cache_key: `boss_spare_${strongest.id}`, trigger_type: 'boss_outcome_spare', context: sCtx });

        cutsceneClient.preload(requests).then(res => {
            if (res.queued?.length) console.log('[cutscene] preloading enemy cutscenes:', res.queued);
        }).catch(() => {});
    }

    update(time, delta) {
        if (this.mode === 'explore' && !this.transitioning) {
            let vx = 0, vy = 0;
            if (this.cursors.left.isDown) vx = -SPEED;
            else if (this.cursors.right.isDown) vx = SPEED;
            if (this.cursors.up.isDown) vy = -SPEED;
            else if (this.cursors.down.isDown) vy = SPEED;
            if (vx && vy) { vx *= 0.707; vy *= 0.707; }
            this.player.setVelocity(vx, vy);

            if (vy < 0) this.player.setTexture('player_up');
            else if (vy > 0) this.player.setTexture('player_down');
            else if (vx < 0) this.player.setTexture('player_left');
            else if (vx > 0) this.player.setTexture('player_right');

            if (vx || vy) { this.walkTimer += delta * 0.008; this.player.y += Math.sin(this.walkTimer * 8) * 0.3; }
            this.playerShadow.setPosition(this.player.x, this.player.y + 14);
            this.checkProximity();

            if (Phaser.Input.Keyboard.JustDown(this.zKey) && this.nearTarget) this.interact(this.nearTarget);
            if (Phaser.Input.Keyboard.JustDown(this.xKey)) this.toggleQuestLog();
        }

        if (this.mode === 'dialogue') {
            if (Phaser.Input.Keyboard.JustDown(this.xKey)) {
                this.endDialogue();
            } else if (this.dlgState.showingChoices) {
                if (Phaser.Input.Keyboard.JustDown(this.cursors.up))
                    this.dlgState.choiceIdx = Math.max(0, this.dlgState.choiceIdx - 1);
                if (Phaser.Input.Keyboard.JustDown(this.cursors.down))
                    this.dlgState.choiceIdx = Math.min(this.dlgState.choices.length - 1, this.dlgState.choiceIdx + 1);
                this.updateChoiceDisplay();
                if (Phaser.Input.Keyboard.JustDown(this.zKey)) this.selectChoice();
            } else {
                if (Phaser.Input.Keyboard.JustDown(this.zKey)) this.advanceDialogue();
            }
        }

        if (this.mode === 'questlog') {
            if (Phaser.Input.Keyboard.JustDown(this.xKey) || Phaser.Input.Keyboard.JustDown(this.zKey))
                this.toggleQuestLog();
        }

        if (this.mode === 'shop') {
            if (Phaser.Input.Keyboard.JustDown(this.cursors.up))
                this.shopIdx = Math.max(0, this.shopIdx - 1);
            if (Phaser.Input.Keyboard.JustDown(this.cursors.down))
                this.shopIdx = Math.min(this.shopItems.length, this.shopIdx + 1);
            this.updateShopDisplay();
            if (Phaser.Input.Keyboard.JustDown(this.zKey)) this.shopSelect();
            if (Phaser.Input.Keyboard.JustDown(this.xKey)) this.closeShop();
        }
    }

    // === ENVIRONMENT ===
    norm(nx, ny) { return { x: WALL + nx * this.playW, y: WALL + ny * this.playH }; }

    buildWalls(spec) {
        const W = this.scale.width, H = this.scale.height;
        const wc = Phaser.Display.Color.HexStringToColor(spec.wall_color || '#2a2a3e').color;
        const exitDirs = new Map();
        for (const e of (spec.exits || [])) exitDirs.set(e.direction, e.position || 0.5);

        const sides = [
            { dir: 'top', x: 0, y: 0, w: W, h: WALL, horiz: true },
            { dir: 'bottom', x: 0, y: H - WALL, w: W, h: WALL, horiz: true },
            { dir: 'left', x: 0, y: 0, w: WALL, h: H, horiz: false },
            { dir: 'right', x: W - WALL, y: 0, w: WALL, h: H, horiz: false }
        ];

        for (const side of sides) {
            if (exitDirs.has(side.dir)) {
                const p = exitDirs.get(side.dir);
                const g = side.horiz ? WALL + p * this.playW : WALL + p * this.playH;
                if (side.horiz) {
                    this.wallRect(0, side.y, g - DOOR_GAP / 2, WALL, wc);
                    this.wallRect(g + DOOR_GAP / 2, side.y, W - g - DOOR_GAP / 2, WALL, wc);
                } else {
                    this.wallRect(side.x, 0, WALL, g - DOOR_GAP / 2, wc);
                    this.wallRect(side.x, g + DOOR_GAP / 2, WALL, H - g - DOOR_GAP / 2, wc);
                }
            } else {
                this.wallRect(side.x, side.y, side.w, side.h, wc);
            }
        }

        // Wall detail pattern
        const g = this.add.graphics().setDepth(0);
        const wCol = Phaser.Display.Color.HexStringToColor(spec.wall_color || '#2a2a3e');
        const detailColor = Phaser.Display.Color.GetColor(
            Math.min(255, wCol.r + 15), Math.min(255, wCol.g + 15), Math.min(255, wCol.b + 15));

        g.lineStyle(1, detailColor, 0.2);
        const theme = storyState.theme;
        if (theme === 'cyberpunk') {
            for (let y = 0; y < WALL; y += 4) { g.lineBetween(0, y, W, y); g.lineBetween(0, H - y, W, H - y); }
        } else if (theme === 'medieval') {
            for (let x = 0; x < W; x += 12) for (let y = 0; y < WALL; y += 6) {
                const off = (Math.floor(y / 6) % 2) * 6;
                g.strokeRect(x + off, y, 12, 6);
                g.strokeRect(x + off, H - WALL + y, 12, 6);
            }
        } else {
            for (let x = 0; x < W; x += 20) {
                g.lineBetween(x, 0, x, WALL);
                g.lineBetween(x, H - WALL, x, H);
            }
        }
    }

    wallRect(x, y, w, h, color) {
        if (w <= 0 || h <= 0) return;
        const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, color);
        this.physics.add.existing(r, true);
        this.walls.add(r);
    }

    drawFloor(spec) {
        const W = this.scale.width, H = this.scale.height;
        const bg = Phaser.Display.Color.HexStringToColor(spec.bg_color || '#0a0a1e');
        const g = this.add.graphics().setDepth(0);

        const lineC = Phaser.Display.Color.GetColor(
            Math.min(255, bg.r + 10), Math.min(255, bg.g + 10), Math.min(255, bg.b + 10));
        const detC = Phaser.Display.Color.GetColor(
            Math.min(255, bg.r + 20), Math.min(255, bg.g + 20), Math.min(255, bg.b + 20));

        const theme = storyState.theme;
        if (theme === 'cyberpunk') {
            g.lineStyle(1, lineC, 0.1);
            for (let x = WALL; x < W - WALL; x += 32) g.lineBetween(x, WALL, x, H - WALL);
            for (let y = WALL; y < H - WALL; y += 32) g.lineBetween(WALL, y, W - WALL, y);
            // Neon floor strips
            g.lineStyle(2, 0x00ffff, 0.04);
            for (let i = 0; i < 3; i++) {
                const y = WALL + 60 + i * 120;
                g.lineBetween(WALL, y, W - WALL, y);
            }
        } else if (theme === 'medieval') {
            // Irregular stone
            for (let x = WALL; x < W - WALL; x += Phaser.Math.Between(28, 40)) {
                for (let y = WALL; y < H - WALL; y += Phaser.Math.Between(24, 36)) {
                    const sw = Phaser.Math.Between(24, 36), sh = Phaser.Math.Between(20, 32);
                    g.lineStyle(1, lineC, 0.08);
                    g.strokeRect(x, y, sw, sh);
                }
            }
        } else {
            // Metal grating
            g.lineStyle(1, lineC, 0.12);
            for (let x = WALL; x < W - WALL; x += 24) g.lineBetween(x, WALL, x, H - WALL);
            for (let y = WALL; y < H - WALL; y += 24) g.lineBetween(WALL, y, W - WALL, y);
            // Under-glow
            g.fillStyle(0x4488ff, 0.02);
            for (let x = WALL + 12; x < W - WALL; x += 48) {
                for (let y = WALL + 12; y < H - WALL; y += 48) g.fillRect(x - 4, y - 4, 8, 8);
            }
        }

        // Random floor scratches/details
        for (let i = 0; i < 15; i++) {
            const dx = Phaser.Math.Between(WALL + 8, W - WALL - 8);
            const dy = Phaser.Math.Between(WALL + 8, H - WALL - 8);
            g.fillStyle(detC, Phaser.Math.FloatBetween(0.06, 0.15));
            g.fillRect(dx, dy, Phaser.Math.Between(1, 5), Phaser.Math.Between(1, 3));
        }
    }

    addDecorations(spec) {
        const W = this.scale.width, H = this.scale.height;
        const g = this.add.graphics().setDepth(1);
        const theme = storyState.theme;

        for (const d of (spec.decorations || [])) {
            const p = this.norm(d.x, d.y);
            const c = Phaser.Display.Color.HexStringToColor(d.color || '#444466').color;

            switch (d.type) {
                case 'neon_sign': case 'graffiti':
                    if (d.text) {
                        this.add.text(p.x, p.y, d.text, {
                            fontFamily: '"Press Start 2P"', fontSize: '6px', color: d.color || '#ff00ff',
                            shadow: { offsetX: 0, offsetY: 0, color: d.color || '#ff00ff', blur: 8, fill: true }
                        }).setOrigin(0.5).setDepth(2);
                    }
                    this.add.ellipse(p.x, p.y, 40, 20, c, 0.06).setDepth(0);
                    break;
                case 'torch_bracket': case 'lantern': case 'warning_light':
                    g.fillStyle(c, 0.3); g.fillRect(p.x - 2, p.y - 4, 4, 8);
                    const lGlow = this.add.ellipse(p.x, p.y, 50, 50, c, 0.06).setDepth(0);
                    this.tweens.add({ targets: lGlow, alpha: 0.12, duration: 600 + Math.random() * 400, yoyo: true, repeat: -1 });
                    break;
                case 'pipe': case 'cable_run':
                    g.lineStyle(2, c, 0.25);
                    g.lineBetween(p.x, p.y, p.x + Phaser.Math.Between(30, 80), p.y + Phaser.Math.Between(-10, 10));
                    break;
                case 'puddle':
                    this.add.ellipse(p.x, p.y, 24, 10, c, 0.1).setDepth(0);
                    break;
                case 'vent': case 'steam_vent':
                    g.fillStyle(0x222222, 0.3); g.fillRect(p.x - 8, p.y - 4, 16, 8);
                    for (let i = 0; i < 3; i++) {
                        const prt = this.add.rectangle(p.x + Phaser.Math.Between(-4, 4), p.y, 1, 2, 0xffffff, 0).setDepth(1);
                        this.tweens.add({
                            targets: prt, y: p.y - 20, alpha: { from: 0, to: 0.2 }, duration: 1500,
                            yoyo: false, repeat: -1, delay: i * 500
                        });
                    }
                    break;
                case 'barrel': case 'crate_stack':
                    g.fillStyle(c, 0.2); g.fillRect(p.x - 6, p.y - 6, 12, 12);
                    g.lineStyle(1, c, 0.3); g.strokeRect(p.x - 6, p.y - 6, 12, 12);
                    break;
                case 'console': case 'screen': case 'terminal':
                    g.fillStyle(0x111122, 0.5); g.fillRect(p.x - 8, p.y - 6, 16, 12);
                    const sc = this.add.rectangle(p.x, p.y, 12, 8, c, 0.2).setDepth(1);
                    this.tweens.add({ targets: sc, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
                    break;
                case 'viewport':
                    g.fillStyle(0x000022, 0.4); g.fillRect(p.x - 12, p.y - 8, 24, 16);
                    g.fillStyle(0xffffff, 0.03);
                    for (let s = 0; s < 5; s++) g.fillRect(p.x - 10 + Math.random() * 18, p.y - 6 + Math.random() * 10, 1, 1);
                    break;
                case 'banner': case 'cobweb': case 'chain':
                    g.lineStyle(1, c, 0.2);
                    for (let i = 0; i < 3; i++) g.lineBetween(p.x, p.y, p.x + Phaser.Math.Between(-10, 10), p.y + Phaser.Math.Between(8, 20));
                    break;
                case 'skull': case 'moss': case 'crack': case 'sparking_wire':
                    g.fillStyle(c, 0.15); g.fillCircle(p.x, p.y, 4);
                    if (d.type === 'sparking_wire') {
                        const spark = this.add.rectangle(p.x, p.y, 2, 2, 0xffff44, 0).setDepth(2);
                        this.tweens.add({ targets: spark, alpha: 0.8, duration: 100, yoyo: true, repeat: -1, repeatDelay: Phaser.Math.Between(500, 2000) });
                    }
                    break;
                default:
                    g.fillStyle(c, 0.1); g.fillRect(p.x - 4, p.y - 4, 8, 8);
            }
        }
    }

    addAmbientParticles(spec) {
        const W = this.scale.width, H = this.scale.height;
        const theme = storyState.theme || 'cyberpunk';
        const pConf = THEME_PARTICLES[theme] || THEME_PARTICLES.cyberpunk;

        for (let i = 0; i < 15; i++) {
            const pc = Phaser.Utils.Array.GetRandom(pConf.colors);
            const x = Phaser.Math.Between(WALL, W - WALL);
            const y = Phaser.Math.Between(WALL, H - WALL);
            const size = Phaser.Math.Between(1, 3);
            const p = this.add.rectangle(x, y, size, size, pc, 0).setDepth(1);
            this.tweens.add({
                targets: p, alpha: { from: 0, to: Phaser.Math.FloatBetween(0.15, 0.5) },
                x: x + Phaser.Math.Between(-25, 25), y: y + Phaser.Math.Between(-20, 20),
                duration: Phaser.Math.Between(3000, 7000), yoyo: true, repeat: -1,
                ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 2000)
            });
        }

        // Mood overlay
        const mood = spec.mood || 'mysterious';
        if (mood === 'eerie' || mood === 'dangerous') {
            const fog = this.add.rectangle(W / 2, H / 2, W, H, 0x220022, 0.06).setDepth(15);
            this.tweens.add({ targets: fog, alpha: 0.12, duration: 2000, yoyo: true, repeat: -1 });
        } else if (mood === 'tense') {
            const tint = this.add.rectangle(W / 2, H / 2, W, H, 0x331100, 0.04).setDepth(15);
            this.tweens.add({ targets: tint, alpha: 0.08, duration: 3000, yoyo: true, repeat: -1 });
        }
    }

    addVignette() {
        const W = this.scale.width, H = this.scale.height;
        const g = this.add.graphics().setDepth(45);
        for (let i = 0; i < 8; i++) {
            const a = 0.10 - i * 0.012;
            if (a <= 0) break;
            const s = i * 10;
            g.fillStyle(0x000000, a);
            g.fillRect(0, 0, W, s + 10);
            g.fillRect(0, H - s - 10, W, s + 10);
            g.fillRect(0, 0, s + 10, H);
            g.fillRect(W - s - 10, 0, s + 10, H);
        }
    }

    // === GAME OBJECTS ===
    buildObstacles(obs) {
        for (const o of obs) {
            const p = this.norm(o.x, o.y);
            const w = o.w * this.playW, h = o.h * this.playH;
            const c = Phaser.Display.Color.HexStringToColor(o.color || '#3a3a4e').color;
            const key = this.textures.exists(`obs_${o.type}`) ? `obs_${o.type}` : 'obs_rock';
            const s = this.add.tileSprite(p.x, p.y, w, h, key).setTint(c).setDepth(2);
            this.physics.add.existing(s, true);
            this.obstacleGroup.add(s);
            this.add.ellipse(p.x, p.y + h / 2 + 2, w * 0.7, 4, 0x000000, 0.2).setDepth(1);
        }
    }

    buildNPCs(npcs) {
        for (const n of npcs) {
            const p = this.norm(n.x, n.y);
            const c = Phaser.Display.Color.HexStringToColor(n.color || '#aaaaff').color;
            const spriteType = n.sprite_type || 'civilian';
            const key = this.textures.exists(`npc_${spriteType}`) ? `npc_${spriteType}` : 'npc_civilian';

            this.add.ellipse(p.x, p.y + 4, 36, 18, c, 0.08).setDepth(3);
            this.add.ellipse(p.x, p.y + 16, 18, 6, 0x000000, 0.3).setDepth(4);

            const sprite = this.physics.add.staticSprite(p.x, p.y, key).setTint(c).setDepth(5);
            this.npcGroup.add(sprite);

            const nameStr = n.name || n.id;
            const nameW = nameStr.length * 6 + 8;
            const nameBg = this.add.rectangle(p.x, p.y - 24, nameW, 12, 0x000000, 0.7)
                .setDepth(6).setStrokeStyle(1, c, 0.4);
            const label = this.add.text(p.x, p.y - 24, nameStr, {
                fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#ffffff'
            }).setOrigin(0.5).setDepth(7);

            // Emotion + shop/quest indicators
            const indicators = [];
            if (n.has_quest) indicators.push({ t: '!', c: '#ffff00' });
            if (n.shop_inventory) indicators.push({ t: '$', c: '#44ff44' });
            const emotions = { friendly: '☺', hostile: '⚠', scared: '!', mysterious: '?', sad: '~' };
            const emo = emotions[n.emotion];
            if (emo && !n.has_quest) indicators.push({ t: emo, c: n.emotion === 'hostile' ? '#ff4444' : '#ffff44' });

            const indObjs = [];
            indicators.forEach((ind, idx) => {
                const io = this.add.text(p.x + (idx - indicators.length / 2) * 12, p.y - 36, ind.t, {
                    fontFamily: '"Press Start 2P"', fontSize: '10px', color: ind.c,
                    shadow: { offsetX: 0, offsetY: 0, color: ind.c, blur: 8, fill: true }
                }).setOrigin(0.5).setDepth(8);
                indObjs.push(io);
                this.tweens.add({ targets: io, y: io.y - 4, duration: 500, yoyo: true, repeat: -1 });
            });

            const floatTargets = [sprite, label, nameBg, ...indObjs];
            this.tweens.add({
                targets: floatTargets, y: `-=3`, duration: 1200 + Math.random() * 500,
                yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });

            this.npcDataMap[n.id] = { data: n, sprite, label, type: 'npc' };
        }
    }

    buildEnemies(enemies) {
        for (const e of enemies) {
            if (storyState.npcsDefeated.includes(e.id) || storyState.npcsSpared.includes(e.id)) continue;
            const p = this.norm(e.x, e.y);
            const c = Phaser.Display.Color.HexStringToColor(e.color || '#ff4444').color;

            const aura = this.add.ellipse(p.x, p.y + 4, 44, 22, 0xff0000, 0.06).setDepth(3);
            this.tweens.add({ targets: aura, alpha: 0.15, scaleX: 1.3, scaleY: 1.3, duration: 800, yoyo: true, repeat: -1 });

            const sprite = this.physics.add.staticSprite(p.x, p.y, 'enemy').setTint(c).setDepth(5).setScale(0.8);
            this.enemyGroup.add(sprite);

            const nameW = (e.name?.length || 5) * 6 + 8;
            this.add.rectangle(p.x, p.y - 26, nameW, 12, 0x000000, 0.7).setDepth(6).setStrokeStyle(1, 0xff4444, 0.5);
            const label = this.add.text(p.x, p.y - 26, e.name, {
                fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#ff6666'
            }).setOrigin(0.5).setDepth(7);

            this.tweens.add({ targets: sprite, scaleX: 0.85, scaleY: 0.85, duration: 600, yoyo: true, repeat: -1 });
            this.enemyDataMap[e.id] = { data: e, sprite, label, type: 'enemy' };
        }
    }

    buildItems(items) {
        for (const item of items) {
            const p = this.norm(item.x, item.y);
            const c = Phaser.Display.Color.HexStringToColor(item.color || '#ffdd44').color;
            this.add.ellipse(p.x, p.y + 2, 24, 14, c, 0.1).setDepth(2);
            for (let s = 0; s < 3; s++) {
                const spark = this.add.rectangle(p.x + Phaser.Math.Between(-8, 8), p.y + Phaser.Math.Between(-8, 8), 2, 2, c, 0).setDepth(3);
                this.tweens.add({ targets: spark, alpha: { from: 0, to: 0.6 }, y: spark.y - 6, duration: Phaser.Math.Between(800, 1400), yoyo: true, repeat: -1, delay: s * 300 });
            }
            const sp = this.physics.add.sprite(p.x, p.y, 'item').setTint(c).setDepth(4);
            sp.setData('itemData', item);
            this.itemGroup.add(sp);
            this.tweens.add({ targets: sp, y: p.y - 5, scaleX: 1.15, scaleY: 1.15, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }
    }

    buildInteractables(interactables) {
        for (const obj of interactables) {
            const p = this.norm(obj.x, obj.y);
            const c = Phaser.Display.Color.HexStringToColor(obj.color || '#888888').color;
            this.add.ellipse(p.x, p.y + 2, 32, 16, c, 0.08).setDepth(2);
            const s = this.physics.add.staticSprite(p.x, p.y, 'interactable').setTint(c).setDepth(3);
            this.interactGroup.add(s);
            if (obj.locked) {
                const lock = this.add.text(p.x, p.y - 18, '🔒', { fontSize: '12px' }).setOrigin(0.5).setDepth(4);
                this.npcDataMap[`inter_${obj.id}`] = { data: obj, sprite: s, label: lock, type: 'interactable', lockIcon: lock };
            } else {
                this.npcDataMap[`inter_${obj.id}`] = { data: obj, sprite: s, type: 'interactable' };
            }
        }
    }

    buildExits(exits) {
        for (const exit of exits) {
            const pos = this.getExitPos(exit);
            const c = Phaser.Display.Color.HexStringToColor(exit.color || '#4488ff').color;
            const g1 = this.add.image(pos.x, pos.y, 'door_glow').setTint(c).setAlpha(0.15).setDepth(1).setScale(2);
            const g2 = this.add.image(pos.x, pos.y, 'door_glow').setTint(c).setAlpha(0.3).setDepth(1).setScale(1.2);
            this.tweens.add({ targets: g1, alpha: 0.35, scaleX: 2.4, scaleY: 2.4, duration: 1500, yoyo: true, repeat: -1 });
            this.tweens.add({ targets: g2, alpha: 0.6, scaleX: 1.5, scaleY: 1.5, duration: 1100, yoyo: true, repeat: -1 });

            if (exit.label) {
                const lbl = exit.label;
                this.add.rectangle(pos.x, pos.y - 30, lbl.length * 6 + 10, 14, 0x000000, 0.6).setDepth(6).setStrokeStyle(1, c, 0.3);
                this.add.text(pos.x, pos.y - 30, lbl, { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#ffffff' }).setOrigin(0.5).setDepth(7);
            }
            if (!exit.blocked) {
                const isV = exit.direction === 'top' || exit.direction === 'bottom';
                const zone = this.add.rectangle(pos.x, pos.y, isV ? DOOR_GAP : WALL + 6, isV ? WALL + 6 : DOOR_GAP, 0x000000, 0);
                this.physics.add.existing(zone, true);
                zone.setData('exitData', exit);
                this.exitZones.add(zone);
            }
        }
    }

    getExitPos(exit) {
        const W = this.scale.width, H = this.scale.height, p = exit.position || 0.5;
        switch (exit.direction) {
            case 'left': return { x: WALL / 2, y: WALL + p * this.playH };
            case 'right': return { x: W - WALL / 2, y: WALL + p * this.playH };
            case 'top': return { x: WALL + p * this.playW, y: WALL / 2 };
            case 'bottom': return { x: WALL + p * this.playW, y: H - WALL / 2 };
            default: return { x: W / 2, y: H - WALL / 2 };
        }
    }

    getStartPos() {
        const W = this.scale.width, H = this.scale.height;
        switch (this.entryDirection) {
            case 'left': return { x: WALL + 30, y: H / 2 };
            case 'right': return { x: W - WALL - 30, y: H / 2 };
            case 'top': return { x: W / 2, y: WALL + 30 };
            default: return { x: W / 2, y: H - WALL - 36 };
        }
    }

    // === HUD ===
    buildHUD() {
        const W = this.scale.width;
        this.hud = {};
        const roomName = this.roomSpec.name || '';
        this.hud.roomNameBg = this.add.rectangle(W / 2, 6, Math.max(60, roomName.length * 7 + 16), 14, 0x000000, 0.5).setOrigin(0.5, 0).setDepth(30);
        this.hud.roomName = this.add.text(W / 2, 8, roomName, { fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#888888' }).setOrigin(0.5, 0).setDepth(31);

        this.hud.hpIcon = this.add.image(WALL + 8, WALL + 10, 'hp_heart').setScale(0.9).setDepth(31);
        this.add.rectangle(WALL + 60, WALL + 7, 82, 10, 0x333333).setOrigin(0.5, 0).setDepth(30);
        this.hud.hpBar = this.add.rectangle(WALL + 20, WALL + 7, 80, 8, 0xffff00).setOrigin(0, 0).setDepth(30);
        this.hud.hpText = this.add.text(WALL + 104, WALL + 4, '', { fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#ffffff' }).setDepth(31);

        this.hud.gold = this.add.text(W - WALL - 4, WALL + 4, '', { fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#ffd700', align: 'right' }).setOrigin(1, 0).setDepth(31);
        this.hud.lvl = this.add.text(W - WALL - 4, WALL + 15, '', { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#ffff00', align: 'right' }).setOrigin(1, 0).setDepth(31);

        this.hud.questHint = this.add.text(WALL + 4, WALL + 20, '', { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#44aaff' }).setDepth(31);

        this.promptText = this.add.text(0, 0, '', {
            fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#ffff00',
            shadow: { offsetX: 0, offsetY: 0, color: '#ffff00', blur: 8, fill: true },
            backgroundColor: '#00000099', padding: { x: 6, y: 3 }
        }).setOrigin(0.5).setDepth(30).setVisible(false);

        this.updateHUD();
    }

    updateHUD() {
        const ratio = storyState.hp / storyState.maxHp;
        this.hud.hpBar.setSize(80 * ratio, 8);
        this.hud.hpBar.setFillStyle(ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffff00 : 0xff4444);
        this.hud.hpText.setText(`${storyState.hp}/${storyState.maxHp}`);

        const curr = storyState.theme === 'medieval' ? 'G' : 'CR';
        this.hud.gold.setText(storyState.gold > 0 ? `${storyState.gold} ${curr}` : '');
        this.hud.lvl.setText(`LV${storyState.level} | XP${storyState.xp}/${storyState.xpToNext}`);

        const aq = storyState.activeQuests[0];
        this.hud.questHint.setText(aq ? `◆ ${aq.title}` : '[X] Journal');
    }

    // === INTERACTION ===
    checkProximity() {
        const threshold = 50;
        let closest = null, closestDist = Infinity;
        const check = (id, entry) => {
            if (!entry.sprite?.active) return;
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.sprite.x, entry.sprite.y);
            if (d < threshold && d < closestDist) { closest = { id, ...entry }; closestDist = d; }
        };
        for (const [id, e] of Object.entries(this.npcDataMap)) check(id, e);
        for (const [id, e] of Object.entries(this.enemyDataMap)) check(id, e);
        this.nearTarget = closest;
        if (closest) {
            let label = closest.type === 'enemy' ? '⚔ FIGHT [Z]' : closest.type === 'interactable' ? '▶ USE [Z]' : '💬 TALK [Z]';
            this.promptText.setText(label).setVisible(true).setPosition(this.player.x, this.player.y - 28);
        } else {
            this.promptText.setVisible(false);
        }
    }

    interact(target) {
        if (target.type === 'npc') this.startNPCDialogue(target.data);
        else if (target.type === 'enemy') this.startCombat(target.data);
        else if (target.type === 'interactable') this.interactWithObject(target.data);
    }

    // === DIALOGUE (Persona 5–style portraits) ===
    initDialogue() {
        const W = this.scale.width, H = this.scale.height;
        const PW = 120, PH = 164;
        const boxH = 120, boxY = H - boxH - 6, boxW = W - 24;
        const pCX = 18 + PW / 2;
        const pCY = boxY + boxH - PH / 2;
        const textX = 18 + PW + 14;
        const textWrap = boxW - PW - 48;

        this.dlgBoxY = boxY;
        this._pCX = pCX; this._pCY = pCY; this._PW = PW; this._PH = PH;
        this.dlg = {};

        this.dlg.bgGlow = this.add.rectangle(W / 2, boxY + boxH / 2, boxW + 6, boxH + 6, 0xffffff, 0.05)
            .setDepth(49).setVisible(false);
        this.dlg.bg = this.add.rectangle(W / 2, boxY + boxH / 2, boxW, boxH, 0x000000)
            .setStrokeStyle(3, 0xffffff).setDepth(50).setVisible(false);

        this.dlg.portraitGlow = this.add.rectangle(pCX, pCY, PW + 18, PH + 18, 0xff2d55, 0.05)
            .setDepth(49).setVisible(false);
        this.dlg.portraitBg = this.add.rectangle(pCX, pCY, PW + 4, PH + 4, 0x000000)
            .setDepth(50).setVisible(false);
        this.dlg.portraitBorder = this.add.rectangle(pCX, pCY, PW, PH, 0x111111)
            .setStrokeStyle(3, 0xff2d55).setDepth(51).setVisible(false);
        this.dlg.portrait = this.add.image(pCX, pCY, 'portrait_npc')
            .setDisplaySize(PW - 6, PH - 6).setDepth(52).setVisible(false);
        this.dlg.portraitSlash = this.add.rectangle(pCX, pCY + PH / 2 - 5, PW + 12, 7, 0xff2d55, 0.7)
            .setDepth(53).setVisible(false);

        this.dlg.nameBg = this.add.rectangle(textX - 4, boxY - 1, 10, 18, 0x000000)
            .setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff).setDepth(50).setVisible(false);
        this.dlg.nameText = this.add.text(textX + 4, boxY - 1, '', {
            fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#ffff00'
        }).setOrigin(0, 0.5).setDepth(51).setVisible(false);
        this.dlg.text = this.add.text(textX, boxY + 18, '', {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffffff',
            wordWrap: { width: textWrap }, lineSpacing: 6
        }).setDepth(51).setVisible(false);
        this.dlg.arrow = this.add.text(W - 36, boxY + boxH - 20, '▼ Z', {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffff00'
        }).setDepth(51).setVisible(false);

        this.dlg.choiceTexts = [];
        for (let i = 0; i < 6; i++) {
            this.dlg.choiceTexts.push(
                this.add.text(textX + 16, boxY + 18 + i * 18, '', {
                    fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffffff'
                }).setDepth(51).setVisible(false)
            );
        }
        this.dlg.choiceCursor = this.add.image(textX, boxY + 24, 'soul')
            .setScale(0.5).setDepth(51).setVisible(false);

        this.dlgState = {
            lines: [], lineIdx: 0, choices: [], choiceIdx: 0,
            showingChoices: false, typing: false, displayedText: '',
            fullText: '', charTimer: null, npcName: '',
            onChoiceSelect: null, onEnd: null
        };

        this._portraitQueue = [];
        this._portraitBusy = false;
        this.requestRoomPortraits();
    }

    // ── AI portrait helpers ──

    _npcTexKey(name) {
        return 'portrait_' + name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + '_ai';
    }

    requestRoomPortraits() {
        const apiKey = this.registry.get('apiKey');
        if (!apiKey) return;

        const API = 'http://localhost:8081';
        const theme = storyState.theme || 'cyberpunk';
        const npcs = this.roomSpec.npcs || [];
        const enemies = this.roomSpec.enemies || [];

        for (const n of npcs) {
            const key = this._npcTexKey(n.name || n.id);
            if (this.textures.exists(key)) continue;
            this._portraitQueue.push({
                key, name: n.name || n.id, role: 'npc',
                description: n.description || n.emotion || '', color: n.color || '',
                theme, apiKey, api: API,
            });
        }
        for (const e of enemies) {
            if (storyState.npcsDefeated.includes(e.id) || storyState.npcsSpared.includes(e.id)) continue;
            const key = this._npcTexKey(e.name || e.id);
            if (this.textures.exists(key)) continue;
            this._portraitQueue.push({
                key, name: e.name || e.id, role: 'enemy',
                description: e.description || '', color: e.color || '',
                theme, apiKey, api: API,
            });
        }
        this._processPortraitQueue();
    }

    async _processPortraitQueue() {
        if (this._portraitBusy || !this._portraitQueue.length) return;
        this._portraitBusy = true;
        const job = this._portraitQueue.shift();
        try {
            const res = await fetch(`${job.api}/api/generate-bustup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: job.apiKey, name: job.name, theme: job.theme,
                    role: job.role, description: job.description, color: job.color,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.portrait_url) {
                    await this._loadTexUrl(job.key, `${job.api}${data.portrait_url}`);
                }
            }
        } catch (err) {
            console.warn(`[portrait] ${job.name}:`, err);
        }
        this._portraitBusy = false;
        this._processPortraitQueue();
    }

    _loadTexUrl(key, url) {
        return new Promise(resolve => {
            if (this.textures.exists(key)) { resolve(); return; }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { this.textures.addImage(key, img); resolve(); };
            img.onerror = () => resolve();
            img.src = url;
        });
    }

    // ── Portrait display ──

    showPortrait(npcName) {
        const soulColor = Phaser.Display.Color.HexStringToColor(storyState.soulColor || '#ff0000').color;
        const all = [
            this.dlg.portraitGlow, this.dlg.portraitBg,
            this.dlg.portraitBorder, this.dlg.portrait, this.dlg.portraitSlash
        ];

        let texKey, borderColor;
        if (npcName) {
            const npcEntry = Object.values(this.npcDataMap).find(e => e.data?.name === npcName);
            const npcColor = npcEntry?.data?.color
                ? Phaser.Display.Color.HexStringToColor(npcEntry.data.color).color : 0xaaaaff;
            const aiKey = this._npcTexKey(npcName);
            texKey = this.textures.exists(aiKey) ? aiKey : 'portrait_npc';
            borderColor = npcColor;

            this.dlg.portrait.setTexture(texKey)
                .setDisplaySize(this._PW - 6, this._PH - 6);
            if (texKey === 'portrait_npc') this.dlg.portrait.setTint(npcColor);
            else this.dlg.portrait.clearTint();
        } else {
            const aiKey = 'portrait_player_ai';
            texKey = this.textures.exists(aiKey) ? aiKey : 'portrait_player';
            borderColor = soulColor;

            this.dlg.portrait.setTexture(texKey)
                .setDisplaySize(this._PW - 6, this._PH - 6);
            if (texKey === 'portrait_player') this.dlg.portrait.setTint(soulColor);
            else this.dlg.portrait.clearTint();
        }

        this.dlg.portraitBorder.setStrokeStyle(3, borderColor);
        this.dlg.portraitSlash.setFillStyle(borderColor, 0.6);
        this.dlg.portraitGlow.setFillStyle(borderColor, 0.06);

        all.forEach(o => o.setVisible(true));
        this.dlg.portrait.setAlpha(0).setX(this._pCX - 30);
        this.tweens.add({
            targets: this.dlg.portrait,
            alpha: 1, x: this._pCX, duration: 220, ease: 'Back.easeOut'
        });
    }

    hidePortrait() {
        [this.dlg.portraitGlow, this.dlg.portraitBg, this.dlg.portraitBorder,
         this.dlg.portrait, this.dlg.portraitSlash].forEach(o => o.setVisible(false));
    }

    showDialogue(npcName, lines, choices, onChoiceSelect, onEnd) {
        this.mode = 'dialogue';
        this.player.setVelocity(0);
        const s = this.dlgState;
        s.lines = lines || []; s.lineIdx = 0; s.choices = choices || []; s.choiceIdx = 0;
        s.showingChoices = false; s.npcName = npcName; s.onChoiceSelect = onChoiceSelect; s.onEnd = onEnd;
        this.dlg.bg.setVisible(true); this.dlg.bgGlow.setVisible(true);
        this.dlg.arrow.setVisible(false); this.dlg.choiceCursor.setVisible(false);
        this.dlg.choiceTexts.forEach(t => t.setVisible(false).setText(''));
        this.showPortrait(npcName);
        if (npcName) {
            this.dlg.nameBg.setSize(npcName.length * 9 + 16, 16).setVisible(true);
            this.dlg.nameText.setText(npcName).setVisible(true);
        } else { this.dlg.nameBg.setVisible(false); this.dlg.nameText.setVisible(false); }
        if (s.lines.length > 0) this.typeText(s.lines[0]);
        else if (s.choices.length > 0) this.showChoices();
    }

    typeText(text) {
        const s = this.dlgState; s.typing = true;
        const prefix = s.npcName ? '' : '* ';
        s.fullText = prefix + text; s.displayedText = '';
        this.dlg.text.setText('').setVisible(true); this.dlg.arrow.setVisible(false);
        let ci = 0;
        if (s.charTimer) s.charTimer.destroy();
        s.charTimer = this.time.addEvent({ delay: 22, loop: true, callback: () => {
            if (ci < s.fullText.length) {
                s.displayedText += s.fullText[ci]; this.dlg.text.setText(s.displayedText); ci++;
                if (ci % 3 === 0) this.playSound('type');
            } else {
                s.charTimer.destroy(); s.typing = false;
                this.dlg.arrow.setVisible(true); this.tweens.killTweensOf(this.dlg.arrow); this.dlg.arrow.setAlpha(1);
                this.tweens.add({ targets: this.dlg.arrow, alpha: 0.3, duration: 400, yoyo: true, repeat: -1 });
            }
        }});
    }

    advanceDialogue() {
        const s = this.dlgState;
        if (s.typing) { if (s.charTimer) s.charTimer.destroy(); s.typing = false; this.dlg.text.setText(s.fullText); this.dlg.arrow.setVisible(true); return; }
        s.lineIdx++;
        if (s.lineIdx < s.lines.length) this.typeText(s.lines[s.lineIdx]);
        else if (s.choices.length > 0 && !s.showingChoices) this.showChoices();
        else this.endDialogue();
    }

    showChoices() {
        const s = this.dlgState; s.showingChoices = true; s.choiceIdx = 0;
        this.dlg.text.setVisible(false); this.dlg.arrow.setVisible(false);
        s.choices.forEach((ch, i) => { if (i < this.dlg.choiceTexts.length) this.dlg.choiceTexts[i].setText(ch.text).setVisible(true); });
        this.dlg.choiceCursor.setVisible(true); this.updateChoiceDisplay();
    }

    updateChoiceDisplay() {
        const s = this.dlgState;
        this.dlg.choiceTexts.forEach((t, i) => t.setColor(i === s.choiceIdx ? '#ffff00' : '#aaaaaa'));
        if (this.dlg.choiceTexts[s.choiceIdx]) this.dlg.choiceCursor.setY(this.dlg.choiceTexts[s.choiceIdx].y + 4);
    }

    selectChoice() {
        const s = this.dlgState; if (!s.showingChoices) return;
        const choice = s.choices[s.choiceIdx]; s.showingChoices = false;
        this.dlg.choiceCursor.setVisible(false); this.dlg.choiceTexts.forEach(t => t.setVisible(false));
        if (s.onChoiceSelect) s.onChoiceSelect(choice); else this.endDialogue();
    }

    endDialogue() {
        Object.values(this.dlg).forEach(v => { if (v?.setVisible) v.setVisible(false); });
        if (Array.isArray(this.dlg.choiceTexts)) this.dlg.choiceTexts.forEach(t => t.setVisible(false));
        this.tweens.killTweensOf(this.dlg.arrow); this.dlg.arrow?.setAlpha(1);
        this.hidePortrait();
        const cb = this.dlgState.onEnd;
        this.dlgState = { lines: [], lineIdx: 0, choices: [], choiceIdx: 0, showingChoices: false, typing: false, displayedText: '', fullText: '', charTimer: null, npcName: '', onChoiceSelect: null, onEnd: null };
        this.mode = 'explore'; if (cb) cb();
    }

    // === NPC + SHOP ===
    startNPCDialogue(npcData) {
        storyState.meetNPC(npcData.id);
        this.playSound('interact');
        this.npcTalkDepth = 0;

        let choices = [...(npcData.initial_choices || [])].slice(0, 3);
        if (npcData.shop_inventory?.length) {
            choices = [{ id: '__shop__', text: '🛒 Browse wares' }, ...choices.slice(0, 2)];
        }
        choices.push({ id: '__leave__', text: '👋 Leave' });

        const lines = (npcData.initial_dialogue || ['...']).slice(0, 3)
            .map(l => typeof l === 'string' && l.length > 120 ? l.slice(0, 117) + '...' : l);

        this.showDialogue(npcData.name, lines, choices,
            (choice) => {
                if (choice.id === '__leave__') { this.endDialogue(); return; }
                if (choice.id === '__shop__') { this.openShop(npcData); return; }
                this.handleNPCChoice(npcData, choice);
            }, null
        );
    }

    async handleNPCChoice(npcData, choice) {
        this.npcTalkDepth = (this.npcTalkDepth || 0) + 1;
        this.playSound('interact');
        this.dlg.text.setText('  . . .').setVisible(true);
        this.dlg.choiceTexts.forEach(t => t.setVisible(false));
        this.dlg.choiceCursor.setVisible(false);
        let dotCount = 0;
        const dotTimer = this.time.addEvent({ delay: 300, loop: true, callback: () => { dotCount = (dotCount + 1) % 4; this.dlg.text.setText('  ' + '. '.repeat(dotCount + 1)); }});

        const gemini = this.registry.get('geminiClient');
        if (!gemini) { dotTimer.destroy(); this.endDialogue(); return; }

        try {
            const result = await gemini.talkToNPC(npcData.id, npcData.name, choice.id, storyState.toContext());
            dotTimer.destroy();
            this.applyEffects(result.effects);
            this.updateHUD();

            let dialogue = (result.dialogue || ['...']).slice(0, 3);
            dialogue = dialogue.map(l => typeof l === 'string' && l.length > 120 ? l.slice(0, 117) + '...' : l);

            let choices = (result.choices || []).slice(0, 3);

            if (this.npcTalkDepth >= 5) choices = [];

            const hasChoices = choices.length > 0;
            if (hasChoices) choices.push({ id: '__leave__', text: '👋 Leave' });

            this.showDialogue(npcData.name, dialogue, choices,
                hasChoices ? (ch) => {
                    if (ch.id === '__leave__') { this.endDialogue(); return; }
                    this.handleNPCChoice(npcData, ch);
                } : null,
                () => { if (result.effects?.trigger_combat) { const enemy = this.roomSpec.enemies?.find(e => e.id === result.effects.trigger_combat); if (enemy) this.startCombat(enemy); }}
            );
        } catch (err) {
            console.error('NPC dialogue error:', err); dotTimer.destroy();
            this.showDialogue(npcData.name, ['...the words fade away.'], [], null, null);
        }
    }

    // === SHOP ===
    openShop(npcData) {
        this.endDialogue();
        this.mode = 'shop';
        this.shopData = npcData;
        this.shopItems = npcData.shop_inventory || [];
        this.shopIdx = 0;

        const W = this.scale.width, H = this.scale.height;
        const boxH = 160, boxY = H - boxH - 6, boxW = W - 24;

        this.shopUI = {};
        this.shopUI.bg = this.add.rectangle(W / 2, boxY + boxH / 2, boxW, boxH, 0x000000).setStrokeStyle(3, 0x44ff44).setDepth(50);
        this.shopUI.title = this.add.text(22, boxY + 6, `${npcData.name}'s Shop`, { fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#44ff44' }).setDepth(51);
        this.shopUI.gold = this.add.text(W - 36, boxY + 6, '', { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffd700', align: 'right' }).setOrigin(1, 0).setDepth(51);
        this.shopUI.items = [];
        for (let i = 0; i < 5; i++) {
            this.shopUI.items.push(this.add.text(50, boxY + 24 + i * 20, '', { fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#ffffff' }).setDepth(51));
        }
        this.shopUI.items.push(this.add.text(50, boxY + 24 + 5 * 20, '← Leave shop', { fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#888888' }).setDepth(51));
        this.shopUI.cursor = this.add.image(30, 0, 'soul').setScale(0.4).setDepth(51);
        this.shopUI.desc = this.add.text(22, boxY + boxH - 18, '', { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#aaaaaa' }).setDepth(51);
        this.updateShopDisplay();
    }

    updateShopDisplay() {
        const curr = storyState.theme === 'medieval' ? 'G' : 'CR';
        this.shopUI.gold.setText(`${storyState.gold} ${curr}`);
        this.shopItems.forEach((item, i) => {
            if (i < 5) {
                const affordable = storyState.gold >= item.price;
                this.shopUI.items[i].setText(`${item.name}  ${item.price}${curr}`).setColor(affordable ? '#ffffff' : '#666666');
            }
        });
        this.shopUI.items.forEach((t, i) => t.setColor(i === this.shopIdx ? '#ffff00' : (i < this.shopItems.length ? (storyState.gold >= (this.shopItems[i]?.price || 0) ? '#ffffff' : '#666666') : '#888888')));
        const cy = this.shopUI.items[Math.min(this.shopIdx, this.shopUI.items.length - 1)];
        if (cy) this.shopUI.cursor.setY(cy.y + 4);

        if (this.shopIdx < this.shopItems.length) {
            const item = this.shopItems[this.shopIdx];
            let desc = item.description || '';
            if (item.effect?.heal) desc += ` (+${item.effect.heal} HP)`;
            if (item.bonus && item.slot) desc += ` (+${item.bonus} ${item.slot === 'weapon' ? 'ATK' : 'DEF'})`;
            this.shopUI.desc.setText(desc);
        } else { this.shopUI.desc.setText(''); }
    }

    shopSelect() {
        if (this.shopIdx >= this.shopItems.length) { this.closeShop(); return; }
        const item = this.shopItems[this.shopIdx];
        if (storyState.gold < item.price) return;
        if (storyState.inventory.length >= storyState.maxInventory) return;
        storyState.gold -= item.price;
        storyState.addItem(item);
        this.playSound('item');
        this.updateShopDisplay();
        this.updateHUD();
    }

    closeShop() {
        Object.values(this.shopUI).forEach(v => { if (v?.destroy) v.destroy(); else if (Array.isArray(v)) v.forEach(t => t.destroy()); });
        this.shopUI = null;
        this.mode = 'explore';
    }

    // === QUEST LOG ===
    initQuestLog() {
        this.questLogUI = null;
    }

    toggleQuestLog() {
        if (this.mode === 'questlog') {
            if (this.questLogUI) Object.values(this.questLogUI).forEach(v => { if (Array.isArray(v)) v.forEach(t => t.destroy()); else v?.destroy(); });
            this.questLogUI = null;
            this.mode = 'explore';
            return;
        }
        this.mode = 'questlog';
        this.player.setVelocity(0);
        const W = this.scale.width, H = this.scale.height;
        const ui = {};
        ui.bg = this.add.rectangle(W / 2, H / 2, W - 60, H - 60, 0x000000, 0.95).setStrokeStyle(3, 0xffffff).setDepth(60);
        ui.title = this.add.text(W / 2, 50, 'JOURNAL', { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#ffff00' }).setOrigin(0.5).setDepth(61);

        const lines = [];
        // Stats
        lines.push(this.add.text(50, 80, `LV ${storyState.level}  HP ${storyState.hp}/${storyState.maxHp}  ATK ${storyState.getATK()}  DEF ${storyState.getDEF()}`, { fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#ffffff' }).setDepth(61));
        lines.push(this.add.text(50, 95, `Alignment: ${storyState.getMoralAlignment().toUpperCase()}  |  Kills: ${storyState.reputation.kills}  Spares: ${storyState.reputation.spares}`, { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#888888' }).setDepth(61));

        // Equipment
        const wp = storyState.equipment.weapon;
        const ar = storyState.equipment.armor;
        lines.push(this.add.text(50, 115, `Weapon: ${wp ? wp.name + ' (+' + wp.bonus + ')' : 'None'}  Armor: ${ar ? ar.name + ' (+' + ar.bonus + ')' : 'None'}`, { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#aaaaaa' }).setDepth(61));

        // Active quests
        lines.push(this.add.text(50, 140, '── ACTIVE QUESTS ──', { fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#44aaff' }).setDepth(61));
        let y = 158;
        for (const q of storyState.activeQuests) {
            lines.push(this.add.text(50, y, `◆ ${q.title}`, { fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#ffffff' }).setDepth(61));
            lines.push(this.add.text(60, y + 14, q.description || '', { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#888888' }).setDepth(61));
            y += 30;
        }
        if (storyState.activeQuests.length === 0) {
            lines.push(this.add.text(50, y, 'No active quests', { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#666666' }).setDepth(61));
            y += 16;
        }

        // Inventory
        lines.push(this.add.text(50, y + 10, '── INVENTORY ──', { fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#ffaa22' }).setDepth(61));
        y += 28;
        if (storyState.inventory.length === 0) {
            lines.push(this.add.text(50, y, 'Empty', { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#666666' }).setDepth(61));
        } else {
            for (const item of storyState.inventory) {
                lines.push(this.add.text(50, y, `• ${item.name} (${item.type})`, { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#dddddd' }).setDepth(61));
                y += 14;
            }
        }

        lines.push(this.add.text(W / 2, H - 45, '[X] Close', { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#666666' }).setOrigin(0.5).setDepth(61));
        ui.lines = lines;
        this.questLogUI = ui;
    }

    // === OBJECTS ===
    async interactWithObject(objData) {
        this.playSound('interact');
        if (objData.locked && objData.requires_item) {
            if (storyState.hasItem(objData.requires_item)) {
                storyState.removeItem(objData.requires_item); objData.locked = false;
                const entry = this.npcDataMap[`inter_${objData.id}`];
                if (entry?.lockIcon) entry.lockIcon.destroy();
                this.showDialogue('', [`Used ${objData.requires_item}. It's now open!`], [], null, null);
                storyState.logEvent(`unlocked:${objData.id}`);
            } else { this.showDialogue('', ['It\'s locked. You need something to open it.'], [], null, null); }
            return;
        }
        if (objData.interact_text) {
            this.showDialogue('', objData.interact_text, [], null, () => { if (objData.interact_effect) this.applyEffects(objData.interact_effect); this.updateHUD(); });
            return;
        }
        const gemini = this.registry.get('geminiClient');
        if (!gemini) { this.showDialogue('', ['Nothing happens.'], [], null, null); return; }
        this.showDialogue('', ['...'], [], null, null);
        try {
            const result = await gemini.interactObject(objData.id, objData, storyState.toContext());
            this.applyEffects(result.effects); this.updateHUD(); this.endDialogue();
            this.showDialogue('', result.dialogue || ['Nothing happens.'], [], null, null);
        } catch { this.endDialogue(); this.showDialogue('', ['Nothing happens.'], [], null, null); }
    }

    applyEffects(effects) {
        if (!effects) return;
        if (effects.give_item && typeof effects.give_item === 'object') { if (storyState.addItem(effects.give_item)) this.playSound('item'); }
        if (effects.take_item) storyState.removeItem(effects.take_item);
        if (effects.set_flag) storyState.setFlag(effects.set_flag.key, effects.set_flag.value);
        if (effects.heal) storyState.heal(effects.heal);
        if (effects.give_gold) storyState.addGold(effects.give_gold);
        if (effects.give_xp) storyState.gainXP(effects.give_xp);
        if (effects.complete_quest) {
            const q = storyState.completeQuest(effects.complete_quest);
            if (q?.reward) { if (q.reward.xp) storyState.gainXP(q.reward.xp); if (q.reward.gold) storyState.addGold(q.reward.gold); }
        }
        if (effects.add_quest) storyState.addQuest(effects.add_quest);
        if (effects.open_path) {
            for (const exit of (this.roomSpec.exits || [])) {
                if (exit.id === effects.open_path) {
                    exit.blocked = false;
                    const pos = this.getExitPos(exit);
                    const isV = exit.direction === 'top' || exit.direction === 'bottom';
                    const zone = this.add.rectangle(pos.x, pos.y, isV ? DOOR_GAP : WALL + 6, isV ? WALL + 6 : DOOR_GAP, 0x000000, 0);
                    this.physics.add.existing(zone, true); zone.setData('exitData', exit);
                    this.exitZones.add(zone); this.physics.add.overlap(this.player, zone, this.onExit, null, this);
                }
            }
        }
    }

    onItem(player, itemSprite) {
        const data = itemSprite.getData('itemData'); if (!data) return;
        itemSprite.setData('itemData', null); if (itemSprite.body) itemSprite.body.enable = false;
        const added = storyState.addItem(data);
        if (added) {
            this.playSound('item'); storyState.logEvent(`found:${data.id}`);
            const qc = storyState.checkQuestObjective('find', data.id);
            if (qc) { const q = storyState.completeQuest(qc); if (q?.reward) { if (q.reward.xp) storyState.gainXP(q.reward.xp); if (q.reward.gold) storyState.addGold(q.reward.gold); } }
            this.tweens.add({ targets: itemSprite, y: itemSprite.y - 20, alpha: 0, scaleX: 2, scaleY: 2, duration: 300, onComplete: () => itemSprite.destroy() });
            this.showDialogue('', [`Found: ${data.name}`, data.description || ''], [], null, null);
            this.updateHUD();
        } else { this.showDialogue('', ['Inventory full!'], [], null, null); itemSprite.setData('itemData', data); if (itemSprite.body) itemSprite.body.enable = true; }
    }

    startCombat(enemyData) {
        this.transitioning = true;
        this.mode = 'cutscene';
        this.player.setVelocity(0);

        const cutsceneClient = this.registry.get('cutsceneClient');
        const cutscenePlayer = this.registry.get('cutscenePlayer');
        const W = this.scale.width, H = this.scale.height;

        const launchCombat = () => {
            this.cameras.main.shake(300, 0.02);
            this.time.delayedCall(400, () => {
                this.cameras.main.fadeOut(400);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    this.scene.start('CombatScene', {
                        enemy: enemyData, roomSpec: this.roomSpec,
                        entryDirection: this.entryDirection,
                    });
                });
            });
        };

        if (!cutsceneClient?.ready || !cutscenePlayer) {
            launchCombat();
            return;
        }

        const key = `boss_intro_${enemyData.id}`;

        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(50);
        const eName = this.add.text(W / 2, H / 2 - 10, enemyData.name || 'Enemy', {
            fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#ff4444',
            shadow: { offsetX: 0, offsetY: 0, color: '#ff0000', blur: 12, fill: true },
        }).setOrigin(0.5).setDepth(51).setAlpha(0);
        const sub = this.add.text(W / 2, H / 2 + 20, '⚔ Preparing battle...', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#888888',
        }).setOrigin(0.5).setDepth(51).setAlpha(0);

        this.tweens.add({ targets: overlay, alpha: 0.85, duration: 400 });
        this.tweens.add({ targets: eName, alpha: 1, duration: 600, delay: 200 });
        this.tweens.add({ targets: sub, alpha: 1, duration: 400, delay: 500 });

        const cleanup = () => { overlay.destroy(); eName.destroy(); sub.destroy(); };

        const ctx = {
            enemy_name: enemyData.name, enemy_color: enemyData.color || '',
            room_name: this.roomSpec.name || '', room_mood: this.roomSpec.mood || '',
        };
        cutsceneClient.preload([
            { cache_key: key, trigger_type: 'boss_intro', context: ctx },
            { cache_key: `boss_victory_${enemyData.id}`, trigger_type: 'boss_outcome_victory', context: ctx },
            { cache_key: `boss_spare_${enemyData.id}`, trigger_type: 'boss_outcome_spare', context: ctx },
        ]).catch(() => {});

        const pollMs = 2500;

        const poll = () => {
            cutsceneClient.checkCache(key).then(cached => {
                if (cached?.status === 'complete' && cached.video_url) {
                    sub.setText('🎬 Playing cinematic...');
                    this.time.delayedCall(300, () => {
                        cleanup();
                        cutscenePlayer.play(cached.video_url).then(() => {
                            this.cameras.main.shake(300, 0.02);
                            this.time.delayedCall(400, launchCombat);
                        });
                    });
                } else if (cached?.status === 'error') {
                    cleanup();
                    launchCombat();
                } else {
                    if (cached?.status === 'generating_video') sub.setText('🎬 Rendering cinematic...');
                    else if (cached?.status === 'generating') sub.setText('🎬 Building scene...');
                    else if (cached?.status === 'waiting_rate_limit') sub.setText('⏳ Queued for render...');
                    else if (!cached || cached.status === 'not_found' || cached.status === 'queued') sub.setText('⏳ Preparing cinematic...');
                    this.time.delayedCall(pollMs, poll);
                }
            }).catch(() => { this.time.delayedCall(pollMs, poll); });
        };

        this.time.delayedCall(800, poll);
    }

    onExit(player, zone) {
        if (this.transitioning || this.mode !== 'explore') return;
        this.transitioning = true;
        const exit = zone.getData('exitData');
        if (exit.requires_item && !storyState.hasItem(exit.requires_item)) { this.transitioning = false; this.showDialogue('', ['The way is blocked...'], [], null, null); return; }
        storyState.logEvent(`exited:${exit.direction}:${exit.label || ''}`); this.playSound('exit');
        const opposites = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
        const entryDir = opposites[exit.direction] || 'bottom';
        const trigger = `exited ${exit.direction} toward "${exit.label || 'unknown'}"`;
        this.cameras.main.flash(200, 255, 255, 255);
        this.cameras.main.once('cameraflashcomplete', () => {
            this.cameras.main.fadeOut(400);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('TransitionScene', {
                    trigger,
                    entryDirection: entryDir,
                    exitDirection: exit.direction,
                    exitLabel: exit.label || '',
                    roomName: this.roomSpec.name || '',
                    roomMood: this.roomSpec.mood || '',
                });
            });
        });
    }

    // === AUDIO ===
    setupAudio() {
        if (this.registry.get('audioCtx')) this.audioCtx = this.registry.get('audioCtx');
        else { try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); this.registry.set('audioCtx', this.audioCtx); } catch { this.audioCtx = null; } }
    }

    playSound(type) {
        if (!this.audioCtx) return;
        const ctx = this.audioCtx, now = ctx.currentTime;
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        switch (type) {
            case 'interact': osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(660, now + 0.05); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12); osc.start(now); osc.stop(now + 0.12); break;
            case 'item': osc.frequency.setValueAtTime(523, now); osc.frequency.setValueAtTime(659, now + 0.06); osc.frequency.setValueAtTime(784, now + 0.12); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2); osc.start(now); osc.stop(now + 0.2); break;
            case 'exit': osc.type = 'sine'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(800, now + 0.3); gain.gain.setValueAtTime(0.08, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); osc.start(now); osc.stop(now + 0.3); break;
            case 'type': osc.type = 'square'; osc.frequency.setValueAtTime(Phaser.Math.Between(180, 260), now); gain.gain.setValueAtTime(0.025, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035); osc.start(now); osc.stop(now + 0.035); break;
        }
    }
}
