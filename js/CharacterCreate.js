/**
 * CharacterCreate — HTML-driven character creation wizard.
 * Neo-brutalist × Persona 5 gamified flow.
 *
 * Returns a promise that resolves with all character data when the player
 * clicks "BEGIN JOURNEY" on the final step.
 */

const API_BASE = 'http://localhost:8081';

const NAME_EASTER_EGGS = {
    'CHARA':      'The true name.',
    'FRISK':      'Is this really your name?',
    'FLOWEY':     'I already HAVE that name.',
    'SANS':       'get dunked on.',
    'PAPYRUS':    'NYEH HEH HEH!',
    'UNDYNE':     'Get your OWN name!',
    'ASGORE':     'You cannot pick this name.',
    'ASRIEL':     '...',
    'TORIEL':     'This name carries warmth.',
    'UNIFACTORY': '...interesting.',
    'GEMINI':     'The AI stirs...',
    'GASTER':     '♎︎♋︎❒︎🙵■︎♏︎⬧︎⬧︎',
    'PERSONA':    'I am thou... thou art I.',
    'JOKER':      'Show me your true form!',
};

const CHARACTER_PRESETS = {
    cyberpunk: [
        { id: 'cyber_neon_blade', name: 'NEON BLADE', desc: 'Street samurai with a code of honor', icon: '⚔', colors: { primary: '#00FFFF', secondary: '#FF00FF' } },
        { id: 'cyber_ghost_run', name: 'GHOST RUNNER', desc: 'Hacker who lives in the network', icon: '👁', colors: { primary: '#00FF88', secondary: '#0066FF' } },
        { id: 'cyber_chrome', name: 'CHROME HEART', desc: 'Cyborg searching for humanity', icon: '⚙', colors: { primary: '#CCCCCC', secondary: '#FF6600' } },
        { id: 'cyber_pixel', name: 'PIXEL PUNK', desc: 'Rebel with nothing left to lose', icon: '✦', colors: { primary: '#FF00FF', secondary: '#FFFF00' } },
    ],
    medieval: [
        { id: 'med_iron_vow', name: 'IRON VOW', desc: 'Knight bound by an ancient oath', icon: '🛡', colors: { primary: '#CCCCCC', secondary: '#FFD700' } },
        { id: 'med_shadow', name: 'SHADOW WEAVE', desc: 'Mage touched by forbidden arts', icon: '✧', colors: { primary: '#9944FF', secondary: '#00FFAA' } },
        { id: 'med_wild', name: 'WILD PATH', desc: 'Ranger who speaks to the forest', icon: '🌿', colors: { primary: '#44DD44', secondary: '#AA8844' } },
        { id: 'med_golden', name: 'GOLDEN TONGUE', desc: 'Rogue thriving on charm and guile', icon: '💎', colors: { primary: '#FFD700', secondary: '#FF4444' } },
    ],
    space: [
        { id: 'spa_walker', name: 'STAR WALKER', desc: 'Explorer charting the unknown', icon: '🚀', colors: { primary: '#4488FF', secondary: '#FFFFFF' } },
        { id: 'spa_void', name: 'VOID BORN', desc: 'Alien hybrid between two worlds', icon: '🌀', colors: { primary: '#AA44FF', secondary: '#44FFAA' } },
        { id: 'spa_steel', name: 'STEEL WING', desc: 'Ace pilot with nerves of titanium', icon: '✈', colors: { primary: '#FF8800', secondary: '#4488FF' } },
        { id: 'spa_data', name: 'DATA GHOST', desc: 'AI construct seeking purpose', icon: '◈', colors: { primary: '#00FFFF', secondary: '#FF2D55' } },
    ],
};

