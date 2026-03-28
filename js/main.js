import BootScene from './BootScene.js';
import IntroSequenceScene from './IntroSequenceScene.js';
import GameScene from './GameScene.js';
import CombatScene from './CombatScene.js';
import TransitionScene from './TransitionScene.js';
import { GeminiClient } from './gemini.js';
import { CutsceneClient, CutscenePlayer } from './cutsceneClient.js';
import storyState from './storyState.js';
import { runCharacterCreation } from './CharacterCreate.js';
import musicManager from './MusicManager.js';

let game = null;

function initGame(apiKey, model, characterData) {
    if (game) return;

    document.getElementById('character-create-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';

    storyState.reset(characterData.theme);
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
        width: 960,
        height: 640,
        parent: 'game-container',
        pixelArt: true,
        physics: {
            default: 'arcade',
            arcade: { gravity: { y: 0 }, debug: false }
        },
        scene: [BootScene, IntroSequenceScene, TransitionScene, GameScene, CombatScene],
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

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-btn').addEventListener('click', async () => {
        const key = document.getElementById('api-key').value.trim();
        if (!key) {
            const inp = document.getElementById('api-key');
            inp.style.borderColor = '#ff4444';
            inp.setAttribute('placeholder', 'API key is required!');
            return;
        }
        const model = document.getElementById('model-select').value;

        document.getElementById('setup-screen').style.display = 'none';

        musicManager.setApiKey(key);
        musicManager.play('menu');

        const characterData = await runCharacterCreation();

        initGame(key, model, characterData);
    });

    document.getElementById('api-key').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('start-btn').click();
    });
});
