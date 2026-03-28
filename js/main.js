import BootScene from './BootScene.js';
import IntroSequenceScene from './IntroSequenceScene.js';
import GameScene from './GameScene.js';
import CombatScene from './CombatScene.js';
import TransitionScene from './TransitionScene.js';
import EndingScene from './EndingScene.js';
import { GeminiClient } from './gemini.js';
import { CutsceneClient, CutscenePlayer } from './cutsceneClient.js';
import storyState from './storyState.js';
import { runCharacterCreation } from './CharacterCreate.js';
import musicManager from './MusicManager.js';

const API_BASE = 'http://localhost:8081';

let game = null;

const THEME_COLORS = {
    cyberpunk: '#00ffff',
    medieval: '#ffd700',
    space: '#4488ff',
};

function initGame(apiKey, model, characterData) {
    if (game) return;

    document.getElementById('character-create-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';

    storyState.reset(characterData.theme);
    storyState.maxRooms = characterData.maxRooms || 10;
    storyState.setCharacterIdentity({
        name: characterData.name,
        soulColor: characterData.soulColor,
        soulTrait: characterData.soulTrait,
        characterPresetId: characterData.characterPresetId,
        characterPhotoUrl: characterData.characterPhotoUrl,
        enemyPresetIds: characterData.enemyPresetIds,
        playerPortraitUrl: characterData.playerPortraitUrl,
        playerSpriteSheetUrl: characterData.playerSpriteSheetUrl,
    });

    const config = {
        type: Phaser.AUTO,
        width: 1280,
        height: 720,
        parent: 'game-container',
        pixelArt: true,
        physics: {
            default: 'arcade',
            arcade: { gravity: { y: 0 }, debug: false }
        },
        scene: [BootScene, IntroSequenceScene, TransitionScene, GameScene, CombatScene, EndingScene],
        input: {
            keyboard: {
                capture: [
                    Phaser.Input.Keyboard.KeyCodes.UP,
                    Phaser.Input.Keyboard.KeyCodes.DOWN,
                    Phaser.Input.Keyboard.KeyCodes.LEFT,
                    Phaser.Input.Keyboard.KeyCodes.RIGHT,
                    Phaser.Input.Keyboard.KeyCodes.Z,
                    Phaser.Input.Keyboard.KeyCodes.X,
                    Phaser.Input.Keyboard.KeyCodes.ENTER
                ]
            }
        }
    };

    game = new Phaser.Game(config);

    const gemini = new GeminiClient(apiKey, model);
    gemini.setTheme(characterData.theme);

    const cutscene = new CutsceneClient();
    const player = new CutscenePlayer();

    game.registry.set('geminiClient', gemini);
    game.registry.set('cutsceneClient', cutscene);
    game.registry.set('cutscenePlayer', player);
    game.registry.set('storyState', storyState);
    game.registry.set('apiKey', apiKey);
    game.registry.set('musicManager', musicManager);

    setTimeout(() => {
        const canvas = document.querySelector('#game-container canvas');
        if (canvas) { canvas.focus(); canvas.setAttribute('tabindex', '0'); }
    }, 200);
}

function renderGallery(games) {
    const grid = document.getElementById('gallery-grid');
    const empty = document.getElementById('gallery-empty');

    if (!games || games.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    for (const g of games) {
        const card = document.createElement('a');
        card.className = 'gallery-card';
        card.href = `recap.html?id=${g.game_id}`;
        card.target = '_blank';

        const themeColor = THEME_COLORS[g.theme] || '#888';
        const endingTitle = g.endingType?.title || 'Unknown';

        let portraitHtml;
        if (g.portraitUrl) {
            portraitHtml = `<img class="gallery-portrait" src="${g.portraitUrl}" alt="" onerror="this.style.display='none'">`;
        } else {
            portraitHtml = `<span class="gallery-soul-icon" style="color:${g.soulColor || '#ff0000'}">♥</span>`;
        }

        card.innerHTML = `
            <div class="gallery-card-top">
                ${portraitHtml}
                <div class="gallery-card-info">
                    <span class="gallery-player-name">${g.playerName || 'Wanderer'}</span>
                    <span class="gallery-theme-badge" style="color:${themeColor};border-color:${themeColor};">${(g.theme || 'unknown').toUpperCase()}</span>
                </div>
            </div>
            <div class="gallery-card-bottom">
                <span class="gallery-ending">${endingTitle}</span>
                <span class="gallery-rooms">${g.roomCount || 0}/${g.maxRooms || '?'} rooms</span>
            </div>
        `;
        grid.appendChild(card);
    }
}

async function loadGallery() {
    try {
        const res = await fetch(`${API_BASE}/api/games`);
        if (!res.ok) return;
        const data = await res.json();
        renderGallery(data.games || []);
    } catch {
        // server might not be running
    }
}

function startGameFlow() {
    const landing = document.getElementById('landing-page');
    const wrapper = document.getElementById('game-wrapper');

    landing.style.display = 'none';
    wrapper.style.display = 'block';
    document.body.style.overflow = 'hidden';
    document.body.style.alignItems = 'center';
}

document.addEventListener('DOMContentLoaded', () => {
    loadGallery();

    document.getElementById('landing-play-btn').addEventListener('click', () => {
        document.getElementById('landing-play-btn').style.display = 'none';
        document.getElementById('landing-api-form').style.display = 'flex';
        document.getElementById('api-key').focus();
    });

    document.getElementById('start-btn').addEventListener('click', async () => {
        const key = document.getElementById('api-key').value.trim();
        if (!key) {
            const inp = document.getElementById('api-key');
            inp.style.borderColor = '#ff4444';
            inp.setAttribute('placeholder', 'API key is required!');
            return;
        }
        const model = document.getElementById('model-select').value;

        musicManager.setApiKey(key);
        musicManager.play('menu');

        startGameFlow();

        const characterData = await runCharacterCreation();

        initGame(key, model, characterData);
    });

    document.getElementById('api-key').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('start-btn').click();
    });
});
