/**
 * MusicManager — AI-generated background music via Google Lyria.
 * Uses Web Audio API for gapless looping + smooth crossfades.
 * Generates unique, context-aware tracks for every room and event.
 * Singleton instance exported as default.
 */

const API_BASE = 'http://localhost:8081';

const PROMPTS = {
    menu: `Atmospheric RPG title screen and character creation music. Instrumental only, no vocals. Nostalgic retro-inspired, mysterious ambient electronic with gentle arpeggios, warm synth pads, and a subtle melodic hook. Slightly melancholic but hopeful, like standing at the threshold of an adventure. Tempo: 85 BPM. Seamlessly loopable background music for a game menu.`,

    intro_cyberpunk: `Dark ambient synthwave for a cinematic story narration. Instrumental only, no vocals. Deep analog bass drones, distant neon-city hum, sparse reverbed piano notes, subtle glitch textures, slowly building tension. Cinematic and atmospheric. Tempo: 70 BPM. Seamlessly loopable.`,
    intro_medieval: `Dark orchestral fantasy music for a story narration. Instrumental only, no vocals. Low cello and viola sustain, distant ethereal choir pads, gentle harp arpeggios, solo oboe melody. Ancient, foreboding, mystical. Tempo: 60 BPM. Seamlessly loopable.`,
    intro_space: `Deep space ambient for a cinematic narration. Instrumental only, no vocals. Vast cosmic synth drones, distant radio static texture, ethereal shimmer pads, isolated piano notes with long reverb tails. Vast emptiness, isolation, wonder mixed with dread. Tempo: 55 BPM. Seamlessly loopable.`,

    loading_cyberpunk: `Atmospheric cyberpunk loading screen ambient. Instrumental only, no vocals. Slow pulsing neon-synth waves, quiet data-stream textures, soft bass drone, digital rain ambience. Anticipation building. Tempo: 65 BPM. Seamlessly loopable.`,
    loading_medieval: `Mysterious medieval loading ambient. Instrumental only, no vocals. Soft wind through ancient halls, distant low bells, gentle string drone, faint whispered choir. The story unfolds. Tempo: 55 BPM. Seamlessly loopable.`,
    loading_space: `Deep space loading ambient. Instrumental only, no vocals. Vast cosmic hum, soft electronic pulses, ship engine drone, distant stellar wind. Drifting between worlds. Tempo: 50 BPM. Seamlessly loopable.`,

    ending_good: `Triumphant emotional RPG ending music. Instrumental only, no vocals. Soaring melody with warm strings, gentle piano, uplifting brass swell, soft choir pads. Victory, hope, a journey completed. Bittersweet but hopeful. Tempo: 80 BPM. Seamlessly loopable.`,
    ending_bad: `Dark somber RPG ending music. Instrumental only, no vocals. Minor key, low cello solo, distant piano decay, mournful oboe, rain-like texture. Loss, regret, the world unchanged. Tempo: 55 BPM. Seamlessly loopable.`,
    ending_neutral: `Reflective RPG ending music. Instrumental only, no vocals. Pensive piano melody, soft ambient pads, gentle acoustic guitar arpeggios, contemplative mood. The journey is over, but what was the cost? Tempo: 70 BPM. Seamlessly loopable.`,
};

const MOOD_PROMPT_FLAVOR = {
    calm:       { energy: 'gentle, relaxed', tempo: '75 BPM', feel: 'peaceful wandering, soft warmth' },
    peaceful:   { energy: 'serene, pastoral', tempo: '70 BPM', feel: 'tranquil beauty, safe haven' },
    tense:      { energy: 'suspenseful, alert', tempo: '100 BPM', feel: 'something is wrong, hidden danger' },
    eerie:      { energy: 'haunting, unsettling', tempo: '65 BPM', feel: 'creeping dread, whispers in the dark' },
    mysterious: { energy: 'enigmatic, curious', tempo: '80 BPM', feel: 'ancient secrets, forbidden knowledge' },
    dangerous:  { energy: 'threatening, intense', tempo: '110 BPM', feel: 'imminent peril, fight or flight' },
    hopeful:    { energy: 'uplifting, bright', tempo: '90 BPM', feel: 'dawn breaking, new beginnings' },
    sad:        { energy: 'melancholic, somber', tempo: '60 BPM', feel: 'loss, bittersweet memories' },
    triumphant: { energy: 'victorious, grand', tempo: '120 BPM', feel: 'celebration, hard-won glory' },
    dark:       { energy: 'ominous, oppressive', tempo: '70 BPM', feel: 'crushing darkness, despair closing in' },
    whimsical:  { energy: 'playful, quirky', tempo: '95 BPM', feel: 'mischievous magic, lighthearted wonder' },
    epic:       { energy: 'grand, sweeping', tempo: '105 BPM', feel: 'vast scale, destiny awaits' },
};

