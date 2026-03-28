# Unifactory

An AI-generated 2D story adventure inspired by Undertale. Navigate through procedurally generated rooms, interact with NPCs, and make story choices by physically walking to exits — no buttons, no menus.

## Quick Start

Serve the project with any static HTTP server:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .

# PHP
php -S localhost:8000
```

Open `http://localhost:8000` in your browser.

## How to Play

- **Arrow Keys** — Move your character
- **Z** — Interact with NPCs
- **Walk into glowing doors** — Make your story choice

Each room has 3 exits representing 3 story paths. Navigate around obstacles to reach your chosen exit. The game generates a unique adventure every time.

## Modes

- **Start Game** — Enter a Gemini API key for AI-generated rooms
- **Demo Mode** — Play with pre-built rooms (no API key needed)

## Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create an API key
3. Paste it into the game's start screen

## Tech Stack

- **Phaser 3** — 2D game engine
- **Gemini API** — AI room/story generation
- **Web Audio API** — Retro sound effects
- All placeholder art generated programmatically — no external assets needed
