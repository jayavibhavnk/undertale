import storyState from './storyState.js';

const BOX_W = 360, BOX_H = 170, SOUL_SPEED = 200;

export default class CombatScene extends Phaser.Scene {
    constructor() { super('CombatScene'); }

    init(data) {
        this.enemyData = data.enemy;
        this.returnRoom = data.roomSpec;
        this.returnEntry = data.entryDirection || 'bottom';
    }

    create() {
        const W = this.scale.width, H = this.scale.height;
        this.cameras.main.setBackgroundColor('#000000');

        this.enemyHp = this.enemyData.hp;
        this.enemyMaxHp = this.enemyData.hp;
        this.enemyWeakened = false;
        this.spareProgress = 0;
        this.turnCount = 0;
        this.phase = 'intro';
        this.menuIndex = 0;
        this.subMenuIndex = 0;
        this.subMenuOpen = null;

        // Box bounds
        this.boxX = (W - BOX_W) / 2;
        this.boxY = 170;
        this.boxR = this.boxX + BOX_W;
        this.boxB = this.boxY + BOX_H;

        // Background atmosphere
        for (let i = 0; i < 20; i++) {
            const s = this.add.rectangle(
                Phaser.Math.Between(0, W), Phaser.Math.Between(0, H),
                1, 1, 0xffffff, Phaser.Math.FloatBetween(0.05, 0.15)
            );
            this.tweens.add({
                targets: s, alpha: 0, duration: Phaser.Math.Between(1500, 4000),
                yoyo: true, repeat: -1
            });
        }

        // Enemy display
        const eColor = Phaser.Display.Color.HexStringToColor(this.enemyData.color || '#ff4444').color;
        this.enemyGlow = this.add.ellipse(W / 2, 80, 80, 40, eColor, 0.1);
        this.tweens.add({
            targets: this.enemyGlow, alpha: 0.2, scaleX: 1.2, scaleY: 1.2,
            duration: 1000, yoyo: true, repeat: -1
        });
        this.enemySprite = this.add.image(W / 2, 65, 'enemy').setScale(2.8).setTint(eColor);

        this.enemyNameText = this.add.text(W / 2, 110, this.enemyData.name || 'Enemy', {
            fontFamily: '"Press Start 2P"', fontSize: '11px', color: '#ffffff'
        }).setOrigin(0.5);

        // Enemy HP bar
        this.add.rectangle(W / 2, 130, 204, 14, 0x222222).setStrokeStyle(2, 0x444444);
        this.enemyHpBar = this.add.rectangle(W / 2 - 100, 130, 200, 10, 0x00ff00).setOrigin(0, 0.5);

        // Combat dialogue area (above box)
        this.combatText = this.add.text(W / 2, 155, '', {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#aaaaaa',
            wordWrap: { width: BOX_W - 20 }
        }).setOrigin(0.5).setDepth(5);

        // Combat box
        this.add.rectangle(W / 2, this.boxY + BOX_H / 2, BOX_W + 4, BOX_H + 4, 0xffffff, 0.05);
        this.add.rectangle(W / 2, this.boxY + BOX_H / 2, BOX_W, BOX_H, 0x000000).setStrokeStyle(3, 0xffffff);

        // Soul
        this.soul = this.physics.add.sprite(W / 2, this.boxY + BOX_H / 2, 'soul');
        this.soul.setScale(0.7).setDepth(10);
        this.soul.body.setSize(10, 10);

        // Bullets
        this.bullets = this.physics.add.group();
        this.physics.add.overlap(this.soul, this.bullets, this.onHit, null, this);

        // Player info bar
        const infoY = this.boxB + 16;
        this.add.text(20, infoY, storyState.playerName, {
            fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#ffffff'
        });
        this.add.text(20, infoY + 16, `LV ${storyState.level}`, {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffff00'
        });

        this.add.image(120, infoY + 8, 'hp_heart').setScale(0.8);
        this.add.rectangle(140, infoY + 8, 102, 12, 0x333333);
        this.hpBar = this.add.rectangle(90, infoY + 8, 100, 10, 0xffff00).setOrigin(0, 0.5);
        this.hpText = this.add.text(195, infoY + 1, '', {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffffff'
        });
        this.updatePlayerHP();

        // Menu buttons - FIGHT / ACT / ITEM / MERCY
        const menuY = infoY + 38;
        const labels = ['FIGHT', 'ACT', 'ITEM', 'MERCY'];
        this.menuItems = [];
        labels.forEach((label, i) => {
            const x = 50 + i * 150;
            const bg = this.add.rectangle(x, menuY, 120, 22, 0x000000).setStrokeStyle(2, 0xff6600);
            const t = this.add.text(x, menuY, label, {
                fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#ffffff'
            }).setOrigin(0.5);
            this.menuItems.push({ bg, t, label });
        });

        this.menuSoul = this.add.image(0, 0, 'soul').setScale(0.5).setVisible(false);

        // Submenu area (replaces combat box content)
        this.subMenuTexts = [];
        for (let i = 0; i < 6; i++) {
            this.subMenuTexts.push(this.add.text(this.boxX + 30, this.boxY + 12 + i * 22, '', {
                fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffffff'
            }).setDepth(11).setVisible(false));
        }
        this.subMenuCursor = this.add.image(this.boxX + 14, 0, 'soul').setScale(0.4).setDepth(11).setVisible(false);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.xKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

        this.iframes = 0;
        this.cameras.main.fadeIn(300);
        this.showIntro();
    }

