/**
 * CutsceneClient — talks to the Python FastAPI backend.
 * Supports preloading, caching, and rate-limit-aware batch requests.
 *
 * Key design: cache checking works IMMEDIATELY after init() returns a sessionId.
 * The "ready" flag only gates PRELOAD requests (which need the Veo model loaded).
 * This means the server's auto-queued first_room cutscene can be polled and played
 * even before the init finishes, because the server queues it internally.
 */
const API_BASE = 'http://localhost:8081';

export class CutsceneClient {
    constructor() {
        this.sessionId = null;
        this.ready = false;
        this._pendingPreloads = [];
    }

    get hasSession() { return !!this.sessionId; }

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
        if (data.status === 'ready') {
            this.ready = true;
            this._flushPendingPreloads();
        }
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

    getFirstRoomCacheKey() {
        return this.sessionId ? `${this.sessionId}_first_room` : null;
    }

    // ── Preload / cache system ──

    async preload(requests) {
        if (!this.sessionId) return { queued: [], already_cached: [] };

        if (!this.ready) {
            this._pendingPreloads.push(...requests);
            return { queued: requests.map(r => r.cache_key), already_cached: [], deferred: true };
        }

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

    async _flushPendingPreloads() {
        if (this._pendingPreloads.length === 0) return;
        const batch = this._pendingPreloads.splice(0);
        console.log('[cutscene] flushing deferred preloads:', batch.length);
        try {
            await this.preload(batch);
        } catch (e) {
            console.warn('[cutscene] flush failed:', e);
        }
    }

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

    async getOrWait(cacheKey, timeoutMs = 180000, onProgress = null) {
        const start = Date.now();
        let errorCount = 0;
        while (Date.now() - start < timeoutMs) {
            const status = await this.checkCache(cacheKey);
            if (onProgress) onProgress(status);
            if (!status || status.status === 'not_found') {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            if (status.status === 'complete') return status;
            if (status.status === 'error') {
                errorCount++;
                if (errorCount >= 3) return status;
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            await new Promise(r => setTimeout(r, 2500));
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

    // ── Legacy cutscene endpoint ──

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
        this._cleanup();

        return new Promise((resolve) => {
            this._resolve = resolve;
            if (!this.video || !this.overlay) {
                console.warn('[cutscene-player] No video/overlay element');
                resolve();
                return;
            }

            this._playbackTimeout = setTimeout(() => {
                console.warn('[cutscene-player] Playback timeout (60s), finishing');
                this._finish();
            }, 60000);

            this._errorHandler = () => {
                const msg = this.video?.error?.message || 'unknown';
                console.warn('[cutscene-player] Video error:', msg);
                this._finish();
            };

            this.video.addEventListener('error', this._errorHandler, { once: true });

            console.log('[cutscene-player] Loading video:', videoUrl);
            this.video.src = videoUrl;
            this.video.load();
            this.overlay.classList.add('active');

            this.video.addEventListener('canplay', () => {
                console.log('[cutscene-player] Video ready, playing');
                this.video.play().catch((err) => {
                    console.warn('[cutscene-player] play() blocked:', err.message);
                    this.video.muted = true;
                    this.video.play().catch(() => this._finish());
                });
            }, { once: true });
        });
    }

    skip() {
        if (this.video) { this.video.pause(); this.video.currentTime = 0; }
        this._finish();
    }

    _cleanup() {
        if (this._playbackTimeout) { clearTimeout(this._playbackTimeout); this._playbackTimeout = null; }
        if (this._errorHandler && this.video) {
            this.video.removeEventListener('error', this._errorHandler);
            this._errorHandler = null;
        }
    }

    _finish() {
        this._cleanup();
        if (this.overlay) this.overlay.classList.remove('active');
        if (this.video) { this.video.pause(); this.video.src = ''; }
        if (this._resolve) { this._resolve(); this._resolve = null; }
    }
}
