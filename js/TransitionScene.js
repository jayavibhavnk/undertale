import storyState from './storyState.js';

const TIPS = {
    cyberpunk: ['Neon flickers in the rain...', 'Data flows through the wires...', 'The city never sleeps...', 'Trust no one in the undercity...'],
    medieval: ['A cold wind sweeps the land...', 'The curse grows stronger...', 'Torchlight dances on stone walls...', 'Legends speak of three relics...'],
    space: ['Stars drift past the viewport...', 'The station hums with static...', 'Oxygen levels nominal...', 'Strange signals from sector 7...']
};

export default class TransitionScene extends Phaser.Scene {
    constructor() { super('TransitionScene'); }

    init(data) {
        this.trigger = data.trigger || null;
        this.entryDirection = data.entryDirection || 'bottom';
    }

    create() {
        const W = this.scale.width, H = this.scale.height;
        this.cameras.main.setBackgroundColor('#000000');

        // Pulsing soul heart
        this.soul = this.add.image(W / 2, H / 2 - 50, 'soul').setScale(1.8);
        this.tweens.add({
            targets: this.soul, scaleX: 2.2, scaleY: 2.2, alpha: 0.5,
            duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        // Status text
        const theme = storyState.theme || 'cyberpunk';
        const tips = TIPS[theme] || TIPS.cyberpunk;
        const tip = tips[Math.floor(Math.random() * tips.length)];

        this.statusText = this.add.text(W / 2, H / 2 + 5, tip, {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#555555'
        }).setOrigin(0.5);

        // Loading bar background
        const barW = 260, barH = 10;
        const barX = (W - barW) / 2, barY = H / 2 + 35;

        this.add.rectangle(barX + barW / 2, barY + barH / 2, barW + 4, barH + 4, 0x000000)
            .setStrokeStyle(2, 0x333333);

        this.barFill = this.add.rectangle(barX + 2, barY + 2, 0, barH, 0xffff00)
            .setOrigin(0, 0);

        this.barGlow = this.add.rectangle(barX + 2, barY + 2, 0, barH, 0xffff44, 0.3)
            .setOrigin(0, 0);

        this.barMaxW = barW - 4;
        this.barProgress = 0;

        // Percentage text
        this.pctText = this.add.text(W / 2, barY + barH + 14, '0%', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#333333'
        }).setOrigin(0.5);

        // "Generating..." label
        this.genText = this.add.text(W / 2, barY - 14, 'Generating world...', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#666666'
        }).setOrigin(0.5);

        // Animate the bar with faked progress (fast at first, slows down)
        this.fakeProgress();

        // Cycle through tips
        this.time.addEvent({
            delay: 2500, loop: true,
            callback: () => {
                const t = tips[Math.floor(Math.random() * tips.length)];
                this.tweens.add({
                    targets: this.statusText, alpha: 0, duration: 200,
                    onComplete: () => { this.statusText.setText(t); }
                });
                this.tweens.add({ targets: this.statusText, alpha: 1, duration: 200, delay: 250 });
            }
        });

        this.cameras.main.fadeIn(200);
        this.loadRoom();
    }

    fakeProgress() {
        const stages = [
            { target: 30, duration: 800 },
            { target: 55, duration: 1500 },
            { target: 75, duration: 2500 },
            { target: 88, duration: 4000 },
            { target: 93, duration: 6000 },
        ];

        let chain = this.tweens.chain({
            targets: this,
            tweens: stages.map(s => ({
                barProgress: s.target,
                duration: s.duration,
                ease: 'Sine.easeOut',
                onUpdate: () => this.updateBar()
            }))
        });
    }

    updateBar() {
        const w = (this.barProgress / 100) * this.barMaxW;
        this.barFill.setSize(w, 10);
        this.barGlow.setSize(w, 10);
        this.pctText.setText(`${Math.floor(this.barProgress)}%`);

        // Color shift: yellow -> green as it progresses
        const r = Math.floor(255 - (this.barProgress / 100) * 200);
        const g = 255;
        const b = Math.floor((this.barProgress / 100) * 50);
        this.barFill.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));
    }

    finishBar() {
        this.tweens.killTweensOf(this);
        this.tweens.add({
            targets: this, barProgress: 100, duration: 400, ease: 'Cubic.easeIn',
            onUpdate: () => this.updateBar(),
            onComplete: () => {
                this.genText.setText('Ready!');
                this.pctText.setText('100%');
            }
        });
    }

    async loadRoom() {
        const gemini = this.registry.get('geminiClient');
        if (!gemini) {
            this.genText.setText('ERROR').setColor('#ff4444');
            this.statusText.setText('No API key provided').setColor('#ff4444');
            return;
        }

        try {
            const context = storyState.toContext();
            const roomSpec = await gemini.generateRoom(context, this.trigger);

            storyState.currentRoomData = roomSpec;
            storyState.chapter++;

            this.finishBar();
            this.time.delayedCall(600, () => {
                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    this.scene.start('GameScene', {
                        roomSpec,
                        entryDirection: this.entryDirection
                    });
                });
            });
        } catch (err) {
            console.error('Gemini room generation failed:', err);
            this.genText.setText('Retrying...').setColor('#ff8844');
            this.statusText.setText('Connection hiccup, trying again...').setColor('#ff8844');

            this.time.delayedCall(2000, async () => {
                try {
                    const context = storyState.toContext();
                    const roomSpec = await gemini.generateRoom(context, this.trigger);
                    storyState.currentRoomData = roomSpec;
                    storyState.chapter++;

                    this.finishBar();
                    this.time.delayedCall(600, () => {
                        this.cameras.main.fadeOut(500, 0, 0, 0);
                        this.cameras.main.once('camerafadeoutcomplete', () => {
                            this.scene.start('GameScene', { roomSpec, entryDirection: this.entryDirection });
                        });
                    });
                } catch (err2) {
                    console.error('Retry failed:', err2);
                    this.genText.setText('FAILED').setColor('#ff4444');
                    this.statusText.setText('Could not reach Gemini').setColor('#ff4444');
                    this.pctText.setVisible(false);

                    this.add.text(this.scale.width / 2, this.scale.height / 2 + 80, '[ ENTER to retry ]', {
                        fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#888888'
                    }).setOrigin(0.5);

                    this.input.keyboard.once('keydown-ENTER', () => {
                        this.scene.restart({ trigger: this.trigger, entryDirection: this.entryDirection });
                    });
                }
            });
        }
    }
}