    update(time, delta) {
        if (this.iframes > 0) this.iframes -= delta;

        if (this.phase === 'dodge') {
            this.soul.setVelocity(0);
            let vx = 0, vy = 0;
            if (this.cursors.left.isDown) vx = -SOUL_SPEED;
            else if (this.cursors.right.isDown) vx = SOUL_SPEED;
            if (this.cursors.up.isDown) vy = -SOUL_SPEED;
            else if (this.cursors.down.isDown) vy = SOUL_SPEED;
            if (vx && vy) { vx *= 0.707; vy *= 0.707; }
            this.soul.setVelocity(vx, vy);
            this.soul.x = Phaser.Math.Clamp(this.soul.x, this.boxX + 8, this.boxR - 8);
            this.soul.y = Phaser.Math.Clamp(this.soul.y, this.boxY + 8, this.boxB - 8);

            this.bullets.children.each(b => {
                if (b.active && (b.x < this.boxX - 20 || b.x > this.boxR + 20 ||
                    b.y < this.boxY - 20 || b.y > this.boxB + 20)) b.destroy();
            });
        }

        if (this.phase === 'menu') {
            if (this.subMenuOpen) {
                if (Phaser.Input.Keyboard.JustDown(this.cursors.up))
                    this.subMenuIndex = Math.max(0, this.subMenuIndex - 1);
                if (Phaser.Input.Keyboard.JustDown(this.cursors.down))
                    this.subMenuIndex = Math.min(this.subMenuItems.length - 1, this.subMenuIndex + 1);
                this.updateSubMenu();
                if (Phaser.Input.Keyboard.JustDown(this.zKey)) this.selectSubMenu();
                if (Phaser.Input.Keyboard.JustDown(this.xKey)) this.closeSubMenu();
            } else {
                if (Phaser.Input.Keyboard.JustDown(this.cursors.left))
                    this.menuIndex = Math.max(0, this.menuIndex - 1);
                if (Phaser.Input.Keyboard.JustDown(this.cursors.right))
                    this.menuIndex = Math.min(3, this.menuIndex + 1);
                this.updateMenu();
                if (Phaser.Input.Keyboard.JustDown(this.zKey)) this.selectMenu();
            }
        }

        if (this.phase === 'intro' || this.phase === 'text') {
            if (Phaser.Input.Keyboard.JustDown(this.zKey) && this.textCallback) this.textCallback();
        }
    }

    // --- UI ---
    updatePlayerHP() {
        const ratio = storyState.hp / storyState.maxHp;
        this.hpBar.setSize(100 * ratio, 10);
        this.hpBar.setFillStyle(ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffff00 : 0xff4444);
        this.hpText.setText(`${storyState.hp} / ${storyState.maxHp}`);
    }

    updateMenu() {
        this.menuItems.forEach((m, i) => {
            m.bg.setStrokeStyle(2, i === this.menuIndex ? 0xffff00 : 0xff6600);
            m.t.setColor(i === this.menuIndex ? '#ffff00' : '#ffffff');
        });
        const sel = this.menuItems[this.menuIndex];
        this.menuSoul.setVisible(true).setPosition(sel.bg.x - 58, sel.bg.y);
    }

    // --- PHASES ---
    showIntro() {
        this.phase = 'intro';
        this.soul.setVisible(false);
        const lines = this.enemyData.intro_dialogue || [`${this.enemyData.name} blocks your path!`];
        this.combatText.setText(lines.join('\n'));
        this.textCallback = () => this.startMenu();
    }

