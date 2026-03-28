import storyState from './storyState.js';

const THEMES = [
    { id: 'cyberpunk', name: 'CYBERPUNK', desc: 'Neon streets. Corporate secrets. Digital rebellion.', color: '#00ffff', accent: '#ff00ff' },
    { id: 'medieval', name: 'MEDIEVAL', desc: 'Dark curses. Sacred relics. A kingdom to save.', color: '#ffd700', accent: '#ff4444' },
    { id: 'space', name: 'SPACE', desc: 'Derelict station. Strange signals. Cosmic dread.', color: '#4488ff', accent: '#44ffaa' }
];

export default class ThemeSelectScene extends Phaser.Scene {
    constructor() { super('ThemeSelectScene'); }

    create() {
        const W = this.scale.width, H = this.scale.height;
        this.cameras.main.setBackgroundColor('#000000');

        // Starfield background
        for (let i = 0; i < 50; i++) {
            const s = this.add.rectangle(
                Phaser.Math.Between(0, W), Phaser.Math.Between(0, H),
                Phaser.Math.Between(1, 2), Phaser.Math.Between(1, 2),
                0xffffff, Phaser.Math.FloatBetween(0.2, 0.6)
            );
            this.tweens.add({
                targets: s, alpha: 0, duration: Phaser.Math.Between(1000, 3000),
                yoyo: true, repeat: -1
            });
        }

        // Title
        this.add.text(W / 2, 50, 'UNIFACTORY', {
            fontFamily: '"Press Start 2P"', fontSize: '24px', color: '#ffffff',
            shadow: { offsetX: 0, offsetY: 0, color: '#ffff00', blur: 15, fill: true }
        }).setOrigin(0.5);

        this.add.text(W / 2, 80, 'Choose your world', {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#666666'
        }).setOrigin(0.5);

        // Theme cards
        this.selected = 0;
        this.cards = [];

        THEMES.forEach((theme, i) => {
            const cx = W / 2;
            const cy = 150 + i * 95;

            const bg = this.add.rectangle(cx, cy, 500, 75, 0x111111)
                .setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(theme.color).color);
            const nameText = this.add.text(cx - 200, cy - 20, theme.name, {
                fontFamily: '"Press Start 2P"', fontSize: '16px',
                color: theme.color
            });
            const descText = this.add.text(cx - 200, cy + 8, theme.desc, {
                fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#888888'
            });

            this.cards.push({ bg, nameText, descText, theme });
        });

        // Soul cursor
        this.soul = this.add.image(0, 0, 'soul').setScale(0.9).setDepth(10);
        this.updateSelection();

        // Controls hint
        this.add.text(W / 2, H - 30, 'UP/DOWN select   Z or ENTER confirm', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#444444'
        }).setOrigin(0.5);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.zKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

        this.cameras.main.fadeIn(600);
        this.choosing = true;
    }

    update() {
        if (!this.choosing) return;

        if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
            this.selected = (this.selected - 1 + THEMES.length) % THEMES.length;
            this.updateSelection();
        }
        if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
            this.selected = (this.selected + 1) % THEMES.length;
            this.updateSelection();
        }
        if (Phaser.Input.Keyboard.JustDown(this.zKey) || Phaser.Input.Keyboard.JustDown(this.enterKey)) {
            this.confirmSelection();
        }
    }

    updateSelection() {
        this.cards.forEach((card, i) => {
            const active = i === this.selected;
            card.bg.setFillStyle(active ? 0x1a1a2e : 0x111111);
            card.bg.setStrokeStyle(active ? 3 : 1,
                Phaser.Display.Color.HexStringToColor(card.theme.color).color);
            card.nameText.setAlpha(active ? 1 : 0.5);
            card.descText.setAlpha(active ? 1 : 0.4);
        });

        const card = this.cards[this.selected];
        this.soul.setPosition(card.bg.x - 270, card.bg.y);
    }

    confirmSelection() {
        this.choosing = false;
        const theme = THEMES[this.selected];
        const color = Phaser.Display.Color.HexStringToColor(theme.color);

        storyState.reset(theme.id);
        const gemini = this.registry.get('geminiClient');
        if (gemini) gemini.setTheme(theme.id);

        this.cameras.main.flash(300, color.r, color.g, color.b);
        this.cameras.main.once('cameraflashcomplete', () => {
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('TransitionScene', { trigger: null });
            });
        });
    }
}
