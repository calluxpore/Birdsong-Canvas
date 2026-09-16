/* Birdsong Canvas — frontend controller
 * Mic capture + visualizer → WAV → /api/identify (Gemini audio) → /api/generate (Gemini image)
 */
(() => {
  "use strict";

  const API = window.API_BASE || "";
  const MAX_UPLOAD_MB = 15;
  const $ = (id) => document.getElementById(id);

  const els = {
    canvas: $("visualizer"),
    recBadge: $("rec-badge"),
    recTimer: $("rec-timer"),
    recProgress: $("rec-progress"),
    btnRecord: $("btn-record"),
    btnRecordIcon: $("btn-record-icon"),
    btnRecordLabel: $("btn-record-label"),
    duration: $("duration"),
    fileInput: $("file-input"),
    playback: $("playback"),
    statusText: $("status-text"),
    results: $("results"),
    lowConf: $("low-conf"),
    resCommon: $("res-common"),
    resScientific: $("res-scientific"),
    resConfLabel: $("res-conf-label"),
    resConfBar: $("res-conf-bar"),
    resConfThreshold: $("res-conf-threshold"),
    resHabitat: $("res-habitat"),
    resVisual: $("res-visual"),
    btnForce: $("btn-force-generate"),
    imageEmpty: $("image-empty"),
    imageLoading: $("image-loading"),
    genTimer: $("gen-timer"),
    image: $("bird-image"),
    btnRegenerate: $("btn-regenerate"),
    btnDownload: $("btn-download"),
    metaPrompt: $("meta-prompt"),
    metaNegative: $("meta-negative"),
    metaParams: $("meta-params"),
    keyToggle: $("btn-key-toggle"),
    keyDot: $("key-dot"),
    keyPillLabel: $("key-pill-label"),
    keyPanel: $("key-panel"),
    keyInput: $("api-key"),
    keyReveal: $("btn-key-reveal"),
    keySave: $("btn-key-save"),
    keyClear: $("btn-key-clear"),
    keyRemember: $("key-remember"),
    keyStatus: $("key-status"),
    audioModel: $("audio-model"),
    imageModel: $("image-model"),
    aspectRatio: $("aspect-ratio"),
    imageSize: $("image-size"),
    alert: $("alert"),
    alertIcon: $("alert-icon"),
    alertTitle: $("alert-title"),
    alertMessage: $("alert-message"),
  };

  const state = {
    busy: false,
    recording: null,        // active recording session
    identification: null,   // last Gemini result
    lastImage: null,        // { image_url, parameters }
    staticWave: null,       // Float32Array for idle waveform display
  };

  // ------------------------------------------------------------------ UI helpers
  const STEPS = ["listening", "analyzing", "generating", "complete"];

  function setStep(active, { error = false } = {}) {
    const idx = STEPS.indexOf(active);
    document.querySelectorAll("#pipeline .step").forEach((li) => {
      const i = STEPS.indexOf(li.dataset.step);
      let s = "idle";
      if (idx === -1) s = "idle";
      else if (i < idx) s = "done";
      else if (i === idx) s = error ? "error" : active === "complete" ? "done" : "active";
      li.dataset.state = s;
    });
  }

  function setStatus(text) { els.statusText.textContent = text; }

  function setBusy(busy) {
    state.busy = busy;
    els.btnRecord.disabled = busy && !state.recording;
    els.fileInput.disabled = busy;
    els.duration.disabled = busy;
    els.btnForce.disabled = busy;
    els.btnRegenerate.disabled = busy || !state.identification?.image_prompt;
    els.btnDownload.disabled = busy || !state.lastImage;
  }

  let alertTimer;
  function showAlert(title, message, kind = "error") {
    const styles = {
      error: ["⛔", "bg-red-950/90 border-red-500/30 text-red-100"],
      warn: ["⚠️", "bg-amber-950/90 border-amber-500/30 text-amber-100"],
      info: ["ℹ️", "bg-stone-900/90 border-white/10 text-stone-100"],
    }[kind];
    els.alert.className = `fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,640px)] rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${styles[1]}`;
    els.alertIcon.textContent = styles[0];
    els.alertTitle.textContent = title;
    els.alertMessage.textContent = message;
    clearTimeout(alertTimer);
    if (kind !== "error") alertTimer = setTimeout(hideAlert, 7000);
  }
  function hideAlert() { els.alert.classList.add("hidden"); }
  $("alert-close").addEventListener("click", hideAlert);

  const ERROR_TITLES = {
    NO_API_KEY: "Gemini API key missing",
    INVALID_API_KEY: "Invalid API key",
    QUOTA_ZERO: "No quota for this model",
    RATE_LIMITED: "Rate limited",
    MODEL_NOT_FOUND: "Model not available",
    NO_IMAGE: "No image returned",
    GEMINI_ERROR: "Gemini request failed",
    UNSUPPORTED_AUDIO: "Unsupported audio format",
    AUDIO_TOO_LARGE: "Audio file too large",
  };

  class ApiError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  async function api(path, options = {}) {
    let res;
    const headers = new Headers(options.headers || {});
    const key = keyStore.get();
    if (key) {
      try {
        headers.set("X-Gemini-Api-Key", key);
      } catch (e) {
        console.warn("Could not set X-Gemini-Api-Key header:", e);
      }
    }
    try {
      res = await fetch(API + path, { ...options, headers });
    } catch (err) {
      if (err instanceof DOMException || err.name === "TypeError") {
        throw new ApiError("REQUEST_FAILED", err.message || "Failed to make request.");
      }
      throw new ApiError("BACKEND_UNREACHABLE", "Could not reach the backend server. Start it with: .venv\\Scripts\\python -m uvicorn main:app --port 8000 — then open http://127.0.0.1:8000");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = body?.error;
      const detail = err?.message || (Array.isArray(body?.detail) ? body.detail.map((d) => d.msg).join("; ") : body?.detail);
      throw new ApiError(err?.code || `HTTP_${res.status}`, detail || `Request failed with HTTP ${res.status}`);
    }
    return body;
  }

  function reportError(err, step) {
    console.error(err);
    setStep(step, { error: true });
    setStatus(err.message);
    showAlert(ERROR_TITLES[err.code] || (err.code === "BACKEND_UNREACHABLE" ? "Backend offline" : "Something went wrong"), err.message);
    if (err.code === "NO_API_KEY" || err.code === "INVALID_API_KEY") {
      setKeyIndicator(false, err.code === "NO_API_KEY" ? "No API key" : "Invalid key");
      openKeyPanel(true);
    }
  }

  // ------------------------------------------------------------------ Visualizer
  const ctx2d = els.canvas.getContext("2d");

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = els.canvas.getBoundingClientRect();
    els.canvas.width = Math.round(width * dpr);
    els.canvas.height = Math.round(height * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!state.recording) drawIdle();
  }

  function drawIdle() {
    const w = els.canvas.clientWidth, h = els.canvas.clientHeight;
    ctx2d.clearRect(0, 0, w, h);
    const wave = state.staticWave;
    ctx2d.strokeStyle = wave ? "rgba(127,176,105,.8)" : "rgba(255,255,255,.12)";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    if (!wave) {
      ctx2d.moveTo(0, h / 2); ctx2d.lineTo(w, h / 2);
    } else {
      // min/max envelope per pixel column
      const per = Math.max(1, Math.floor(wave.length / w));
      for (let x = 0; x < w; x++) {
        let min = 1, max = -1;
        const start = x * per;
        for (let i = start; i < start + per && i < wave.length; i++) {
          if (wave[i] < min) min = wave[i];
          if (wave[i] > max) max = wave[i];
        }
        ctx2d.moveTo(x + 0.5, h / 2 - max * h * 0.45);
        ctx2d.lineTo(x + 0.5, h / 2 - min * h * 0.45);
      }
    }
    ctx2d.stroke();
  }

  function drawLive(analyser, freqData, timeData) {
    const w = els.canvas.clientWidth, h = els.canvas.clientHeight;
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);
    ctx2d.clearRect(0, 0, w, h);

    // Frequency bars (log-ish distribution; birdsong mostly 1–8 kHz)
    const bars = Math.min(96, Math.floor(w / 6));
    const barW = w / bars;
    const maxBin = freqData.length;
    for (let b = 0; b < bars; b++) {
      const lo = Math.floor(Math.pow(b / bars, 1.6) * maxBin);
      const hi = Math.max(lo + 1, Math.floor(Math.pow((b + 1) / bars, 1.6) * maxBin));
      let sum = 0;
      for (let i = lo; i < hi; i++) sum += freqData[i];
      const v = sum / (hi - lo) / 255;
      const bh = Math.max(2, v * h * 0.9);
      ctx2d.fillStyle = `rgba(${Math.round(95 + 60 * v)},${Math.round(148 + 60 * v)},${Math.round(72 + 30 * v)},${0.35 + 0.65 * v})`;
      ctx2d.fillRect(b * barW + 1, h - bh, barW - 2, bh);
    }

    // Waveform overlay
    ctx2d.strokeStyle = "rgba(231,239,228,.55)";
    ctx2d.lineWidth = 1.25;
    ctx2d.beginPath();
    for (let i = 0; i < timeData.length; i++) {
      const x = (i / (timeData.length - 1)) * w;
      const y = (timeData[i] / 255) * h;
      i ? ctx2d.lineTo(x, y) : ctx2d.moveTo(x, y);
    }
    ctx2d.stroke();
  }

  // ------------------------------------------------------------------ Recording
  // AudioWorklet that forwards raw PCM (mono) to the main thread.
  const RECORDER_WORKLET = `
    class PcmTap extends AudioWorkletProcessor {
      process(inputs) {
        const ch = inputs[0];
        if (ch && ch.length) {
          const mono = new Float32Array(ch[0].length);
          for (let c = 0; c < ch.length; c++) {
            const d = ch[c];
            for (let i = 0; i < d.length; i++) mono[i] += d[i] / ch.length;
          }
          this.port.postMessage(mono, [mono.buffer]);
        }
        return true;
      }
    }
    registerProcessor("pcm-tap", PcmTap);
  `;

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showAlert("Microphone unavailable", "This browser does not support microphone capture. Use a modern browser on http://localhost or HTTPS.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Disable voice processing: it suppresses high-pitched birdsong.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (err) {
      showAlert("Microphone access denied", err.name === "NotAllowedError"
        ? "Allow microphone access in your browser's site settings, then try again."
        : `Could not open the microphone: ${err.message}`);
      return;
    }

    const audioCtx = new AudioContext();
    const workletUrl = URL.createObjectURL(new Blob([RECORDER_WORKLET], { type: "application/javascript" }));
    await audioCtx.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    const tap = new AudioWorkletNode(audioCtx, "pcm-tap");
    const mute = audioCtx.createGain();
    mute.gain.value = 0;
    source.connect(analyser);
    source.connect(tap).connect(mute).connect(audioCtx.destination);

    const chunks = [];
    tap.port.onmessage = (e) => chunks.push(e.data);

    const seconds = Number(els.duration.value);
    const rec = { stream, audioCtx, chunks, seconds, startedAt: performance.now(), raf: 0, timeout: 0 };
    state.recording = rec;
    state.staticWave = null;

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Uint8Array(analyser.fftSize);
    const loop = () => {
      drawLive(analyser, freqData, timeData);
      const elapsed = (performance.now() - rec.startedAt) / 1000;
      els.recTimer.textContent = Math.min(elapsed, seconds).toFixed(1);
      els.recProgress.style.width = `${Math.min(100, (elapsed / seconds) * 100)}%`;
      rec.raf = requestAnimationFrame(loop);
    };
    loop();
    rec.timeout = setTimeout(() => stopRecording(), seconds * 1000);

    resetResults();
    setBusy(true);
    els.btnRecord.disabled = false;
    els.btnRecordIcon.textContent = "⏹️";
    els.btnRecordLabel.textContent = "Stop & Analyze";
    els.recBadge.classList.remove("hidden");
    els.playback.classList.add("hidden");
    setStep("listening");
    setStatus(`Listening for ${seconds} seconds… keep the microphone pointed at the bird.`);
  }

  async function stopRecording() {
    const rec = state.recording;
    if (!rec) return;
    state.recording = null;
    clearTimeout(rec.timeout);
    cancelAnimationFrame(rec.raf);
    rec.stream.getTracks().forEach((t) => t.stop());
    const sampleRate = rec.audioCtx.sampleRate;
    await rec.audioCtx.close();

    els.recBadge.classList.add("hidden");
    els.recProgress.style.width = "0";
    els.btnRecordIcon.textContent = "🎙️";
    els.btnRecordLabel.textContent = "Record / Listen";

    const pcm = concatFloat32(rec.chunks);
    const durationSec = pcm.length / sampleRate;
    if (durationSec < 1.5) {
      setBusy(false);
      setStep("listening", { error: true });
      setStatus("Recording was too short. Record at least 5 seconds.");
      drawIdle();
      return;
    }
    normalize(pcm);
    state.staticWave = pcm;
    drawIdle();

    const wav = encodeWav(pcm, sampleRate);
    setPlayback(wav);
    await analyze(wav, "recording.wav");
  }

  function concatFloat32(chunks) {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  // Peak-normalize to -1 dBFS so quiet distant birds are audible to the model.
  function normalize(pcm) {
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    if (peak < 1e-4) return;
    const gain = Math.min(0.89 / peak, 20);
    for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  }

  // 16-bit PCM mono WAV
  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, samples.length * 2, true);
    let o = 44;
    for (let i = 0; i < samples.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  function setPlayback(blob) {
    if (els.playback.src) URL.revokeObjectURL(els.playback.src);
    els.playback.src = URL.createObjectURL(blob);
    els.playback.classList.remove("hidden");
  }

  // ------------------------------------------------------------------ Upload
  async function handleUpload(file) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      showAlert("Audio file too large", `Please upload a clip under ${MAX_UPLOAD_MB} MB (5–30 seconds is ideal).`);
      return;
    }
    resetResults();
    setPlayback(file);
    setStep("listening");
    setStatus(`Loaded ${file.name}`);
    try {
      const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
      const buf = await ac.decodeAudioData(await file.arrayBuffer());
      state.staticWave = buf.getChannelData(0);
    } catch {
      state.staticWave = null; // preview only; the backend still receives the original file
    }
    drawIdle();
    await analyze(file, file.name);
  }

  // ------------------------------------------------------------------ Pipeline
  function resetResults() {
    state.identification = null;
    els.results.classList.add("hidden");
    els.lowConf.classList.add("hidden");
    els.btnForce.classList.add("hidden");
    setBusy(state.busy);
  }

  async function analyze(blob, filename) {
    setBusy(true);
    setStep("analyzing");
    setStatus("Analyzing audio with Gemini…");
    try {
      const form = new FormData();
      form.append("audio", blob, filename);
      if (els.audioModel.value) form.append("model", els.audioModel.value);
      const data = await api("/api/identify", { method: "POST", body: form });
      state.audioModelUsed = data.model;
      renderIdentification(data);

      if (data.status === "ok") {
        await generate();
      } else {
        setStep("analyzing", { error: true });
        setStatus(data.message);
        showAlert(data.status === "no_bird" ? "No bird detected" : "Low confidence — please re-record", data.message, "warn");
      }
    } catch (err) {
      reportError(err, "analyzing");
    } finally {
      setBusy(false);
    }
  }

  function renderIdentification({ status, message, result, min_confidence }) {
    state.identification = result;
    const pct = Math.round((result.confidence || 0) * 100);
    const identified = result.identified && result.common_name;

    els.results.classList.remove("hidden");
    els.resCommon.textContent = identified ? result.common_name : "No bird detected";
    els.resScientific.textContent = identified ? result.scientific_name : "—";
    els.resConfLabel.textContent = `${pct}%`;
    els.resConfBar.style.width = `${pct}%`;
    els.resConfBar.className = `h-full rounded-full transition-all duration-700 ${
      pct >= min_confidence * 100 ? "bg-moss-400" : pct >= 35 ? "bg-amber-400" : "bg-red-400"}`;
    els.resConfThreshold.style.left = `${min_confidence * 100}%`;
    els.resHabitat.textContent = result.habitat_description || "—";
    els.resVisual.textContent = result.visual_description || "—";

    const warn = status !== "ok";
    els.lowConf.classList.toggle("hidden", !warn);
    els.lowConf.textContent = warn ? `🎙️ ${message}` : "";
    els.btnForce.classList.toggle("hidden", !(status === "low_confidence" && result.image_prompt));
  }

  let genClock;
  async function generate() {
    const id = state.identification;
    if (!id?.image_prompt) return;

    setBusy(true);
    setStep("generating");
    setStatus(`Gemini is generating a photorealistic ${id.common_name || "bird"}…`);
    els.imageEmpty.classList.add("hidden");
    els.imageLoading.classList.remove("hidden");
    const t0 = performance.now();
    els.genTimer.textContent = "0";
    genClock = setInterval(() => { els.genTimer.textContent = Math.round((performance.now() - t0) / 1000); }, 500);

    try {
      const data = await api("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_prompt: id.image_prompt,
          negative_prompt: id.negative_prompt || "",
          model: els.imageModel.value || null,
          aspect_ratio: els.aspectRatio.value,
          image_size: els.imageSize.value,
        }),
      });
      await loadImage(API + data.image_url);
      state.lastImage = data;
      renderMetadata(data.parameters);
      setStep("complete");
      setStatus(`Complete — ${id.common_name} rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
    } catch (err) {
      reportError(err, "generating");
      if (!state.lastImage) els.imageEmpty.classList.remove("hidden");
    } finally {
      clearInterval(genClock);
      els.imageLoading.classList.add("hidden");
      setBusy(false);
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = els.image;
      img.onload = () => { img.classList.remove("hidden"); resolve(); };
      img.onerror = () => reject(new ApiError("IMAGE_LOAD", "The generated image could not be loaded."));
      img.src = src;
    });
  }

  function renderMetadata(p) {
    els.metaPrompt.textContent = p.prompt;
    els.metaNegative.textContent = p.negative_prompt || "(none)";
    const rows = [
      ["Image model", p.model], ["Aspect ratio", p.aspect_ratio], ["Resolution", p.image_size],
      ["Generation time", `${p.generation_seconds} s`], ["Recognition model", state.audioModelUsed || "—"],
    ];
    if (p.model_notes) rows.push(["Model notes", p.model_notes]);
    els.metaParams.replaceChildren(...rows.map(([k, v]) => {
      const wrap = document.createElement("div");
      wrap.className = k === "Model notes" ? "col-span-2 sm:col-span-3" : "";
      const dt = document.createElement("dt"); dt.className = "text-stone-500"; dt.textContent = k;
      const dd = document.createElement("dd"); dd.className = "font-mono text-stone-300 break-all"; dd.textContent = String(v);
      wrap.append(dt, dd);
      return wrap;
    }));
  }

  async function downloadImage() {
    if (!state.lastImage) return;
    try {
      const res = await fetch(API + state.lastImage.image_url);
      if (!res.ok) throw new Error("Image expired from the server cache — click Regenerate.");
      const blob = await res.blob();
      const name = (state.identification?.common_name || "bird").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      showAlert("Download failed", err.message);
    }
  }

  // ------------------------------------------------------------------ API key & settings
  const KEY_NAME = "birdsong.geminiKey";
  const PREFS_NAME = "birdsong.prefs";
  const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  const sanitizeKey = (k) => (k || "").replace(/[^\x20-\x7E]/g, "").trim().replace(/^["'`]|["'`]$/g, "").trim();

  // "Remember" keeps the key in localStorage; otherwise it lives only for this tab (sessionStorage).
  const keyStore = {
    get: () => sanitizeKey(safe(() => localStorage.getItem(KEY_NAME) || sessionStorage.getItem(KEY_NAME)) || ""),
    set(key, remember) {
      const clean = sanitizeKey(key);
      safe(() => { localStorage.removeItem(KEY_NAME); sessionStorage.removeItem(KEY_NAME); });
      if (clean) safe(() => (remember ? localStorage : sessionStorage).setItem(KEY_NAME, clean));
    },
    remembered: () => !!safe(() => localStorage.getItem(KEY_NAME)),
  };

  const prefs = {
    load: () => safe(() => JSON.parse(localStorage.getItem(PREFS_NAME)) || {}, {}),
    save: () => safe(() => localStorage.setItem(PREFS_NAME, JSON.stringify({
      audioModel: els.audioModel.value, imageModel: els.imageModel.value,
      aspectRatio: els.aspectRatio.value, imageSize: els.imageSize.value,
    }))),
  };

  const maskKey = (k) => (k.length > 10 ? `${k.slice(0, 4)}…${k.slice(-4)}` : "set");

  function setKeyIndicator(ok, label) {
    els.keyDot.className = `w-2 h-2 rounded-full ${ok === true ? "bg-moss-400" : ok === false ? "bg-red-400" : "bg-amber-400"}`;
    els.keyPillLabel.textContent = label;
  }

  function setKeyStatus(text, kind = "muted") {
    els.keyStatus.className = { ok: "text-moss-400", error: "text-red-300", muted: "text-stone-500" }[kind];
    els.keyStatus.textContent = text;
  }

  function openKeyPanel(open) {
    els.keyPanel.classList.toggle("hidden", !open);
    els.keyToggle.setAttribute("aria-expanded", String(open));
    if (open && !els.keyInput.value) els.keyInput.focus();
  }

  function fillSelect(select, models, preferred) {
    const current = preferred && models.includes(preferred) ? preferred : models[0];
    select.replaceChildren(...models.map((m) => new Option(m, m, m === current, m === current)));
  }

  async function checkKey({ quiet = false } = {}) {
    els.keySave.disabled = true;
    els.keySave.textContent = "Testing…";
    setKeyStatus("Testing key with Google Gemini…");
    try {
      const data = await api("/api/key/check", { method: "POST" });
      const p = prefs.load();
      fillSelect(els.audioModel, data.audio_models, p.audioModel || data.default_audio_model);
      fillSelect(els.imageModel, data.image_models, p.imageModel || data.default_image_model);
      const k = keyStore.get();
      setKeyIndicator(true, k ? `Key ${maskKey(k)}` : "Server key");
      setKeyStatus(`✓ Key verified! ${data.audio_models.length} audio and ${data.image_models.length} image models available.`, "ok");
      els.keySave.textContent = "✓ Verified";
      if (!quiet) showAlert("API key saved", "Gemini key verified and saved! You can record or upload audio now.", "info");
      return true;
    } catch (err) {
      setKeyIndicator(false, err.code === "NO_API_KEY" ? "No API key" : "Key problem");
      setKeyStatus(err.message, "error");
      els.keySave.textContent = "Save & test";
      openKeyPanel(true);
      return false;
    } finally {
      els.keySave.disabled = false;
    }
  }

  async function initSettings() {
    const p = prefs.load();
    if (p.aspectRatio) els.aspectRatio.value = p.aspectRatio;
    if (p.imageSize) els.imageSize.value = p.imageSize;

    let config;
    try {
      config = await api("/api/config");
    } catch (err) {
      showAlert("Backend offline", err.message);
      return;
    }
    fillSelect(els.audioModel, [p.audioModel || config.audio_model]);
    fillSelect(els.imageModel, [p.imageModel || config.image_model]);

    const key = keyStore.get();
    els.keyInput.value = key;
    els.keyRemember.checked = keyStore.remembered();
    if (key || config.server_key_configured) {
      setKeyIndicator(null, "Checking key…");
      await checkKey({ quiet: true });
    } else {
      setKeyIndicator(false, "No API key");
      setKeyStatus("Paste your Google AI Studio key and click Save & test.");
      openKeyPanel(true);
    }
  }

  els.keyToggle.addEventListener("click", () => openKeyPanel(els.keyPanel.classList.contains("hidden")));
  els.keyReveal.addEventListener("click", () => {
    const hidden = els.keyInput.type === "password";
    els.keyInput.type = hidden ? "text" : "password";
    els.keyReveal.textContent = hidden ? "Hide" : "Show";
  });
  els.keySave.addEventListener("click", async () => {
    const key = els.keyInput.value.trim();
    if (!key) {
      setKeyStatus("Please paste your Gemini API key first.", "error");
      els.keyInput.focus();
      return;
    }
    keyStore.set(key, els.keyRemember.checked);
    const ok = await checkKey();
    if (ok) {
      setTimeout(() => {
        openKeyPanel(false);
        els.keySave.textContent = "Save & test";
      }, 900);
    }
  });
  els.keyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") els.keySave.click(); });
  els.keyRemember.addEventListener("change", () => {
    const key = keyStore.get();
    if (key) keyStore.set(key, els.keyRemember.checked);
  });
  els.keyClear.addEventListener("click", () => {
    keyStore.set("", false);
    els.keyInput.value = "";
    setKeyIndicator(false, "No API key");
    setKeyStatus("Key removed from this browser. The server's .env key (if any) will still be used.");
  });
  [els.audioModel, els.imageModel, els.aspectRatio, els.imageSize].forEach((s) => s.addEventListener("change", prefs.save));

  // ------------------------------------------------------------------ Wire up
  els.btnRecord.addEventListener("click", () => {
    hideAlert();
    state.recording ? stopRecording() : startRecording().catch((err) => {
      console.error(err);
      state.recording = null;
      setBusy(false);
      showAlert("Recording failed", err.message);
    });
  });
  els.fileInput.addEventListener("change", (e) => {
    hideAlert();
    handleUpload(e.target.files[0]);
    e.target.value = "";
  });
  els.btnRegenerate.addEventListener("click", () => { hideAlert(); generate(); });
  els.btnForce.addEventListener("click", () => { hideAlert(); els.lowConf.classList.add("hidden"); generate(); });
  els.btnDownload.addEventListener("click", downloadImage);
  document.querySelectorAll("[data-copy]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const text = $(btn.dataset.copy)?.textContent || "";
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 1200);
      } catch {
        showAlert("Copy failed", "Could not copy text to clipboard.", "info");
      }
    }));

  window.addEventListener("resize", sizeCanvas);
  sizeCanvas();

  // Opened as a local file (file://)? The API and microphone only work when
  // the page is served by the backend, so jump there if it's running.
  if (location.protocol === "file:") {
    const SERVER = "http://127.0.0.1:8000/";
    fetch(SERVER + "api/config", { mode: "no-cors" })
      .then(() => location.replace(SERVER))
      .catch(() => showAlert(
        "Backend not running",
        `This page was opened as a file. Start the server with ".venv\\Scripts\\python -m uvicorn main:app --port 8000" in the project folder, then open ${SERVER}`,
      ));
  } else {
    initSettings();
  }
})();