    startMenu() {
        this.phase = 'menu';
        this.menuIndex = 0;
        this.subMenuOpen = null;
        this.soul.setVisible(false);
        this.menuSoul.setVisible(true);
        this.combatText.setText('');
        this.updateMenu();
        this.clearSubMenu();
    }

    selectMenu() {
        const choice = ['fight', 'act', 'item', 'mercy'][this.menuIndex];
        if (choice === 'fight') this.doFight();
        else if (choice === 'act') this.openACT();
        else if (choice === 'item') this.openITEM();
        else if (choice === 'mercy') this.doMercy();
    }

    // --- FIGHT ---
    doFight() {
        this.phase = 'text';
        this.menuSoul.setVisible(false);
        const atk = storyState.getATK();
        const enemyDef = Math.floor(this.enemyData.atk / 3);
        const dmg = Math.max(1, atk - enemyDef + Phaser.Math.Between(-1, 2));
        this.enemyHp = Math.max(0, this.enemyHp - dmg);

        this.cameras.main.shake(150, 0.015);
        this.tweens.add({ targets: this.enemySprite, alpha: 0.2, duration: 80, yoyo: true, repeat: 3 });
        this.enemyHpBar.setSize(200 * (this.enemyHp / this.enemyMaxHp), 10);

        this.combatText.setText(`You dealt ${dmg} damage!`);
        this.textCallback = () => this.enemyHp <= 0 ? this.victory() : this.startDodge();
    }

    // --- ACT ---
    openACT() {
        this.subMenuOpen = 'act';
        this.subMenuIndex = 0;
        this.subMenuItems = this.enemyData.act_options || [
            { id: 'check', text: 'Check', response: `${this.enemyData.name}. ATK ${this.enemyData.atk}.`, effect: 'none' }
        ];
        this.showSubMenu(this.subMenuItems.map(a => a.text));
    }

    selectACT() {
        const act = this.subMenuItems[this.subMenuIndex];
        this.closeSubMenu();
        this.phase = 'text';
        this.menuSoul.setVisible(false);

        let response = act.response || '...';
        if (act.effect === 'weaken') {
            this.enemyWeakened = true;
            this.enemyData.atk = Math.max(1, Math.floor(this.enemyData.atk * 0.6));
        } else if (act.effect === 'spare_progress') {
            this.spareProgress++;
        } else if (act.effect === 'heal_self') {
            storyState.heal(5);
            this.updatePlayerHP();
        }

        this.combatText.setText(response);
        this.textCallback = () => this.startDodge();
    }

    // --- ITEM ---
    openITEM() {
        const consumables = storyState.inventory.filter(i => i.type === 'consumable');
        if (consumables.length === 0) {
            this.combatText.setText('No items to use.');
            this.phase = 'text';
            this.textCallback = () => this.startMenu();
            return;
        }
        this.subMenuOpen = 'item';
        this.subMenuIndex = 0;
        this.subMenuItems = consumables;
        this.showSubMenu(consumables.map(i => `${i.name} ${i.effect?.heal ? `(+${i.effect.heal}HP)` : ''}`));
    }

    selectITEM() {
        const item = this.subMenuItems[this.subMenuIndex];
        this.closeSubMenu();
        this.phase = 'text';
        this.menuSoul.setVisible(false);

        storyState.removeItem(item.id);
        if (item.effect?.heal) {
            storyState.heal(item.effect.heal);
            this.updatePlayerHP();
            this.combatText.setText(`Used ${item.name}. Recovered ${item.effect.heal} HP!`);
        } else {
            this.combatText.setText(`Used ${item.name}.`);
        }
        this.textCallback = () => this.startDodge();
    }

    // --- MERCY ---
    doMercy() {
        this.phase = 'text';
        this.menuSoul.setVisible(false);

        const cond = this.enemyData.spare_condition || 'spare_progress:2';
        let canSpare = false;
        if (cond === 'always') canSpare = true;
        else if (cond === 'hp_below_half') canSpare = this.enemyHp <= this.enemyMaxHp / 2;
        else if (cond.startsWith('spare_progress:')) {
            const needed = parseInt(cond.split(':')[1]) || 2;
            canSpare = this.spareProgress >= needed;
        } else if (cond.startsWith('after_') && cond.endsWith('_turns')) {
            canSpare = this.turnCount >= (parseInt(cond.split('_')[1]) || 3);
        } else if (cond.startsWith('has_item:')) {
            canSpare = storyState.hasItem(cond.split(':')[1]);
        }

        if (canSpare) {
            const lines = this.enemyData.spare_dialogue || ['The enemy retreats peacefully.'];
            this.combatText.setText(lines.join('\n'));
            this.textCallback = () => this.spare();
        } else {
            this.combatText.setText(`${this.enemyData.name} isn't ready to back down.`);
            this.textCallback = () => this.startDodge();
        }
    }

