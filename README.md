# Birdsong Canvas 🎨🐦
### *Bioacoustic Bird Identification & Photorealistic Wildlife Art Generation*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-2.5_Flash-4285F4?style=flat&logo=google&logoColor=white)](https://aistudio.google.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)

---

## 🌿 What is Birdsong Canvas?

**Birdsong Canvas** transforms transient avian melodies into breathtaking, photorealistic wildlife portraits. It is a full-stack bioacoustic application that bridges sound recognition and visual generative AI:

1. **Listen & Capture**: Records high-fidelity audio directly from your microphone or accepts audio file uploads (`.wav`, `.mp3`, `.m4a`, `.ogg`).
2. **Bioacoustic Analysis**: Uses multimodal Google Gemini models (`gemini-2.5-flash`, `gemini-flash-latest`, `gemini-2.5-pro`) with automated retry and fallback mechanisms to identify the bird species, compute detection confidence, and extract natural habitat characteristics.
3. **Prompt Engineering**: Automatically synthesizes ornithological visual descriptions and generates detailed, naturalistic image generation prompts.
4. **Photorealistic Canvas**: Renders high-resolution wildlife portraits using Fal.ai (`fal-ai/fast-sdxl`) or Google Gemini Imagen, contextualizing the bird in its authentic wild ecosystem.
5. **Persistent Archive & Gallery**:
   - **Recordings Archive**: Every recorded or uploaded audio track is automatically archived with ISO date-time filenames (`recording_YYYY-MM-DD_HH-MM-SS.wav`).
   - **Art & Sound Library**: Every generated portrait is saved in a catalog linking the artwork directly with the original bird song audio.

---

## 🛠️ Tech Stack

