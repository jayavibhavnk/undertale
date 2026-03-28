import storyState from './storyState.js';

const BOX_W = 380, BOX_H = 180;
const SOUL_SPEED = 200;

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
        this.turnCount = 0;
        this.phase = 'intro';
        this.menuIndex = 0;

        // Box bounds
        this.boxX = (W - BOX_W) / 2;
        this.boxY = 180;
        this.boxR = this.boxX + BOX_W;
        this.boxB = this.boxY + BOX_H;

        // Enemy display
        const eColor = Phaser.Display.Color.HexStringToColor(this.enemyData.color || '#ff4444').color;
        this.enemySprite = this.add.image(W / 2, 70, 'enemy').setScale(2.5).setTint(eColor);

        this.enemyNameText = this.add.text(W / 2, 120, this.enemyData.name || 'Enemy', {
            fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#ffffff'
        }).setOrigin(0.5);

        // Enemy HP bar
        this.enemyHpBg = this.add.rectangle(W / 2, 140, 200, 10, 0x333333);
        this.enemyHpBar = this.add.rectangle(W / 2 - 100, 140, 200, 10, 0x00ff00).setOrigin(0, 0.5);

        // Combat box
        this.add.rectangle(W / 2, this.boxY + BOX_H / 2, BOX_W, BOX_H, 0x000000).setStrokeStyle(3, 0xffffff);

        // Soul
        this.soul = this.physics.add.sprite(W / 2, this.boxY + BOX_H / 2, 'soul');
        this.soul.setScale(0.7).setDepth(10);
        this.soul.body.setSize(10, 10);

        // Bullets group
        this.bullets = this.physics.add.group();
        this.physics.add.overlap(this.soul, this.bullets, this.onHit, null, this);

        // Player HP
        this.add.image(30, H - 60, 'hp_heart').setScale(1);
        this.playerHpText = this.add.text(50, H - 67, `HP ${storyState.hp}/${storyState.maxHp}`, {
            fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#ffffff'
        });
        this.hpBar = this.add.rectangle(50, H - 48, 150, 8, 0xffff00).setOrigin(0, 0.5);
        this.add.rectangle(50, H - 48, 150, 8, 0x333333).setOrigin(0, 0.5).setDepth(-1);

        // Menu buttons
        this.menuItems = [];
        const labels = ['FIGHT', 'MERCY'];
        labels.forEach((label, i) => {
            const x = W / 2 - 80 + i * 160;
            const y = H - 25;
            const t = this.add.text(x, y, label, {
                fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#ffffff'
            }).setOrigin(0.5);
            this.menuItems.push(t);
        });

        this.menuSoul = this.add.image(0, 0, 'soul').setScale(0.6).setVisible(false);

        // Dialogue text
        this.dialogueText = this.add.text(30, this.boxY + 10, '', {
            fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#ffffff',
            wordWrap: { width: BOX_W - 20 }, lineSpacing: 4
        }).setDepth(5);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);

        this.iframes = 0;
        this.cameras.main.fadeIn(300);

        // Start with intro
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

            // Constrain soul to box
            this.soul.x = Phaser.Math.Clamp(this.soul.x, this.boxX + 8, this.boxR - 8);
            this.soul.y = Phaser.Math.Clamp(this.soul.y, this.boxY + 8, this.boxB - 8);

            // Clean up off-screen bullets
            this.bullets.children.each(b => {
                if (b.active && (b.x < this.boxX - 20 || b.x > this.boxR + 20 ||
                    b.y < this.boxY - 20 || b.y > this.boxB + 20)) {
                    b.destroy();
                }
            });
        }

        if (this.phase === 'menu') {
            if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
                this.menuIndex = Math.max(0, this.menuIndex - 1);
                this.updateMenu();
            }
            if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
                this.menuIndex = Math.min(this.menuItems.length - 1, this.menuIndex + 1);
                this.updateMenu();
            }
            if (Phaser.Input.Keyboard.JustDown(this.zKey)) {
                this.selectMenuOption();
            }
        }

        if (this.phase === 'intro' || this.phase === 'text') {
            if (Phaser.Input.Keyboard.JustDown(this.zKey)) {
                if (this.phase === 'intro') this.startDodge();
                else if (this.textCallback) this.textCallback();
            }
        }
    }

    showIntro() {
        this.phase = 'intro';
        this.soul.setVisible(false);
        const lines = this.enemyData.intro_dialogue || [`${this.enemyData.name} appears!`];
        this.dialogueText.setText(lines.join('\n'));
    }

    startDodge() {
        this.phase = 'dodge';
        this.turnCount++;
        this.dialogueText.setText('');
        this.soul.setVisible(true);
        this.soul.setPosition(this.scale.width / 2, this.boxY + BOX_H / 2);
        this.menuSoul.setVisible(false);

        const patterns = this.enemyData.patterns || [{ type: 'horizontal_sweep', speed: 2, count: 5, duration: 5000 }];
        const pattern = patterns[(this.turnCount - 1) % patterns.length];
        this.runPattern(pattern);
    }

    runPattern(pattern) {
        const dur = pattern.duration || 5000;
        const speed = (pattern.speed || 2) * 60;
        const count = pattern.count || 5;

        const spawnInterval = dur / (count + 2);

        let spawned = 0;
        this.patternTimer = this.time.addEvent({
            delay: spawnInterval,
            repeat: count - 1,
            callback: () => {
                spawned++;
                this.spawnBullets(pattern.type, speed, spawned, count);
            }
        });

        this.time.delayedCall(dur, () => {
            this.endDodge();
        });
    }

    spawnBullets(type, speed, index, total) {
        const cx = this.scale.width / 2;

        switch (type) {
            case 'horizontal_sweep': {
                const fromLeft = index % 2 === 0;
                const y = this.boxY + 20 + ((index / total) * (BOX_H - 40));
                const b = this.bullets.create(fromLeft ? this.boxX - 10 : this.boxR + 10, y, 'bullet_circle');
                b.setTint(0xffffff);
                b.setVelocityX(fromLeft ? speed : -speed);
                b.body.setSize(6, 6);
                break;
            }
            case 'vertical_rain': {
                for (let i = 0; i < 3; i++) {
                    const x = this.boxX + 20 + Math.random() * (BOX_W - 40);
                    const b = this.bullets.create(x, this.boxY - 10, 'bullet_diamond');
                    b.setTint(0x44aaff);
                    b.setVelocityY(speed);
                    b.body.setSize(6, 6);
                }
                break;
            }
            case 'aimed_shots': {
                const angle = Phaser.Math.Angle.Between(cx, this.boxY, this.soul.x, this.soul.y);
                const b = this.bullets.create(cx, this.boxY + 5, 'bullet_diamond');
                b.setTint(0xff4444);
                b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
                b.body.setSize(6, 6);
                break;
            }
            case 'spiral': {
                const baseAngle = (index / total) * Math.PI * 4;
                for (let i = 0; i < 2; i++) {
                    const a = baseAngle + i * Math.PI;
                    const b = this.bullets.create(cx, this.boxY + BOX_H / 2, 'bullet_circle');
                    b.setTint(0xff66ff);
                    b.setVelocity(Math.cos(a) * speed * 0.8, Math.sin(a) * speed * 0.8);
                    b.body.setSize(6, 6);
                }
                break;
            }
            case 'random_scatter':
            default: {
                for (let i = 0; i < 2; i++) {
                    const x = this.boxX + 10 + Math.random() * (BOX_W - 20);
                    const y = this.boxY + 10 + Math.random() * (BOX_H - 20);
                    const b = this.bullets.create(x, y, 'bullet_circle');
                    b.setTint(0xffff44);
                    b.setScale(0);
                    b.body.setSize(6, 6);
                    this.tweens.add({
                        targets: b, scaleX: 1, scaleY: 1,
                        duration: 600, ease: 'Cubic.easeIn',
                        onComplete: () => {
                            if (b.active) {
                                const a = Math.random() * Math.PI * 2;
                                b.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
                            }
                        }
                    });
                }
                break;
            }
        }
    }

    endDodge() {
        if (this.patternTimer) this.patternTimer.destroy();
        this.bullets.clear(true, true);
        this.soul.setVelocity(0);
        this.phase = 'menu';
        this.menuIndex = 0;
        this.menuSoul.setVisible(true);
        this.updateMenu();
        this.dialogueText.setText('What will you do?');
    }

    updateMenu() {
        this.menuItems.forEach((t, i) => t.setColor(i === this.menuIndex ? '#ffff00' : '#ffffff'));
        const sel = this.menuItems[this.menuIndex];
        this.menuSoul.setPosition(sel.x - sel.width / 2 - 16, sel.y);
    }

    onHit(soul, bullet) {
        if (this.iframes > 0) return;
        bullet.destroy();
        this.iframes = 800;

        const dmg = storyState.takeDamage(this.enemyData.atk || 5);
        this.playerHpText.setText(`HP ${storyState.hp}/${storyState.maxHp}`);
        this.hpBar.setScale(storyState.hp / storyState.maxHp, 1);

        // Flash soul
        this.tweens.add({
            targets: this.soul, alpha: 0.3, duration: 100,
            yoyo: true, repeat: 3
        });
        this.cameras.main.shake(100, 0.01);

        if (storyState.hp <= 0) {
            this.phase = 'gameover';
            this.time.delayedCall(500, () => this.gameOver());
        }
    }

    selectMenuOption() {
        if (this.menuIndex === 0) this.doFight();
        else this.doMercy();
    }

    doFight() {
        this.phase = 'text';
        this.menuSoul.setVisible(false);
        const dmg = Math.max(1, storyState.atk - Math.floor(this.enemyData.atk / 3));
        this.enemyHp -= dmg;
        this.enemyHp = Math.max(0, this.enemyHp);

        // Animate enemy hit
        this.cameras.main.shake(150, 0.015);
        this.tweens.add({
            targets: this.enemySprite, alpha: 0.3, duration: 80,
            yoyo: true, repeat: 2
        });
        this.enemyHpBar.setScale(this.enemyHp / this.enemyMaxHp, 1);

        this.dialogueText.setText(`You dealt ${dmg} damage!`);

        if (this.enemyHp <= 0) {
            this.textCallback = () => this.victory();
        } else {
            this.textCallback = () => this.startDodge();
        }
    }

    doMercy() {
        this.phase = 'text';
        this.menuSoul.setVisible(false);

        const cond = this.enemyData.spare_condition || 'hp_below_half';
        let canSpare = false;

        if (cond === 'always') canSpare = true;
        else if (cond === 'hp_below_half') canSpare = this.enemyHp <= this.enemyMaxHp / 2;
        else if (cond.startsWith('after_') && cond.endsWith('_turns')) {
            const n = parseInt(cond.split('_')[1]) || 3;
            canSpare = this.turnCount >= n;
        } else if (cond.startsWith('has_item:')) {
            canSpare = storyState.hasItem(cond.split(':')[1]);
        }

        if (canSpare) {
            const lines = this.enemyData.spare_dialogue || ['The enemy retreats...'];
            this.dialogueText.setText(lines.join('\n'));
            this.textCallback = () => this.spare();
        } else {
            this.dialogueText.setText(`${this.enemyData.name} refuses to back down!`);
            this.textCallback = () => this.startDodge();
        }
    }

    victory() {
        this.phase = 'text';
        storyState.defeatEnemy(this.enemyData.id);
        const reward = this.enemyData.rewards || {};
        if (reward.gold) storyState.addGold(reward.gold);

        const lines = this.enemyData.defeat_dialogue || ['You won!'];
        let rewardText = '';
        if (reward.gold) rewardText += `\nGot ${reward.gold} ${storyState.theme === 'medieval' ? 'gold' : 'credits'}!`;

        this.dialogueText.setText(lines.join('\n') + rewardText);
        this.textCallback = () => this.endCombat('victory');
    }

    spare() {
        storyState.spareEnemy(this.enemyData.id);
        this.endCombat('spared');
    }

    gameOver() {
        this.phase = 'gameover';
        this.dialogueText.setText('You fell...\n\nPress ENTER to try again');
        this.dialogueText.setColor('#ff4444');

        this.input.keyboard.once('keydown-ENTER', () => {
            storyState.hp = storyState.maxHp;
            storyState.gameOver = false;
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('GameScene', {
                    roomSpec: this.returnRoom,
                    entryDirection: this.returnEntry
                });
            });
        });
    }

    endCombat(result) {
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('GameScene', {
                roomSpec: this.returnRoom,
                entryDirection: this.returnEntry,
                combatResult: { enemyId: this.enemyData.id, result }
            });
        });
    }
}
