/**
 * CutsceneClient — talks to the Python FastAPI backend.
 * Supports preloading, caching, and rate-limit-aware batch requests.
 */
const API_BASE = 'http://localhost:8081';

export class CutsceneClient {
    constructor() {
        this.sessionId = null;
        this.ready = false;
    }

    async init(apiKey, worldType, characterName = 'Wanderer', customization = '') {
        const res = await fetch(`${API_BASE}/api/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                world_type: worldType,
                character_name: characterName,
                customization_text: customization,
            }),
        });
        if (!res.ok) throw new Error(`Init failed: ${res.status}`);
        const data = await res.json();
        this.sessionId = data.session_id;
        return data;
    }

    async pollInit() {
        if (!this.sessionId) return { status: 'error', error: 'No session' };
        const res = await fetch(`${API_BASE}/api/init/${this.sessionId}`);
        const data = await res.json();
        if (data.status === 'ready') this.ready = true;
        return data;
    }

    async waitForInit(onProgress, timeoutMs = 300000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const status = await this.pollInit();
            if (onProgress) onProgress(status);
            if (status.status === 'ready') return status;
            if (status.status === 'error') throw new Error(status.error);
            await new Promise(r => setTimeout(r, 2000));
        }
        throw new Error('Init timed out');
    }

    // ── Preload / cache system ──

    /**
     * Queue multiple cutscene generation jobs on the server.
     * @param {Array<{cache_key, trigger_type, context}>} requests
     */
    async preload(requests) {
        if (!this.ready || !this.sessionId) return { queued: [], already_cached: [] };
        try {
            const res = await fetch(`${API_BASE}/api/preload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: this.sessionId, requests }),
            });
            if (!res.ok) return { queued: [], already_cached: [] };
            return await res.json();
        } catch (err) {
            console.warn('[cutscene] preload error:', err);
            return { queued: [], already_cached: [] };
        }
    }

    /**
     * Check the cache status of a single cutscene by key.
     * Returns { status, progress, video_url, error } with absolute video_url.
     */
    async checkCache(cacheKey) {
        try {
            const res = await fetch(`${API_BASE}/api/cache/${encodeURIComponent(cacheKey)}`);
            if (!res.ok) return null;
            const data = await res.json();
            if (data.video_url && !data.video_url.startsWith('http')) {
                data.video_url = `${API_BASE}${data.video_url}`;
            }
            return data;
        } catch {
            return null;
        }
    }

    /**
     * Poll cache until the cutscene is complete or timeout.
     * @returns {{ status, video_url } | { status: 'timeout' }}
     */
    async getOrWait(cacheKey, timeoutMs = 120000, onProgress = null) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const status = await this.checkCache(cacheKey);
            if (onProgress) onProgress(status);
            if (!status || status.status === 'not_found') {
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            if (status.status === 'complete') return status;
            if (status.status === 'error') return status;
            await new Promise(r => setTimeout(r, 3000));
        }
        return { status: 'timeout' };
    }

    async getRateLimit() {
        try {
            const res = await fetch(`${API_BASE}/api/rate-limit`);
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    // ── Legacy cutscene endpoint (used by TransitionScene for act transitions) ──

    async requestCutscene(trigger, storyContext, exitDirection, exitLabel,
                          roomName, roomMood) {
        if (!this.ready) return null;
        const res = await fetch(`${API_BASE}/api/cutscene`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: this.sessionId,
                trigger, story_context: storyContext,
                exit_direction: exitDirection || '',
                exit_label: exitLabel || '',
                room_name: roomName || '',
                room_mood: roomMood || '',
            }),
        });
        if (!res.ok) return null;
        return await res.json();
    }

    async waitForCutscene(sceneId, onProgress, timeoutMs = 180000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const status = await this.checkCache(sceneId);
            if (onProgress) onProgress(status);
            if (status?.status === 'complete') return status;
            if (status?.status === 'error') return status;
            await new Promise(r => setTimeout(r, 3000));
        }
        return { status: 'timeout' };
    }
}

/**
 * Manages the HTML <video> overlay for cutscene playback.
 */
export class CutscenePlayer {
    constructor() {
        this.overlay = document.getElementById('cutscene-overlay');
        this.video = document.getElementById('cutscene-video');
        this.skipBtn = document.getElementById('cutscene-skip');
        this._resolve = null;

        if (this.skipBtn) {
            this.skipBtn.addEventListener('click', () => this.skip());
        }
        if (this.video) {
            this.video.addEventListener('ended', () => this._finish());
        }
    }

    play(videoUrl) {
        return new Promise((resolve) => {
            this._resolve = resolve;
            if (!this.video || !this.overlay) { resolve(); return; }
            this.video.src = videoUrl;
            this.overlay.classList.add('active');
            this.video.play().catch(() => this._finish());
        });
    }

    skip() {
        if (this.video) { this.video.pause(); this.video.currentTime = 0; }
        this._finish();
    }

    _finish() {
        if (this.overlay) this.overlay.classList.remove('active');
        if (this.video) { this.video.pause(); this.video.src = ''; }
        if (this._resolve) { this._resolve(); this._resolve = null; }
    }
}