### **Backend**
- **[FastAPI](https://fastapi.tiangolo.com/)**: High-performance asynchronous Python web framework for RESTful endpoints.
- **[Uvicorn](https://www.uvicorn.org/)**: Lightning-fast ASGI web server.
- **[Google GenAI SDK (`google-genai`)](https://github.com/google-gemini/generative-ai-python)**: Official SDK for interacting with Gemini multimodal & audio reasoning models.
- **[Pydantic](https://docs.pydantic.dev/)**: Robust data validation and JSON schema structuring for bioacoustic identification.
- **[Python-Multipart](https://andrew-d.github.io/python-multipart/)**: Streaming file upload handling for audio inputs.
- **[Httpx](https://www.python-httpx.org/)**: Asynchronous HTTP client for communicating with image generation services (Fal.ai / external endpoints).

### **Frontend**
- **Single Page Application (SPA)**: Ultra-responsive, reactive interface without heavy JavaScript framework bloat.
- **[Tailwind CSS](https://tailwindcss.com/)**: Modern dark emerald luxury theme with smooth glassmorphism, responsive grid layouts, and custom animations.
- **[Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)**: In-browser audio recording, MediaRecorder handling, audio scrubbing, and real-time waveform visualization.
- **Canvas API**: Custom audio frequency and waveform renderers.

### **AI Models & Services**
- **Bioacoustic Audio Recognition**:
  - `gemini-2.5-flash` (Primary default — ultra-fast & resilient)
  - `gemini-flash-latest` & `gemini-2.5-pro` (Automatic fallback tier)
- **Image Generation**:
  - **Fal.ai Fast SDXL (`fal-ai/fast-sdxl`)**: Sub-second high-fidelity photorealistic rendering.
  - **Google Imagen (`imagen-3.0-generate-002`) / Gemini Flash Image**: Native Google ecosystem image generation.

---

## 🚀 How to Use It

### 1. Prerequisites
- **Python 3.10+** (Python 3.12 recommended)
- A **Google AI Studio API Key** (Get one free at [aistudio.google.com](https://aistudio.google.com/))
- *(Optional)* A **Fal.ai API Key** (Get one at [fal.ai](https://fal.ai/) for fast SDXL generation)

---

### 2. Installation & Setup

Clone the repository and navigate into the project directory:

```bash
git clone https://github.com/calluxpore/Birdsong-Canvas.git
cd Birdsong-Canvas
```

Create and activate a virtual environment:

```bash
# Windows
py -3.12 -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

Install the dependencies:

```bash
pip install -r requirements.txt
```

---

### 3. Configuration

You can configure API keys via a `.env` file or directly inside the web UI:

1. **Option A: `.env` file (Recommended for development)**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Add your keys:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   FAL_KEY=your_fal_api_key_here          # Optional, for fast Fal.ai image generation
   ```

2. **Option B: Web UI Settings Panel**:
   - Open the application and click **Settings ⚙️** in the sidebar.
   - Paste your **Google Gemini API Key** and optional **Fal.ai API Key**.
   - Click **Save & Test Keys**. Keys can be saved to your browser's local storage.

---

### 4. Running the Application

Start the local server with Uvicorn:

```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Open your browser and navigate to:
```
http://127.0.0.1:8000
```
> **Note**: Modern browsers require `localhost` / `127.0.0.1` or HTTPS to allow microphone permissions.

---

## 📖 Walkthrough of Features

### 🎙️ 1. Studio (Audio Input & Analysis)
- **Record**: Select a recording duration (5s, 10s, or 15s) and click **Record / Listen**. Sing, whistle, or hold the mic near a bird call.
- **Upload**: Alternatively, click **Upload audio** to choose an existing `.wav`, `.mp3`, `.ogg`, or `.m4a` file.
- **Audio Scrubber**: Play back your audio clip with the integrated audio player.
- **Identify Species**: Click **Identify Bird Species**. The Gemini bioacoustic engine processes the recording, displaying real-time pipeline status (*Listening → Analyzing Audio → Generating Visual → Complete*).
- **View Species Insights**: Discover the bird's common name, scientific taxonomy, confidence rating, natural habitat, and visual characteristics.
- **Generate Wildlife Art**: Click **Generate Art** (or **Regenerate Art**) to create a photorealistic painting of the identified species. Download or inspect the artwork in full resolution.

### 📁 2. Recordings Archive
- Access the **Recordings** tab in the sidebar.
- Every audio sample recorded or uploaded is saved permanently with a timestamped filename (e.g., `recording_2026-09-16_17-30-00.wav`).
- Listen to previous clips directly or click **Analyze in Studio** to re-run identification on any saved recording.

### 🖼️ 3. Art & Sound Library
- Navigate to the **Library** tab in the sidebar.
- Browse all generated wildlife portraits.
- Each piece in your library includes the bird's common name, scientific name, creation timestamp, and an **inline audio player** linking directly to the original bird call that inspired the art.

---

## 📂 Project Structure

```
Birdsong-Canvas/
├── main.py                 # FastAPI backend, routing, Gemini & Fal.ai integration
├── requirements.txt        # Python dependencies
├── .env.example            # Environment variables template
├── recordings/             # Stored audio recordings & uploads (timestamped)
├── library/                # Saved wildlife artwork & catalog.json
│   └── catalog.json        # Metadata registry linking artwork to audio recordings
└── frontend/               # Single Page Application
    ├── index.html          # Semantic HTML5 layout with Tailwind CSS
    └── app.js              # Web Audio API, state management, and API client
```

---

## 🛡️ Error Handling & Resilience

- **Gemini 503 High Demand Recovery**: Automatically retries with exponential backoff and cascades through fallback models (`gemini-2.5-flash` → `gemini-flash-latest` → `gemini-2.5-pro`) to ensure reliable recognition even during peak hours.
- **Low Confidence Warning**: Audio samples yielding lower than 60% confidence prompt you to re-record or allow you to force generation.
- **Quota Safeguards**: Clear UI diagnostics if an API key lacks quota or billing permissions.

---

## 📄 License

This project is licensed under the MIT License — feel free to explore, modify, and build upon it!
