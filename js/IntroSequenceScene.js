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

export default class IntroSequenceScene extends Phaser.Scene {
    constructor() { super('IntroSequenceScene'); }

    create() {
        const W = this.scale.width, H = this.scale.height;
        this.cameras.main.setBackgroundColor('#000000');

        this.introLines = [];
        this.lineObjects = [];
        this.done = false;
        this.assetsReady = false;

        const skipHint = this.add.text(W - 10, H - 10, '[ENTER to skip]', {
            fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#222222'
        }).setOrigin(1, 1).setDepth(5);
        this.tweens.add({ targets: skipHint, alpha: 0.4, duration: 1500, yoyo: true, repeat: -1 });

        this.statusText = this.add.text(W / 2, H - 20, '', {
            fontFamily: '"Press Start 2P"', fontSize: '5px', color: '#1a1a1a'
        }).setOrigin(0.5).setDepth(5);

        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER).on('down', () => {
            if (!this.done) this.finishIntro();
        });

        this.soulHeart = this.add.text(W / 2, H / 2 - 80, '♥', {
            fontSize: '48px', color: storyState.soulColor || '#ff0000',
        }).setOrigin(0.5).setAlpha(0).setDepth(2);

        this.tweens.add({
            targets: this.soulHeart, alpha: 0.6, duration: 2000, ease: 'Sine.easeIn',
            onComplete: () => {
                this.tweens.add({
                    targets: this.soulHeart, alpha: 0.2, scaleX: 1.1, scaleY: 1.1,
                    duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
            }
        });

        this.kickOffParallelWork();
        this.generateIntro();

        const music = this.registry.get('musicManager');
        if (music) {
            const theme = storyState.theme || 'cyberpunk';
            music.play(`intro_${theme}`);
            music.preload(`combat_${theme}`);
            music.preload(`explore_${theme}_calm`);
        }
    }

    // ── Parallel background work during narration ──

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
            await cutscene.waitForInit(() => {}, 120000);
        } catch (err) {
            console.warn('[intro] Cutscene init failed:', err);
        }
    }

    setStatus(msg) {
        if (this.statusText?.active) this.statusText.setText(msg);
    }

    // ── Narration ──

    async generateIntro() {
        const gemini = this.registry.get('geminiClient');
        const name = storyState.playerName || 'Wanderer';
        const trait = storyState.soulTrait || 'Determination';
        const theme = storyState.theme || 'cyberpunk';

        const FALLBACK = {
            cyberpunk: [
                'The neon bleeds into rain-soaked streets.',
                `A soul burns bright in the undercity — the soul of ${name}.`,
                `Driven by ${trait}, they walk where others dare not.`,
                'The megacorps hide a truth. The Oracle knows.',
                'But the path to truth... is paved with choices.',
                `And so begins the story of ${name}.`,
            ],
            medieval: [
                'The kingdom crumbles under a shadow curse.',
                `In the ruins, a single soul endures — ${name}.`,
                `Their ${trait} burns like a torch in the darkness.`,
                'Three Sacred Relics. One last hope.',
                'But who can be trusted in a land of betrayal?',
                `And so begins the legend of ${name}.`,
            ],
            space: [
                'Station Omega-7 drifts in silence.',
                `One soul remains awake — ${name}.`,
                `Fueled by ${trait}, they face the void alone.`,
                'Strange signals pulse from the station core.',
                'The crew is fractured. Something lurks below.',
                `And so begins the odyssey of ${name}.`,
            ],
        };

        let lines = FALLBACK[theme] || FALLBACK.cyberpunk;

        if (gemini) {
            try {
                const result = await gemini.callGemini(
                    `ACTION: generate_intro_narration\n\nGenerate a 5-6 line atmospheric introduction for a story RPG.\nPlayer name: ${name}\nSoul trait: ${trait}\nWorld theme: ${theme}\n\nEach line: short (under 60 chars), dramatic. Reference name and trait. Return ONLY a JSON array of strings.`
                );
                if (Array.isArray(result) && result.length >= 3) lines = result.slice(0, 7);
            } catch (err) {
                console.warn('[intro] Gemini narration failed:', err);
            }
        }

        this.introLines = lines;
        this.displayLines();
    }

    displayLines() {
        if (this.done) return;
        const W = this.scale.width, H = this.scale.height;
        const startY = H / 2 - 30;

        const showLine = (i) => {
            if (this.done || i >= this.introLines.length) {
                this.time.delayedCall(2000, () => { if (!this.done) this.finishIntro(); });
                return;
            }
            const text = this.add.text(W / 2, startY + i * 28, this.introLines[i], {
                fontFamily: '"Press Start 2P"', fontSize: '8px',
                color: '#888888', wordWrap: { width: W - 80 }, align: 'center'
            }).setOrigin(0.5).setAlpha(0).setDepth(3);
            this.lineObjects.push(text);
            this.tweens.add({
                targets: text, alpha: 1, duration: 1200, ease: 'Sine.easeIn',
                onComplete: () => this.time.delayedCall(800, () => showLine(i + 1)),
            });
        };
        this.time.delayedCall(1500, () => showLine(0));
    }

    finishIntro() {
        if (this.done) return;
        this.done = true;
        this.cameras.main.fadeOut(1000, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('TransitionScene', { trigger: null });
        });
    }
}