    // --- SUBMENU ---
    showSubMenu(labels) {
        this.soul.setVisible(false);
        labels.forEach((l, i) => {
            if (i < this.subMenuTexts.length) this.subMenuTexts[i].setText(l).setVisible(true);
        });
        this.subMenuCursor.setVisible(true);
        this.updateSubMenu();
    }

    updateSubMenu() {
        this.subMenuTexts.forEach((t, i) => t.setColor(i === this.subMenuIndex ? '#ffff00' : '#aaaaaa'));
        if (this.subMenuTexts[this.subMenuIndex]?.visible) {
            this.subMenuCursor.setY(this.subMenuTexts[this.subMenuIndex].y + 5);
        }
    }

    selectSubMenu() {
        if (this.subMenuOpen === 'act') this.selectACT();
        else if (this.subMenuOpen === 'item') this.selectITEM();
    }

    closeSubMenu() {
        this.subMenuOpen = null;
        this.clearSubMenu();
        this.startMenu();
    }

    clearSubMenu() {
        this.subMenuTexts.forEach(t => t.setVisible(false).setText(''));
        this.subMenuCursor.setVisible(false);
    }

    // --- DODGE PHASE ---
    startDodge() {
        this.phase = 'dodge';
        this.turnCount++;
        this.combatText.setText('');
        this.soul.setVisible(true);
        this.soul.setPosition(this.scale.width / 2, this.boxY + BOX_H / 2);
        this.menuSoul.setVisible(false);
        this.clearSubMenu();

        const patterns = this.enemyData.patterns || [{ type: 'horizontal_sweep', speed: 2, count: 5, duration: 5000 }];
        const pattern = patterns[(this.turnCount - 1) % patterns.length];
        this.runPattern(pattern);
    }

    runPattern(pattern) {
        const dur = pattern.duration || 5000;
        const speed = (pattern.speed || 2) * (this.enemyWeakened ? 40 : 60);
        const count = pattern.count || 5;
        const interval = dur / (count + 2);

        let spawned = 0;
        this.patternTimer = this.time.addEvent({
            delay: interval, repeat: count - 1,
            callback: () => { spawned++; this.spawnBullets(pattern.type, speed, spawned, count); }
        });
        this.time.delayedCall(dur, () => this.endDodge());
    }

