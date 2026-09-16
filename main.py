"""
Bird Sound -> Image  (all-Gemini pipeline)
==========================================
FastAPI backend that:
  1. Listens: receives a recorded / uploaded audio clip.
  2. Recognises: sends the audio to a Gemini multimodal model which returns
     structured JSON (species, confidence, habitat, visual description, and
     an image-generation prompt).
  3. Generates: sends that prompt to a Gemini image model and returns the PNG.

The Gemini API key comes from the web UI (X-Gemini-Api-Key header) or, as a
fallback, from GEMINI_API_KEY in .env.

Run:  uvicorn main:app --reload --port 8000
Then open http://127.0.0.1:8000
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
import uuid
from collections import OrderedDict
from pathlib import Path
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bird-sound-to-image")


# --------------------------------------------------------------------------- #
# Configuration                                                               #
# --------------------------------------------------------------------------- #
class Settings:
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "").strip()
    fal_api_key: str = os.getenv("FAL_KEY", os.getenv("FAL_API_KEY", "")).strip()
    audio_model: str = os.getenv("GEMINI_AUDIO_MODEL", "gemini-3.5-flash")
    image_model: str = os.getenv("IMAGE_MODEL", os.getenv("GEMINI_IMAGE_MODEL", "fal-ai/fast-sdxl"))
    min_confidence: float = float(os.getenv("MIN_CONFIDENCE", "0.60"))
    generation_seed: int = int(os.getenv("GENERATION_SEED", "42"))
    max_audio_bytes: int = int(os.getenv("MAX_AUDIO_MB", "15")) * 1024 * 1024
    cors_origins: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://127.0.0.1:8000,http://localhost:8000").split(",")
        if o.strip()
    ]


settings = Settings()

ALLOWED_AUDIO_MIME = {
    "audio/wav": "audio/wav",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/vnd.wave": "audio/wav",
    "audio/mpeg": "audio/mp3",
    "audio/mp3": "audio/mp3",
    "audio/mp4": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "audio/webm": "audio/webm",
    "audio/ogg": "audio/ogg",
    "audio/flac": "audio/flac",
    "audio/x-flac": "audio/flac",
    "audio/aac": "audio/aac",
    "audio/aiff": "audio/aiff",
    "audio/x-aiff": "audio/aiff",
}
EXTENSION_MIME = {
    ".wav": "audio/wav",
    ".mp3": "audio/mp3",
    ".mp4": "audio/mp4",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".aif": "audio/aiff",
    ".aiff": "audio/aiff",
}

AspectRatio = Literal["1:1", "4:3", "3:4", "16:9", "9:16"]
ImageSize = Literal["1K", "2K"]


# --------------------------------------------------------------------------- #
# Schemas                                                                     #
# --------------------------------------------------------------------------- #
class BirdIdentification(BaseModel):
    """Structured output schema enforced on the Gemini audio model."""

    identified: bool = Field(description="True only if a bird vocalization is clearly present and attributable to a species.")
    common_name: str = Field(description="Accepted English common name (IOC/eBird). Empty string if not identified.")
    scientific_name: str = Field(description="Binomial scientific name. Empty string if not identified.")
    confidence: float = Field(description="Calibrated probability 0.0-1.0 that the species is correct.")
    habitat_description: str = Field(description="Native range and typical habitat in 1-3 sentences.")
    visual_description: str = Field(description="Precise plumage, beak shape, posture, and natural perching environment.")
    image_prompt: str = Field(description="Detailed, descriptive image-generation prompt for a photorealistic photo of the bird.")
    negative_prompt: str = Field(description="Comma-separated things the image must avoid.")


class GenerateRequest(BaseModel):
    image_prompt: str = Field(min_length=3, max_length=6000)
    negative_prompt: str = Field(default="", max_length=2000)
    model: str | None = Field(default=None, max_length=100)
    aspect_ratio: AspectRatio = "1:1"
    image_size: ImageSize = "1K"
    seed: int | None = Field(default=None)


AUDIO_SYSTEM_PROMPT = """\
You are an expert field ornithologist and bioacoustics specialist.
You will receive an audio recording. Listen carefully and identify the bird
species producing the dominant vocalization (song or call) using its acoustic
features: pitch range, note structure, trills, repetition rate, syllable shape
and rhythm.