const ENEMY_PRESETS = {
    cyberpunk: [
        { id: 'cyber_drones', name: 'ROGUE DRONES', desc: 'Mechanical swarm hunting in packs', icon: '🤖', danger: 2, color: '#FF4444' },
        { id: 'cyber_corps', name: 'CORP ENFORCERS', desc: 'Armored soldiers protecting secrets', icon: '🔫', danger: 3, color: '#FF8800' },
        { id: 'cyber_wraiths', name: 'NEON WRAITHS', desc: 'Digital ghosts corrupting the net', icon: '👻', danger: 4, color: '#CC00FF' },
    ],
    medieval: [
        { id: 'med_cursed', name: 'CURSED KNIGHTS', desc: 'Undead warriors bound to serve', icon: '💀', danger: 3, color: '#AAAAAA' },
        { id: 'med_beasts', name: 'SHADOW BEASTS', desc: 'Dark creatures from the abyss', icon: '🐺', danger: 4, color: '#6622AA' },
        { id: 'med_goblins', name: 'GOBLIN HORDE', desc: 'Chaotic raiders pillaging the land', icon: '👹', danger: 2, color: '#44AA22' },
    ],
    space: [
        { id: 'spa_parasites', name: 'VOID PARASITES', desc: 'Alien organisms that infect hosts', icon: '🦠', danger: 3, color: '#44FF44' },
        { id: 'spa_rogue_ai', name: 'ROGUE AI UNITS', desc: 'Corrupted machines with no mercy', icon: '⚠', danger: 2, color: '#FF8800' },
        { id: 'spa_reapers', name: 'STAR REAPERS', desc: 'Cosmic horrors from beyond', icon: '🌑', danger: 5, color: '#9900FF' },
    ],
};

