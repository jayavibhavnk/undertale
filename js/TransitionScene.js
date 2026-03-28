import storyState from './storyState.js';

const TIPS = {
    cyberpunk: ['Neon flickers in the rain...', 'Data flows through the wires...', 'The city never sleeps...', 'Trust no one in the undercity...'],
    medieval: ['A cold wind sweeps the land...', 'The curse grows stronger...', 'Torchlight dances on stone walls...', 'Legends speak of three relics...'],
    space: ['Stars drift past the viewport...', 'The station hums with static...', 'Oxygen levels nominal...', 'Strange signals from sector 7...']
};

const CUTSCENE_TIPS = {
    cyberpunk: ['Rendering neon skyline...', 'Compositing holographic overlays...', 'Veo is painting your story...'],
    medieval: ['Forging the next chapter...', 'The oracle weaves your fate...', 'Veo conjures your destiny...'],
    space: ['Scanning deep space visuals...', 'Rendering stellar phenomena...', 'Veo charts your course...'],
};

export default class TransitionScene extends Phaser.Scene {
    constructor() { super('TransitionScene'); }

    init(data) {
        this.trigger = data.trigger || null;
        this.entryDirection = data.entryDirection || 'bottom';
        this.exitDirection = data.exitDirection || '';
        this.exitLabel = data.exitLabel || '';
        this.roomName = data.roomName || '';
        this.roomMood = data.roomMood || '';
        this.preloadedCutsceneKey = data.preloadedCutsceneKey || null;
    }