const THEME_INSTRUMENTS = {
    cyberpunk: 'analog synths, glitch textures, sub-bass, neon-tinged electronic tones, retro-digital arpeggios',
    medieval:  'acoustic lute, wooden flute, cello, harp, subtle choir pads, string ensemble',
    space:     'cosmic synth drones, ethereal shimmer pads, distant radio signals, electronic hum, isolated piano',
};

function buildRoomPrompt(theme, mood, roomName, roomDescription) {
    const flavor = MOOD_PROMPT_FLAVOR[mood] || MOOD_PROMPT_FLAVOR.mysterious;
    const instruments = THEME_INSTRUMENTS[theme] || THEME_INSTRUMENTS.cyberpunk;
    let prompt = `${flavor.energy} RPG exploration music. Instrumental only, no vocals. `
        + `Setting: ${theme} world`;
    if (roomName) prompt += `, location "${roomName}"`;
    if (roomDescription) prompt += ` — ${roomDescription.slice(0, 120)}`;
    prompt += `. Instruments: ${instruments}. `
        + `Mood: ${flavor.feel}. Tempo: ${flavor.tempo}. `
        + `Seamlessly loopable game background music. High quality, cinematic.`;
    return prompt;
}

function buildCombatPrompt(theme, enemyName, mood) {
    const instruments = THEME_INSTRUMENTS[theme] || THEME_INSTRUMENTS.cyberpunk;
    const intensity = mood === 'dangerous' ? 'extremely intense, relentless' : 'intense, driving';
    let prompt = `${intensity} RPG battle music. Instrumental only, no vocals. `
        + `Setting: ${theme} world. `;
    if (enemyName) prompt += `Fighting "${enemyName}". `;
    prompt += `Instruments: ${instruments}, with aggressive percussion and dramatic energy. `
        + `Adrenaline-pumping, high stakes combat. Tempo: 135 BPM. `
        + `Seamlessly loopable. High quality, cinematic.`;
    return prompt;
}

class MusicManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.currentSource = null;
        this.currentGain = null;
        this.currentKey = null;
        this.bufferCache = {};
        this.pendingRequests = {};
        this.dynamicPrompts = {};
        this.apiKey = null;
        this.volume = 0.30;
        this._stopped = false;
    }

    setApiKey(key) { this.apiKey = key; }

    _ensureCtx() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    _resolvePrompt(cacheKey) {
        if (PROMPTS[cacheKey]) return PROMPTS[cacheKey];
        if (this.dynamicPrompts[cacheKey]) return this.dynamicPrompts[cacheKey];
        return null;
    }

    async _fetchBuffer(cacheKey) {
        if (this.bufferCache[cacheKey]) return this.bufferCache[cacheKey];
        if (this.pendingRequests[cacheKey]) return this.pendingRequests[cacheKey];

        const prompt = this._resolvePrompt(cacheKey);
        if (!prompt || !this.apiKey) return null;

        const req = (async () => {
            try {
                console.log(`[music] Generating: ${cacheKey}`);
                const res = await fetch(`${API_BASE}/api/generate-music`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_key: this.apiKey, cache_key: cacheKey, prompt }),
                });
                if (!res.ok) throw new Error(res.status);
                const data = await res.json();
                if (!data.music_url) return null;

                this._ensureCtx();
                const audio = await fetch(`${API_BASE}${data.music_url}`);
                const buf = await this.ctx.decodeAudioData(await audio.arrayBuffer());
                this.bufferCache[cacheKey] = buf;
                console.log(`[music] Ready: ${cacheKey}${data.cached ? ' (cached)' : ' (fresh)'}`);
                return buf;
            } catch (err) {
                console.warn(`[music] ${cacheKey}:`, err);
                return null;
            } finally {
                delete this.pendingRequests[cacheKey];
            }
        })();

        this.pendingRequests[cacheKey] = req;
        return req;
    }

    /**
     * Play a track by key. If the key doesn't exist in static PROMPTS,
     * it must have been registered via playRoom/playCombat/preloadRoom first.
     */
    async play(cacheKey, fadeMs = 2000) {
        if (!cacheKey || cacheKey === this.currentKey) return;
        this._stopped = false;
        this._ensureCtx();

        const buffer = await this._fetchBuffer(cacheKey);
        if (!buffer || this._stopped) return;

        this._crossfadeTo(buffer, cacheKey, fadeMs);
    }

    /**
     * Generate and play unique room exploration music.
     */
    playRoom(theme, mood, roomName, roomDescription, roomId) {
        const key = `room_${(roomId || roomName || 'unknown').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`;
        if (!this.dynamicPrompts[key]) {
            this.dynamicPrompts[key] = buildRoomPrompt(theme, mood, roomName, roomDescription);
        }
        this.play(key, 2500);
        return key;
    }

    /**
     * Generate and play unique combat music based on enemy context.
     */
    playCombat(theme, enemyName, mood) {
        const safe = (enemyName || 'enemy').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
        const key = `combat_${theme}_${safe}`;
        if (!this.dynamicPrompts[key]) {
            this.dynamicPrompts[key] = buildCombatPrompt(theme, enemyName, mood);
        }
        this.play(key, 1000);
        return key;
    }

    /**
     * Pre-generate room music so it's ready before the player arrives.
     */
    preloadRoom(theme, mood, roomName, roomDescription, roomId) {
        const key = `room_${(roomId || roomName || 'unknown').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`;
        if (!this.dynamicPrompts[key]) {
            this.dynamicPrompts[key] = buildRoomPrompt(theme, mood, roomName, roomDescription);
        }
        this._fetchBuffer(key);
        return key;
    }

    /**
     * Pre-generate combat music.
     */
    preloadCombat(theme, enemyName, mood) {
        const safe = (enemyName || 'enemy').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
        const key = `combat_${theme}_${safe}`;
        if (!this.dynamicPrompts[key]) {
            this.dynamicPrompts[key] = buildCombatPrompt(theme, enemyName, mood);
        }
        this._fetchBuffer(key);
        return key;
    }

    /**
     * Preload a static key (menu, intro, loading, ending).
     */
    preload(cacheKey) {
        if (cacheKey && this._resolvePrompt(cacheKey)) this._fetchBuffer(cacheKey);
    }

    _crossfadeTo(buffer, cacheKey, fadeMs) {
        const now = this.ctx.currentTime;
        const fadeSec = fadeMs / 1000;

        if (this.currentSource) {
            const oldGain = this.currentGain;
            const oldSource = this.currentSource;
            oldGain.gain.cancelScheduledValues(now);
            oldGain.gain.setValueAtTime(oldGain.gain.value, now);
            oldGain.gain.linearRampToValueAtTime(0, now + fadeSec);
            setTimeout(() => {
                try { oldSource.stop(); oldGain.disconnect(); } catch {}
            }, fadeMs + 300);
        }

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + fadeSec);
        gain.connect(this.masterGain);

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        source.start();

        this.currentSource = source;
        this.currentGain = gain;
        this.currentKey = cacheKey;
    }

    stop(fadeMs = 1500) {
        this._stopped = true;
        if (!this.currentSource || !this.ctx) return;

        const now = this.ctx.currentTime;
        const oldGain = this.currentGain;
        const oldSource = this.currentSource;

        oldGain.gain.cancelScheduledValues(now);
        oldGain.gain.setValueAtTime(oldGain.gain.value, now);
        oldGain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
        setTimeout(() => {
            try { oldSource.stop(); oldGain.disconnect(); } catch {}
        }, fadeMs + 300);

        this.currentSource = null;
        this.currentGain = null;
        this.currentKey = null;
    }

    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        if (this.masterGain) this.masterGain.gain.value = this.volume;
    }
}

const musicManager = new MusicManager();
export default musicManager;
