import storyState from './storyState.js';

export default class BootScene extends Phaser.Scene {
    constructor() { super('BootScene'); }

    create() {
        this.generatePlayerSprites();
        this.generateNPCSprites();
        this.generateEnemySprite();
        this.generateObstacles();
        this.generateDoor();
        this.generateItem();
        this.generateInteractable();
        this.generateCombatAssets();
        this.generateUI();
        this.generatePortraitFrames();
        this.scene.start('IntroSequenceScene');
    }

    generatePlayerSprites() {
        const dirs = [
            { key: 'player_down', eyes: [[7,6],[11,6]], flip: false },
            { key: 'player_up', eyes: null, flip: false },
            { key: 'player_left', eyes: [[6,6]], flip: false },
            { key: 'player_right', eyes: [[12,6]], flip: false }
        ];
        for (const d of dirs) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0x553311); g.fillRect(4, 0, 12, 4);
            if (d.eyes) {
                g.fillStyle(0xffcc88); g.fillRect(5, 3, 10, 9);
                g.fillStyle(0x000000);
                for (const [ex, ey] of d.eyes) g.fillRect(ex, ey, 2, 2);
            } else {
                g.fillStyle(0x553311); g.fillRect(4, 0, 12, 6);
                g.fillRect(5, 6, 10, 6);
            }
            g.fillStyle(0x4466ff); g.fillRect(3, 12, 14, 10);
            g.fillStyle(0x3322aa); g.fillRect(4, 22, 5, 6); g.fillRect(11, 22, 5, 6);
            g.generateTexture(d.key, 20, 28);
            g.destroy();
        }
    }

    generateNPCSprites() {
        const types = ['merchant', 'warrior', 'mage', 'civilian', 'suspicious', 'royal', 'alien', 'robot'];
        for (const type of types) {
            const g = this.make.graphics({ add: false });
            switch (type) {
                case 'merchant':
                    g.fillStyle(0xffffff); g.fillRect(2, 0, 20, 8);
                    g.fillStyle(0xdddddd); g.fillRect(5, 6, 14, 10);
                    g.fillStyle(0x000000); g.fillRect(8, 9, 2, 2); g.fillRect(14, 9, 2, 2);
                    g.fillStyle(0xffffff); g.fillRect(3, 16, 18, 14);
                    g.fillStyle(0xeeeeee); g.fillRect(10, 18, 4, 10);
                    break;
                case 'warrior':
                    g.fillStyle(0xcccccc); g.fillRect(3, 0, 18, 6);
                    g.fillStyle(0xaaaaaa); g.fillRect(5, 5, 14, 10);
                    g.fillStyle(0x000000); g.fillRect(8, 8, 2, 2); g.fillRect(14, 8, 2, 2);
                    g.fillStyle(0xcccccc); g.fillRect(2, 15, 20, 13);
                    g.fillStyle(0x888888); g.fillRect(0, 12, 4, 16); g.fillRect(20, 12, 4, 16);
                    break;
                case 'mage':
                    g.fillStyle(0xffffff); g.fillTriangle(12, 0, 2, 12, 22, 12);
                    g.fillStyle(0xdddddd); g.fillRect(5, 10, 14, 8);
                    g.fillStyle(0x000000); g.fillRect(8, 12, 2, 2); g.fillRect(14, 12, 2, 2);
                    g.fillStyle(0xffffff); g.fillRect(3, 18, 18, 12);
                    break;
                case 'suspicious':
                    g.fillStyle(0x888888); g.fillRect(1, 0, 22, 10);
                    g.fillStyle(0x666666); g.fillRect(4, 8, 16, 10);
                    g.fillStyle(0xff0000); g.fillRect(8, 11, 2, 2); g.fillRect(14, 11, 2, 2);
                    g.fillStyle(0x888888); g.fillRect(2, 18, 20, 12);
                    break;
                case 'royal':
                    g.fillStyle(0xffd700); g.fillRect(4, 0, 16, 4);
                    g.fillStyle(0xffd700); g.fillRect(8, 0, 8, 2);
                    g.fillStyle(0xffcc88); g.fillRect(5, 4, 14, 10);
                    g.fillStyle(0x000000); g.fillRect(8, 7, 2, 2); g.fillRect(14, 7, 2, 2);
                    g.fillStyle(0xdd2222); g.fillRect(3, 14, 18, 16);
                    break;
                case 'alien':
                    g.fillStyle(0xdddddd); g.fillRect(3, 2, 18, 14);
                    g.fillStyle(0x000000);
                    g.fillRect(6, 6, 4, 4); g.fillRect(14, 6, 4, 4);
                    g.fillStyle(0xdddddd); g.fillRect(5, 16, 14, 14);
                    break;
                case 'robot':
                    g.fillStyle(0xaaaaaa); g.fillRect(4, 0, 16, 14);
                    g.fillStyle(0x00ff00); g.fillRect(7, 4, 3, 3); g.fillRect(14, 4, 3, 3);
                    g.fillStyle(0x888888); g.fillRect(3, 14, 18, 14);
                    g.fillStyle(0x666666); g.fillRect(5, 22, 5, 8); g.fillRect(14, 22, 5, 8);
                    break;
                default:
                    g.fillStyle(0xdddddd); g.fillRect(5, 2, 14, 12);
                    g.fillStyle(0x000000); g.fillRect(8, 6, 2, 2); g.fillRect(14, 6, 2, 2);
                    g.fillStyle(0xcccccc); g.fillRect(3, 14, 18, 14);
            }
            g.generateTexture(`npc_${type}`, 24, 30);
            g.destroy();
        }
    }

    generateEnemySprite() {
        const g = this.make.graphics({ add: false });
        g.fillStyle(0xffffff);
        g.fillRect(2, 0, 28, 28);
        g.fillStyle(0x000000);
        g.fillRect(6, 6, 6, 6); g.fillRect(20, 6, 6, 6);
        g.fillRect(8, 18, 16, 4);
        g.fillRect(8, 18, 4, 2); g.fillRect(16, 18, 4, 2); g.fillRect(20, 18, 4, 2);
        g.generateTexture('enemy', 32, 32);
        g.destroy();
    }

    generateObstacles() {
        const g = this.make.graphics({ add: false });
        const types = ['rock', 'crystal', 'pillar', 'crate', 'rubble', 'machine', 'barrel', 'debris'];
        for (const type of types) {
            g.clear();
            switch (type) {
                case 'rock':
                    g.fillStyle(0xaaaaaa); g.fillRect(2, 4, 28, 24); g.fillRect(4, 2, 24, 28);
                    g.fillStyle(0x888888); g.fillRect(6, 6, 8, 6);
                    break;
                case 'crystal':
                    g.fillStyle(0xaaaaff); g.fillTriangle(16, 0, 4, 28, 28, 28);
                    g.fillStyle(0xccccff); g.fillTriangle(16, 4, 8, 24, 20, 24);
                    break;
                case 'pillar':
                    g.fillStyle(0xbbbbbb); g.fillRect(8, 0, 16, 32);
                    g.fillStyle(0x999999); g.fillRect(6, 0, 20, 4); g.fillRect(6, 28, 20, 4);
                    break;
                case 'crate': case 'barrel':
                    g.fillStyle(0xaa8844); g.fillRect(2, 2, 28, 28);
                    g.fillStyle(0x886633); g.fillRect(2, 2, 28, 2); g.fillRect(14, 2, 2, 28);
                    break;
                case 'machine':
                    g.fillStyle(0x888888); g.fillRect(2, 2, 28, 28);
                    g.fillStyle(0x00ff00); g.fillRect(6, 6, 4, 4);
                    g.fillStyle(0xff0000); g.fillRect(14, 6, 4, 4);
                    g.fillStyle(0x666666); g.fillRect(6, 14, 20, 12);
                    break;
                default:
                    g.fillStyle(0x666666); g.fillRect(0, 0, 32, 32);
            }
            g.generateTexture(`obs_${type}`, 32, 32);
        }
        g.destroy();
    }

    generateDoor() {
        const g = this.make.graphics({ add: false });
        g.fillStyle(0xffffff); g.fillRect(0, 0, 40, 48);
        g.fillStyle(0xcccccc); g.fillRect(4, 4, 32, 40);
        g.fillStyle(0xffffff); g.fillRect(8, 0, 24, 4);
        g.generateTexture('door', 40, 48);
        g.clear();
        g.fillStyle(0xffffff); g.fillCircle(24, 24, 24);
        g.generateTexture('door_glow', 48, 48);
        g.destroy();
    }

    generateItem() {
        const g = this.make.graphics({ add: false });
        g.fillStyle(0xffffff);
        g.fillTriangle(8, 0, 0, 8, 16, 8);
        g.fillTriangle(0, 8, 8, 16, 16, 8);
        g.generateTexture('item', 16, 16);
        g.destroy();
    }

    generateInteractable() {
        const g = this.make.graphics({ add: false });
        g.fillStyle(0xffffff);
        g.fillRect(0, 0, 28, 24);
        g.fillStyle(0xcccccc);
        g.fillRect(2, 2, 24, 20);
        g.fillStyle(0xffffff);
        g.fillRect(10, 10, 8, 4);
        g.generateTexture('interactable', 28, 24);
        g.destroy();
    }

    generateCombatAssets() {
        const soulHex = storyState.soulColor || '#ff0000';
        const soulInt = Phaser.Display.Color.HexStringToColor(soulHex).color;

        const g = this.make.graphics({ add: false });
        g.fillStyle(soulInt);
        g.fillCircle(6, 5, 5); g.fillCircle(14, 5, 5);
        g.fillTriangle(1, 7, 10, 18, 19, 7);
        g.generateTexture('soul', 20, 20);
        g.clear();

        g.fillStyle(0xffffff); g.fillCircle(4, 4, 4);
        g.generateTexture('bullet_circle', 8, 8);
        g.clear();

        g.fillStyle(0xffffff);
        g.fillTriangle(4, 0, 0, 4, 4, 8); g.fillTriangle(4, 0, 8, 4, 4, 8);
        g.generateTexture('bullet_diamond', 8, 8);
        g.clear();

        g.fillStyle(0xffffff); g.fillRect(0, 0, 4, 4);
        g.generateTexture('particle', 4, 4);
        g.destroy();
    }

    generateUI() {
        const soulHex = storyState.soulColor || '#ff0000';
        const soulInt = Phaser.Display.Color.HexStringToColor(soulHex).color;

        const g = this.make.graphics({ add: false });
        g.fillStyle(soulInt);
        g.fillCircle(4, 3, 3); g.fillCircle(10, 3, 3);
        g.fillTriangle(1, 5, 7, 12, 13, 5);
        g.generateTexture('hp_heart', 14, 14);
        g.destroy();
    }

    generatePortraitFrames() {
        const W = 128, H = 160;

        const pg = this.make.graphics({ add: false });
        pg.fillStyle(0x181828); pg.fillRect(0, 0, W, H);
        pg.fillStyle(0x553311); pg.fillRect(30, 6, 68, 30);
        pg.fillStyle(0xffcc88); pg.fillRect(28, 24, 72, 52);
        pg.fillStyle(0x000000);
        pg.fillRect(44, 42, 10, 10); pg.fillRect(72, 42, 10, 10);
        pg.fillStyle(0xffbb77); pg.fillRect(56, 56, 16, 6);
        pg.fillStyle(0x4466ff); pg.fillRect(22, 76, 84, 52);
        pg.fillStyle(0x3855dd); pg.fillRect(34, 76, 8, 52);
        pg.fillStyle(0x3322aa); pg.fillRect(28, 128, 28, 24); pg.fillRect(72, 128, 28, 24);
        pg.generateTexture('portrait_player', W, H);
        pg.destroy();

        const ng = this.make.graphics({ add: false });
        ng.fillStyle(0x181828); ng.fillRect(0, 0, W, H);
        ng.fillStyle(0xaaaaaa); ng.fillRect(36, 10, 56, 24);
        ng.fillStyle(0xdddddd); ng.fillRect(30, 26, 68, 48);
        ng.fillStyle(0x000000);
        ng.fillRect(46, 40, 10, 10); ng.fillRect(72, 40, 10, 10);
        ng.fillStyle(0xcccccc); ng.fillRect(56, 58, 16, 6);
        ng.fillStyle(0xbbbbbb); ng.fillRect(24, 74, 80, 54);
        ng.fillStyle(0x999999); ng.fillRect(30, 128, 28, 24); ng.fillRect(70, 128, 28, 24);
        ng.generateTexture('portrait_npc', W, H);
        ng.destroy();
    }
}