    create() {
        const W = this.scale.width, H = this.scale.height;
        this.cameras.main.setBackgroundColor('#000000');

        this.soul = this.add.image(W / 2, H / 2 - 60, 'soul').setScale(1.8);
        this.tweens.add({
            targets: this.soul, scaleX: 2.2, scaleY: 2.2, alpha: 0.5,
            duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        const theme = storyState.theme || 'cyberpunk';
        const tips = TIPS[theme] || TIPS.cyberpunk;
        const tip = tips[Math.floor(Math.random() * tips.length)];

        this.statusText = this.add.text(W / 2, H / 2 - 8, tip, {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#555555'
        }).setOrigin(0.5);

        const barW = 260, barH = 10;
        const barX = (W - barW) / 2, barY = H / 2 + 30;

        this.add.rectangle(barX + barW / 2, barY + barH / 2, barW + 4, barH + 4, 0x000000)
            .setStrokeStyle(2, 0x333333);

        this.barFill = this.add.rectangle(barX + 2, barY + 2, 0, barH, 0xffff00)
            .setOrigin(0, 0);
        this.barGlow = this.add.rectangle(barX + 2, barY + 2, 0, barH, 0xffff44, 0.3)
            .setOrigin(0, 0);
        this.barMaxW = barW - 4;
        this.barProgress = 0;

        this.pctText = this.add.text(W / 2, barY + barH + 12, '0%', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#333333'
        }).setOrigin(0.5);

        const nextRoom = storyState.roomNumber + 1;
        const pct = nextRoom / storyState.maxRooms;
        const phase = pct >= 0.92 ? 'finale' : pct >= 0.65 ? 'climax' : pct >= 0.25 ? 'rising' : 'setup';
        const phaseLabels = { setup: 'ACT I', rising: 'ACT II', climax: 'ACT III', finale: '★ FINALE ★' };
        const phaseColors = { setup: '#666666', rising: '#888844', climax: '#aa6644', finale: '#ff4444' };

        this.add.text(W / 2, H / 2 + 12, `Room ${nextRoom}/${storyState.maxRooms} — ${phaseLabels[phase] || 'ACT I'}`, {
            fontFamily: '"Press Start 2P"', fontSize: '6px', color: phaseColors[phase] || '#666666'
        }).setOrigin(0.5);

        this.genText = this.add.text(W / 2, barY + barH + 28, 'Generating world...', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#666666'
        }).setOrigin(0.5);

        this.cutsceneLabel = this.add.text(W / 2, barY + barH + 44, '', {
            fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#446688'
        }).setOrigin(0.5);

        this.time.addEvent({
            delay: 2800, loop: true,
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
        this.loadRoomAndCutscene();
    }

    // ── Progress bar ──

    fakeProgress(maxTarget = 93) {
        this.tweens.chain({
            targets: this,
            tweens: [
                { barProgress: Math.min(30, maxTarget), duration: 800, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: Math.min(55, maxTarget), duration: 1500, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: Math.min(75, maxTarget), duration: 2500, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: Math.min(88, maxTarget), duration: 4000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: Math.min(maxTarget, 93), duration: 6000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
            ]
        });
    }

    fakeProgressSlow() {
        this.tweens.killTweensOf(this);
        this.tweens.chain({
            targets: this,
            tweens: [
                { barProgress: 60, duration: 5000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: 75, duration: 10000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: 85, duration: 20000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: 93, duration: 40000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
            ]
        });
    }

    updateBar() {
        const w = (this.barProgress / 100) * this.barMaxW;
        this.barFill.setSize(w, 10);
        this.barGlow.setSize(w, 10);
        this.pctText.setText(`${Math.floor(this.barProgress)}%`);
        const r = Math.floor(255 - (this.barProgress / 100) * 200);
        this.barFill.setFillStyle(Phaser.Display.Color.GetColor(r, 255, Math.floor((this.barProgress / 100) * 50)));
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

    // ── Main loading pipeline ──

    async loadRoomAndCutscene() {
        const gemini = this.registry.get('geminiClient');
        if (!gemini) {
            this.genText.setText('ERROR').setColor('#ff4444');
            this.statusText.setText('No API key provided').setColor('#ff4444');
            return;
        }

        const cutsceneClient = this.registry.get('cutsceneClient');
        const cutscenePlayer = this.registry.get('cutscenePlayer');

        const isFirstRoom = !this.trigger;
        const cutsceneKey = this.resolveCutsceneKey(cutsceneClient);
        const hasCutsceneCandidate = !!cutsceneKey && !!cutscenePlayer;

        console.log(`[transition] isFirstRoom=${isFirstRoom}, cutsceneKey=${cutsceneKey}, hasCutsceneCandidate=${hasCutsceneCandidate}`);

        this.fakeProgress(93);

        // --- Generate room ---
        let roomSpec = null;
        try {
            roomSpec = await this.generateRoom(gemini);
        } catch (err) {
            console.error('Room generation failed:', err);
            return this.handleRoomError(gemini);
        }

        storyState.currentRoomData = roomSpec;
        storyState.chapter++;
        storyState.trackNames(roomSpec);
        storyState.addSummary(
            `Room ${storyState.roomNumber}: "${roomSpec.name}" — ${roomSpec.narration || 'explored'}`
        );

        // --- Wait for cutscene ---
        let cutsceneVideoUrl = null;

        if (hasCutsceneCandidate) {
            this.genText.setText('Loading cinematic...');
            this.cutsceneLabel.setText('🎬 Preparing cinematic...');
            this.fakeProgressSlow();
            cutsceneVideoUrl = await this.waitForCutscene(cutsceneClient, cutsceneKey);
            this.cutsceneLabel.setText('');
        }

        this.finishBar();

        if (cutsceneVideoUrl && cutscenePlayer) {
            console.log('[transition] Playing cutscene:', cutsceneVideoUrl);
            this.genText.setText('Playing cutscene...');
            this.time.delayedCall(300, async () => {
                await cutscenePlayer.play(cutsceneVideoUrl);
                this.transitionToGame(roomSpec);
            });
        } else {
            console.log('[transition] No cutscene available, proceeding to game');
            this.time.delayedCall(500, () => this.transitionToGame(roomSpec));
        }
    }

    /**
     * Quick non-blocking check — only waits a few seconds.
     * Used for first room so player isn't stuck.
     */
    async quickCheckCutscene(cutsceneClient, cacheKey, maxWaitMs) {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            try {
                const status = await cutsceneClient.checkCache(cacheKey);
                if (status?.status === 'complete' && status.video_url) return status.video_url;
                if (status?.status === 'error') return null;
            } catch { /* ignore */ }
            await new Promise(r => setTimeout(r, 1000));
        }
        return null;
    }

    /**
     * Patient wait for a pre-generated cutscene. Shows progress.
     * Gives up after 120s.
     */
    async waitForCutscene(cutsceneClient, cacheKey) {
        if (cacheKey.startsWith('__legacy_')) {
            return this.generateFreshCutscene(cutsceneClient);
        }

        const isFirstRoom = !this.trigger;
        const maxWait = isFirstRoom ? 180000 : 90000;

        if (isFirstRoom) {
            this.cutsceneLabel.setText('🎬 Initializing cinematic engine...');
        }

        const INIT_LABELS = {
            generating_master_sheet: '🎬 Building visual models (~20s)...',
            generating_anchor: '🎬 Preparing scene reference (~15s)...',
            queuing_first_room: '🎬 Queuing opening cinematic...',
            ready: '🎬 Rendering cinematic...',
        };

        const result = await cutsceneClient.getOrWait(cacheKey, maxWait, async (s) => {
            if (!s) return;
            if (s.status === 'not_found' && !cutsceneClient.ready) {
                try {
                    const initData = await cutsceneClient.pollInit();
                    const label = INIT_LABELS[initData?.status] || '🎬 Initializing cinematic engine...';
                    this.cutsceneLabel.setText(label);
                    const p = initData?.progress || 0;
                    if (p > 0 && this.barProgress < 55) {
                        this.barProgress = 20 + (p / 100) * 35;
                        this.updateBar();
                    }
                } catch { /* ignore poll errors */ }
            } else if (s.status === 'not_found') {
                this.cutsceneLabel.setText('🎬 Waiting for cinematic...');
            } else {
                this.updateCutsceneStatus(s);
            }
        });

        if (result?.status === 'complete' && result.video_url) return result.video_url;

        if (cutsceneClient.ready && this.trigger) {
            this.cutsceneLabel.setText('🎬 Generating fresh cutscene...');
            return this.generateFreshCutscene(cutsceneClient);
        }

        return null;
    }

    async generateFreshCutscene(cutsceneClient) {
        if (!cutsceneClient.ready) {
            this.cutsceneLabel.setText('⏳ Waiting for video engine...');
            const start = Date.now();
            while (!cutsceneClient.ready && Date.now() - start < 45000) {
                await cutsceneClient.pollInit();
                await new Promise(r => setTimeout(r, 2000));
            }
            if (!cutsceneClient.ready) return null;
        }
        const context = storyState.toContext();
        try {
            const result = await cutsceneClient.requestCutscene(
                this.trigger || 'The adventure begins', context,
                this.exitDirection, this.exitLabel, this.roomName, this.roomMood,
            );
            if (!result?.scene_id) return null;
            const status = await cutsceneClient.waitForCutscene(
                result.scene_id,
                (s) => this.updateCutsceneStatus(s),
                120000
            );
            return (status.status === 'complete' && status.video_url) ? status.video_url : null;
        } catch (err) {
            console.warn('[transition] Fresh cutscene error:', err);
            return null;
        }
    }

    updateCutsceneStatus(s) {
        if (!s) return;
        if (s.status === 'generating_video') this.cutsceneLabel.setText('🎬 Rendering cinematic...');
        else if (s.status === 'generating') this.cutsceneLabel.setText('🎬 Building scene...');
        else if (s.status === 'waiting_rate_limit') this.cutsceneLabel.setText('⏳ Queued for render...');
        else if (s.status === 'queued') this.cutsceneLabel.setText('⏳ Preparing cinematic...');
        if (s.progress && this.barProgress < 90) {
            const mapped = 55 + (s.progress / 100) * 40;
            if (mapped > this.barProgress) { this.barProgress = mapped; this.updateBar(); }
        }
    }

    resolveCutsceneKey(cutsceneClient) {
        if (this.preloadedCutsceneKey) return this.preloadedCutsceneKey;
        if (!this.trigger && cutsceneClient?.hasSession) return cutsceneClient.getFirstRoomCacheKey();
        if (this.trigger && cutsceneClient?.hasSession) return `__legacy_${Date.now()}`;
        return null;
    }

    // ── Room generation ──

    async generateRoom(gemini) {
        storyState.roomNumber++;
        const context = storyState.toContext();
        return await gemini.generateRoom(context, this.trigger);
    }

    transitionToGame(roomSpec) {
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('GameScene', { roomSpec, entryDirection: this.entryDirection });
        });
    }

    async handleRoomError(gemini) {
        this.genText.setText('Retrying...').setColor('#ff8844');
        this.statusText.setText('Connection hiccup, trying again...').setColor('#ff8844');
        this.time.delayedCall(2000, async () => {
            try {
                const context = storyState.toContext();
                const roomSpec = await gemini.generateRoom(context, this.trigger);
                storyState.currentRoomData = roomSpec;
                storyState.chapter++;
                storyState.trackNames(roomSpec);
                storyState.addSummary(`Room ${storyState.roomNumber}: "${roomSpec.name}" — ${roomSpec.narration || 'explored'}`);
                this.finishBar();
                this.time.delayedCall(600, () => this.transitionToGame(roomSpec));
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
