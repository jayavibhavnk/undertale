/**
 * MusicManager — AI-generated background music via Google Lyria.
 * Uses Web Audio API for gapless looping + smooth crossfades.
 * Singleton instance exported as default.
 */

const API_BASE = 'http://localhost:8081';

const PROMPTS = {
    menu: `Atmospheric RPG title screen and character creation music. Instrumental only, no vocals. Nostalgic retro-inspired, mysterious ambient electronic with gentle arpeggios, warm synth pads, and a subtle melodic hook. Slightly melancholic but hopeful, like standing at the threshold of an adventure. Tempo: 85 BPM. Seamlessly loopable background music for a game menu.`,

    intro_cyberpunk: `Dark ambient synthwave for a cinematic story narration. Instrumental only, no vocals. Deep analog bass drones, distant neon-city hum, sparse reverbed piano notes, subtle glitch textures, slowly building tension. Cinematic and atmospheric. Tempo: 70 BPM. Seamlessly loopable.`,
    intro_medieval: `Dark orchestral fantasy music for a story narration. Instrumental only, no vocals. Low cello and viola sustain, distant ethereal choir pads, gentle harp arpeggios, solo oboe melody. Ancient, foreboding, mystical. Tempo: 60 BPM. Seamlessly loopable.`,
    intro_space: `Deep space ambient for a cinematic narration. Instrumental only, no vocals. Vast cosmic synth drones, distant radio static texture, ethereal shimmer pads, isolated piano notes with long reverb tails. Vast emptiness, isolation, wonder mixed with dread. Tempo: 55 BPM. Seamlessly loopable.`,

    explore_cyberpunk_calm: `Chill lo-fi synthwave exploration music for a cyberpunk RPG. Instrumental only, no vocals. Relaxed electronic beats, warm detuned synth pads, soft sub-bass groove, muted neon-tinged melodies, vinyl crackle texture. Nighttime city wandering through neon rain. Tempo: 85 BPM. Seamlessly loopable game background music.`,
    explore_cyberpunk_tense: `Tense cyberpunk ambient music. Instrumental only, no vocals. Dark pulsing analog synth, glitchy stutter percussion, ominous sub-bass, distant alarm-like tones, digital interference textures. Something is wrong. Surveillance, hidden danger. Tempo: 100 BPM. Seamlessly loopable.`,
    explore_medieval_calm: `Peaceful medieval fantasy exploration music. Instrumental only, no vocals. Gentle acoustic lute picking, soft wooden flute melody, warm string pad, occasional harp glissando, birdsong texture. Cozy tavern warmth and countryside beauty. Tempo: 80 BPM. Seamlessly loopable game background music.`,
    explore_medieval_tense: `Tense medieval dungeon music. Instrumental only, no vocals. Low string tremolo, distant tribal war drums, ominous monk choir whispers, sparse plucked dulcimer, wind howling. Dark stone corridors, ancient danger lurking. Tempo: 75 BPM. Seamlessly loopable.`,
    explore_space_calm: `Calm space station ambient music. Instrumental only, no vocals. Gentle electronic hum, soft glowing synth pads, quiet computer beeps and chirps, floating arpeggio, subtle mechanical rhythm. Serene observation deck, stargazing. Tempo: 70 BPM. Seamlessly loopable game background music.`,
    explore_space_tense: `Tense sci-fi corridor music. Instrumental only, no vocals. Metallic percussion hits, pulsing deep sub-bass, distorted radio signal fragments, eerie synthetic vocal-like tones, hull stress creaking. Something is aboard. Creeping dread. Tempo: 90 BPM. Seamlessly loopable.`,

    combat_cyberpunk: `Intense cyberpunk battle music for an RPG fight. Instrumental only, no vocals. Aggressive driving synthwave, heavy distorted bass drops, fast glitchy breakbeat percussion, screaming lead synth riffs, adrenaline energy. Street fight in neon chaos. Tempo: 140 BPM. Seamlessly loopable.`,
    combat_medieval: `Epic medieval battle music for an RPG fight. Instrumental only, no vocals. Full orchestra with thundering war drums, bold brass fanfares, urgent string ostinato, powerful choir chants. Clash of swords, desperate valor. Tempo: 135 BPM. Seamlessly loopable.`,
    combat_space: `Intense sci-fi combat music for an RPG fight. Instrumental only, no vocals. Electronic orchestra hybrid, pulsing energy-beam synths, dramatic brass-like leads, rapid snare percussion, laser-effect arpeggios. Zero-gravity battle for survival. Tempo: 130 BPM. Seamlessly loopable.`,
};

export function getMusicKey(type, theme, mood) {
    if (type === 'menu') return 'menu';
    if (type === 'intro') return `intro_${theme}`;
    if (type === 'combat') return `combat_${theme}`;
    if (type === 'explore') {
        const cat = ['calm', 'peaceful'].includes(mood) ? 'calm' : 'tense';
        return `explore_${theme}_${cat}`;
    }
    return null;
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

    async _fetchBuffer(cacheKey) {
        if (this.bufferCache[cacheKey]) return this.bufferCache[cacheKey];
        if (this.pendingRequests[cacheKey]) return this.pendingRequests[cacheKey];

        const prompt = PROMPTS[cacheKey];
        if (!prompt || !this.apiKey) return null;

        const req = (async () => {
            try {
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

    async play(cacheKey, fadeMs = 2000) {
        if (!cacheKey || cacheKey === this.currentKey) return;
        this._stopped = false;
        this._ensureCtx();

        const buffer = await this._fetchBuffer(cacheKey);
        if (!buffer || this._stopped) return;

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

    preload(cacheKey) {
        if (cacheKey && PROMPTS[cacheKey]) this._fetchBuffer(cacheKey);
    }

    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        if (this.masterGain) this.masterGain.gain.value = this.volume;
    }
}

const musicManager = new MusicManager();
export default musicManager;
