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

        // Physics groups
        this.walls = this.physics.add.staticGroup();
        this.obstacleGroup = this.physics.add.staticGroup();
        this.exitZones = this.physics.add.staticGroup();
        this.itemGroup = this.physics.add.group();
        this.npcGroup = this.physics.add.staticGroup();
        this.interactGroup = this.physics.add.staticGroup();
        this.enemyGroup = this.physics.add.staticGroup();

        // Build room
        this.npcDataMap = {};
        this.enemyDataMap = {};
        this.buildWalls(spec);
        this.drawFloor(spec);
        this.addAmbientEffects(spec);
        this.buildObstacles(spec.obstacles || []);
        this.buildExits(spec.exits || []);
        this.buildItems(spec.items || []);
        this.buildInteractables(spec.interactables || []);
        this.buildNPCs(spec.npcs || []);
        this.buildEnemies(spec.enemies || []);
        this.addVignette();

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
        this.player = this.physics.add.sprite(start.x, start.y, 'player_down');
        this.player.setDepth(10).setCollideWorldBounds(true);
        this.player.body.setSize(14, 18).setOffset(3, 10);

        // Player shadow
        this.playerShadow = this.add.ellipse(start.x, start.y + 14, 16, 6, 0x000000, 0.3).setDepth(9);

        // Collisions
        this.physics.add.collider(this.player, this.walls);
        this.physics.add.collider(this.player, this.obstacleGroup);
        this.physics.add.collider(this.player, this.npcGroup);
        this.physics.add.collider(this.player, this.interactGroup);
        this.physics.add.overlap(this.player, this.exitZones, this.onExit, null, this);
        this.physics.add.overlap(this.player, this.itemGroup, this.onItem, null, this);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.xKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

        // HUD
        this.buildHUD();

        // Dialogue system
        this.initDialogue();

        // State
        this.mode = 'explore';
        this.nearTarget = null;
        this.transitioning = false;
        this.walkTimer = 0;

        // Audio
        this.setupAudio();

        // Fade in then show narration
        this.cameras.main.fadeIn(500);
        if (spec.narration && !this.combatResult) {
            this.time.delayedCall(600, () => {
                this.showDialogue('', [spec.narration], [], null);
            });
        }
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

            // Walk bob
            if (vx || vy) {
                this.walkTimer += delta * 0.008;
                this.player.setY(this.player.y + Math.sin(this.walkTimer * 8) * 0.3);
            }

            // Shadow follows player
            this.playerShadow.setPosition(this.player.x, this.player.y + 14);

            this.checkProximity();

            if (Phaser.Input.Keyboard.JustDown(this.zKey) && this.nearTarget) {
                this.interact(this.nearTarget);
            }
        }

        // FIXED: separate branches so Z doesn't fire both advance AND select
        if (this.mode === 'dialogue') {
            if (this.dlgState.showingChoices) {
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
    }

    // === ROOM BUILDING ===

    norm(nx, ny) { return { x: WALL + nx * this.playW, y: WALL + ny * this.playH }; }

    buildWalls(spec) {
        const W = this.scale.width, H = this.scale.height;
        const wc = Phaser.Display.Color.HexStringToColor(spec.wall_color || '#2a2a3e').color;
        const exitDirs = new Map();
        for (const e of (spec.exits || [])) exitDirs.set(e.direction, e.position || 0.5);

        if (exitDirs.has('top')) {
            const g = WALL + exitDirs.get('top') * this.playW;
            this.wallRect(0, 0, g - DOOR_GAP / 2, WALL, wc);
            this.wallRect(g + DOOR_GAP / 2, 0, W - g - DOOR_GAP / 2, WALL, wc);
        } else this.wallRect(0, 0, W, WALL, wc);

        if (exitDirs.has('bottom')) {
            const g = WALL + exitDirs.get('bottom') * this.playW;
            this.wallRect(0, H - WALL, g - DOOR_GAP / 2, WALL, wc);
            this.wallRect(g + DOOR_GAP / 2, H - WALL, W - g - DOOR_GAP / 2, WALL, wc);
        } else this.wallRect(0, H - WALL, W, WALL, wc);

        if (exitDirs.has('left')) {
            const g = WALL + exitDirs.get('left') * this.playH;
            this.wallRect(0, 0, WALL, g - DOOR_GAP / 2, wc);
            this.wallRect(0, g + DOOR_GAP / 2, WALL, H - g - DOOR_GAP / 2, wc);
        } else this.wallRect(0, 0, WALL, H, wc);

        if (exitDirs.has('right')) {
            const g = WALL + exitDirs.get('right') * this.playH;
            this.wallRect(W - WALL, 0, WALL, g - DOOR_GAP / 2, wc);
            this.wallRect(W - WALL, g + DOOR_GAP / 2, WALL, H - g - DOOR_GAP / 2, wc);
        } else this.wallRect(W - WALL, 0, WALL, H, wc);
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

        // Grid lines
        const lc = Phaser.Display.Color.GetColor(
            Math.min(255, bg.r + 10), Math.min(255, bg.g + 10), Math.min(255, bg.b + 10));
        g.lineStyle(1, lc, 0.08);
        for (let x = WALL; x < W - WALL; x += 32)
            g.lineBetween(x, WALL, x, H - WALL);
        for (let y = WALL; y < H - WALL; y += 32)
            g.lineBetween(WALL, y, W - WALL, y);

        // Random floor details
        const dc = Phaser.Display.Color.GetColor(
            Math.min(255, bg.r + 18), Math.min(255, bg.g + 18), Math.min(255, bg.b + 18));
        const dc2 = Phaser.Display.Color.GetColor(
            Math.min(255, bg.r + 6), Math.min(255, bg.g + 6), Math.min(255, bg.b + 6));

        for (let i = 0; i < 20; i++) {
            const dx = Phaser.Math.Between(WALL + 8, W - WALL - 8);
            const dy = Phaser.Math.Between(WALL + 8, H - WALL - 8);
            const r = Math.random();
            if (r < 0.4) {
                g.fillStyle(dc, 0.15);
                g.fillRect(dx, dy, Phaser.Math.Between(2, 6), Phaser.Math.Between(1, 3));
            } else if (r < 0.7) {
                g.fillStyle(dc2, 0.12);
                g.fillCircle(dx, dy, Phaser.Math.Between(1, 3));
            } else {
                g.lineStyle(1, dc, 0.1);
                g.lineBetween(dx, dy, dx + Phaser.Math.Between(-8, 8), dy + Phaser.Math.Between(-4, 4));
            }
        }

        // Corner darkening
        const cornerAlpha = 0.15;
        g.fillStyle(0x000000, cornerAlpha);
        g.fillRect(WALL, WALL, 40, 40);
        g.fillRect(W - WALL - 40, WALL, 40, 40);
        g.fillRect(WALL, H - WALL - 40, 40, 40);
        g.fillRect(W - WALL - 40, H - WALL - 40, 40, 40);
    }

    addAmbientEffects(spec) {
        const W = this.scale.width, H = this.scale.height;
        const theme = storyState.theme || 'cyberpunk';
        const pConf = THEME_PARTICLES[theme] || THEME_PARTICLES.cyberpunk;

        // Floating ambient particles
        for (let i = 0; i < 18; i++) {
            const pc = Phaser.Utils.Array.GetRandom(pConf.colors);
            const x = Phaser.Math.Between(WALL + 10, W - WALL - 10);
            const y = Phaser.Math.Between(WALL + 10, H - WALL - 10);
            const size = pConf.style === 'stars' ? Phaser.Math.Between(1, 3) : Phaser.Math.Between(2, 4);
            const p = this.add.rectangle(x, y, size, size, pc, 0).setDepth(1);

            this.tweens.add({
                targets: p,
                alpha: { from: 0, to: Phaser.Math.FloatBetween(0.2, 0.6) },
                x: x + Phaser.Math.Between(-30, 30),
                y: y + Phaser.Math.Between(-20, 20),
                duration: Phaser.Math.Between(3000, 7000),
                yoyo: true, repeat: -1,
                ease: 'Sine.easeInOut',
                delay: Phaser.Math.Between(0, 2000)
            });
        }

        // Mood-based ambient overlay
        const mood = spec.mood || 'mysterious';
        if (mood === 'eerie' || mood === 'dangerous') {
            const fog = this.add.rectangle(W / 2, H / 2, W, H, 0x220022, 0.06).setDepth(15);
            this.tweens.add({
                targets: fog, alpha: 0.12, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
        } else if (mood === 'tense') {
            const tint = this.add.rectangle(W / 2, H / 2, W, H, 0x331100, 0.04).setDepth(15);
            this.tweens.add({
                targets: tint, alpha: 0.08, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
        }
    }

    addVignette() {
        const W = this.scale.width, H = this.scale.height;
        const g = this.add.graphics().setDepth(45);
        const edgeW = 80;

        // Gradient edges using layered alpha rectangles
        for (let i = 0; i < 8; i++) {
            const a = 0.12 - i * 0.014;
            if (a <= 0) break;
            const offset = i * (edgeW / 8);
            g.fillStyle(0x000000, a);
            // Top
            g.fillRect(0, 0, W, offset + edgeW / 8);
            // Bottom
            g.fillRect(0, H - offset - edgeW / 8, W, offset + edgeW / 8);
            // Left
            g.fillRect(0, 0, offset + edgeW / 8, H);
            // Right
            g.fillRect(W - offset - edgeW / 8, 0, offset + edgeW / 8, H);
        }
    }

    buildObstacles(obs) {
        for (const o of obs) {
            const p = this.norm(o.x, o.y);
            const w = o.w * this.playW, h = o.h * this.playH;
            const c = Phaser.Display.Color.HexStringToColor(o.color || '#3a3a4e').color;
            const key = this.textures.exists(`obs_${o.type}`) ? `obs_${o.type}` : 'obs_rock';
            const s = this.add.tileSprite(p.x, p.y, w, h, key).setTint(c).setDepth(2);
            this.physics.add.existing(s, true);
            this.obstacleGroup.add(s);

            // Obstacle shadow
            this.add.ellipse(p.x, p.y + h / 2 + 2, w * 0.8, 5, 0x000000, 0.2).setDepth(1);
        }
    }

    buildNPCs(npcs) {
        for (const n of npcs) {
            const p = this.norm(n.x, n.y);
            const c = Phaser.Display.Color.HexStringToColor(n.color || '#aaaaff').color;
            const ac = Phaser.Display.Color.HexStringToColor(n.accent_color || '#ffffff').color;
            const spriteType = n.sprite_type || 'civilian';
            const key = this.textures.exists(`npc_${spriteType}`) ? `npc_${spriteType}` : 'npc_civilian';

            // NPC glow
            const glow = this.add.ellipse(p.x, p.y + 4, 36, 18, c, 0.08).setDepth(3);
            this.tweens.add({
                targets: glow, alpha: 0.18, scaleX: 1.15, scaleY: 1.15,
                duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });

            // NPC shadow
            this.add.ellipse(p.x, p.y + 16, 18, 6, 0x000000, 0.3).setDepth(4);

            const sprite = this.physics.add.staticSprite(p.x, p.y, key).setTint(c).setDepth(5);
            this.npcGroup.add(sprite);

            // Name label with colored background
            const nameStr = n.name || n.id;
            const nameW = nameStr.length * 6 + 8;
            const nameBg = this.add.rectangle(p.x, p.y - 24, nameW, 12, 0x000000, 0.7)
                .setDepth(6).setStrokeStyle(1, c, 0.4);
            const label = this.add.text(p.x, p.y - 24, nameStr, {
                fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#ffffff'
            }).setOrigin(0.5).setDepth(7);

            // Emotion indicator
            const emotions = { friendly: '☺', hostile: '⚠', scared: '!', mysterious: '?', sad: '~', neutral: '' };
            const emo = emotions[n.emotion] || '';
            let emoText = null;
            if (emo) {
                emoText = this.add.text(p.x + 14, p.y - 16, emo, {
                    fontFamily: '"Press Start 2P"', fontSize: '7px',
                    color: n.emotion === 'hostile' ? '#ff4444' : n.emotion === 'friendly' ? '#44ff44' : '#ffff44'
                }).setOrigin(0.5).setDepth(7);
            }

            // Idle float
            const floatTargets = [sprite, label, nameBg, glow];
            if (emoText) floatTargets.push(emoText);
            this.tweens.add({
                targets: floatTargets, y: `-=3`, duration: 1200 + Math.random() * 500,
                yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });

            // Quest indicator
            if (n.has_quest) {
                const qi = this.add.text(p.x, p.y - 38, '!', {
                    fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#ffff00',
                    shadow: { offsetX: 0, offsetY: 0, color: '#ffff00', blur: 10, fill: true }
                }).setOrigin(0.5).setDepth(8);
                this.tweens.add({ targets: qi, y: p.y - 44, duration: 400, yoyo: true, repeat: -1 });
            }

            this.npcDataMap[n.id] = { data: n, sprite, label, type: 'npc' };
        }
    }

    buildEnemies(enemies) {
        for (const e of enemies) {
            if (storyState.npcsDefeated.includes(e.id) || storyState.npcsSpared.includes(e.id)) continue;
            const p = this.norm(e.x, e.y);
            const c = Phaser.Display.Color.HexStringToColor(e.color || '#ff4444').color;

            // Enemy aura
            const aura = this.add.ellipse(p.x, p.y + 4, 44, 22, 0xff0000, 0.06).setDepth(3);
            this.tweens.add({
                targets: aura, alpha: 0.15, scaleX: 1.3, scaleY: 1.3,
                duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });

            const sprite = this.physics.add.staticSprite(p.x, p.y, 'enemy').setTint(c).setDepth(5).setScale(0.8);
            this.enemyGroup.add(sprite);

            const nameW = (e.name?.length || 5) * 6 + 8;
            this.add.rectangle(p.x, p.y - 26, nameW, 12, 0x000000, 0.7)
                .setDepth(6).setStrokeStyle(1, 0xff4444, 0.5);
            const label = this.add.text(p.x, p.y - 26, e.name, {
                fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#ff6666'
            }).setOrigin(0.5).setDepth(7);

            this.tweens.add({
                targets: sprite, scaleX: 0.85, scaleY: 0.85, duration: 600,
                yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });

            this.enemyDataMap[e.id] = { data: e, sprite, label, type: 'enemy' };
        }
    }

    buildItems(items) {
        for (const item of items) {
            const p = this.norm(item.x, item.y);
            const c = Phaser.Display.Color.HexStringToColor(item.color || '#ffdd44').color;

            // Item glow
            const glow = this.add.ellipse(p.x, p.y + 2, 24, 14, c, 0.1).setDepth(2);
            this.tweens.add({
                targets: glow, alpha: 0.25, scaleX: 1.3, scaleY: 1.3,
                duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });

            // Sparkle particles around item
            for (let s = 0; s < 3; s++) {
                const spark = this.add.rectangle(
                    p.x + Phaser.Math.Between(-10, 10),
                    p.y + Phaser.Math.Between(-10, 10),
                    2, 2, c, 0
                ).setDepth(3);
                this.tweens.add({
                    targets: spark, alpha: { from: 0, to: 0.7 },
                    x: spark.x + Phaser.Math.Between(-6, 6),
                    y: spark.y + Phaser.Math.Between(-8, -2),
                    duration: Phaser.Math.Between(800, 1400),
                    yoyo: true, repeat: -1, delay: s * 300, ease: 'Sine.easeInOut'
                });
            }

            const sp = this.physics.add.sprite(p.x, p.y, 'item').setTint(c).setDepth(4);
            sp.setData('itemData', item);
            this.itemGroup.add(sp);
            this.tweens.add({
                targets: sp, y: p.y - 5, scaleX: 1.15, scaleY: 1.15,
                duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
        }
    }

    buildInteractables(interactables) {
        for (const obj of interactables) {
            const p = this.norm(obj.x, obj.y);
            const c = Phaser.Display.Color.HexStringToColor(obj.color || '#888888').color;

            // Glow for interactable
            const glow = this.add.ellipse(p.x, p.y + 2, 32, 16, c, 0.08).setDepth(2);
            this.tweens.add({
                targets: glow, alpha: 0.15, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });

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

            // Multi-layered exit glow
            const glow1 = this.add.image(pos.x, pos.y, 'door_glow').setTint(c).setAlpha(0.15).setDepth(1).setScale(2);
            const glow2 = this.add.image(pos.x, pos.y, 'door_glow').setTint(c).setAlpha(0.3).setDepth(1).setScale(1.2);
            this.tweens.add({
                targets: glow1, alpha: 0.35, scaleX: 2.4, scaleY: 2.4,
                duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
            this.tweens.add({
                targets: glow2, alpha: 0.6, scaleX: 1.5, scaleY: 1.5,
                duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });

            if (exit.label) {
                const lbl = exit.label;
                const lblW = lbl.length * 6 + 10;
                this.add.rectangle(pos.x, pos.y - 30, lblW, 14, 0x000000, 0.6)
                    .setDepth(6).setStrokeStyle(1, c, 0.3);
                this.add.text(pos.x, pos.y - 30, lbl, {
                    fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#ffffff'
                }).setOrigin(0.5).setDepth(7);
            }

            if (!exit.blocked) {
                let zw, zh;
                if (exit.direction === 'top' || exit.direction === 'bottom') { zw = DOOR_GAP; zh = WALL + 6; }
                else { zw = WALL + 6; zh = DOOR_GAP; }
                const zone = this.add.rectangle(pos.x, pos.y, zw, zh, 0x000000, 0);
                this.physics.add.existing(zone, true);
                zone.setData('exitData', exit);
                this.exitZones.add(zone);
            }
        }
    }

    getExitPos(exit) {
        const W = this.scale.width, H = this.scale.height;
        const p = exit.position || 0.5;
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
        const H = this.scale.height, W = this.scale.width;
        this.hud = {};

        // Room name with background
        const roomName = this.roomSpec.name || '';
        const rnW = Math.max(60, roomName.length * 7 + 16);
        this.hud.roomNameBg = this.add.rectangle(W / 2, 6, rnW, 14, 0x000000, 0.5)
            .setOrigin(0.5, 0).setDepth(30);
        this.hud.roomName = this.add.text(W / 2, 8, roomName, {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#888888'
        }).setOrigin(0.5, 0).setDepth(31);

        // HP section
        this.hud.hpIcon = this.add.image(WALL + 8, WALL + 10, 'hp_heart').setScale(0.9).setDepth(31);
        this.hud.hpBarBg = this.add.rectangle(WALL + 20, WALL + 7, 80, 8, 0x333333).setOrigin(0, 0).setDepth(30);
        this.hud.hpBar = this.add.rectangle(WALL + 20, WALL + 7, 80, 8, 0xffff00).setOrigin(0, 0).setDepth(30);
        this.hud.hpText = this.add.text(WALL + 104, WALL + 5, '', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#ffffff'
        }).setDepth(31);

        // Gold/credits
        this.hud.gold = this.add.text(W - WALL - 4, WALL + 5, '', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#ffd700', align: 'right'
        }).setOrigin(1, 0).setDepth(31);

        // Chapter indicator
        this.hud.chapter = this.add.text(W - WALL - 4, WALL + 16, `CH ${storyState.chapter}`, {
            fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#444444', align: 'right'
        }).setOrigin(1, 0).setDepth(31);

        // Interaction prompt (floating near player)
        this.promptText = this.add.text(W / 2, H - WALL - 16, '', {
            fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#ffff00',
            shadow: { offsetX: 0, offsetY: 0, color: '#ffff00', blur: 8, fill: true },
            backgroundColor: '#00000088', padding: { x: 6, y: 3 }
        }).setOrigin(0.5).setDepth(30).setVisible(false);

        this.updateHUD();
    }

    updateHUD() {
        const ratio = storyState.hp / storyState.maxHp;
        this.hud.hpBar.setSize(80 * ratio, 8);
        const hpColor = ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffff00 : 0xff4444;
        this.hud.hpBar.setFillStyle(hpColor);
        this.hud.hpText.setText(`${storyState.hp}/${storyState.maxHp}`);

        const curr = storyState.theme === 'medieval' ? 'G' : 'CR';
        this.hud.gold.setText(storyState.gold > 0 ? `${storyState.gold} ${curr}` : '');

        if (storyState.inventory.length > 0) {
            this.hud.chapter.setText(`CH${storyState.chapter} | ${storyState.inventory.length} items`);
        }
    }

    // === INTERACTION ===

    checkProximity() {
        const threshold = 50;
        let closest = null, closestDist = Infinity;

        const checkTarget = (id, entry) => {
            if (!entry.sprite?.active) return;
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, entry.sprite.x, entry.sprite.y);
            if (d < threshold && d < closestDist) { closest = { id, ...entry }; closestDist = d; }
        };

        for (const [id, entry] of Object.entries(this.npcDataMap)) checkTarget(id, entry);
        for (const [id, entry] of Object.entries(this.enemyDataMap)) checkTarget(id, entry);

        this.nearTarget = closest;
        if (closest) {
            let label;
            if (closest.type === 'enemy') label = '⚔ FIGHT [Z]';
            else if (closest.type === 'interactable') label = '▶ USE [Z]';
            else label = '💬 TALK [Z]';
            this.promptText.setText(label).setVisible(true);
            this.promptText.setPosition(this.player.x, this.player.y - 28);
        } else {
            this.promptText.setVisible(false);
        }
    }

    interact(target) {
        if (target.type === 'npc') {
            this.startNPCDialogue(target.data);
        } else if (target.type === 'enemy') {
            this.startCombat(target.data);
        } else if (target.type === 'interactable') {
            this.interactWithObject(target.data);
        }
    }

    // === DIALOGUE SYSTEM ===

    initDialogue() {
        const W = this.scale.width, H = this.scale.height;
        const boxH = 130, boxY = H - boxH - 6, boxW = W - 24;
        this.dlgBoxY = boxY;

        this.dlg = {};

        // Outer border glow
        this.dlg.bgGlow = this.add.rectangle(W / 2, boxY + boxH / 2, boxW + 6, boxH + 6, 0xffffff, 0.05)
            .setDepth(49).setVisible(false);

        // Main box
        this.dlg.bg = this.add.rectangle(W / 2, boxY + boxH / 2, boxW, boxH, 0x000000)
            .setStrokeStyle(3, 0xffffff).setDepth(50).setVisible(false);

        // Name plate with background
        this.dlg.nameBg = this.add.rectangle(20, boxY - 1, 10, 16, 0x000000)
            .setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff).setDepth(50).setVisible(false);
        this.dlg.nameText = this.add.text(26, boxY - 1, '', {
            fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#ffff00'
        }).setOrigin(0, 0.5).setDepth(51).setVisible(false);

        // Dialogue text (asterisk prefix like Undertale)
        this.dlg.text = this.add.text(22, boxY + 18, '', {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffffff',
            wordWrap: { width: boxW - 40 }, lineSpacing: 6
        }).setDepth(51).setVisible(false);

        // Continue prompt
        this.dlg.arrow = this.add.text(W - 36, boxY + boxH - 20, '▼ Z', {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffff00'
        }).setDepth(51).setVisible(false);

        // Choice UI
        this.dlg.choiceTexts = [];
        for (let i = 0; i < 4; i++) {
            this.dlg.choiceTexts.push(this.add.text(50, boxY + 20 + i * 22, '', {
                fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffffff'
            }).setDepth(51).setVisible(false));
        }
        this.dlg.choiceCursor = this.add.image(30, boxY + 24, 'soul').setScale(0.5)
            .setDepth(51).setVisible(false);

        this.dlgState = {
            lines: [], lineIdx: 0, choices: [], choiceIdx: 0,
            showingChoices: false, typing: false, displayedText: '',
            fullText: '', charTimer: null, npcName: '', onChoiceSelect: null, onEnd: null
        };
    }

    showDialogue(npcName, lines, choices, onChoiceSelect, onEnd) {
        this.mode = 'dialogue';
        this.player.setVelocity(0);

        const s = this.dlgState;
        s.lines = lines || [];
        s.lineIdx = 0;
        s.choices = choices || [];
        s.choiceIdx = 0;
        s.showingChoices = false;
        s.npcName = npcName;
        s.onChoiceSelect = onChoiceSelect;
        s.onEnd = onEnd;

        this.dlg.bg.setVisible(true);
        this.dlg.bgGlow.setVisible(true);
        this.dlg.arrow.setVisible(false);
        this.dlg.choiceCursor.setVisible(false);
        this.dlg.choiceTexts.forEach(t => t.setVisible(false).setText(''));

        // Name plate
        if (npcName) {
            const nw = npcName.length * 9 + 16;
            this.dlg.nameBg.setSize(nw, 16).setVisible(true);
            this.dlg.nameText.setText(npcName).setVisible(true);
        } else {
            this.dlg.nameBg.setVisible(false);
            this.dlg.nameText.setVisible(false);
        }

        if (s.lines.length > 0) {
            this.typeText(s.lines[0]);
        } else if (s.choices.length > 0) {
            this.showChoices();
        }
    }

    typeText(text) {
        const s = this.dlgState;
        s.typing = true;
        // Undertale-style asterisk prefix for narration
        const prefix = s.npcName ? '' : '* ';
        s.fullText = prefix + text;
        s.displayedText = '';
        this.dlg.text.setText('').setVisible(true);
        this.dlg.arrow.setVisible(false);

        let ci = 0;
        if (s.charTimer) s.charTimer.destroy();
        s.charTimer = this.time.addEvent({
            delay: 25, loop: true,
            callback: () => {
                if (ci < s.fullText.length) {
                    s.displayedText += s.fullText[ci];
                    this.dlg.text.setText(s.displayedText);
                    ci++;
                    // Typing sound every few chars
                    if (ci % 3 === 0) this.playSound('type');
                } else {
                    s.charTimer.destroy();
                    s.typing = false;
                    this.dlg.arrow.setVisible(true);
                    this.tweens.killTweensOf(this.dlg.arrow);
                    this.dlg.arrow.setAlpha(1);
                    this.tweens.add({
                        targets: this.dlg.arrow, alpha: 0.3, duration: 400,
                        yoyo: true, repeat: -1
                    });
                }
            }
        });
    }

    advanceDialogue() {
        const s = this.dlgState;
        if (s.typing) {
            if (s.charTimer) s.charTimer.destroy();
            s.typing = false;
            this.dlg.text.setText(s.fullText);
            this.dlg.arrow.setVisible(true);
            return;
        }

        s.lineIdx++;
        if (s.lineIdx < s.lines.length) {
            this.typeText(s.lines[s.lineIdx]);
        } else if (s.choices.length > 0 && !s.showingChoices) {
            this.showChoices();
        } else {
            this.endDialogue();
        }
    }

    showChoices() {
        const s = this.dlgState;
        s.showingChoices = true;
        s.choiceIdx = 0;
        this.dlg.text.setVisible(false);
        this.dlg.arrow.setVisible(false);

        s.choices.forEach((ch, i) => {
            if (i < this.dlg.choiceTexts.length) {
                this.dlg.choiceTexts[i].setText(ch.text).setVisible(true);
            }
        });
        this.dlg.choiceCursor.setVisible(true);
        this.updateChoiceDisplay();
    }

    updateChoiceDisplay() {
        const s = this.dlgState;
        this.dlg.choiceTexts.forEach((t, i) => t.setColor(i === s.choiceIdx ? '#ffff00' : '#aaaaaa'));
        if (this.dlg.choiceTexts[s.choiceIdx]) {
            this.dlg.choiceCursor.setY(this.dlg.choiceTexts[s.choiceIdx].y + 4);
        }
    }

    selectChoice() {
        const s = this.dlgState;
        if (!s.showingChoices) return;
        const choice = s.choices[s.choiceIdx];
        s.showingChoices = false;
        this.dlg.choiceCursor.setVisible(false);
        this.dlg.choiceTexts.forEach(t => t.setVisible(false));

        if (s.onChoiceSelect) {
            s.onChoiceSelect(choice);
        } else {
            this.endDialogue();
        }
    }

    endDialogue() {
        this.dlg.bg.setVisible(false);
        this.dlg.bgGlow.setVisible(false);
        this.dlg.nameBg.setVisible(false);
        this.dlg.nameText.setVisible(false);
        this.dlg.text.setVisible(false);
        this.dlg.arrow.setVisible(false);
        this.dlg.choiceCursor.setVisible(false);
        this.dlg.choiceTexts.forEach(t => t.setVisible(false));
        this.tweens.killTweensOf(this.dlg.arrow);
        this.dlg.arrow.setAlpha(1);

        const cb = this.dlgState.onEnd;
        this.dlgState = {
            lines: [], lineIdx: 0, choices: [], choiceIdx: 0,
            showingChoices: false, typing: false, displayedText: '',
            fullText: '', charTimer: null, npcName: '', onChoiceSelect: null, onEnd: null
        };
        this.mode = 'explore';
        if (cb) cb();
    }

    // === NPC DIALOGUE ===

    startNPCDialogue(npcData) {
        storyState.meetNPC(npcData.id);
        this.playSound('interact');

        this.showDialogue(
            npcData.name,
            npcData.initial_dialogue || ['...'],
            npcData.initial_choices || [],
            (choice) => this.handleNPCChoice(npcData, choice),
            null
        );
    }

    async handleNPCChoice(npcData, choice) {
        this.playSound('interact');

        // Show thinking indicator
        this.dlg.text.setText('  . . .').setVisible(true);
        this.dlg.choiceTexts.forEach(t => t.setVisible(false));
        this.dlg.choiceCursor.setVisible(false);

        // Animate the dots
        let dotCount = 0;
        const dotTimer = this.time.addEvent({
            delay: 300, loop: true,
            callback: () => {
                dotCount = (dotCount + 1) % 4;
                this.dlg.text.setText('  ' + '. '.repeat(dotCount + 1));
            }
        });

        const gemini = this.registry.get('geminiClient');
        if (!gemini) { dotTimer.destroy(); this.endDialogue(); return; }

        try {
            const result = await gemini.talkToNPC(
                npcData.id, npcData.name, choice.id, storyState.toContext()
            );
            dotTimer.destroy();
            this.applyEffects(result.effects);
            this.updateHUD();

            this.showDialogue(
                npcData.name,
                result.dialogue || ['...'],
                result.choices || [],
                result.choices?.length ? (ch) => this.handleNPCChoice(npcData, ch) : null,
                () => {
                    if (result.effects?.trigger_combat) {
                        const enemy = this.roomSpec.enemies?.find(e => e.id === result.effects.trigger_combat);
                        if (enemy) this.startCombat(enemy);
                    }
                }
            );
        } catch (err) {
            console.error('NPC dialogue error:', err);
            dotTimer.destroy();
            this.showDialogue(npcData.name, ['...the words fade away.'], [], null, null);
        }
    }

    // === INTERACTABLE OBJECTS ===

    async interactWithObject(objData) {
        this.playSound('interact');

        if (objData.locked && objData.requires_item) {
            if (storyState.hasItem(objData.requires_item)) {
                storyState.removeItem(objData.requires_item);
                objData.locked = false;
                const entry = this.npcDataMap[`inter_${objData.id}`];
                if (entry?.lockIcon) entry.lockIcon.destroy();
                this.showDialogue('', [`Used ${objData.requires_item}. It's now open!`], [], null, null);
                storyState.logEvent(`unlocked:${objData.id}`);
            } else {
                this.showDialogue('', ['It\'s locked. You need something to open it.'], [], null, null);
            }
            return;
        }

        if (objData.interact_text) {
            this.showDialogue('', objData.interact_text, [], null, () => {
                if (objData.interact_effect) this.applyEffects(objData.interact_effect);
                this.updateHUD();
            });
            return;
        }

        const gemini = this.registry.get('geminiClient');
        if (!gemini) { this.showDialogue('', ['Nothing happens.'], [], null, null); return; }

        this.showDialogue('', ['...'], [], null, null);
        try {
            const result = await gemini.interactObject(objData.id, objData, storyState.toContext());
            this.applyEffects(result.effects);
            this.updateHUD();
            this.endDialogue();
            this.showDialogue('', result.dialogue || ['Nothing happens.'], [], null, null);
        } catch (err) {
            this.endDialogue();
            this.showDialogue('', ['Nothing happens.'], [], null, null);
        }
    }

    // === EFFECTS ===

    applyEffects(effects) {
        if (!effects) return;
        if (effects.give_item && typeof effects.give_item === 'object') {
            const added = storyState.addItem(effects.give_item);
            if (added) this.playSound('item');
        }
        if (effects.take_item) storyState.removeItem(effects.take_item);
        if (effects.set_flag) storyState.setFlag(effects.set_flag.key, effects.set_flag.value);
        if (effects.heal) storyState.heal(effects.heal);
        if (effects.give_gold) storyState.addGold(effects.give_gold);
        if (effects.open_path) {
            for (const exit of (this.roomSpec.exits || [])) {
                if (exit.id === effects.open_path) {
                    exit.blocked = false;
                    const pos = this.getExitPos(exit);
                    const zw = (exit.direction === 'top' || exit.direction === 'bottom') ? DOOR_GAP : WALL + 6;
                    const zh = (exit.direction === 'top' || exit.direction === 'bottom') ? WALL + 6 : DOOR_GAP;
                    const zone = this.add.rectangle(pos.x, pos.y, zw, zh, 0x000000, 0);
                    this.physics.add.existing(zone, true);
                    zone.setData('exitData', exit);
                    this.exitZones.add(zone);
                    this.physics.add.overlap(this.player, zone, this.onExit, null, this);
                }
            }
            for (const inter of (this.roomSpec.interactables || [])) {
                if (inter.id === effects.open_path) inter.locked = false;
            }
        }
    }

    // === ITEMS ===

    onItem(player, itemSprite) {
        const data = itemSprite.getData('itemData');
        if (!data) return;
        itemSprite.setData('itemData', null);
        if (itemSprite.body) itemSprite.body.enable = false;

        const added = storyState.addItem(data);
        if (added) {
            this.playSound('item');
            storyState.logEvent(`found:${data.id}`);
            this.tweens.add({
                targets: itemSprite, y: itemSprite.y - 20, alpha: 0, scaleX: 2, scaleY: 2,
                duration: 300, onComplete: () => itemSprite.destroy()
            });
            this.showDialogue('', [`Found: ${data.name}`, data.description || ''], [], null, null);
            this.updateHUD();
        } else {
            this.showDialogue('', ['Inventory full!'], [], null, null);
            itemSprite.setData('itemData', data);
            if (itemSprite.body) itemSprite.body.enable = true;
        }
    }

    // === COMBAT ===

    startCombat(enemyData) {
        this.transitioning = true;
        this.cameras.main.shake(300, 0.02);
        this.time.delayedCall(400, () => {
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('CombatScene', {
                    enemy: enemyData,
                    roomSpec: this.roomSpec,
                    entryDirection: this.entryDirection
                });
            });
        });
    }

    // === EXITS ===

    onExit(player, zone) {
        if (this.transitioning || this.mode !== 'explore') return;
        this.transitioning = true;
        const exit = zone.getData('exitData');
        if (exit.requires_item && !storyState.hasItem(exit.requires_item)) {
            this.transitioning = false;
            this.showDialogue('', ['The way is blocked...'], [], null, null);
            return;
        }

        storyState.logEvent(`exited:${exit.direction}:${exit.label || ''}`);
        this.playSound('exit');

        const opposites = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
        const entryDir = opposites[exit.direction] || 'bottom';
        const trigger = `exited ${exit.direction} toward "${exit.label || 'unknown'}"`;

        this.cameras.main.flash(200, 255, 255, 255);
        this.cameras.main.once('cameraflashcomplete', () => {
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('TransitionScene', { trigger, entryDirection: entryDir });
            });
        });
    }

    // === AUDIO ===

    setupAudio() {
        if (this.registry.get('audioCtx')) {
            this.audioCtx = this.registry.get('audioCtx');
        } else {
            try {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                this.registry.set('audioCtx', this.audioCtx);
            } catch (e) { this.audioCtx = null; }
        }
    }

    playSound(type) {
        if (!this.audioCtx) return;
        const ctx = this.audioCtx, now = ctx.currentTime;
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        switch (type) {
            case 'interact':
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(660, now + 0.05);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                osc.start(now); osc.stop(now + 0.12); break;
            case 'item':
                osc.frequency.setValueAtTime(523, now);
                osc.frequency.setValueAtTime(659, now + 0.06);
                osc.frequency.setValueAtTime(784, now + 0.12);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.start(now); osc.stop(now + 0.2); break;
            case 'exit':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now); osc.stop(now + 0.3); break;
            case 'type':
                osc.type = 'square';
                osc.frequency.setValueAtTime(Phaser.Math.Between(180, 260), now);
                gain.gain.setValueAtTime(0.03, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                osc.start(now); osc.stop(now + 0.04); break;
        }
    }
}
