import storyState from './storyState.js';

const API_BASE = 'http://localhost:8081';

function dataURLtoBlob(dataURL) {
    const [header, data] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(data);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    return new Blob([array], { type: mime });
}

function loadTextureFromUrl(scene, key, url) {
    return new Promise((resolve) => {
        if (scene.textures.exists(key)) { resolve(true); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { scene.textures.addImage(key, img); resolve(true); };
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

export { loadTextureFromUrl, API_BASE };

const FALLBACK = {
    cyberpunk: [
        'The neon bleeds into rain-soaked streets.',
        'A soul burns bright in the undercity.',
        'Driven by something unbreakable, they walk where others dare not.',
        'The megacorps hide a truth. The Oracle knows.',
        'But the path to truth... is paved with choices.',
    ],
    medieval: [
        'The kingdom crumbles under a shadow curse.',
        'In the ruins, a single soul endures.',
        'Their light burns like a torch in the darkness.',
        'Three Sacred Relics. One last hope.',
        'But who can be trusted in a land of betrayal?',
    ],
    space: [
        'Station Omega-7 drifts in silence.',
        'One soul remains awake in the void.',
        'Fueled by something unbreakable, they face the unknown.',
        'Strange signals pulse from the station core.',
        'The crew is fractured. Something lurks below.',
    ],
};

export default class IntroSequenceScene extends Phaser.Scene {
    constructor() { super('IntroSequenceScene'); }

    create() {
        const W = this.scale.width, H = this.scale.height;
        this.cameras.main.setBackgroundColor('#000000');
        this.cameras.main.fadeIn(800, 0, 0, 0);

        this.done = false;
        this.assetsReady = false;

        const name = storyState.playerName || 'Wanderer';
        const trait = storyState.soulTrait || 'Determination';
        const theme = storyState.theme || 'cyberpunk';

        const soulColor = storyState.soulColor || '#ff0000';
        this.soulHeart = this.add.text(W / 2, H * 0.13, '♥', {
            fontSize: '52px', color: soulColor,
        }).setOrigin(0.5).setAlpha(0).setDepth(2);

        this.tweens.add({
            targets: this.soulHeart, alpha: 0.8, duration: 1200, ease: 'Sine.easeIn',
            onComplete: () => {
                this.tweens.add({
                    targets: this.soulHeart, alpha: 0.3, scaleX: 1.1, scaleY: 1.1,
                    duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
            }
        });

        const loadingText = this.add.text(W / 2, H * 0.28, 'Forging your destiny...', {
            fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#444444'
        }).setOrigin(0.5).setDepth(5);

        let dots = 0;
        this.loadingTimer = this.time.addEvent({
            delay: 500, loop: true,
            callback: () => {
                dots = (dots + 1) % 4;
                loadingText.setText('Forging your destiny' + '.'.repeat(dots));
            }
        });

        this.statusText = this.add.text(W / 2, H - 18, '', {
            fontFamily: '"Press Start 2P"', fontSize: '5px', color: '#222222'
        }).setOrigin(0.5).setDepth(5);

        const skipHint = this.add.text(W - 10, H - 10, '[ENTER to skip]', {
            fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#333333'
        }).setOrigin(1, 1).setDepth(5);
        this.tweens.add({ targets: skipHint, alpha: 0.5, duration: 1000, yoyo: true, repeat: -1 });

        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER).on('down', () => {
            if (!this.done) this.finishIntro();
        });

        this.kickOffParallelWork();

        const music = this.registry.get('musicManager');
        if (music) {
            music.play(`intro_${theme}`);
            music.preload(`loading_${theme}`);
        }

        const fallbackLines = (FALLBACK[theme] || FALLBACK.cyberpunk).map(line =>
            line.replace('A soul burns bright', `${name}'s soul burns bright`)
                .replace('a single soul endures', `${name} endures`)
                .replace('One soul remains awake', `${name} remains awake`)
                .replace('something unbreakable', trait)
        );
        fallbackLines.push(`And so begins the story of ${name}.`);

        const gemini = this.registry.get('geminiClient');
        const geminiPromise = gemini
            ? this.fetchGeminiIntro(gemini, name, trait, theme)
            : Promise.resolve(null);

        const timeoutPromise = new Promise(r => setTimeout(() => r(null), 4000));

        Promise.race([geminiPromise, timeoutPromise]).then(geminiLines => {
            if (this.done) return;
            const lines = geminiLines || fallbackLines;
            if (this.loadingTimer) { this.loadingTimer.destroy(); this.loadingTimer = null; }
            loadingText.setVisible(false);
            this.displayLines(lines);
        });
    }

    async fetchGeminiIntro(gemini, name, trait, theme) {
        try {
            const prompt = `Generate a 5-6 line atmospheric RPG introduction. Player: "${name}", soul trait: "${trait}", theme: "${theme}". Each line: short (under 60 chars), dramatic, poetic. Reference the player name and trait. Return ONLY a JSON array of strings.`;
            const url = `${gemini.baseUrl}/models/${gemini.model}:generateContent?key=${gemini.apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json', temperature: 0.9, maxOutputTokens: 1024 },
                }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) return null;
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) && parsed.length >= 3 ? parsed.slice(0, 7) : null;
        } catch {
            return null;
        }
    }

    async kickOffParallelWork() {
        const apiKey = this.registry.get('apiKey');
        const jobs = [
            this.generatePlayerPortrait(apiKey),
            this.initCutsceneServer(apiKey),
        ];
        await Promise.allSettled(jobs);
        this.assetsReady = true;
    }

    async generatePlayerPortrait(apiKey) {
        if (!apiKey) return;
        const photoUrl = storyState.characterPhotoUrl;
        const presetId = storyState.characterPresetId;

        try {
            let result;
            if (photoUrl) {
                this.setStatus('Forging avatar from photo...');
                const blob = dataURLtoBlob(photoUrl);
                const formData = new FormData();
                formData.append('photo', blob, 'character.jpg');
                formData.append('theme', storyState.theme || 'cyberpunk');
                formData.append('character_name', storyState.playerName || 'Wanderer');
                formData.append('api_key', apiKey);

                const res = await fetch(`${API_BASE}/api/generate-from-photo`, {
                    method: 'POST', body: formData,
                });
                if (!res.ok) throw new Error(`${res.status}`);
                result = await res.json();
            } else {
                this.setStatus('Forging avatar...');
                const res = await fetch(`${API_BASE}/api/generate-portrait`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: apiKey,
                        character_name: storyState.playerName || 'Wanderer',
                        theme: storyState.theme || 'cyberpunk',
                        preset_id: presetId || '',
                    }),
                });
                if (!res.ok) throw new Error(`${res.status}`);
                result = await res.json();
            }

            if (result.portrait_url) {
                const fullUrl = `${API_BASE}${result.portrait_url}`;
                storyState.playerPortraitUrl = fullUrl;
                const ok = await loadTextureFromUrl(this, 'portrait_player_ai', fullUrl);
                if (ok) this.setStatus('Avatar forged!');
            }
            if (result.sprite_url) {
                storyState.playerSpriteSheetUrl = `${API_BASE}${result.sprite_url}`;
            }
        } catch (err) {
            console.warn('[intro] Portrait generation failed:', err);
            this.setStatus('');
        }
    }

    async initCutsceneServer(apiKey) {
        const cutscene = this.registry.get('cutsceneClient');
        if (!cutscene || !apiKey) return;
        try {
            await cutscene.init(apiKey, storyState.theme, storyState.playerName);
            console.log('[intro] Cutscene session started:', cutscene.sessionId);
            cutscene.waitForInit(() => {}, 300000).then(() => {
                console.log('[intro] Cutscene server fully ready');
            }).catch(err => {
                console.warn('[intro] Cutscene init poll failed:', err);
            });
        } catch (err) {
            console.warn('[intro] Cutscene init failed:', err);
        }
    }

    setStatus(msg) {
        if (this.statusText?.active) this.statusText.setText(msg);
    }

    displayLines(lines) {
        if (this.done) return;
        const W = this.scale.width, H = this.scale.height;
        const startY = H * 0.35;

        const showLine = (i) => {
            if (this.done || i >= lines.length) {
                this.time.delayedCall(1800, () => { if (!this.done) this.finishIntro(); });
                return;
            }
            const text = this.add.text(W / 2, startY + i * 26, lines[i], {
                fontFamily: '"Press Start 2P"', fontSize: '8px',
                color: '#999999', wordWrap: { width: W - 80 }, align: 'center',
                lineSpacing: 4,
            }).setOrigin(0.5, 0).setAlpha(0).setDepth(3);

            this.tweens.add({
                targets: text, alpha: 1, duration: 1000, ease: 'Sine.easeIn',
                onComplete: () => this.time.delayedCall(700, () => showLine(i + 1)),
            });
        };
        this.time.delayedCall(500, () => showLine(0));
    }

    finishIntro() {
        if (this.done) return;
        this.done = true;
        if (this.loadingTimer) { this.loadingTimer.destroy(); this.loadingTimer = null; }
        this.cameras.main.fadeOut(1000, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('TransitionScene', { trigger: null });
        });
    }
}
