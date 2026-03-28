import storyState from './storyState.js';
import { loadTextureFromUrl, API_BASE } from './IntroSequenceScene.js';

const ASSET_CACHE_KEY = 'undertale_asset_urls_v2';

function _urlCache() {
    try { return JSON.parse(localStorage.getItem(ASSET_CACHE_KEY) || '{}'); }
    catch { return {}; }
}

function _cacheUrl(texKey, url) {
    try {
        const c = _urlCache();
        c[texKey] = url;
        localStorage.setItem(ASSET_CACHE_KEY, JSON.stringify(c));
    } catch { /* storage full or unavailable */ }
}

function _getCachedUrl(texKey) {
    return _urlCache()[texKey] || null;
}

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
    }

    create() {
        const W = this.scale.width, H = this.scale.height;
        this.cameras.main.setBackgroundColor('#000000');

        this.soul = this.add.image(W / 2, H / 2 - 50, 'soul').setScale(1.8);
        this.tweens.add({
            targets: this.soul, scaleX: 2.2, scaleY: 2.2, alpha: 0.5,
            duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        const theme = storyState.theme || 'cyberpunk';
        const tips = TIPS[theme] || TIPS.cyberpunk;
        const tip = tips[Math.floor(Math.random() * tips.length)];

        this.statusText = this.add.text(W / 2, H / 2 + 5, tip, {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#555555'
        }).setOrigin(0.5);

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

        this.pctText = this.add.text(W / 2, barY + barH + 14, '0%', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#333333'
        }).setOrigin(0.5);

        this.genText = this.add.text(W / 2, barY - 14, 'Generating world...', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#666666'
        }).setOrigin(0.5);

        this.cutsceneLabel = this.add.text(W / 2, barY + barH + 32, '', {
            fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#444466'
        }).setOrigin(0.5);

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
        this.loadRoomAndCutscene();
    }

    fakeProgress(maxTarget = 93) {
        const stages = [
            { target: Math.min(30, maxTarget), duration: 800 },
            { target: Math.min(55, maxTarget), duration: 1500 },
            { target: Math.min(75, maxTarget), duration: 2500 },
            { target: Math.min(88, maxTarget), duration: 4000 },
            { target: Math.min(maxTarget, 93), duration: 6000 },
        ];
        this.tweens.chain({
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

    async loadRoomAndCutscene() {
        const gemini = this.registry.get('geminiClient');
        if (!gemini) {
            this.genText.setText('ERROR').setColor('#ff4444');
            this.statusText.setText('No API key provided').setColor('#ff4444');
            return;
        }

        const cutsceneClient = this.registry.get('cutsceneClient');
        const cutscenePlayer = this.registry.get('cutscenePlayer');
        const hasCutscene = cutsceneClient?.ready && this.trigger;

        this.fakeProgress(hasCutscene ? 50 : 93);

        let roomSpec = null;
        let cutsceneVideoUrl = null;

        const roomPromise = this.generateRoom(gemini);

        try {
            roomSpec = await roomPromise;
        } catch (err) {
            console.error('Room generation failed:', err);
            return this.handleRoomError(gemini);
        }

        const bgTextureKey = `room_bg_${(roomSpec.room_id || 'unknown').replace(/[^a-z0-9]/gi, '_')}`;

        this.genText.setText('Forging scene & characters...');
        const bgPromise = this.generateBackground(roomSpec, bgTextureKey).catch(e => {
            console.warn('Background gen failed:', e);
            return null;
        });
        const portraitPromises = this.generateAllPortraits(roomSpec);
        const spritePromises = this.generateAllSprites(roomSpec);

        const [bgResult] = await Promise.allSettled([
            bgPromise, ...portraitPromises, ...spritePromises,
        ]);
        const backgroundUrl = bgResult.status === 'fulfilled' ? bgResult.value : null;

        storyState.currentRoomData = roomSpec;
        storyState.chapter++;

        if (hasCutscene) {
            this.cutsceneLabel.setText('🎬 Generating cinematic cutscene...');
            this.fakeProgressSlow();
            const csTips = CUTSCENE_TIPS[storyState.theme] || CUTSCENE_TIPS.cyberpunk;

            this.cutsceneTipTimer = this.time.addEvent({
                delay: 3000, loop: true,
                callback: () => {
                    const t = csTips[Math.floor(Math.random() * csTips.length)];
                    this.cutsceneLabel.setText(`🎬 ${t}`);
                }
            });

            cutsceneVideoUrl = await this.generateCutscene(cutsceneClient, backgroundUrl).catch(err => {
                console.warn('Cutscene generation failed:', err);
                return null;
            });

            if (this.cutsceneTipTimer) this.cutsceneTipTimer.destroy();
            this.cutsceneLabel.setText('');
        }

        this.finishBar();

        if (cutsceneVideoUrl && cutscenePlayer) {
            this.genText.setText('Playing cutscene...');
            this.time.delayedCall(400, async () => {
                await cutscenePlayer.play(cutsceneVideoUrl);
                this.transitionToGame(roomSpec, bgTextureKey);
            });
        } else {
            this.time.delayedCall(600, () => this.transitionToGame(roomSpec, bgTextureKey));
        }
    }

    async generateRoom(gemini) {
        const context = storyState.toContext();
        return await gemini.generateRoom(context, this.trigger);
    }

    generateAllPortraits(roomSpec) {
        const apiKey = this.registry.get('apiKey');
        if (!apiKey) return [];
        const theme = storyState.theme || 'cyberpunk';
        const npcs = roomSpec.npcs || [];
        const enemies = roomSpec.enemies || [];
        const promises = [];

        const mkKey = (name) => 'portrait_' + name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + '_ai';

        for (const n of npcs) {
            const key = mkKey(n.name || n.id);
            if (this.textures.exists(key)) continue;
            promises.push(this._generateOnePortrait(apiKey, key, n.name || n.id, theme, 'npc', n.description || n.emotion || '', n.color || ''));
        }
        for (const e of enemies) {
            if (storyState.npcsDefeated?.includes(e.id) || storyState.npcsSpared?.includes(e.id)) continue;
            const key = mkKey(e.name || e.id);
            if (this.textures.exists(key)) continue;
            promises.push(this._generateOnePortrait(apiKey, key, e.name || e.id, theme, 'enemy', e.description || '', e.color || ''));
        }
        return promises;
    }

    async _loadFromCacheOrGenerate(texKey, endpoint, body, urlField, label) {
        const cached = _getCachedUrl(texKey);
        if (cached) {
            try {
                const ok = await loadTextureFromUrl(this, texKey, cached);
                if (ok) return;
            } catch { /* stale cache, fall through to regenerate */ }
        }
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) return;
            const data = await res.json();
            const relUrl = data[urlField];
            if (relUrl) {
                const fullUrl = `${API_BASE}${relUrl}`;
                await loadTextureFromUrl(this, texKey, fullUrl);
                _cacheUrl(texKey, fullUrl);
            }
        } catch (e) {
            console.warn(`[${label}] ${body.name || texKey}:`, e);
        }
    }

    async _generateOnePortrait(apiKey, texKey, name, theme, role, description, color) {
        return this._loadFromCacheOrGenerate(texKey, '/api/generate-bustup',
            { api_key: apiKey, name, theme, role, description, color },
            'portrait_url', 'portrait');
    }

    generateAllSprites(roomSpec) {
        const apiKey = this.registry.get('apiKey');
        if (!apiKey) return [];
        const theme = storyState.theme || 'cyberpunk';
        const npcs = roomSpec.npcs || [];
        const enemies = roomSpec.enemies || [];
        const promises = [];

        const mkKey = (name) => 'sprite_ai_' + name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        for (const n of npcs) {
            const key = mkKey(n.name || n.id);
            if (this.textures.exists(key)) continue;
            promises.push(this._generateOneSprite(apiKey, key, n.name || n.id, theme, 'npc', n.description || '', n.color || ''));
        }
        for (const e of enemies) {
            if (storyState.npcsDefeated?.includes(e.id) || storyState.npcsSpared?.includes(e.id)) continue;
            const key = mkKey(e.name || e.id);
            if (this.textures.exists(key)) continue;
            promises.push(this._generateOneSprite(apiKey, key, e.name || e.id, theme, 'enemy', e.description || '', e.color || ''));
        }
        return promises;
    }

    async _generateOneSprite(apiKey, texKey, name, theme, role, description, color) {
        return this._loadFromCacheOrGenerate(texKey, '/api/generate-sprite',
            { api_key: apiKey, name, theme, role, description, color },
            'sprite_url', 'sprite');
    }

    async generateBackground(roomSpec, textureKey) {
        const apiKey = this.registry.get('apiKey');
        if (!apiKey) return null;

        const cached = _getCachedUrl(textureKey);
        if (cached) {
            try {
                const ok = await loadTextureFromUrl(this, textureKey, cached);
                if (ok) return cached.replace(API_BASE, '');
            } catch { /* stale, regenerate */ }
        }

        try {
            const resp = await fetch(`${API_BASE}/api/generate-background`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: apiKey,
                    theme: storyState.theme || 'cyberpunk',
                    room_name: roomSpec.name || roomSpec.room_id || 'Unknown',
                    mood: roomSpec.mood || 'mysterious',
                    narration: roomSpec.narration || ''
                })
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            if (data.background_url) {
                const fullUrl = `${API_BASE}${data.background_url}`;
                await loadTextureFromUrl(this, textureKey, fullUrl);
                _cacheUrl(textureKey, fullUrl);
                return data.background_url;
            }
            return null;
        } catch (e) {
            console.warn('Background generation error:', e);
            return null;
        }
    }

    async generateCutscene(cutsceneClient, backgroundUrl) {
        const context = storyState.toContext();
        try {
            const result = await cutsceneClient.requestCutscene(
                this.trigger || 'The adventure begins',
                context,
                this.exitDirection,
                this.exitLabel,
                this.roomName,
                this.roomMood,
                backgroundUrl || '',
            );
            if (!result?.scene_id) return null;

            const status = await cutsceneClient.waitForCutscene(
                result.scene_id,
                (s) => {
                    if (s.progress && this.barProgress < 90) {
                        const mapped = 50 + (s.progress / 100) * 45;
                        if (mapped > this.barProgress) {
                            this.barProgress = mapped;
                            this.updateBar();
                        }
                    }
                },
                180000
            );

            if (status.status === 'complete' && status.video_url) {
                return status.video_url;
            }
            return null;
        } catch (err) {
            console.warn('Cutscene request error:', err);
            return null;
        }
    }

    fakeProgressSlow() {
        this.tweens.killTweensOf(this);
        this.tweens.chain({
            targets: this,
            tweens: [
                { barProgress: 60, duration: 8000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: 70, duration: 15000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: 80, duration: 25000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: 88, duration: 40000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
                { barProgress: 93, duration: 60000, ease: 'Sine.easeOut', onUpdate: () => this.updateBar() },
            ]
        });
    }

    transitionToGame(roomSpec, bgTextureKey) {
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('GameScene', {
                roomSpec,
                entryDirection: this.entryDirection,
                bgTextureKey: bgTextureKey || null
            });
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
                const bgKey = `room_bg_${(roomSpec.room_id || 'retry').replace(/[^a-z0-9]/gi, '_')}`;
                await Promise.allSettled([
                    this.generateBackground(roomSpec, bgKey).catch(() => {}),
                    ...this.generateAllPortraits(roomSpec),
                    ...this.generateAllSprites(roomSpec),
                ]);
                this.finishBar();
                this.time.delayedCall(600, () => this.transitionToGame(roomSpec, bgKey));
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
