# Birdsong Canvas — Bird Sound → Image (all Gemini)

Record or upload a bird call. **Gemini** does all four steps:

1. **Listens** to the audio.
2. **Recognises** the species, with a confidence score and the bird's habitat.
3. **Writes** a photorealistic image prompt.
4. **Generates** the image.

```
Browser (mic → 16-bit WAV)
   │  POST /api/identify   (audio + model)          header: X-Gemini-Api-Key
   ▼
main.py ──► Gemini audio model (e.g. gemini-3.5-flash, JSON schema)
            → species, confidence, habitat, visual description, image_prompt, negative_prompt
   │  POST /api/generate   (prompt, model, aspect ratio, resolution)
   ▼
main.py ──► Gemini image model (e.g. gemini-3.1-flash-image) → image bytes → GET /api/images/{id}
```

## Files

| File | Purpose |
|---|---|
| `main.py` | FastAPI backend: key check and model list, audio recognition, image generation, image cache |
| `frontend/index.html` | Split-screen UI plus the API key and model settings panel |
| `frontend/app.js` | Mic capture and visualizer, pipeline status, key storage, regenerate/download |
| `.env.example` | Configuration template (`.env` is git-ignored) |

## Setup

```bash
py -3.12 -m venv .venv
```

```bash
.venv\Scripts\python -m pip install -r requirements.txt
```

```bash
.venv\Scripts\python -m uvicorn main:app --port 8000
```

Open **http://127.0.0.1:8000**. Browsers only allow the microphone on localhost or HTTPS.

## API key

- **In the web UI:** click **API key ⚙️** (top right), paste your Google AI Studio key and click **Save & test**. The key is checked and the model dropdowns fill with the models your key can use.
  - If **Remember in this browser** is ticked, the key is stored in `localStorage`. Otherwise it only lasts for the current tab.
  - The key goes only to your local backend, which forwards it to Google.
- **Or in `.env`:** set `GEMINI_API_KEY=...`. A key entered in the UI overrides it.

## ⚠️ Image generation needs billing

The Gemini image models (`gemini-3.1-flash-image`, `gemini-2.5-flash-image`, `gemini-3-pro-image`, …) have a free-tier quota of **0**. If you see "No quota for this model", enable billing for the key's project in [Google AI Studio](https://aistudio.google.com) and try again. Audio recognition works on the free tier.

## Settings (UI or `.env`)

| Setting | Default | Notes |
|---|---|---|
| Recognition model | `gemini-3.5-flash` | Any audio-capable Gemini model; `gemini-3.1-pro-preview` is more accurate but slower |
| Image model | `gemini-3.1-flash-image` | `gemini-3-pro-image` for highest quality |
| Aspect ratio | `1:1` | 1:1, 4:3, 3:4, 16:9, 9:16 |
| Resolution | `1K` | 1K or 2K |
| `MIN_CONFIDENCE` | `0.60` | Below this, you're asked to re-record, with a "Generate anyway" option |

## Error handling

| Code | Meaning |
|---|---|
| `NO_API_KEY` / `INVALID_API_KEY` | The key panel opens automatically |
| `QUOTA_ZERO` | The model has no free-tier quota; enable billing |
| `RATE_LIMITED` | Wait a minute |
| `MODEL_NOT_FOUND` | Pick another model in the panel |
| `NO_IMAGE` | Gemini returned no image (e.g. a safety block); try Regenerate |
| `no_bird` / `low_confidence` | Shown in the results card, with a prompt to re-record |
