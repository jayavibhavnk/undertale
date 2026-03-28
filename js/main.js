import BootScene from './BootScene.js';
import ThemeSelectScene from './ThemeSelectScene.js';
import GameScene from './GameScene.js';
import CombatScene from './CombatScene.js';
import TransitionScene from './TransitionScene.js';
import { GeminiClient } from './gemini.js';
import storyState from './storyState.js';

let game = null;

function initGame(apiKey, model) {
    if (game) return;

    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';

    const config = {
        type: Phaser.AUTO,
        width: 640,
        height: 480,
        parent: 'game-container',
        pixelArt: true,
        physics: {
            default: 'arcade',
            arcade: { gravity: { y: 0 }, debug: false }
        },
        scene: [BootScene, ThemeSelectScene, TransitionScene, GameScene, CombatScene],
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

    const client = new GeminiClient(apiKey, model);
    game.registry.set('geminiClient', client);
    game.registry.set('storyState', storyState);

    setTimeout(() => {
        const canvas = document.querySelector('#game-container canvas');
        if (canvas) { canvas.focus(); canvas.setAttribute('tabindex', '0'); }
    }, 200);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-btn').addEventListener('click', () => {
        const key = document.getElementById('api-key').value.trim();
        if (!key) {
            const inp = document.getElementById('api-key');
            inp.style.borderColor = '#ff4444';
            inp.setAttribute('placeholder', 'API key is required!');
            return;
        }
        const model = document.getElementById('model-select').value;
        initGame(key, model);
    });

    document.getElementById('api-key').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('start-btn').click();
    });
});
