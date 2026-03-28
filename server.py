"""
Unifactory — AI Cutscene Server
Rate-limited priority queue with preloading for boss fights,
act transitions, and narrative moments.

Run:  python server.py
"""

import json, uuid, time, threading, mimetypes, io, base64, traceback
import requests as http_requests
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict, field
from typing import Optional, List, Dict, Any
from queue import PriorityQueue

import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

from google import genai
from google.genai import types

# ────────────────────────────────────────────────────────────
# App & paths
# ────────────────────────────────────────────────────────────

app = FastAPI(title="Unifactory AI Cutscene Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

PROJECT_ROOT = Path(__file__).parent
ASSETS_DIR = PROJECT_ROOT / "generated_assets"
REFS_DIR = ASSETS_DIR / "references"
MASTER_SHEETS_DIR = ASSETS_DIR / "master_sheets"
VIDEO_REFS_DIR = ASSETS_DIR / "video_refs"
SCENE_PACKAGES_DIR = ASSETS_DIR / "scene_packages"
VIDEOS_DIR = ASSETS_DIR / "videos"
STORY_DIR = ASSETS_DIR / "story_state"
PORTRAITS_DIR = ASSETS_DIR / "portraits"
PRESETS_DIR = ASSETS_DIR / "presets"
UPLOADS_DIR = ASSETS_DIR / "uploads"
MUSIC_DIR = ASSETS_DIR / "music"

for d in [ASSETS_DIR, REFS_DIR, MASTER_SHEETS_DIR, VIDEO_REFS_DIR,
          SCENE_PACKAGES_DIR, VIDEOS_DIR, STORY_DIR, PORTRAITS_DIR,
          PRESETS_DIR, UPLOADS_DIR, MUSIC_DIR]:
    d.mkdir(parents=True, exist_ok=True)

MODELS = {
    "image_fast": "gemini-3.1-flash-image-preview",
    "image_pro":  "gemini-3-pro-image-preview",
    "music":      "lyria-3-clip-preview",
    "video":      "veo-3.1-generate-preview",
    "video_fast": "veo-3.1-fast-generate-preview",
    "text":       "gemini-3.1-flash-lite-preview",
}

# ────────────────────────────────────────────────────────────
# In-memory state
# ────────────────────────────────────────────────────────────

sessions: Dict[str, Dict[str, Any]] = {}
cutscene_jobs: Dict[str, Dict[str, Any]] = {}

# ────────────────────────────────────────────────────────────
# Rate-limited video queue
# ────────────────────────────────────────────────────────────

class VideoRateLimiter:
    """Thread-safe sliding-window rate limiter for Veo API."""

    def __init__(self, max_per_minute=8):
        self.max_per_minute = max_per_minute
        self.timestamps: List[float] = []
        self.lock = threading.Lock()

    def acquire(self, timeout=180):
        start = time.time()
        while time.time() - start < timeout:
            with self.lock:
                now = time.time()
                self.timestamps = [t for t in self.timestamps if now - t < 60]
                if len(self.timestamps) < self.max_per_minute:
                    self.timestamps.append(now)
                    return True
            time.sleep(3)
        return False

    def remaining(self):
        with self.lock:
            now = time.time()
            self.timestamps = [t for t in self.timestamps if now - t < 60]
            return self.max_per_minute - len(self.timestamps)

    def next_slot_seconds(self):
        with self.lock:
            now = time.time()
            self.timestamps = [t for t in self.timestamps if now - t < 60]
            if len(self.timestamps) < self.max_per_minute:
                return 0
            return max(0, 60 - (now - self.timestamps[0]))


VIDEO_CHANNELS = {
    "fast": {
        "model_id": f"models/{MODELS['video_fast']}",
        "limiter": VideoRateLimiter(max_per_minute=9),
    },
    "standard": {
        "model_id": f"models/{MODELS['video']}",
        "limiter": VideoRateLimiter(max_per_minute=9),
    },
}

FAST_TRIGGERS = {"first_room", "boss_intro", "boss_outcome_victory", "boss_outcome_spare"}

video_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = threading.Lock()
_job_counter = 0
_counter_lock = threading.Lock()
_job_queue: PriorityQueue = PriorityQueue()

TRIGGER_PRIORITIES = {
    "boss_intro": 0, "boss_outcome_victory": 0, "boss_outcome_spare": 0,
    "act_transition": 1, "first_room": 1, "room_transition": 1,
    "key_item": 2, "game_over": 2,
}


def _get_counter():
    global _job_counter
    with _counter_lock:
        _job_counter += 1
        return _job_counter


def _enqueue_preload(cache_key, session_id, trigger_type, context):
    """Add a job to the priority queue. Returns False if already cached/queued."""
    with _cache_lock:
        if cache_key in video_cache:
            st = video_cache[cache_key].get("status")
            if st in ("queued", "waiting_rate_limit", "generating",
                       "generating_video", "complete"):
                return False
        video_cache[cache_key] = {
            "status": "queued", "progress": 0,
            "video_url": None, "error": None,
        }
    priority = TRIGGER_PRIORITIES.get(trigger_type, 3)
    _job_queue.put((priority, _get_counter(), cache_key,
                    session_id, trigger_type, context))
    return True


# ────────────────────────────────────────────────────────────
# World style rules
# ────────────────────────────────────────────────────────────

WORLD_STYLE_RULES = {
    "cyberpunk": {
        "style_keywords": ["futuristic", "neon-accented", "techwear",
                           "high-contrast materials", "sleek sci-fi"],
        "outfit_defaults": ["layered urban techwear", "utility jacket or fitted top",
                            "combat or tactical pants", "small glowing accessory"],
        "prop_defaults": ["digital key", "energy vial", "wrist device"],
        "environment_hint": "dense futuristic city, holograms, moody lighting",
    },
    "medieval": {
        "style_keywords": ["fantasy", "cloth and leather", "ornamental details",
                           "grounded medieval silhouette"],
        "outfit_defaults": ["tunic or cloak", "belted waist", "boots",
                            "small metal or leather accessories"],
        "prop_defaults": ["journal", "coin pouch", "small blade or trinket"],
        "environment_hint": "castle halls, stone paths, torch-lit interiors",
    },
    "space": {
        "style_keywords": ["clean sci-fi", "spacefaring", "modular suit design",
                           "technical materials"],
        "outfit_defaults": ["flight suit or modular jacket", "utility belt",
                            "reinforced boots", "subtle luminous accents"],
        "prop_defaults": ["access card", "data pad", "energy canister"],
        "environment_hint": "spaceship interiors, stations, distant planets",
    },
}

# ────────────────────────────────────────────────────────────
# Data classes
# ────────────────────────────────────────────────────────────

@dataclass
class CharacterSpec:
    character_id: str
    character_name: str
    world_type: str
    character_source: str
    template_name: Optional[str]
    uploaded_image_path: Optional[str]
    visual_dna: Dict[str, Any] = field(default_factory=dict)
    palette_preferences: Dict[str, Any] = field(default_factory=dict)
    outfit_profile: Dict[str, Any] = field(default_factory=dict)
    prop_profile: Dict[str, Any] = field(default_factory=dict)
    style_profile: Dict[str, Any] = field(default_factory=dict)
    prompt_lock: List[str] = field(default_factory=list)
    negative_constraints: List[str] = field(default_factory=list)
    raw_customization_text: str = ""
    output_plan: Dict[str, bool] = field(default_factory=lambda: {
        "master_sheet": True, "sprite_sheet": True, "expression_sheet": True,
        "prop_sheet": True, "scene_anchor": True, "video_ready_refs": True,
    })


@dataclass
class SceneInput:
    scene_type: str
    chapter_id: str
    scene_index: int
    location: str
    time_of_day: str
    action: str
    emotion: str
    player_choice_text: str
    choice_outcome: str
    story_context: str
    camera_direction: str = "medium-wide cinematic framing, slow push-in"
    duration_seconds: int = 8
    include_anchor_image: bool = True
    supporting_characters: List[Dict[str, Any]] = field(default_factory=list)
    continuity_notes: List[str] = field(default_factory=list)
    extra_constraints: List[str] = field(default_factory=list)


# ────────────────────────────────────────────────────────────
# Character pipeline
# ────────────────────────────────────────────────────────────

def build_character_spec(world_type: str, character_name: str,
                         customization_text: str) -> CharacterSpec:
    wt = world_type.strip().lower()
    if wt not in WORLD_STYLE_RULES:
        raise ValueError(f"Invalid world_type '{wt}'")
    rules = WORLD_STYLE_RULES[wt]
    cid = f"{wt[:3]}_{uuid.uuid4().hex[:8]}"

    spec = CharacterSpec(
        character_id=cid, character_name=character_name or f"{wt.title()} Hero",
        world_type=wt, character_source="template",
        template_name=f"{wt}_protagonist_01", uploaded_image_path=None,
        raw_customization_text=customization_text.strip(),
    )
    spec.style_profile = {
        "style_keywords": rules["style_keywords"],
        "environment_hint": rules["environment_hint"],
        "target_render_mix": "2D gameplay sprites + 3D cutscene-ready character identity",
    }
    spec.outfit_profile = {
        "default_outfit_elements": rules["outfit_defaults"],
        "must_preserve_core_silhouette": True,
    }
    spec.prop_profile = {"default_props": rules["prop_defaults"],
                         "important_story_props": []}
    spec.visual_dna = {
        "facial_features": "preserve identity consistently across all generated assets",
        "body_proportions": "maintain same body proportions and silhouette",
        "hair": "keep hairstyle consistent unless explicitly changed by story logic",
        "accessories": "preserve signature accessories across all views and scenes",
    }
    spec.palette_preferences = {
        "consistency_priority": "high",
        "extract_palette_from_reference_if_available": False,
        "allow_world_specific_accents": True,
    }
    spec.prompt_lock = [
        "maintain exact facial identity across all outputs",
        "maintain consistent body proportions",
        "maintain consistent hairstyle",
        "maintain consistent costume details",
        "maintain consistent accessories and props unless changed intentionally",
        "preserve the same character identity in 2D sprites and 3D reference outputs",
    ]
    spec.negative_constraints = [
        "do not change age drastically", "do not change face shape",
        "do not change hair color unless requested",
        "do not replace outfit with a different archetype",
        "do not introduce extra limbs or malformed hands",
        "do not alter glasses or signature accessories",
        "do not drift into a different art style mid-generation",
    ]
    return spec


def save_character_spec(spec: CharacterSpec) -> Path:
    out = REFS_DIR / f"{spec.character_id}_spec.json"
    out.write_text(json.dumps(asdict(spec), indent=2, ensure_ascii=False))
    return out


# ── master sheet ──

def _build_master_sheet_prompt(spec: CharacterSpec) -> str:
    kw = ", ".join(spec.style_profile.get("style_keywords", []))
    outfit = ", ".join(spec.outfit_profile.get("default_outfit_elements", []))
    props = ", ".join(spec.prop_profile.get("default_props", []))
    locks = "; ".join(spec.prompt_lock)
    negs = "; ".join(spec.negative_constraints)
    cust = spec.raw_customization_text or "No extra customization provided."
    return f"""
Use the provided structured character specification as the identity source of truth.

Create a professional game character master reference sheet for a persistent story-driven game protagonist.

Character name: {spec.character_name}
Character ID: {spec.character_id}
World type: {spec.world_type}

Target use:
- 3D cutscene-ready character identity reference
- future 2D gameplay sprite generation
- future Veo cutscene consistency

Style direction: {kw}
World/environment flavor: {spec.style_profile.get("environment_hint", "")}
Character customization: {cust}
Outfit defaults: {outfit}
Props: {props}

Requirements:
- One single composite master sheet image
- Orthographic-style front view, back view, left side view, right side view
- 3/4 front view, 3/4 back view
- Consistent identical character identity across all views
- Flat or clean cel-shaded presentation, minimal shadows
- Clean white or very light neutral background
- Label each view cleanly
- Include a color palette row at the bottom
- Game-ready, polished, readable layout

Consistency locks: {locks}
Do not: {negs}
Output exactly one master reference sheet image.
""".strip()


def _extract_first_image(response) -> Image.Image:
    candidates = []
    try:
        if response.parts:
            candidates.extend(response.parts)
    except Exception:
        pass
    try:
        if response.candidates:
            for c in response.candidates:
                try:
                    if c.content and c.content.parts:
                        candidates.extend(c.content.parts)
                except Exception:
                    pass
    except Exception:
        pass
    for part in candidates:
        try:
            img = part.as_image()
            if img is not None:
                return img
        except Exception:
            pass
        try:
            if hasattr(part, 'inline_data') and part.inline_data:
                img_bytes = part.inline_data.data
                if img_bytes:
                    return Image.open(io.BytesIO(img_bytes))
        except Exception:
            pass
    raise ValueError(f"No image found in model response. Candidates count: {len(candidates)}")


def generate_master_sheet(client, spec: CharacterSpec,
                          retries: int = 2) -> Dict[str, Any]:
    prompt = _build_master_sheet_prompt(spec)
    for attempt in range(retries + 1):
        try:
            response = client.models.generate_content(
                model=MODELS["image_fast"], contents=[prompt],
                config=types.GenerateContentConfig(
                    response_modalities=["Image"],
                    image_config=types.ImageConfig(aspect_ratio="1:1", image_size="2K"),
                ),
            )
            img = _extract_first_image(response)
            img_path = MASTER_SHEETS_DIR / f"{spec.character_id}_master_sheet.png"
            img.save(img_path)
            meta = {"character_id": spec.character_id, "model": MODELS["image_fast"],
                    "path": str(img_path), "prompt": prompt}
            meta_path = MASTER_SHEETS_DIR / f"{spec.character_id}_master_sheet_meta.json"
            meta_path.write_text(json.dumps(meta, indent=2))
            return {"image_path": img_path, "meta_path": meta_path}
        except Exception as e:
            print(f"[init] master sheet attempt {attempt+1} failed: {e}")
            if attempt < retries:
                time.sleep(3)
            else:
                raise


# ── scene anchor ──

def _build_scene_anchor_prompt(spec: CharacterSpec) -> str:
    kw = ", ".join(spec.style_profile.get("style_keywords", []))
    outfit = ", ".join(spec.outfit_profile.get("default_outfit_elements", []))
    cust = spec.raw_customization_text or ""
    return f"""
Create a single cinematic keyframe for a story game intro scene.

Main character:
Persistent story game protagonist.
Character name: {spec.character_name}
World: {spec.world_type}
Style: {kw}
Outfit profile: {outfit}
Customization: {cust}

Scene goal: Generate an intro cutscene anchor frame establishing the protagonist in the {spec.world_type} world.

Requirements:
- one single polished cinematic frame
- preserve exact character identity from the attached master sheet
- medium shot or full-body hero framing
- strong environmental storytelling
- no text overlays, no split layout, no multi-panel
""".strip()


def generate_scene_anchor(client, spec: CharacterSpec,
                          master_sheet_path: Path,
                          retries: int = 2) -> Dict[str, Any]:
    prompt = _build_scene_anchor_prompt(spec)
    master_img = Image.open(master_sheet_path)
    for attempt in range(retries + 1):
        try:
            response = client.models.generate_content(
                model=MODELS["image_fast"], contents=[prompt, master_img],
                config=types.GenerateContentConfig(
                    response_modalities=["Image"],
                    image_config=types.ImageConfig(aspect_ratio="16:9", image_size="2K"),
                ),
            )
            anchor_img = _extract_first_image(response)
            anchor_path = VIDEO_REFS_DIR / f"{spec.character_id}_scene_anchor.png"
            anchor_img.save(anchor_path)
            return {"anchor_path": anchor_path}
        except Exception as e:
            print(f"[init] scene anchor attempt {attempt+1} failed: {e}")
            if attempt < retries:
                time.sleep(3)
            else:
                raise


# ── veo package ──

def _build_subject_prompt(spec: CharacterSpec) -> str:
    kw = ", ".join(spec.style_profile.get("style_keywords", []))
    outfit = ", ".join(spec.outfit_profile.get("default_outfit_elements", []))
    props = ", ".join(spec.prop_profile.get("default_props", []))
    cust = spec.raw_customization_text or ""
    return f"""
Persistent story game protagonist.
Character name: {spec.character_name}
World: {spec.world_type}

Identity requirements:
- same face and facial identity, same hairstyle
- same body proportions, same costume archetype
- same signature accessories, same overall silhouette

Style: {kw}
Outfit profile: {outfit}
Props: {props}
Customization: {cust}
""".strip()


def _build_style_prompt(spec: CharacterSpec) -> str:
    return f"""
Cinematic game cutscene style.
Stylized but consistent with the approved master character sheet.
Readable silhouette, clean visual storytelling, strong composition, game-trailer quality.
World tone: {spec.world_type}.
Environment hint: {spec.style_profile.get("environment_hint", "")}
""".strip()


def _build_negative_prompt(spec: CharacterSpec) -> str:
    negs = spec.negative_constraints + [
        "do not change the character into a different person",
        "do not alter costume colors significantly",
        "do not add random accessories",
        "do not introduce visual drift between shots",
        "do not make the character look older or younger",
        "do not change the art direction dramatically",
    ]
    return "; ".join(negs)


def build_veo_package(spec: CharacterSpec, master_sheet_path: Path,
                      anchor_path: Optional[Path]) -> Dict[str, Any]:
    pkg = {
        "character_id": spec.character_id,
        "character_name": spec.character_name,
        "world_type": spec.world_type,
        "subject_images": [str(master_sheet_path)],
        "subject_prompt": _build_subject_prompt(spec),
        "style_prompt": _build_style_prompt(spec),
        "negative_prompt": _build_negative_prompt(spec),
    }
    if anchor_path:
        pkg["scene_anchor_image"] = str(anchor_path)
        if str(anchor_path) not in pkg["subject_images"]:
            pkg["subject_images"].append(str(anchor_path))
    out = VIDEO_REFS_DIR / f"{spec.character_id}_veo_package.json"
    out.write_text(json.dumps(pkg, indent=2))
    return pkg


# ────────────────────────────────────────────────────────────
# Video generation
# ────────────────────────────────────────────────────────────

def _make_genai_image(img_path: str) -> types.Image:
    p = Path(img_path)
    if not p.exists():
        raise FileNotFoundError(f"Reference image not found: {img_path}")
    mime, _ = mimetypes.guess_type(str(p))
    return types.Image(image_bytes=p.read_bytes(), mime_type=mime or "image/png")


def _build_ref_images(scene_package: Dict[str, Any]):
    refs = []
    imgs = scene_package.get("reference_images", [])
    if not imgs:
        return refs
    for img_path in reversed(imgs):
        try:
            refs.append(types.VideoGenerationReferenceImage(
                image=_make_genai_image(img_path), reference_type="asset"))
            break
        except Exception as e:
            print(f"[warn] failed to load ref image {img_path}: {e}")
    return refs


def _poll_video(client, operation, timeout=900, interval=10):
    start = time.time()
    op = operation
    while not op.done:
        if time.time() - start > timeout:
            raise TimeoutError("Video generation timed out")
        time.sleep(interval)
        op = client.operations.get(op)
    return op


def _download_video(video_obj, save_path: Path, api_key: str):
    uri = video_obj.uri
    headers = {"x-goog-api-key": api_key}
    resp = http_requests.get(uri, headers=headers, stream=True)
    if resp.status_code == 403:
        resp = http_requests.get(f"{uri}&key={api_key}", stream=True)
    resp.raise_for_status()
    with open(save_path, "wb") as f:
        for chunk in resp.iter_content(8192):
            f.write(chunk)


def generate_video(client, api_key: str, scene_package: Dict[str, Any],
                   retries: int = 1, model_id: str = None) -> Path:
    prompt = scene_package["scene_prompt"]
    sid = scene_package["scene_id"]
    refs = _build_ref_images(scene_package)
    if not refs:
        raise ValueError("No valid reference images")

    veo_model = model_id or VIDEO_CHANNELS["standard"]["model_id"]

    attempt = 0
    while attempt <= retries:
        try:
            op = client.models.generate_videos(
                model=veo_model,
                prompt=prompt,
                config=types.GenerateVideosConfig(
                    reference_images=refs, resolution="720p",
                    aspect_ratio="16:9", duration_seconds=8,
                    person_generation="allow_adult", number_of_videos=1,
                ),
            )
            completed = _poll_video(client, op)
            if completed.response is None or not completed.response.generated_videos:
                raise ValueError("Veo returned no video")

            video_path = VIDEOS_DIR / f"{sid}.mp4"
            _download_video(completed.response.generated_videos[0].video,
                            video_path, api_key)

            meta = {"scene_id": sid, "video_path": str(video_path),
                    "prompt": prompt, "model": veo_model}
            (VIDEOS_DIR / f"{sid}_meta.json").write_text(json.dumps(meta, indent=2))
            return video_path
        except Exception as e:
            print(f"[video] attempt {attempt+1} failed ({veo_model}): {e}")
            attempt += 1
            if attempt > retries:
                raise


# ── scene planner (text LLM, used by legacy endpoint) ──

def plan_next_scene(client, story_context: dict,
                    trigger: str, room_name: str, room_mood: str,
                    exit_direction: str, exit_label: str,
                    world_type: str) -> Dict[str, Any]:
    recent = story_context.get("recent_events", [])[-8:]
    history_text = "\n".join(str(e) for e in recent) or "No prior events."

    prompt = f"""
You are planning a cinematic cutscene for a branching narrative RPG.

WORLD: {world_type}

CURRENT STATE:
Chapter: {story_context.get("chapter", 1)}
Level: {story_context.get("level", 1)}
HP: {story_context.get("hp")}/{story_context.get("max_hp")}
Moral alignment: {story_context.get("moral_alignment", "neutral")}
Current room: {room_name}
Room mood: {room_mood}

RECENT EVENTS:
{history_text}

TRIGGER: Player exited {exit_direction} toward "{exit_label}".
{trigger}

TASK: Plan an 8-second cinematic cutscene for this room transition.
Return ONLY valid JSON:

{{
  "location": "short vivid location description",
  "time_of_day": "string",
  "action": "what happens visually in the cutscene",
  "emotion": "one word like tense, hopeful, eerie, determined",
  "camera_direction": "cinematic camera instruction",
  "story_context": "1-2 sentence narrative recap",
  "continuity_notes": ["preserve X", "maintain Y"],
  "extra_constraints": ["constraint"],
  "supporting_characters": []
}}

Rules:
- action must describe what happens visually
- make it cinematic and specific enough for video generation
- no markdown, no text outside JSON
""".strip()

    response = client.models.generate_content(model=MODELS["text"], contents=[prompt])
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(raw)


# ────────────────────────────────────────────────────────────
# Trigger-specific prompt builder (for preload queue)
# ────────────────────────────────────────────────────────────

def build_trigger_scene_prompt(trigger_type, context, veo_package):
    subject = veo_package.get("subject_prompt", "")
    style = veo_package.get("style_prompt", "")
    negative = veo_package.get("negative_prompt", "")

    header = f"""Use the attached approved reference image(s) to preserve the same protagonist identity across the entire scene.

PROTAGONIST
{subject}

STYLE
{style}

NEGATIVE CONSTRAINTS
{negative}

"""

    prompts = {
        "boss_intro": f"""SCENE TYPE: Boss Encounter — Dramatic Introduction
DURATION: 8 seconds

A powerful enemy named "{context.get('enemy_name', 'an imposing figure')}" emerges dramatically.
Location: {context.get('room_name', 'a dark chamber')}
Atmosphere: {context.get('room_mood', 'tense and foreboding')}

The protagonist faces off against this formidable adversary.
Camera: dramatic low-angle reveal of the enemy, slow push-in on their menacing form,
then quick cut to the protagonist's determined stance. Tension fills every frame.""",

        "boss_outcome_victory": f"""SCENE TYPE: Victory Aftermath
DURATION: 8 seconds

The protagonist has defeated "{context.get('enemy_name', 'a powerful foe')}" in combat.
The enemy crumbles. Dust settles. The protagonist stands victorious.
Location: {context.get('room_name', 'the battlefield')}

Camera: wide shot of the aftermath, debris settling, dramatic lighting.
Slow push-in on the protagonist catching their breath, triumphant.""",

        "boss_outcome_spare": f"""SCENE TYPE: Merciful Resolution
DURATION: 8 seconds

The protagonist shows mercy to "{context.get('enemy_name', 'their opponent')}".
The tension drains away. The enemy retreats peacefully.
Location: {context.get('room_name', 'the encounter site')}

Camera: medium shot of both characters. The enemy turns away.
Slow zoom out as peace returns. Bittersweet, compassionate lighting.""",

        "act_transition": f"""SCENE TYPE: Chapter Transition — Act Break
DURATION: 8 seconds
CHAPTER: {context.get('chapter', '?')}

Time passes. The world shifts. The protagonist journeys deeper.
Previous area: {context.get('room_name', 'the last location')}
Heading toward: {context.get('exit_label', 'the unknown')}
Mood: {context.get('room_mood', 'contemplative')}

Camera: sweeping cinematic transition. Montage of the journey.
Landscape establishing shots. Ends on the protagonist arriving at a new threshold.""",

        "first_room": f"""SCENE TYPE: Grand Opening — World Establishing Shot
DURATION: 8 seconds

The protagonist arrives in the {context.get('world_type', 'mysterious')} world for the very first time.
This is the grand introduction — cinematic and atmospheric.

Camera: sweeping wide establishing shot of the environment.
Slowly push in until we discover the protagonist standing at the entrance.
Set the tone for the entire adventure. Epic, awe-inspiring.""",

        "game_over": f"""SCENE TYPE: Game Over — Soul Shatter
DURATION: 8 seconds

The protagonist falls in battle against "{context.get('enemy_name', 'a deadly foe')}".
Their soul shatters. Darkness closes in.
Location: {context.get('room_name', 'the battlefield')}

Camera: slow-motion fall. Color drains from the scene.
A soul-shaped light flickers and breaks apart. Fade to complete darkness.""",

        "key_item": f"""SCENE TYPE: Key Item Discovery
DURATION: 8 seconds

The protagonist discovers: "{context.get('item_name', 'a mysterious artifact')}".
{context.get('item_description', 'An object of great significance.')}
Location: {context.get('room_name', 'the current location')}

Camera: close-up on the item with dramatic lighting.
Pull back to show the protagonist's reaction. A moment of revelation.""",

        "room_transition": f"""SCENE TYPE: Room Transition — Journey Continues
DURATION: 8 seconds

The protagonist leaves "{context.get('current_room', 'the previous area')}" heading {context.get('direction', 'forward')} toward "{context.get('destination', 'the unknown')}".
Theme: {context.get('theme', 'mysterious')}
Mood: {context.get('room_mood', 'contemplative')}

Camera: tracking shot following the protagonist through the environment.
Transition from the previous area to glimpses of what lies ahead.
Atmospheric, cinematic. Build anticipation for the next area.""",
    }

    body = prompts.get(trigger_type, f"""SCENE TYPE: Narrative Moment
DURATION: 8 seconds
Context: {json.dumps(context, default=str)[:500]}
Camera: cinematic medium shot with slow push-in.""")

    return header + body


# ────────────────────────────────────────────────────────────
# Queue worker threads
# ────────────────────────────────────────────────────────────

def _pick_channel(trigger_type):
    """Pick the best video model channel. Try preferred first, fallback to other."""
    if trigger_type in FAST_TRIGGERS:
        preferred, fallback = "fast", "standard"
    else:
        preferred, fallback = "standard", "fast"

    pref = VIDEO_CHANNELS[preferred]
    fb = VIDEO_CHANNELS[fallback]

    if pref["limiter"].remaining() > 0:
        return preferred, pref["model_id"], pref["limiter"]
    if fb["limiter"].remaining() > 0:
        return fallback, fb["model_id"], fb["limiter"]
    return preferred, pref["model_id"], pref["limiter"]


def _queue_worker():
    while True:
        cache_key = None
        try:
            item = _job_queue.get()
            priority, counter, cache_key, session_id, trigger_type, context = item

            sess = sessions.get(session_id)
            if not sess or sess.get("status") != "ready":
                with _cache_lock:
                    video_cache[cache_key] = {
                        "status": "error", "progress": 0,
                        "video_url": None, "error": "Session not ready",
                    }
                _job_queue.task_done()
                continue

            with _cache_lock:
                video_cache[cache_key]["status"] = "waiting_rate_limit"
                video_cache[cache_key]["progress"] = 5

            channel_name, model_id, limiter = _pick_channel(trigger_type)
            print(f"[queue] {cache_key} → {channel_name} model (pri={priority})")

            if not limiter.acquire(timeout=90):
                other_name = "standard" if channel_name == "fast" else "fast"
                other = VIDEO_CHANNELS[other_name]
                print(f"[queue] {cache_key} rate-limited on {channel_name}, trying {other_name}")
                if not other["limiter"].acquire(timeout=90):
                    with _cache_lock:
                        video_cache[cache_key] = {
                            "status": "error", "progress": 0,
                            "video_url": None, "error": "Rate limit timeout (both models)",
                        }
                    print(f"[queue] {cache_key} rate-limit timeout on both models")
                    _job_queue.task_done()
                    continue
                channel_name = other_name
                model_id = other["model_id"]

            with _cache_lock:
                video_cache[cache_key]["status"] = "generating"
                video_cache[cache_key]["progress"] = 20

            spec = sess["spec"]
            veo_pkg = sess["veo_package"]
            client = sess["client"]
            api_key = sess["api_key"]

            prompt = build_trigger_scene_prompt(trigger_type, context, veo_pkg)
            scene_id = f"{spec.character_id}_{trigger_type}_{uuid.uuid4().hex[:6]}"

            ref_imgs = list(veo_pkg.get("subject_images", []))
            anchor = veo_pkg.get("scene_anchor_image")
            if anchor and anchor not in ref_imgs:
                ref_imgs.append(anchor)

            scene_pkg = {
                "scene_id": scene_id,
                "reference_images": ref_imgs[:3],
                "scene_prompt": prompt,
            }

            pkg_path = SCENE_PACKAGES_DIR / f"{scene_id}.json"
            pkg_path.write_text(json.dumps({
                **scene_pkg, "trigger_type": trigger_type,
                "context": {k: str(v)[:200] for k, v in context.items()},
                "model_channel": channel_name,
            }, indent=2, default=str))

            with _cache_lock:
                video_cache[cache_key]["status"] = "generating_video"
                video_cache[cache_key]["progress"] = 30

            print(f"[queue] {cache_key} generating video via {channel_name}...")
            try:
                video_path = generate_video(client, api_key, scene_pkg,
                                            model_id=model_id)
            except Exception as gen_err:
                fallback_name = "standard" if channel_name == "fast" else "fast"
                fallback_model = VIDEO_CHANNELS[fallback_name]["model_id"]
                print(f"[queue] {cache_key} {channel_name} failed: {gen_err}")
                print(f"[queue] {cache_key} retrying with {fallback_name} model...")
                with _cache_lock:
                    video_cache[cache_key]["progress"] = 25
                video_path = generate_video(client, api_key, scene_pkg,
                                            model_id=fallback_model)
                channel_name = fallback_name

            with _cache_lock:
                video_cache[cache_key] = {
                    "status": "complete", "progress": 100,
                    "video_url": f"/api/videos/{video_path.name}",
                    "error": None,
                }
            print(f"[queue] {cache_key} complete → {video_path.name} ({channel_name})")

        except Exception as e:
            if cache_key:
                with _cache_lock:
                    video_cache[cache_key] = {
                        "status": "error", "progress": 0,
                        "video_url": None, "error": str(e),
                    }
            print(f"[queue] {cache_key or '?'} error: {e}")

        _job_queue.task_done()


for _i in range(6):
    threading.Thread(target=_queue_worker, daemon=True).start()
print("[queue] Started 6 video worker threads (dual-model: standard + fast)")


# ────────────────────────────────────────────────────────────
# API request / response models
# ────────────────────────────────────────────────────────────

class InitRequest(BaseModel):
    api_key: str
    world_type: str
    character_name: str = "Wanderer"
    customization_text: str = ""

class CutsceneRequest(BaseModel):
    session_id: str
    trigger: str
    story_context: dict
    exit_direction: str = ""
    exit_label: str = ""
    room_name: str = ""
    room_mood: str = ""

class PreloadItem(BaseModel):
    cache_key: str
    trigger_type: str
    context: dict = {}

class PreloadRequest(BaseModel):
    session_id: str
    requests: List[PreloadItem]


# ────────────────────────────────────────────────────────────
# Endpoints
# ────────────────────────────────────────────────────────────

@app.post("/api/init")
def init_character(req: InitRequest):
    session_id = uuid.uuid4().hex[:12]
    sessions[session_id] = {
        "status": "creating_spec", "progress": 0,
        "api_key": req.api_key, "world_type": req.world_type,
        "character_name": req.character_name,
        "customization_text": req.customization_text,
        "character_id": None, "spec": None, "veo_package": None,
        "error": None,
    }

    def _run():
        sess = sessions[session_id]
        try:
            client = genai.Client(api_key=req.api_key)

            sess["status"] = "creating_spec"
            sess["progress"] = 10
            spec = build_character_spec(req.world_type, req.character_name,
                                        req.customization_text)
            save_character_spec(spec)
            sess["character_id"] = spec.character_id
            sess["spec"] = spec

            sess["status"] = "generating_master_sheet"
            sess["progress"] = 20
            ms_result = generate_master_sheet(client, spec)
            print(f"[init] master sheet done: {ms_result['image_path']}")

            anchor_path = None
            sess["status"] = "generating_anchor"
            sess["progress"] = 50
            try:
                anchor_result = generate_scene_anchor(client, spec,
                                                      ms_result["image_path"])
                anchor_path = anchor_result["anchor_path"]
                print(f"[init] scene anchor done: {anchor_path}")
            except Exception as anchor_err:
                print(f"[init] scene anchor failed (non-fatal): {anchor_err}")
                traceback.print_exc()

            sess["status"] = "building_package"
            sess["progress"] = 80
            veo_pkg = build_veo_package(spec, ms_result["image_path"],
                                        anchor_path)
            sess["veo_package"] = veo_pkg
            sess["client"] = client

            sess["status"] = "ready"
            sess["progress"] = 100
            print(f"[init] session {session_id} ready — {spec.character_id}")

            first_key = f"{session_id}_first_room"
            _enqueue_preload(first_key, session_id, "first_room", {
                "world_type": spec.world_type,
                "character_name": spec.character_name,
            })
            print(f"[init] auto-queued first_room cutscene: {first_key}")

        except Exception as e:
            sess["status"] = "error"
            sess["error"] = str(e)
            print(f"[init] FATAL error: {e}")
            traceback.print_exc()

    threading.Thread(target=_run, daemon=True).start()
    return {"session_id": session_id}


@app.get("/api/init/{session_id}")
def init_status(session_id: str):
    sess = sessions.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    return {
        "status": sess["status"], "progress": sess["progress"],
        "character_id": sess.get("character_id"), "error": sess.get("error"),
    }


@app.post("/api/cutscene")
def request_cutscene(req: CutsceneRequest):
    """Legacy endpoint — now routes through the rate-limited queue."""
    sess = sessions.get(req.session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    if sess["status"] != "ready":
        raise HTTPException(400, f"Session not ready: {sess['status']}")

    cache_key = f"legacy_{req.session_id}_{uuid.uuid4().hex[:6]}"
    _enqueue_preload(cache_key, req.session_id, "room_transition", {
        "current_room": req.room_name,
        "room_mood": req.room_mood,
        "direction": req.exit_direction,
        "destination": req.exit_label,
        "theme": req.story_context.get("theme", "cyberpunk"),
        "chapter": req.story_context.get("chapter", 1),
    })
    return {"scene_id": cache_key}


@app.get("/api/cutscene/{scene_id}")
def cutscene_status(scene_id: str):
    with _cache_lock:
        cached = video_cache.get(scene_id)
    if cached:
        return {
            "status": cached.get("status", "unknown"),
            "progress": cached.get("progress", 0),
            "video_url": cached.get("video_url"),
            "error": cached.get("error"),
        }
    job = cutscene_jobs.get(scene_id)
    if not job:
        raise HTTPException(404, "Cutscene job not found")
    return {
        "status": job["status"], "progress": job["progress"],
        "video_url": job.get("video_url"), "error": job.get("error"),
    }


@app.post("/api/preload")
def preload_cutscenes(req: PreloadRequest):
    """Queue multiple cutscene jobs with priority ordering."""
    sess = sessions.get(req.session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    if sess.get("status") != "ready":
        raise HTTPException(400, f"Session not ready: {sess.get('status')}")

    queued, already = [], []
    for item in req.requests:
        if _enqueue_preload(item.cache_key, req.session_id,
                            item.trigger_type, item.context):
            queued.append(item.cache_key)
        else:
            already.append(item.cache_key)

    return {
        "queued": queued,
        "already_cached": already,
        "rate_limit_remaining": VIDEO_CHANNELS["standard"]["limiter"].remaining() + VIDEO_CHANNELS["fast"]["limiter"].remaining(),
    }


@app.get("/api/cache/{cache_key}")
def cache_status(cache_key: str):
    with _cache_lock:
        entry = video_cache.get(cache_key)
    if not entry:
        return {"status": "not_found", "progress": 0, "video_url": None, "error": None}
    return {
        "status": entry.get("status", "unknown"),
        "progress": entry.get("progress", 0),
        "video_url": entry.get("video_url"),
        "error": entry.get("error"),
    }


@app.get("/api/rate-limit")
def rate_limit_info():
    std = VIDEO_CHANNELS["standard"]["limiter"]
    fast = VIDEO_CHANNELS["fast"]["limiter"]
    return {
        "standard": {
            "remaining": std.remaining(),
            "next_slot_seconds": round(std.next_slot_seconds(), 1),
            "max_per_minute": std.max_per_minute,
        },
        "fast": {
            "remaining": fast.remaining(),
            "next_slot_seconds": round(fast.next_slot_seconds(), 1),
            "max_per_minute": fast.max_per_minute,
        },
        "total_remaining": std.remaining() + fast.remaining(),
    }


@app.get("/api/videos/{filename:path}")
def serve_video(filename: str):
    fp = VIDEOS_DIR / filename
    if not fp.exists():
        raise HTTPException(404, "Video not found")
    return FileResponse(fp, media_type="video/mp4")


# ────────────────────────────────────────────────────────────
# Character Photo Upload + Portrait Generation
# ────────────────────────────────────────────────────────────

def _build_portrait_prompt(character_name: str, world_type: str) -> str:
    rules = WORLD_STYLE_RULES.get(world_type, WORLD_STYLE_RULES["cyberpunk"])
    kw = ", ".join(rules["style_keywords"])
    return f"""
Create a character dialogue portrait (bust-up) for a story RPG game.

Character name: {character_name}
World style: {world_type}
Style: {kw}

Requirements:
- Upper body portrait (head and shoulders, slight chest visible)
- Facing slightly to the right (3/4 view)
- Expressive, neutral-confident expression
- Clean background (solid dark or transparent feel)
- Game-quality art, polished and readable at small sizes
- Style consistent with {world_type} aesthetic
- Single portrait, no split panels or multiple views
""".strip()


def _build_photo_master_sheet_prompt(character_name: str, world_type: str) -> str:
    rules = WORLD_STYLE_RULES.get(world_type, WORLD_STYLE_RULES["cyberpunk"])
    kw = ", ".join(rules["style_keywords"])
    outfit = ", ".join(rules["outfit_defaults"])
    return f"""
Using the uploaded photo as the character's face/identity reference,
create a professional game character master reference sheet.

Adapt the person from the photo into a {world_type} game protagonist.

Character name: {character_name}
World: {world_type}
Style: {kw}
Outfit: {outfit}

Requirements:
- Preserve the person's facial identity from the photo
- Adapt them into {world_type} style clothing and aesthetic
- Include front view, back view, and 3/4 view
- Consistent identity across all views
- Clean white background, labeled views
- Game-ready, polished, clean cel-shaded style
- Include a color palette row at the bottom
""".strip()


@app.post("/api/generate-from-photo")
async def generate_from_photo(
    photo: UploadFile = File(...),
    theme: str = Form("cyberpunk"),
    character_name: str = Form("Wanderer"),
    api_key: str = Form(...),
):
    """Accept a user photo and generate game assets (master sheet + portrait)."""
    try:
        photo_bytes = await photo.read()
        photo_id = uuid.uuid4().hex[:8]
        upload_path = UPLOADS_DIR / f"{photo_id}_{photo.filename}"
        upload_path.write_bytes(photo_bytes)

        uploaded_img = Image.open(io.BytesIO(photo_bytes))
        if uploaded_img.mode == "RGBA":
            uploaded_img = uploaded_img.convert("RGB")

        client = genai.Client(api_key=api_key)

        portrait_prompt = _build_portrait_prompt(character_name, theme)
        portrait_resp = client.models.generate_content(
            model=MODELS["image_fast"],
            contents=[portrait_prompt, uploaded_img],
            config=types.GenerateContentConfig(
                response_modalities=["Image"],
                image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K"),
            ),
        )
        portrait_img = _extract_first_image(portrait_resp)
        portrait_path = PORTRAITS_DIR / f"{photo_id}_portrait.png"
        portrait_img.save(portrait_path)

        sprite_prompt = _build_photo_master_sheet_prompt(character_name, theme)
        sprite_resp = client.models.generate_content(
            model=MODELS["image_fast"],
            contents=[sprite_prompt, uploaded_img],
            config=types.GenerateContentConfig(
                response_modalities=["Image"],
                image_config=types.ImageConfig(aspect_ratio="1:1", image_size="2K"),
            ),
        )
        sprite_img = _extract_first_image(sprite_resp)
        sprite_path = MASTER_SHEETS_DIR / f"{photo_id}_master_sheet.png"
        sprite_img.save(sprite_path)

        return {
            "portrait_url": f"/api/assets/portraits/{portrait_path.name}",
            "sprite_url": f"/api/assets/master_sheets/{sprite_path.name}",
            "photo_id": photo_id,
        }

    except Exception as e:
        print(f"[photo] Error generating from photo: {e}")
        raise HTTPException(500, f"Asset generation failed: {str(e)}")


class PortraitRequest(BaseModel):
    api_key: str
    character_name: str = "Wanderer"
    theme: str = "cyberpunk"
    preset_id: str = ""


@app.post("/api/generate-portrait")
def generate_portrait(req: PortraitRequest):
    """Generate a dialogue portrait from character spec (no photo)."""
    try:
        client = genai.Client(api_key=req.api_key)
        prompt = _build_portrait_prompt(req.character_name, req.theme)
        resp = client.models.generate_content(
            model=MODELS["image_fast"],
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=["Image"],
                image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K"),
            ),
        )
        img = _extract_first_image(resp)
        pid = uuid.uuid4().hex[:8]
        path = PORTRAITS_DIR / f"{pid}_portrait.png"
        img.save(path)
        return {"portrait_url": f"/api/assets/portraits/{path.name}"}
    except Exception as e:
        raise HTTPException(500, f"Portrait generation failed: {str(e)}")


class BustupRequest(BaseModel):
    api_key: str
    name: str = "NPC"
    theme: str = "cyberpunk"
    role: str = "npc"
    description: str = ""
    color: str = ""


@app.post("/api/generate-bustup")
def generate_bustup(req: BustupRequest):
    """Generate a dialogue portrait for any NPC/enemy. Caches by name+theme."""
    safe_name = "".join(c if c.isalnum() else "_" for c in req.name).lower()
    cache_key = f"{req.theme}_{req.role}_{safe_name}"
    cached_path = PORTRAITS_DIR / f"{cache_key}_portrait.png"

    if cached_path.exists():
        return {"portrait_url": f"/api/assets/portraits/{cached_path.name}", "cached": True}

    try:
        client = genai.Client(api_key=req.api_key)
        rules = WORLD_STYLE_RULES.get(req.theme, WORLD_STYLE_RULES["cyberpunk"])
        kw = ", ".join(rules["style_keywords"])
        color_hint = f"\nAccent color hint: {req.color}" if req.color else ""
        prompt = f"""
Create a character dialogue portrait (bust-up) for a story RPG game.

Character name: {req.name}
Role: {req.role}
World style: {req.theme}
Style keywords: {kw}{color_hint}
Description: {req.description or req.name}

Requirements:
- Upper body portrait (head and shoulders)
- Facing slightly to the right (3/4 view)
- Expressive, character-appropriate expression
- Clean dark background
- Game-quality art, polished, readable at small sizes
- {req.theme} world aesthetic
- Single portrait, no split panels
""".strip()

        resp = client.models.generate_content(
            model=MODELS["image_fast"],
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=["Image"],
                image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K"),
            ),
        )
        img = _extract_first_image(resp)
        img.save(cached_path)
        return {"portrait_url": f"/api/assets/portraits/{cached_path.name}", "cached": False}
    except Exception as e:
        print(f"[bustup] Error generating for {req.name}: {e}")
        raise HTTPException(500, f"Bustup generation failed: {str(e)}")


@app.get("/api/presets/{theme}")
def get_presets(theme: str):
    """Return preset definitions and check for cached generated assets."""
    CHARACTER_PRESETS = {
        "cyberpunk": [
            {"id": "cyber_neon_blade", "name": "Neon Blade", "desc": "Street samurai with a code of honor"},
            {"id": "cyber_ghost_run", "name": "Ghost Runner", "desc": "Hacker who lives in the network"},
            {"id": "cyber_chrome", "name": "Chrome Heart", "desc": "Cyborg searching for humanity"},
            {"id": "cyber_pixel", "name": "Pixel Punk", "desc": "Rebel with nothing left to lose"},
        ],
        "medieval": [
            {"id": "med_iron_vow", "name": "Iron Vow", "desc": "Knight bound by an ancient oath"},
            {"id": "med_shadow", "name": "Shadow Weave", "desc": "Mage touched by forbidden arts"},
            {"id": "med_wild", "name": "Wild Path", "desc": "Ranger who speaks to the forest"},
            {"id": "med_golden", "name": "Golden Tongue", "desc": "Rogue thriving on charm and guile"},
        ],
        "space": [
            {"id": "spa_walker", "name": "Star Walker", "desc": "Explorer charting the unknown"},
            {"id": "spa_void", "name": "Void Born", "desc": "Alien hybrid between two worlds"},
            {"id": "spa_steel", "name": "Steel Wing", "desc": "Ace pilot with nerves of titanium"},
            {"id": "spa_data", "name": "Data Ghost", "desc": "AI construct seeking purpose"},
        ],
    }
    ENEMY_PRESETS = {
        "cyberpunk": [
            {"id": "cyber_drones", "name": "Rogue Drones", "desc": "Mechanical swarm", "danger": 2},
            {"id": "cyber_corps", "name": "Corp Enforcers", "desc": "Armored soldiers", "danger": 3},
            {"id": "cyber_wraiths", "name": "Neon Wraiths", "desc": "Digital ghosts", "danger": 4},
        ],
        "medieval": [
            {"id": "med_cursed", "name": "Cursed Knights", "desc": "Undead warriors", "danger": 3},
            {"id": "med_beasts", "name": "Shadow Beasts", "desc": "Dark creatures", "danger": 4},
            {"id": "med_goblins", "name": "Goblin Horde", "desc": "Chaotic raiders", "danger": 2},
        ],
        "space": [
            {"id": "spa_parasites", "name": "Void Parasites", "desc": "Alien organisms", "danger": 3},
            {"id": "spa_rogue_ai", "name": "Rogue AI Units", "desc": "Corrupted machines", "danger": 2},
            {"id": "spa_reapers", "name": "Star Reapers", "desc": "Cosmic horrors", "danger": 5},
        ],
    }

    chars = CHARACTER_PRESETS.get(theme, [])
    enemies = ENEMY_PRESETS.get(theme, [])

    for c in chars:
        portrait = PORTRAITS_DIR / f"{c['id']}_portrait.png"
        sprite = MASTER_SHEETS_DIR / f"{c['id']}_master_sheet.png"
        c["has_portrait"] = portrait.exists()
        c["has_sprite"] = sprite.exists()
        if c["has_portrait"]:
            c["portrait_url"] = f"/api/assets/portraits/{portrait.name}"
        if c["has_sprite"]:
            c["sprite_url"] = f"/api/assets/master_sheets/{sprite.name}"

    return {"characters": chars, "enemies": enemies}


@app.get("/api/assets/{folder}/{filename}")
def serve_asset(folder: str, filename: str):
    """Serve generated asset files (portraits, master sheets, etc.)."""
    folder_map = {
        "portraits": PORTRAITS_DIR,
        "master_sheets": MASTER_SHEETS_DIR,
        "presets": PRESETS_DIR,
        "uploads": UPLOADS_DIR,
    }
    base = folder_map.get(folder)
    if not base:
        raise HTTPException(404, "Unknown asset folder")
    fp = base / filename
    if not fp.exists():
        raise HTTPException(404, "Asset not found")
    mime, _ = mimetypes.guess_type(str(fp))
    return FileResponse(fp, media_type=mime or "application/octet-stream")


# ────────────────────────────────────────────────────────────
# Music Generation via Lyria
# ────────────────────────────────────────────────────────────

class MusicRequest(BaseModel):
    api_key: str
    cache_key: str
    prompt: str


@app.post("/api/generate-music")
def generate_music(req: MusicRequest):
    """Generate a 30-second music clip via Lyria. Cached by cache_key."""
    safe_key = "".join(c if c.isalnum() or c == "_" else "_" for c in req.cache_key)

    for ext in (".wav", ".mp3", ".ogg", ".webm", ".flac"):
        cached = MUSIC_DIR / f"{safe_key}{ext}"
        if cached.exists():
            return {"music_url": f"/api/music/{cached.name}", "cached": True}

    try:
        client = genai.Client(api_key=req.api_key)
        contents = [types.Content(role="user", parts=[types.Part.from_text(text=req.prompt)])]
        config = types.GenerateContentConfig(response_modalities=["audio"])

        audio_data = b""
        mime_type = "audio/wav"

        for chunk in client.models.generate_content_stream(
            model=MODELS["music"],
            contents=contents,
            config=config,
        ):
            if chunk.parts is None:
                continue
            part = chunk.parts[0]
            if part.inline_data and part.inline_data.data:
                audio_data += part.inline_data.data
                if part.inline_data.mime_type:
                    mime_type = part.inline_data.mime_type

        if not audio_data:
            raise ValueError("No audio data received from Lyria")

        ext = mimetypes.guess_extension(mime_type) or ".wav"
        save_path = MUSIC_DIR / f"{safe_key}{ext}"
        save_path.write_bytes(audio_data)
        print(f"[music] Generated {save_path.name} ({len(audio_data)} bytes)")
        return {"music_url": f"/api/music/{save_path.name}", "cached": False}

    except Exception as e:
        print(f"[music] Error generating {req.cache_key}: {e}")
        raise HTTPException(500, f"Music generation failed: {str(e)}")


@app.get("/api/music/{filename}")
def serve_music(filename: str):
    fp = MUSIC_DIR / filename
    if not fp.exists():
        raise HTTPException(404, "Music not found")
    mime, _ = mimetypes.guess_type(str(fp))
    return FileResponse(fp, media_type=mime or "audio/wav")


# ────────────────────────────────────────────────────────────
# Game save / gallery / recap
# ────────────────────────────────────────────────────────────

GAMES_DIR = STORY_DIR  # reuse the already-created story_state dir


@app.post("/api/save-game")
def save_game(payload: dict):
    """Save a completed game for the gallery / recap page."""
    game_id = uuid.uuid4().hex[:10]
    payload["game_id"] = game_id
    payload["saved_at"] = time.time()

    sid = payload.get("sessionId", "")
    if sid:
        with _cache_lock:
            all_vids = []
            for key, entry in video_cache.items():
                if key.startswith(sid) and entry.get("status") == "complete" and entry.get("video_url"):
                    all_vids.append({
                        "cache_key": key,
                        "video_url": entry["video_url"],
                    })
            payload["allSessionVideos"] = all_vids

    fp = GAMES_DIR / f"{game_id}.json"
    fp.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"[save] Game saved: {game_id} — {payload.get('playerName', '?')}")
    return {"game_id": game_id}


