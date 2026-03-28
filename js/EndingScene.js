import storyState from './storyState.js';

const API_BASE = 'http://localhost:8081';

const ENDING_COLORS = {
    true_pacifist: { bg: '#0a1628', accent: '#44ddff', glow: '#00aaff' },
    hero:          { bg: '#0a1e0a', accent: '#44ff66', glow: '#00cc44' },
    merciful:      { bg: '#141428', accent: '#aabbff', glow: '#6688dd' },
    neutral:       { bg: '#1a1a1a', accent: '#cccccc', glow: '#888888' },
    wanderer:      { bg: '#1a1a18', accent: '#cccc88', glow: '#999966' },
    violent:       { bg: '#1e0a0a', accent: '#ff6644', glow: '#cc3322' },
    genocide:      { bg: '#1e0000', accent: '#ff2222', glow: '#ff0000' },
};

export default class EndingScene extends Phaser.Scene {
    constructor() { super('EndingScene'); }

    init(data) {
        this.endingType = data.endingType || storyState.getEndingType();
        this.finaleNarration = data.finaleNarration || null;
    }

    async create() {
        const W = this.scale.width, H = this.scale.height;
        const colors = ENDING_COLORS[this.endingType.id] || ENDING_COLORS.neutral;
        this.cameras.main.setBackgroundColor(colors.bg);
        this.cameras.main.fadeIn(2000, 0, 0, 0);

        const music = this.registry.get('musicManager');
        if (music) {
            const goodEndings = ['true_pacifist', 'hero', 'merciful'];
            const badEndings = ['violent', 'genocide'];
            const endingMusicKey = goodEndings.includes(this.endingType.id) ? 'ending_good'
                : badEndings.includes(this.endingType.id) ? 'ending_bad'
                : 'ending_neutral';
            music.play(endingMusicKey, 3000);
        }

        const gemini = this.registry.get('geminiClient');
        let narration = null;
        try {
            narration = await gemini.generateEndingNarration(storyState.toContext(), this.endingType);
        } catch (e) {
            console.warn('Ending narration generation failed:', e);
        }

        const title = narration?.title || this.endingType.title;
        const lines = narration?.narration || [this.endingType.desc];
        const epilogue = narration?.epilogue || '';

        const accentHex = Phaser.Display.Color.HexStringToColor(colors.accent).color;

        const soulY = H * 0.15;
        const soul = this.add.image(W / 2, soulY, 'soul').setScale(2).setAlpha(0);
        this.tweens.add({
            targets: soul, alpha: 1, duration: 2000,
            onComplete: () => {
                this.tweens.add({
                    targets: soul, scaleX: 2.4, scaleY: 2.4, alpha: 0.6,
                    duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
            }
        });

        const lineTop = this.add.rectangle(W / 2, soulY + 30, W * 0.6, 2, accentHex, 0.5).setAlpha(0);
        this.tweens.add({ targets: lineTop, alpha: 1, duration: 2000, delay: 800 });

        const titleText = this.add.text(W / 2, soulY + 50, title, {
            fontFamily: '"Press Start 2P"', fontSize: '12px', color: colors.accent,
            align: 'center', wordWrap: { width: W * 0.8 }
        }).setOrigin(0.5, 0).setAlpha(0);

        this.tweens.add({ targets: titleText, alpha: 1, duration: 1500, delay: 1500 });

        let y = soulY + 85;
        const lineDelay = 2500;
        for (let i = 0; i < lines.length; i++) {
            const t = this.add.text(W / 2, y, lines[i], {
                fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#aaaaaa',
                align: 'center', wordWrap: { width: W * 0.75 }, lineSpacing: 6
            }).setOrigin(0.5, 0).setAlpha(0);
            this.tweens.add({ targets: t, alpha: 1, duration: 1200, delay: lineDelay + i * 1800 });
            y += t.height + 12;
        }

        const statsDelay = lineDelay + lines.length * 1800 + 800;
        const statsY = H * 0.62;

        this.add.rectangle(W / 2, statsY - 4, W * 0.5, 1, accentHex, 0.3).setAlpha(0);
        this.tweens.add({ targets: this.children.last, alpha: 1, duration: 800, delay: statsDelay });

        const stats = [
            `Rooms explored: ${storyState.roomNumber}`,
            `Enemies defeated: ${storyState.reputation.kills}`,
            `Enemies spared: ${storyState.reputation.spares}`,
            `Quests completed: ${storyState.reputation.quests_done}`,
            `Moral alignment: ${storyState.getMoralAlignment()}`,
            `Level: ${storyState.level}`,
        ];

        stats.forEach((s, i) => {
            const t = this.add.text(W / 2, statsY + 10 + i * 14, s, {
                fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#666666'
            }).setOrigin(0.5, 0).setAlpha(0);
            this.tweens.add({ targets: t, alpha: 1, duration: 600, delay: statsDelay + 200 + i * 300 });
        });

        if (epilogue) {
            const epY = statsY + 10 + stats.length * 14 + 20;
            const ep = this.add.text(W / 2, epY, epilogue, {
                fontFamily: '"Press Start 2P"', fontSize: '6px', color: colors.accent,
                fontStyle: 'italic', align: 'center', wordWrap: { width: W * 0.7 }, lineSpacing: 4
            }).setOrigin(0.5, 0).setAlpha(0);
            this.tweens.add({ targets: ep, alpha: 1, duration: 1000, delay: statsDelay + stats.length * 300 + 400 });
        }

        // Save game in background
        this._saveGame(narration);

        const endDelay = statsDelay + stats.length * 300 + 2000;

        const shareBtn = this.add.text(W / 2, H - 36, '[ SHARE YOUR ADVENTURE ]', {
            fontFamily: '"Press Start 2P"', fontSize: '6px', color: colors.accent,
        }).setOrigin(0.5).setAlpha(0).setInteractive({ useHandCursor: true });

        const prompt = this.add.text(W / 2, H - 16, '[ PRESS ENTER TO PLAY AGAIN ]', {
            fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#444444'
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: [shareBtn, prompt], alpha: 1, duration: 800, delay: endDelay,
            onComplete: () => {
                this.tweens.add({
                    targets: prompt, alpha: 0.3, duration: 800,
                    yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
                this.input.keyboard.once('keydown-ENTER', () => {
                    this.cameras.main.fadeOut(1500, 0, 0, 0);
                    this.cameras.main.once('camerafadeoutcomplete', () => {
                        location.reload();
                    });
                });
            }
        });

        shareBtn.on('pointerdown', () => {
            if (this._savedGameId) {
                const url = `${window.location.origin}/recap.html?id=${this._savedGameId}`;
                window.open(url, '_blank');
            } else {
                shareBtn.setText('[ SAVING... ]');
            }
        });
        shareBtn.on('pointerover', () => shareBtn.setColor('#ffffff'));
        shareBtn.on('pointerout', () => shareBtn.setColor(colors.accent));
    }

    async _saveGame(narration) {
        try {
            const recap = storyState.toRecap(this.endingType, {
                title: narration?.title || this.endingType.title,
                narration: narration?.narration || [this.endingType.desc],
                epilogue: narration?.epilogue || '',
            });

            const cutsceneClient = this.registry.get('cutsceneClient');
            if (cutsceneClient?.sessionId) {
                recap.sessionId = cutsceneClient.sessionId;
            }

            const res = await fetch(`${API_BASE}/api/save-game`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(recap),
            });
            if (res.ok) {
                const data = await res.json();
                this._savedGameId = data.game_id;
                console.log('[ending] Game saved:', data.game_id);
            }
        } catch (e) {
            console.warn('[ending] Save failed:', e);
        }
    }
}