Rules:
- Be conservative. If there is no bird sound (silence, speech, music, traffic,
  insects, synthetic sounds) set identified=false, confidence=0.0 and leave
  names and prompts as empty strings.
- If a bird is audible but the species is ambiguous, give your best candidate
  with an honest, calibrated confidence (do NOT inflate it).
- Use the accepted English common name and correct binomial scientific name.
- visual_description: accurate adult plumage (state sex if dimorphic and which
  one you describe), bill shape and colour, eye/leg colour, size cues, posture,
  and a typical natural perch/environment for the species.
- image_prompt: write it for a modern text-to-image model as rich descriptive
  prose (not a keyword list). Start with "A photorealistic wildlife photograph
  of a <common name> (<scientific name>)", describe every diagnostic field
  mark exactly, the pose, the natural perch and habitat, then the photography:
  telephoto 600mm lens, natural golden-hour light, shallow depth of field with
  soft bokeh, tack-sharp focus on the eye, finely detailed feathers, 8k, in the
  style of National Geographic. No humans, no man-made objects, no text.
- negative_prompt: always include "blurry, low quality, distorted anatomy,
  extra limbs, extra wings, deformed beak, illustration, cartoon, painting,
  3d render, text, watermark, humans, cage" plus any similar species whose
  plumage should not be mixed in.