    spawnBullets(type, speed, index, total) {
        const cx = this.scale.width / 2;
        switch (type) {
            case 'horizontal_sweep': {
                const fromLeft = index % 2 === 0;
                const y = this.boxY + 15 + ((index / total) * (BOX_H - 30));
                const b = this.bullets.create(fromLeft ? this.boxX - 10 : this.boxR + 10, y, 'bullet_circle');
                b.setTint(0xffffff); b.setVelocityX(fromLeft ? speed : -speed); b.body.setSize(6, 6);
                break;
            }
            case 'vertical_rain': {
                for (let i = 0; i < 3; i++) {
                    const x = this.boxX + 15 + Math.random() * (BOX_W - 30);
                    const b = this.bullets.create(x, this.boxY - 10, 'bullet_diamond');
                    b.setTint(0x44aaff); b.setVelocityY(speed); b.body.setSize(6, 6);
                }
                break;
            }
            case 'aimed_shots': {
                const angle = Phaser.Math.Angle.Between(cx, this.boxY, this.soul.x, this.soul.y);
                const b = this.bullets.create(cx, this.boxY + 5, 'bullet_diamond');
                b.setTint(0xff4444); b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed); b.body.setSize(6, 6);
                break;
            }
            case 'spiral': {
                const a = (index / total) * Math.PI * 4;
                for (let i = 0; i < 2; i++) {
                    const angle = a + i * Math.PI;
                    const b = this.bullets.create(cx, this.boxY + BOX_H / 2, 'bullet_circle');
                    b.setTint(0xff66ff);
                    b.setVelocity(Math.cos(angle) * speed * 0.7, Math.sin(angle) * speed * 0.7);
                    b.body.setSize(6, 6);
                }
                break;
            }
            case 'wave': {
                for (let i = 0; i < 4; i++) {
                    const y = this.boxY + 10 + (i * BOX_H / 4);
                    const gap = (Math.sin(index + i) + 1) * 0.3 + 0.2;
                    if (Math.abs((y - this.boxY) / BOX_H - gap) > 0.15) {
                        const b = this.bullets.create(this.boxX - 5, y, 'bullet_circle');
                        b.setTint(0x44ff88); b.setVelocityX(speed); b.body.setSize(6, 6);
                    }
                }
                break;
            }
            default: {
                for (let i = 0; i < 2; i++) {
                    const x = this.boxX + 10 + Math.random() * (BOX_W - 20);
                    const y = this.boxY + 10 + Math.random() * (BOX_H - 20);
                    const b = this.bullets.create(x, y, 'bullet_circle');
                    b.setTint(0xffff44); b.setScale(0); b.body.setSize(6, 6);
                    this.tweens.add({
                        targets: b, scaleX: 1, scaleY: 1, duration: 500,
                        onComplete: () => {
                            if (b.active) {
                                const ang = Math.random() * Math.PI * 2;
                                b.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
                            }
                        }
                    });
                }
            }
        }
    }

    endDodge() {
        if (this.patternTimer) this.patternTimer.destroy();
        this.bullets.clear(true, true);
        this.soul.setVelocity(0);
        this.startMenu();
    }

    // --- DAMAGE ---
    onHit(soul, bullet) {
        if (this.iframes > 0) return;
        bullet.destroy();
        this.iframes = 800;

        const dmg = storyState.takeDamage(this.enemyData.atk);
        this.updatePlayerHP();
        this.tweens.add({ targets: this.soul, alpha: 0.3, duration: 80, yoyo: true, repeat: 4 });
        this.cameras.main.shake(100, 0.01);

        if (storyState.hp <= 0) {
            this.phase = 'gameover';
            this.time.delayedCall(500, () => this.gameOver());
        }
    }

    // --- OUTCOMES ---
    victory() {
        this.phase = 'text';
        storyState.defeatEnemy(this.enemyData.id);

        const xp = this.enemyData.xp_reward || 20;
        const gold = this.enemyData.gold_reward || 10;
        storyState.addGold(gold);
        const leveled = storyState.gainXP(xp);

        const lines = this.enemyData.defeat_dialogue || ['You won!'];
        const curr = storyState.theme === 'medieval' ? 'gold' : 'credits';
        let rewardText = `\n+${xp} XP  +${gold} ${curr}`;
        if (leveled) rewardText += `\n\nLEVEL UP! LV ${storyState.level}!  HP+4 ATK+2 DEF+1`;

        this.combatText.setText(lines.join('\n') + rewardText);
        this.updatePlayerHP();

        if (leveled) {
            this.cameras.main.flash(300, 255, 255, 100);
        }

        this.textCallback = () => this.endCombat('victory');
    }

    spare() {
        storyState.spareEnemy(this.enemyData.id);
        const xp = Math.floor((this.enemyData.xp_reward || 20) * 0.6);
        const leveled = storyState.gainXP(xp);

        let txt = `+${xp} XP (mercy bonus)`;
        if (leveled) txt += `\n\nLEVEL UP! LV ${storyState.level}!`;

        this.combatText.setText(txt);
        this.updatePlayerHP();
        this.textCallback = () => this.endCombat('spared');
    }

    gameOver() {
        this.combatText.setText('Your soul shattered...\n\nPress ENTER to try again.');
        this.combatText.setColor('#ff4444');
        this.input.keyboard.once('keydown-ENTER', () => {
            storyState.hp = storyState.maxHp;
            storyState.gameOver = false;
            this.cameras.main.fadeOut(500);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('GameScene', { roomSpec: this.returnRoom, entryDirection: this.returnEntry });
            });
        });
    }

    endCombat(result) {
        const questComplete = storyState.checkQuestObjective('defeat', this.enemyData.id);
        if (questComplete) {
            const quest = storyState.completeQuest(questComplete);
            if (quest?.reward) {
                if (quest.reward.xp) storyState.gainXP(quest.reward.xp);
                if (quest.reward.gold) storyState.addGold(quest.reward.gold);
            }
        }

        this.cameras.main.fadeOut(500);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('GameScene', {
                roomSpec: this.returnRoom,
                entryDirection: this.returnEntry,
                combatResult: { enemyId: this.enemyData.id, result }
            });
        });
    }
}