export function runCharacterCreation() {
    return new Promise((resolve) => {
        const screen = document.getElementById('character-create-screen');
        screen.style.display = 'flex';

        let currentStep = 0;
        const totalSteps = 4;

        let selectedSoul = { color: '#FF0000', trait: 'Determination' };
        let selectedTheme = null;
        let selectedPreset = null;
        let uploadedPhotoFile = null;
        let uploadedPhotoDataUrl = null;
        let selectedEnemies = [];
        let useUpload = false;
        let maxRooms = 10;

        const $ = (sel) => document.querySelector(sel);
        const $$ = (sel) => document.querySelectorAll(sel);

        const progressFill = $('#cc-progress-fill');
        const btnBack = $('#cc-btn-back');
        const btnNext = $('#cc-btn-next');
        const nameInput = $('#cc-name-input');
        const easterEgg = $('#cc-name-easter');
        const charPresetsEl = $('#cc-char-presets');
        const enemyGridEl = $('#cc-enemy-grid');

        // ── Audio ──
        let audioCtx;
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; }

        function playClick() {
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(440, audioCtx.currentTime);
            osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.04);
            gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            osc.start(); osc.stop(audioCtx.currentTime + 0.1);
        }

        function playConfirm() {
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(523, audioCtx.currentTime);
            osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.06);
            osc.frequency.setValueAtTime(784, audioCtx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
            osc.start(); osc.stop(audioCtx.currentTime + 0.2);
        }

        // ── Step Navigation ──

        function goToStep(step) {
            if (step < 0 || step >= totalSteps) return;
            playClick();
            currentStep = step;

            $$('.cc-step').forEach(s => s.classList.remove('active'));
            const target = $(`.cc-step[data-step="${step}"]`);
            if (target) target.classList.add('active');

            progressFill.style.width = `${((step + 1) / totalSteps) * 100}%`;

            $$('.cc-plabel').forEach((l, i) => {
                l.classList.toggle('active', i === step);
                l.classList.toggle('done', i < step);
            });

            $$('.cc-dot').forEach((d, i) => {
                d.classList.toggle('active', i === step);
                d.classList.toggle('done', i < step);
            });

            btnBack.style.visibility = step === 0 ? 'hidden' : 'visible';

            if (step === totalSteps - 1) {
                btnNext.textContent = '★ BEGIN JOURNEY';
                btnNext.classList.add('launch');
            } else {
                btnNext.textContent = 'NEXT ►';
                btnNext.classList.remove('launch');
            }

            if (step === 2) populateCharPresets();
            if (step === 3) populateEnemyPresets();
        }

        function validateStep() {
            switch (currentStep) {
                case 0:
                    if (!nameInput.value.trim()) {
                        nameInput.style.borderColor = '#FF2D55';
                        nameInput.setAttribute('placeholder', 'NAME REQUIRED!');
                        nameInput.focus();
                        return false;
                    }
                    return true;
                case 1:
                    if (!selectedTheme) {
                        $$('.cc-theme-card').forEach(c => {
                            c.style.borderColor = '#FF2D55';
                            setTimeout(() => { c.style.borderColor = ''; }, 600);
                        });
                        return false;
                    }
                    return true;
                case 2:
                    if (!selectedPreset && !uploadedPhotoDataUrl) {
                        return false;
                    }
                    return true;
                case 3: return true;
            }
            return true;
        }

        btnNext.addEventListener('click', () => {
            if (!validateStep()) return;
            if (currentStep === totalSteps - 1) {
                finishCreation();
            } else {
                goToStep(currentStep + 1);
            }
        });

        btnBack.addEventListener('click', () => {
            goToStep(currentStep - 1);
        });

        // ── Step 0: Name + Soul ──

        nameInput.addEventListener('input', () => {
            nameInput.style.borderColor = '';
            const name = nameInput.value.trim().toUpperCase();
            const egg = NAME_EASTER_EGGS[name];
            easterEgg.textContent = egg || '';
            easterEgg.style.opacity = egg ? '1' : '0';
        });

        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && validateStep()) {
                goToStep(currentStep + 1);
            }
        });

        $$('.cc-soul-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                playClick();
                $$('.cc-soul-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedSoul = {
                    color: btn.dataset.color,
                    trait: btn.dataset.trait,
                };
                btn.style.setProperty('--soul-glow', btn.dataset.color);
            });
        });

        // set initial glow
        const initialSoul = $('.cc-soul-btn.selected');
        if (initialSoul) initialSoul.style.setProperty('--soul-glow', initialSoul.dataset.color);

        // ── Step 0b: Game Length ──

        $$('.cc-length-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                playClick();
                $$('.cc-length-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                maxRooms = parseInt(btn.dataset.rooms, 10);
            });
        });

        // ── Step 1: Theme ──

        $$('.cc-theme-card').forEach(card => {
            const accent = card.dataset.accent;
            card.style.setProperty('--theme-accent', accent);
            card.addEventListener('click', () => {
                playClick();
                $$('.cc-theme-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedTheme = card.dataset.theme;
                selectedPreset = null;
                selectedEnemies = [];
            });
        });

        // ── Step 2: Avatar ──

        $$('.cc-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                playClick();
                $$('.cc-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                $$('.cc-tab-panel').forEach(p => p.classList.remove('active'));
                const panel = $(`#cc-tab-${tab.dataset.tab}`);
                if (panel) panel.classList.add('active');
                useUpload = tab.dataset.tab === 'upload';
            });
        });

        function populateCharPresets() {
            if (!selectedTheme) return;
            const presets = CHARACTER_PRESETS[selectedTheme] || [];
            charPresetsEl.innerHTML = '';
            presets.forEach(p => {
                const card = document.createElement('button');
                card.className = 'cc-preset-card' + (selectedPreset === p.id ? ' selected' : '');
                card.innerHTML = `
                    <div class="cc-preset-swatch" style="background:${p.colors.primary}20; border-color:${p.colors.primary};">
                        <span>${p.icon}</span>
                    </div>
                    <div class="cc-preset-info">
                        <span class="cc-preset-name" style="color:${p.colors.primary};">${p.name}</span>
                        <span class="cc-preset-desc">${p.desc}</span>
                    </div>
                `;
                card.addEventListener('click', () => {
                    playClick();
                    charPresetsEl.querySelectorAll('.cc-preset-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    selectedPreset = p.id;
                    useUpload = false;
                    $$('.cc-tab').forEach(t => t.classList.remove('active'));
                    $$('.cc-tab')[0].classList.add('active');
                    $$('.cc-tab-panel').forEach(pa => pa.classList.remove('active'));
                    $('#cc-tab-presets').classList.add('active');
                });
                charPresetsEl.appendChild(card);
            });
        }

        // Photo upload
        const uploadZone = $('#cc-upload-zone');
        const photoInput = $('#cc-photo-input');
        const uploadLabel = $('#cc-upload-label');
        const uploadPreview = $('#cc-upload-preview');
        const previewImg = $('#cc-preview-img');
        const uploadClear = $('#cc-upload-clear');

        uploadZone.addEventListener('click', (e) => {
            if (e.target.id !== 'cc-upload-clear') photoInput.click();
        });

        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('drag-over');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handlePhoto(e.dataTransfer.files[0]);
        });

        photoInput.addEventListener('change', () => {
            if (photoInput.files.length) handlePhoto(photoInput.files[0]);
        });

        function handlePhoto(file) {
            if (!file.type.startsWith('image/')) return;
            uploadedPhotoFile = file;
            useUpload = true;
            selectedPreset = null;

            const reader = new FileReader();
            reader.onload = (e) => {
                uploadedPhotoDataUrl = e.target.result;
                previewImg.src = uploadedPhotoDataUrl;
                uploadLabel.style.display = 'none';
                uploadPreview.style.display = 'flex';
                charPresetsEl.querySelectorAll('.cc-preset-card').forEach(c => c.classList.remove('selected'));
            };
            reader.readAsDataURL(file);
            playConfirm();
        }

        uploadClear.addEventListener('click', (e) => {
            e.stopPropagation();
            uploadedPhotoFile = null;
            uploadedPhotoDataUrl = null;
            useUpload = false;
            photoInput.value = '';
            uploadLabel.style.display = 'flex';
            uploadPreview.style.display = 'none';
            $('#cc-gen-status').style.display = 'none';
        });

        // ── Step 3: Enemies ──

        function populateEnemyPresets() {
            if (!selectedTheme) return;
            const presets = ENEMY_PRESETS[selectedTheme] || [];
            enemyGridEl.innerHTML = '';
            presets.forEach(p => {
                const card = document.createElement('button');
                card.className = 'cc-enemy-card' + (selectedEnemies.includes(p.id) ? ' selected' : '');
                let dangerPips = '';
                for (let i = 0; i < 5; i++) {
                    dangerPips += `<span class="cc-danger-pip${i < p.danger ? ' active' : ''}"></span>`;
                }
                card.innerHTML = `
                    <div class="cc-enemy-swatch" style="background:${p.color}15; border-color:${p.color};">
                        <span>${p.icon}</span>
                    </div>
                    <div class="cc-enemy-info">
                        <span class="cc-enemy-name" style="color:${p.color};">${p.name}</span>
                        <span class="cc-enemy-desc">${p.desc}</span>
                        <div class="cc-enemy-danger">${dangerPips}</div>
                    </div>
                `;
                card.addEventListener('click', () => {
                    playClick();
                    if (selectedEnemies.includes(p.id)) {
                        selectedEnemies = selectedEnemies.filter(e => e !== p.id);
                        card.classList.remove('selected');
                    } else if (selectedEnemies.length < 3) {
                        selectedEnemies.push(p.id);
                        card.classList.add('selected');
                    }
                });
                enemyGridEl.appendChild(card);
            });
        }

        // ── Finish — no server calls here, asset gen deferred to IntroSequenceScene ──

        function finishCreation() {
            playConfirm();

            const result = {
                name: nameInput.value.trim() || 'Wanderer',
                soulColor: selectedSoul.color,
                soulTrait: selectedSoul.trait,
                theme: selectedTheme,
                characterPresetId: selectedPreset,
                characterPhotoUrl: uploadedPhotoDataUrl,
                enemyPresetIds: selectedEnemies,
                playerPortraitUrl: null,
                playerSpriteSheetUrl: null,
                maxRooms,
            };

            screen.style.display = 'none';
            resolve(result);
        }

        // Initialize first step
        goToStep(0);
        nameInput.focus();
    });
}

export { CHARACTER_PRESETS, ENEMY_PRESETS };