Return ONLY the JSON object that matches the schema.
"""


# --------------------------------------------------------------------------- #
# App setup                                                                   #
# --------------------------------------------------------------------------- #
app = FastAPI(title="Bird Sound → Image (Gemini)", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status, self.code, self.message = status, code, message


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})


# One client per API key (keyed by hash so raw keys are never used as dict keys in logs/dumps).
_clients: OrderedDict[str, genai.Client] = OrderedDict()


def get_client(header_key: str | None) -> genai.Client:
    api_key = (header_key or "").strip() or settings.gemini_api_key
    api_key = "".join(c for c in api_key if 32 <= ord(c) <= 126).strip().strip("\"'").strip()
    if not api_key:
        raise ApiError(401, "NO_API_KEY", "No Gemini API key. Paste your Google AI Studio key in the API key panel.")
    digest = hashlib.sha256(api_key.encode()).hexdigest()
    client = _clients.get(digest)
    if client is None:
        client = genai.Client(api_key=api_key)
        _clients[digest] = client
        while len(_clients) > 8:
            _clients.popitem(last=False)
    return client


def translate_gemini_error(exc: Exception, model: str, stage: str) -> ApiError:
    """Map google-genai errors to clear, actionable UI messages."""
    if isinstance(exc, ApiError):
        return exc
    if isinstance(exc, genai_errors.APIError):
        code, text = exc.code, str(exc.message or exc)
        if code in (400, 401, 403) and ("API key" in text or "API_KEY" in text or "PERMISSION_DENIED" in str(exc.status)):
            return ApiError(401, "INVALID_API_KEY", "Google rejected the API key. Check it in the API key panel.")
        if code == 429:
            if "limit: 0" in str(exc):
                return ApiError(
                    429,
                    "QUOTA_ZERO",
                    f"Your API key's project has no free-tier quota for '{model}'. "
                    "Gemini image generation requires billing: enable it at https://aistudio.google.com (Settings → Billing), "
                    "or choose another model.",
                )
            return ApiError(429, "RATE_LIMITED", f"Gemini rate limit reached for '{model}'. Wait a minute and try again.")
        if code == 404:
            return ApiError(404, "MODEL_NOT_FOUND", f"Model '{model}' is not available for this API key. Pick another model.")
        return ApiError(502, "GEMINI_ERROR", f"Gemini {stage} failed ({code}): {text[:300]}")
    log.exception("Unexpected Gemini %s error", stage)
    return ApiError(502, "GEMINI_ERROR", f"Gemini {stage} failed: {exc}")


# --------------------------------------------------------------------------- #
# Image cache                                                                 #
# --------------------------------------------------------------------------- #
class ImageStore:
    def __init__(self, capacity: int = 24) -> None:
        self.capacity = capacity
        self._items: OrderedDict[str, tuple[bytes, str]] = OrderedDict()

    def put(self, data: bytes, mime: str) -> str:
        image_id = uuid.uuid4().hex
        self._items[image_id] = (data, mime)
        while len(self._items) > self.capacity:
            self._items.popitem(last=False)
        return image_id

    def get(self, image_id: str) -> tuple[bytes, str] | None:
        item = self._items.get(image_id)
        if item is not None:
            self._items.move_to_end(image_id)
        return item


image_store = ImageStore()


FAL_IMAGE_MODELS = [
    "fal-ai/fast-sdxl",
    "fal-ai/flux/schnell",
    "fal-ai/sdxl-turbo",
    "fal-ai/flux/dev",
    "fal-ai/krea-realtime",
]


async def generate_fal_image(
    prompt: str,
    negative_prompt: str,
    model: str,
    aspect_ratio: str,
    fal_key: str,
    seed: int = 42,
) -> tuple[bytes, str]:
    if not fal_key:
        raise ApiError(401, "NO_FAL_KEY", "No Fal.ai API key. Paste your Fal.ai key in the API key panel.")

    model_clean = model.strip()
    if not model_clean.startswith("http"):
        endpoint = f"https://fal.run/{model_clean}"
    else:
        endpoint = model_clean

    dim_map = {
        "1:1": {"width": 1024, "height": 1024},
        "4:3": {"width": 1152, "height": 864},
        "3:4": {"width": 864, "height": 1152},
        "16:9": {"width": 1344, "height": 768},
        "9:16": {"width": 768, "height": 1344},
    }
    dims = dim_map.get(aspect_ratio, {"width": 1024, "height": 1024})

    payload: dict[str, Any] = {
        "prompt": prompt,
        "image_size": dims,
        "num_images": 1,
        "enable_safety_checker": True,
        "seed": seed,
    }
    if negative_prompt:
        payload["negative_prompt"] = negative_prompt

    headers = {
        "Authorization": f"Key {fal_key}",
        "Content-Type": "application/json",
    }

    log.info("Sending request to Fal.ai model %s", model_clean)
    async with httpx.AsyncClient(timeout=90.0) as http_client:
        try:
            res = await http_client.post(endpoint, json=payload, headers=headers)
        except Exception as exc:
            raise ApiError(502, "FAL_REQUEST_FAILED", f"Could not connect to Fal.ai: {exc}")

        if res.status_code != 200:
            err_msg = res.text
            try:
                err_data = res.json()
                err_msg = str(err_data.get("detail", err_data.get("message", res.text)))
            except Exception:
                pass
            if res.status_code in (401, 403):
                raise ApiError(401, "INVALID_FAL_KEY", f"Fal.ai rejected the API key: {err_msg[:200]}")
            raise ApiError(res.status_code, "FAL_ERROR", f"Fal.ai generation failed ({res.status_code}): {err_msg[:300]}")

        data = res.json()
        images = data.get("images") or []
        if not images:
            raise ApiError(502, "NO_IMAGE", "Fal.ai returned no image.")

        img_url = images[0].get("url")
        mime = images[0].get("content_type") or "image/png"

        try:
            img_res = await http_client.get(img_url)
            if img_res.status_code != 200:
                raise ApiError(502, "IMAGE_DOWNLOAD_FAILED", "Failed to download generated image from Fal.ai CDN.")
            img_bytes = img_res.content
        except Exception as exc:
            raise ApiError(502, "IMAGE_DOWNLOAD_FAILED", f"Failed to download image from Fal.ai: {exc}")

        return img_bytes, mime


# --------------------------------------------------------------------------- #
# API key / models                                                            #
# --------------------------------------------------------------------------- #
@app.get("/api/config")
async def api_config() -> dict[str, Any]:
    return {
        "server_key_configured": bool(settings.gemini_api_key),
        "fal_key_configured": bool(settings.fal_api_key),
        "audio_model": settings.audio_model,
        "image_model": settings.image_model,
        "min_confidence": settings.min_confidence,
    }


@app.post("/api/key/check")
async def api_key_check(
    x_gemini_api_key: str | None = Header(default=None),
    x_fal_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
    """Validate the key by listing models; return models usable for each stage."""
    client = get_client(x_gemini_api_key)
    all_models: list[str] = []
    audio_models: list[str] = []
    image_models: list[str] = []
    try:
        async for m in await client.aio.models.list():
            raw_name = m.name or ""
            name = raw_name.removeprefix("models/")
            actions = m.supported_actions or []
            all_models.append(name)
            if "generateContent" in actions:
                audio_models.append(name)
            if "generateImages" in actions or "imagen" in name:
                image_models.append(name)
    except Exception as exc:
        raise translate_gemini_error(exc, "models.list", "key check") from exc

    PREF_AUDIO = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"]
    PREF_IMAGE = ["gemini-3.1-flash-image", "gemini-2.5-flash-image", "gemini-3-pro-image", "gemini-3.1-flash-lite-image"]

    usable_audio = [m for m in audio_models if not any(x in m for x in ("tts", "embedding", "robotics", "customtools", "computer-use", "native-audio"))]
    sorted_audio = [m for m in PREF_AUDIO if m in usable_audio]
    for m in sorted(usable_audio):
        if m not in sorted_audio:
            sorted_audio.append(m)

    usable_image = [m for m in image_models if not any(x in m for x in ("tts", "embedding", "robotics", "customtools"))]
    sorted_gemini_image = [m for m in PREF_IMAGE if m in usable_image]
    for m in sorted(usable_image):
        if m not in sorted_gemini_image:
            sorted_gemini_image.append(m)

    # Combined list with Fal.ai models at the top
    combined_image_models = list(FAL_IMAGE_MODELS) + sorted_gemini_image

    default_audio = sorted_audio[0] if sorted_audio else "gemini-3.5-flash"
    default_image = combined_image_models[0] if combined_image_models else "fal-ai/fast-sdxl"

    log.info("FINAL RETURNED AUDIO MODELS: %s (default: %s)", sorted_audio, default_audio)
    log.info("FINAL RETURNED IMAGE MODELS: %s (default: %s)", combined_image_models, default_image)

    return {
        "valid": True,
        "audio_models": sorted_audio,
        "image_models": combined_image_models,
        "default_audio_model": default_audio,
        "default_image_model": default_image,
    }


# --------------------------------------------------------------------------- #
# Stage 1+2: listen & recognise (audio -> structured JSON + prompt)           #
# --------------------------------------------------------------------------- #
def resolve_mime(upload: UploadFile) -> str:
    ctype = (upload.content_type or "").split(";")[0].strip().lower()
    if ctype in ALLOWED_AUDIO_MIME:
        return ALLOWED_AUDIO_MIME[ctype]
    ext = Path(upload.filename or "").suffix.lower()
    if ext in EXTENSION_MIME:
        return EXTENSION_MIME[ext]
    raise ApiError(415, "UNSUPPORTED_AUDIO", f"Unsupported audio type '{ctype or ext or 'unknown'}'. Use WAV, MP3, OGG, FLAC, AAC or AIFF.")


async def identify_bird(client: genai.Client, model: str, audio: bytes, mime_type: str) -> BirdIdentification:
    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=[
                types.Part.from_bytes(data=audio, mime_type=mime_type),
                "Identify the bird in this recording and return the JSON object.",
            ],
            config=types.GenerateContentConfig(
                system_instruction=AUDIO_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=BirdIdentification,
                temperature=0.0,
                seed=settings.generation_seed,
            ),
        )
    except Exception as exc:
        raise translate_gemini_error(exc, model, "audio recognition") from exc

    result = response.parsed
    if not isinstance(result, BirdIdentification):
        try:
            result = BirdIdentification.model_validate_json(response.text or "")
        except Exception as exc:
            log.error("Unparseable Gemini output: %r", response.text)
            raise ApiError(502, "GEMINI_BAD_OUTPUT", "Gemini returned output that did not match the expected JSON schema.") from exc

    result.confidence = max(0.0, min(1.0, float(result.confidence)))
    return result


@app.post("/api/identify")
async def api_identify(
    audio: UploadFile = File(...),
    model: str | None = Form(default=None),
    x_gemini_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
    client = get_client(x_gemini_api_key)
    model = (model or "").strip() or settings.audio_model
    mime_type = resolve_mime(audio)
    data = await audio.read()
    if not data:
        raise ApiError(400, "EMPTY_AUDIO", "The uploaded audio file is empty.")
    if len(data) > settings.max_audio_bytes:
        raise ApiError(413, "AUDIO_TOO_LARGE", f"Audio exceeds {settings.max_audio_bytes // (1024 * 1024)} MB. Trim it to 5–30 seconds.")

    log.info("Identifying %s (%d bytes, %s) with %s", audio.filename, len(data), mime_type, model)
    result = await identify_bird(client, model, data, mime_type)

    if not result.identified or not result.common_name:
        status, message = "no_bird", "No bird vocalization was detected. Move closer to the bird, reduce background noise and record again."
    elif result.confidence < settings.min_confidence:
        status, message = (
            "low_confidence",
            f"Low confidence ({result.confidence:.0%}). Best guess is {result.common_name}; please re-record a clearer 5–10 s clip.",
        )
    else:
        status, message = "ok", f"Identified {result.common_name}."

    return {
        "status": status,
        "message": message,
        "min_confidence": settings.min_confidence,
        "model": model,
        "result": result.model_dump(),
    }


# --------------------------------------------------------------------------- #
# Stage 3: generate image (prompt -> Fal.ai or Gemini image model)            #
# --------------------------------------------------------------------------- #
def compose_image_prompt(req: GenerateRequest) -> str:
    prompt = req.image_prompt.strip()
    if req.negative_prompt.strip():
        prompt += f"\n\nAvoid: {req.negative_prompt.strip()}."
    return prompt


@app.post("/api/generate")
async def api_generate(
    req: GenerateRequest,
    x_gemini_api_key: str | None = Header(default=None),
    x_fal_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
    model = (req.model or "").strip() or settings.image_model
    prompt = compose_image_prompt(req)
    fal_key = (x_fal_api_key or "").strip() or settings.fal_api_key
    seed = req.seed if req.seed is not None else settings.generation_seed

    log.info("Generating image with %s (%s, %s, seed=%s)", model, req.aspect_ratio, req.image_size, seed)
    t0 = time.perf_counter()
    image_bytes = None
    mime = "image/png"
    text_parts: list[str] = []

    if model.startswith("fal-") or model.startswith("fal/") or model in FAL_IMAGE_MODELS or (fal_key and not model.startswith("gemini")):
        image_bytes, mime = await generate_fal_image(
            prompt=req.image_prompt,
            negative_prompt=req.negative_prompt,
            model=model if (model.startswith("fal-") or model.startswith("fal/")) else "fal-ai/fast-sdxl",
            aspect_ratio=req.aspect_ratio,
            fal_key=fal_key,
            seed=seed,
        )
    else:
        client = get_client(x_gemini_api_key)
        try:
            if "imagen" in model.lower():
                res = await client.aio.models.generate_images(
                    model=model,
                    prompt=prompt,
                    config=types.GenerateImagesConfig(
                        number_of_images=1,
                        aspect_ratio=req.aspect_ratio,
                        output_mime_type="image/png",
                        seed=seed,
                    ),
                )
                if res.generated_images:
                    image_bytes = res.generated_images[0].image.image_bytes
            else:
                response = await client.aio.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                        image_config=types.ImageConfig(aspect_ratio=req.aspect_ratio),
                        seed=seed,
                    ),
                )
                candidate = (response.candidates or [None])[0]
                for part in (candidate.content.parts if candidate and candidate.content else None) or []:
                    if part.inline_data and part.inline_data.data and image_bytes is None:
                        image_bytes = part.inline_data.data
                        mime = part.inline_data.mime_type or "image/png"
                    elif part.text:
                        text_parts.append(part.text)
        except Exception as exc:
            raise translate_gemini_error(exc, model, "image generation") from exc

    elapsed = time.perf_counter() - t0

    if image_bytes is None:
        detail = " ".join(text_parts)[:300] or "No image returned by model"
        raise ApiError(502, "NO_IMAGE", f"Image generator returned no image ({detail}). Try Regenerate.")

    image_id = image_store.put(image_bytes, mime)
    return {
        "image_id": image_id,
        "image_url": f"/api/images/{image_id}",
        "mime_type": mime,
        "parameters": {
            "prompt": req.image_prompt,
            "negative_prompt": req.negative_prompt,
            "model": model,
            "aspect_ratio": req.aspect_ratio,
            "image_size": req.image_size,
            "seed": seed,
            "generation_seconds": round(elapsed, 1),
            "model_notes": " ".join(text_parts)[:500],
        },
    }


@app.get("/api/images/{image_id}")
async def api_image(image_id: str) -> Response:
    item = image_store.get(image_id)
    if item is None:
        raise ApiError(404, "IMAGE_NOT_FOUND", "Image expired from the server cache. Regenerate it.")
    data, mime = item
    return Response(content=data, media_type=mime, headers={"Cache-Control": "private, max-age=3600"})


# Serve the frontend from the same origin (mounted last so /api/* wins).
FRONTEND_DIR = Path(__file__).parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