@app.get("/api/games")
def list_games():
    """Return lightweight list of saved games for the gallery."""
    games = []
    for fp in sorted(GAMES_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(fp.read_text())
            games.append({
                "game_id": data.get("game_id", fp.stem),
                "playerName": data.get("playerName", "Unknown"),
                "theme": data.get("theme", "cyberpunk"),
                "soulColor": data.get("soulColor", "#ff0000"),
                "soulTrait": data.get("soulTrait", "Determination"),
                "endingType": data.get("endingType", {}),
                "roomCount": data.get("roomNumber", 0),
                "maxRooms": data.get("maxRooms", 10),
                "level": data.get("level", 1),
                "portraitUrl": data.get("portraitUrl", ""),
                "saved_at": data.get("saved_at", 0),
            })
        except Exception:
            continue
    return {"games": games[:50]}


@app.get("/api/games/{game_id}")
def get_game(game_id: str):
    """Return full game data for the recap page."""
    safe = "".join(c if c.isalnum() else "" for c in game_id)
    fp = GAMES_DIR / f"{safe}.json"
    if not fp.exists():
        raise HTTPException(404, "Game not found")
    return json.loads(fp.read_text())


# ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  UNIFACTORY — AI Cutscene Backend (dual-model)")
    print("  API running at http://localhost:8081")
    print("  Veo Standard: 9/min | Veo Fast: 9/min | ~18 RPM total")
    print("  Frontend should run at http://localhost:8080")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8081)
