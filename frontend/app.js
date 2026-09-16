/* Birdsong Canvas — Frontend Application Controller
 * Bioacoustic Audio Capture & Identification + Photorealistic Wildlife Art Generation
 */
(() => {
  "use strict";

  const API = window.API_BASE || "";
  const MAX_UPLOAD_MB = 15;
  const $ = (id) => document.getElementById(id);

  const els = {
    // Views
    viewHome: $("view-home"),
    viewRecordings: $("view-recordings"),
    viewLibrary: $("view-library"),
    navHome: $("nav-home"),
    navRecordings: $("nav-recordings"),
    navLibrary: $("nav-library"),
    navSettings: $("nav-settings"),

    // Studio Canvas & Audio Player
    canvas: $("visualizer"),
    playhead: $("visualizer-playhead"),
    recBadge: $("rec-badge"),
    recTimer: $("rec-timer"),
    recProgress: $("rec-progress"),
    btnRecord: $("btn-record"),
    btnRecordIcon: $("btn-record-icon"),
    btnRecordLabel: $("btn-record-label"),
    duration: $("duration"),
    durationDisplay: $("duration-display"),
    badgeDuration: $("badge-duration"),
    fileInput: $("file-input"),
    playback: $("playback"),
    btnPlayerPlay: $("btn-player-play"),
    iconPlayerPlay: $("icon-player-play"),
    iconPlayerPause: $("icon-player-pause"),
    playerTime: $("player-time"),
    playerSeek: $("player-seek"),
    btnPlayerVolume: $("btn-player-volume"),
    statusText: $("status-text"),

    // Results Card
    results: $("results"),
    speciesThumb: $("species-thumb"),
    speciesThumbPlaceholder: $("species-thumb-placeholder"),
    resCommon: $("res-common"),
    resScientific: $("res-scientific"),
    resConfLabel: $("res-conf-label"),
    resConfBar: $("res-conf-bar"),
    resHabitat: $("res-habitat"),
    resVisual: $("res-visual"),
    lowConf: $("low-conf"),
    btnForce: $("btn-force-generate"),

    // Visual Art Card
    imageFrame: $("image-frame"),
    imageEmpty: $("image-empty"),
    imageLoading: $("image-loading"),
    genTimer: $("gen-timer"),
    birdImage: $("bird-image"),
    btnRegenerate: $("btn-regenerate"),
    btnDownload: $("btn-download"),
    btnTabImage: $("btn-tab-image"),
    btnTabArt: $("btn-tab-art"),

    // Generation Metadata Card
    metadataCard: $("metadata-card"),
    metaPrompt: $("meta-prompt"),
    metaNegative: $("meta-negative"),
    metaImageModel: $("meta-image-model"),
    metaAspectRatio: $("meta-aspect-ratio"),
    metaResolution: $("meta-resolution"),
    metaGenTime: $("meta-gen-time"),
    metaRecModel: $("meta-rec-model"),
    btnCopyAll: $("btn-copy-all"),
    btnCopyAllLabel: $("btn-copy-all-label"),
    btnCopyNeg: $("btn-copy-neg"),

    // Recordings View
    recordingsContainer: $("recordings-container"),
    recordingsEmpty: $("recordings-empty"),
    btnRefreshRecordings: $("btn-refresh-recordings"),

    // Library View
    libraryContainer: $("library-container"),
    libraryEmpty: $("library-empty"),
    btnRefreshLibrary: $("btn-refresh-library"),

    // Settings Modal
    btnSettingsToggle: $("btn-settings-toggle"),
    settingsModal: $("settings-modal"),
    btnSettingsClose: $("btn-settings-close"),
    keyDot: $("key-dot"),
    keyPillLabel: $("key-pill-label"),
    keyInput: $("api-key"),
    keyReveal: $("btn-key-reveal"),
    falKeyInput: $("fal-key"),
    falKeyReveal: $("btn-fal-reveal"),
    keySave: $("btn-key-save"),
    keyClear: $("btn-key-clear"),
    keyRemember: $("key-remember"),
    keyStatus: $("key-status"),
    audioModel: $("audio-model"),
    imageModel: $("image-model"),
    aspectRatio: $("aspect-ratio"),
    imageSize: $("image-size"),

    // Alert
    alert: $("alert"),
    alertIcon: $("alert-icon"),
    alertTitle: $("alert-title"),
    alertMessage: $("alert-message"),
    alertClose: $("alert-close"),
  };

  const state = {
    currentView: "home",
    busy: false,
    recording: null,
    identification: null,
    lastImage: null,
    currentAudioUrl: null,
    currentAudioBlob: null,
    audioModelUsed: null,
    staticWave: null,
    isPlaying: false,
  };

  // ------------------------------------------------------------------ View Navigation
  function showView(name) {
    state.currentView = name;
    els.viewHome.classList.toggle("hidden", name !== "home");
    els.viewRecordings.classList.toggle("hidden", name !== "recordings");
    els.viewLibrary.classList.toggle("hidden", name !== "library");

    const navItems = [
      { id: els.navHome, active: name === "home" },
      { id: els.navRecordings, active: name === "recordings" },
      { id: els.navLibrary, active: name === "library" },
    ];

    navItems.forEach(({ id, active }) => {
      if (!id) return;
      if (active) {
        id.className = "nav-btn flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-950/70 to-emerald-900/40 border border-canvas-mint/30 text-canvas-mint font-medium text-xs shadow-[0_0_15px_rgba(74,222,128,0.15)] transition";
      } else {
        id.className = "nav-btn flex items-center gap-3 px-4 py-2.5 rounded-2xl text-stone-400 hover:text-white hover:bg-white/[0.04] transition font-medium text-xs";
      }
    });

    if (name === "recordings") loadRecordings();
    if (name === "library") loadLibrary();
    if (name === "home") sizeCanvas();
  }

  els.navHome.addEventListener("click", (e) => { e.preventDefault(); showView("home"); });
  els.navRecordings.addEventListener("click", (e) => { e.preventDefault(); showView("recordings"); });
  els.navLibrary.addEventListener("click", (e) => { e.preventDefault(); showView("library"); });
  els.btnRefreshRecordings.addEventListener("click", () => loadRecordings());
  els.btnRefreshLibrary.addEventListener("click", () => loadLibrary());

  // ------------------------------------------------------------------ Alert Helpers
  let alertTimer;
  function showAlert(title, message, kind = "error") {
    const styles = {
      error: ["⛔", "bg-red-950/90 border-red-500/30 text-red-200"],
      warn: ["⚠️", "bg-amber-950/90 border-amber-500/30 text-amber-200"],
      info: ["✨", "bg-emerald-950/90 border-emerald-500/30 text-emerald-200"],
    }[kind] || ["✨", "bg-stone-900/90 border-white/10 text-stone-200"];

    els.alert.className = `fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[min(94vw,560px)] rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl transition-all duration-300 ${styles[1]}`;
    els.alertIcon.textContent = styles[0];
    els.alertTitle.textContent = title;
    els.alertMessage.textContent = message;
    els.alert.classList.remove("hidden");
    clearTimeout(alertTimer);
    if (kind !== "error") alertTimer = setTimeout(hideAlert, 6000);
  }
  function hideAlert() {
    els.alert.classList.add("hidden");
  }
  if (els.alertClose) els.alertClose.addEventListener("click", hideAlert);

  class ApiError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  // ------------------------------------------------------------------ Pipeline Stepper
  const STEPS = ["listening", "analyzing", "generating", "complete"];
  function setStep(active, { error = false } = {}) {
    const idx = STEPS.indexOf(active);
    document.querySelectorAll("#pipeline .step").forEach((li) => {
      const stepName = li.dataset.step;
      const i = STEPS.indexOf(stepName);
      const icon = li.querySelector("div");
      const label = li.querySelector("span");

      if (idx === -1) {
        li.className = "step flex items-center gap-1.5 text-stone-500";
        icon.className = "w-4 h-4 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[10px] text-stone-500";
        icon.textContent = "○";
        label.className = "font-medium text-stone-500";
      } else if (i < idx || (active === "complete" && !error)) {
        li.className = "step flex items-center gap-1.5 text-canvas-mint";
        icon.className = "w-4 h-4 rounded-full bg-canvas-mint/20 border border-canvas-mint flex items-center justify-center text-[10px] text-canvas-mint font-bold shadow-[0_0_8px_rgba(74,222,128,0.3)]";
        icon.textContent = "✓";
        label.className = "font-medium text-stone-200";
      } else if (i === idx) {
        if (error) {
          li.className = "step flex items-center gap-1.5 text-red-400";
          icon.className = "w-4 h-4 rounded-full bg-red-500/20 border border-red-400 flex items-center justify-center text-[10px] text-red-400 font-bold";
          icon.textContent = "✕";
          label.className = "font-medium text-red-300";
        } else {
          li.className = "step flex items-center gap-1.5 text-canvas-mint animate-pulse";
          icon.className = "w-4 h-4 rounded-full bg-canvas-mint/30 border border-canvas-mint flex items-center justify-center text-[10px] text-canvas-mint font-bold";
          icon.textContent = "●";
          label.className = "font-bold text-white";
        }
      } else {
        li.className = "step flex items-center gap-1.5 text-stone-600";
        icon.className = "w-4 h-4 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-[10px] text-stone-600";
        icon.textContent = "○";
        label.className = "font-normal text-stone-500";
      }
    });
  }

  function setStatus(text) {
    if (els.statusText) els.statusText.textContent = text;
  }

  function setBusy(busy) {
    state.busy = busy;
    els.btnRecord.disabled = busy && !state.recording;
    els.fileInput.disabled = busy;
    els.duration.disabled = busy;
    if (els.btnForce) els.btnForce.disabled = busy;
    els.btnRegenerate.disabled = busy || !state.identification?.image_prompt;
    els.btnDownload.disabled = busy || !state.lastImage;
  }

  // ------------------------------------------------------------------ Visualizer
  const ctx2d = els.canvas.getContext("2d");

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = els.canvas.getBoundingClientRect();
    els.canvas.width = Math.round(rect.width * dpr);
    els.canvas.height = Math.round(rect.height * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWaveform();
  }

  function drawWaveform() {
    if (state.recording) return;
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    ctx2d.clearRect(0, 0, w, h);

    const wave = state.staticWave;
    const barCount = 76;
    const barW = Math.max(2, (w / barCount) - 2);
    const cy = h / 2;

    if (!wave || !wave.length) {
      // Gentle calm idle bars
      for (let b = 0; b < barCount; b++) {
        const x = b * (w / barCount) + 1;
        const bh = 4;
        ctx2d.fillStyle = "rgba(74, 222, 128, 0.25)";
        ctx2d.beginPath();
        ctx2d.roundRect(x, cy - bh / 2, barW, bh, 2);
        ctx2d.fill();
      }
      ctx2d.strokeStyle = "rgba(74, 222, 128, 0.15)";
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(0, cy);
      ctx2d.lineTo(w, cy);
      ctx2d.stroke();
      return;
    }

    for (let b = 0; b < barCount; b++) {
      const x = b * (w / barCount) + 1;
      const idx = Math.floor((b / barCount) * wave.length);
      const amp = Math.min(1, Math.abs(wave[idx]) * 1.9);
      const bh = Math.max(3, amp * (h * 0.8));

      const grad = ctx2d.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
      grad.addColorStop(0, "rgba(74, 222, 128, 0.95)");
      grad.addColorStop(0.5, "rgba(45, 212, 191, 0.85)");
      grad.addColorStop(1, "rgba(34, 197, 94, 0.95)");

      ctx2d.fillStyle = grad;
      ctx2d.beginPath();
      ctx2d.roundRect(x, cy - bh / 2, barW, bh, 2);
      ctx2d.fill();
    }

    ctx2d.strokeStyle = "rgba(74, 222, 128, 0.25)";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, cy);
    ctx2d.lineTo(w, cy);
    ctx2d.stroke();
  }

  function drawLive(analyser, freqData, timeData) {
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);
    ctx2d.clearRect(0, 0, w, h);

    const bars = Math.min(76, Math.floor(w / 5));
    const barW = Math.max(2, (w / bars) - 2);
    const cy = h / 2;
    const maxBin = freqData.length;

    for (let b = 0; b < bars; b++) {
      const lo = Math.floor(Math.pow(b / bars, 1.5) * maxBin);
      const hi = Math.max(lo + 1, Math.floor(Math.pow((b + 1) / bars, 1.5) * maxBin));
      let sum = 0;
      for (let i = lo; i < hi; i++) sum += freqData[i];
      const v = sum / (hi - lo) / 255;
      const bh = Math.max(4, v * (h * 0.85));
      const x = b * (w / bars) + 1;

      const grad = ctx2d.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
      grad.addColorStop(0, "rgba(74, 222, 128, 1)");
      grad.addColorStop(0.5, "rgba(45, 212, 191, 0.9)");
      grad.addColorStop(1, "rgba(34, 197, 94, 1)");

      ctx2d.fillStyle = grad;
      ctx2d.beginPath();
      ctx2d.roundRect(x, cy - bh / 2, barW, bh, 2);
      ctx2d.fill();
    }
  }

  // ------------------------------------------------------------------ Audio Player
  function formatTime(sec) {
    if (isNaN(sec) || !isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function updatePlayerUI() {
    const audio = els.playback;
    const cur = audio.currentTime || 0;
    const dur = audio.duration || 0;
    els.playerTime.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    const pct = dur > 0 ? (cur / dur) * 100 : 0;
    els.playerSeek.value = pct;
    if (els.playhead) {
      if (dur > 0) {
        els.playhead.classList.remove("hidden");
        els.playhead.style.left = `${Math.min(99, Math.max(0, pct))}%`;
      } else {
        els.playhead.classList.add("hidden");
      }
    }
  }

  function togglePlay() {
    const audio = els.playback;
    if (!audio.src) return;
    if (audio.paused) {
      audio.play().then(() => {
        state.isPlaying = true;
        els.iconPlayerPlay.classList.add("hidden");
        els.iconPlayerPause.classList.remove("hidden");
      }).catch((e) => console.warn("Play error:", e));
    } else {
      audio.pause();
      state.isPlaying = false;
      els.iconPlayerPlay.classList.remove("hidden");
      els.iconPlayerPause.classList.add("hidden");
    }
  }

  els.btnPlayerPlay.addEventListener("click", togglePlay);
  els.playback.addEventListener("timeupdate", updatePlayerUI);
  els.playback.addEventListener("loadedmetadata", updatePlayerUI);
  els.playback.addEventListener("ended", () => {
    state.isPlaying = false;
    els.iconPlayerPlay.classList.remove("hidden");
    els.iconPlayerPause.classList.add("hidden");
    updatePlayerUI();
  });
  els.playerSeek.addEventListener("input", (e) => {
    const audio = els.playback;
    const dur = audio.duration || 0;
    if (dur > 0) {
      audio.currentTime = (e.target.value / 100) * dur;
      updatePlayerUI();
    }
  });
  els.btnPlayerVolume.addEventListener("click", () => {
    els.playback.muted = !els.playback.muted;
    els.btnPlayerVolume.classList.toggle("opacity-50", els.playback.muted);
  });

  // Duration selection sync
  els.duration.addEventListener("change", (e) => {
    const val = e.target.value;
    els.durationDisplay.textContent = `${val}s`;
    els.badgeDuration.textContent = `${val}s ∿`;
  });

  // ------------------------------------------------------------------ Image vs Art Tabs
  els.btnTabImage.addEventListener("click", () => {
    els.btnTabImage.className = "flex items-center gap-1.5 px-3 py-1 rounded-lg bg-canvas-mint text-[#08150e] font-semibold shadow-sm transition";
    els.btnTabArt.className = "flex items-center gap-1.5 px-3 py-1 rounded-lg text-stone-400 hover:text-white transition";
    els.birdImage.style.filter = "none";
  });
  els.btnTabArt.addEventListener("click", () => {
    els.btnTabArt.className = "flex items-center gap-1.5 px-3 py-1 rounded-lg bg-canvas-mint text-[#08150e] font-semibold shadow-sm transition";
    els.btnTabImage.className = "flex items-center gap-1.5 px-3 py-1 rounded-lg text-stone-400 hover:text-white transition";
    els.birdImage.style.filter = "contrast(1.15) saturate(1.25) brightness(0.95)";
  });

  // ------------------------------------------------------------------ Audio Recording
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
      showAlert("Microphone unavailable", "Microphone access is only supported on localhost or HTTPS.", "warn");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (err) {
      showAlert("Microphone denied", err.name === "NotAllowedError" ? "Allow microphone permission in browser settings." : err.message);
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

    const seconds = Number(els.duration.value) || 8;
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

    setBusy(true);
    els.btnRecord.disabled = false;
    els.btnRecordIcon.textContent = "⏹";
    els.btnRecordLabel.textContent = "Stop & Analyze";
    els.recBadge.classList.remove("hidden");
    setStep("listening");
    setStatus(`Listening for ${seconds} seconds… keep the microphone pointed toward the bird.`);
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
    els.recProgress.style.width = "0%";
    els.btnRecordIcon.textContent = "🎙";
    els.btnRecordLabel.textContent = "Record / Listen";

    const pcm = concatFloat32(rec.chunks);
    const durationSec = pcm.length / sampleRate;
    if (durationSec < 1.2) {
      setBusy(false);
      setStep("listening", { error: true });
      setStatus("Recording was too short. Record at least 3 seconds.");
      drawWaveform();
      return;
    }
    normalize(pcm);
    state.staticWave = pcm;
    drawWaveform();

    const wav = encodeWav(pcm, sampleRate);
    setAudioPlayback(wav);
    await analyze(wav, "recording.wav");
  }

  function concatFloat32(chunks) {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  function normalize(pcm) {
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    if (peak < 1e-4) return;
    const gain = Math.min(0.89 / peak, 20);
    for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  }

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

  function setAudioPlayback(blobOrUrl) {
    if (typeof blobOrUrl === "string") {
      els.playback.src = blobOrUrl;
      state.currentAudioUrl = blobOrUrl;
    } else {
      if (els.playback.src && els.playback.src.startsWith("blob:")) {
        URL.revokeObjectURL(els.playback.src);
      }
      const url = URL.createObjectURL(blobOrUrl);
      els.playback.src = url;
      state.currentAudioBlob = blobOrUrl;
    }
    els.playback.load();
    els.btnPlayerPlay.disabled = false;
    els.btnPlayerPlay.className = "w-9 h-9 rounded-full bg-canvas-mint hover:bg-emerald-400 text-[#07130c] flex items-center justify-center shadow-[0_0_12px_rgba(74,222,128,0.3)] transition active:scale-95 shrink-0 cursor-pointer";
    updatePlayerUI();
  }

  // ------------------------------------------------------------------ Upload Audio
  async function handleUpload(file) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      showAlert("File too large", `Please upload an audio file under ${MAX_UPLOAD_MB} MB.`, "warn");
      return;
    }
    setAudioPlayback(file);
    setStep("listening");
    setStatus(`Uploaded ${file.name}`);
    try {
      const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
      const buf = await ac.decodeAudioData(await file.arrayBuffer());
      state.staticWave = buf.getChannelData(0);
    } catch {
      state.staticWave = null;
    }
    drawWaveform();
    await analyze(file, file.name);
  }

  // ------------------------------------------------------------------ API Calls
  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const key = keyStore.get();
    if (key) headers.set("X-Gemini-Api-Key", key);
    const falKey = keyStore.getFal();
    if (falKey) headers.set("X-Fal-Api-Key", falKey);

    let res;
    try {
      res = await fetch(API + path, { ...options, headers });
    } catch (err) {
      throw new ApiError("BACKEND_UNREACHABLE", "Could not reach the server backend.");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = body?.error;
      const detail = err?.message || (Array.isArray(body?.detail) ? body.detail.map((d) => d.msg).join("; ") : body?.detail);
      throw new ApiError(err?.code || `HTTP_${res.status}`, detail || `Request failed with HTTP ${res.status}`);
    }
    return body;
  }

  async function analyze(blob, filename) {
    setBusy(true);
    setStep("analyzing");
    setStatus("Analyzing bioacoustics with Gemini multimodal audio…");
    try {
      const form = new FormData();
      form.append("audio", blob, filename);
      if (els.audioModel.value) form.append("model", els.audioModel.value);
      const data = await api("/api/identify", { method: "POST", body: form });
      state.audioModelUsed = data.model;
      if (data.audio_record?.url) {
        state.currentAudioUrl = data.audio_record.url;
      }
      renderIdentification(data);

      if (data.status === "ok") {
        await generate();
      } else {
        setStep("analyzing", { error: true });
        setStatus(data.message);
        showAlert(data.status === "no_bird" ? "No bird detected" : "Low confidence recording", data.message, "warn");
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
    setStatus(`Rendering photorealistic ${id.common_name || "bird"} wildlife art…`);
    els.imageEmpty.classList.add("hidden");
    els.imageLoading.classList.remove("hidden");
    const t0 = performance.now();
    els.genTimer.textContent = "0";
    genClock = setInterval(() => {
      els.genTimer.textContent = Math.round((performance.now() - t0) / 1000);
    }, 500);

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
          bird_name: id.common_name || "Bird",
          scientific_name: id.scientific_name || "",
          audio_url: state.currentAudioUrl || "",
        }),
      });
      await loadImage(API + data.image_url);
      state.lastImage = data;
      renderMetadata(data.parameters);
      setStep("complete");
      setStatus(`Complete — ${id.common_name} rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
      els.btnRegenerate.disabled = false;
      els.btnDownload.disabled = false;
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
      const img = els.birdImage;
      img.onload = () => {
        img.classList.remove("hidden");
        els.speciesThumb.src = src;
        els.speciesThumb.classList.remove("hidden");
        if (els.speciesThumbPlaceholder) els.speciesThumbPlaceholder.classList.add("hidden");
        resolve();
      };
      img.onerror = () => reject(new ApiError("IMAGE_LOAD", "Generated image could not be loaded."));
      img.src = src;
    });
  }

  function renderMetadata(p) {
    els.metadataCard.classList.remove("hidden");
    els.metaPrompt.textContent = p.prompt;
    els.metaNegative.textContent = p.negative_prompt || "(none)";
    els.metaImageModel.textContent = p.model || "fal-ai/fast-sdxl";
    els.metaAspectRatio.textContent = p.aspect_ratio || "1:1";
    els.metaResolution.textContent = p.image_size || "1K";
    els.metaGenTime.textContent = `${p.generation_seconds} s`;
    els.metaRecModel.textContent = state.audioModelUsed || "gemini-3.5-flash";
  }

  function reportError(err, step) {
    console.error(err);
    setStep(step, { error: true });
    setStatus(err.message);
    showAlert("Error", err.message, "error");
    if (err.code === "NO_API_KEY" || err.code === "INVALID_API_KEY") {
      openSettings(true);
    }
  }

  async function downloadImage() {
    if (!state.lastImage) return;
    try {
      const res = await fetch(API + state.lastImage.image_url);
      if (!res.ok) throw new Error("Image expired from server cache.");
      const blob = await res.blob();
      const name = (state.identification?.common_name || "bird").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      showAlert("Download failed", err.message, "warn");
    }
  }

  // ------------------------------------------------------------------ Recordings View Logic
  async function loadRecordings() {
    try {
      const items = await api("/api/recordings");
      if (!items || !items.length) {
        els.recordingsContainer.innerHTML = `
          <div class="text-center py-16 text-stone-500 space-y-2">
            <span class="text-4xl">🎙️</span>
            <p class="text-sm font-semibold text-stone-300">No recordings saved yet</p>
            <p class="text-xs text-stone-500">Record a bird call on the Home tab or upload an audio file to see it here.</p>
          </div>
        `;
        return;
      }

      els.recordingsContainer.innerHTML = items.map((rec) => {
        const kb = Math.round(rec.size_bytes / 1024);
        return `
          <div class="p-4 rounded-2xl bg-canvas-card border border-canvas-cardBorder flex flex-wrap items-center justify-between gap-4 hover:border-canvas-mint/30 transition">
            <div class="flex items-center gap-3 min-w-[240px]">
              <div class="w-10 h-10 rounded-xl bg-canvas-inner border border-white/[0.08] flex items-center justify-center text-canvas-mint text-base">
                🎵
              </div>
              <div>
                <h4 class="font-mono text-xs font-semibold text-white truncate max-w-sm">${rec.filename}</h4>
                <p class="text-[11px] text-canvas-muted mt-0.5">${rec.created_at} · ${kb} KB</p>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <audio controls class="h-8 max-w-[220px]" src="${rec.url}"></audio>
              <button data-analyze-url="${rec.url}" data-analyze-name="${rec.filename}" class="btn-use-rec px-3 py-1.5 rounded-xl bg-canvas-mint/15 hover:bg-canvas-mint/25 border border-canvas-mint/30 text-canvas-mint text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer">
                <span>🔍</span>
                <span>Analyze</span>
              </button>
              <a href="${rec.url}" download="${rec.filename}" class="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-stone-300 hover:text-white transition" title="Download Audio">
                ⬇
              </a>
            </div>
          </div>
        `;
      }).join("");

      // Wire Analyze buttons
      document.querySelectorAll(".btn-use-rec").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const url = btn.dataset.analyzeUrl;
          const name = btn.dataset.analyzeName;
          showView("home");
          setStatus(`Loading ${name} from recordings…`);
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            setAudioPlayback(blob);
            await analyze(blob, name);
          } catch (err) {
            showAlert("Could not load recording", err.message);
          }
        });
      });
    } catch (err) {
      console.warn("Could not load recordings:", err);
    }
  }

  // ------------------------------------------------------------------ Library View Logic
  async function loadLibrary() {
    try {
      const items = await api("/api/library");
      if (!items || !items.length) {
        els.libraryContainer.innerHTML = `
          <div class="col-span-full text-center py-16 text-stone-500 space-y-2">
            <span class="text-4xl">🎨</span>
            <p class="text-sm font-semibold text-stone-300">No generated birds in your library yet</p>
            <p class="text-xs text-stone-500">Record or upload a bird sound on the Home tab to analyze and generate photorealistic portraits.</p>
          </div>
        `;
        return;
      }

      els.libraryContainer.innerHTML = items.map((item) => {
        const audioLinkHtml = item.audio_url ? `
          <div class="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-1.5">
            <div class="flex items-center justify-between text-[11px]">
              <span class="font-semibold text-canvas-mint flex items-center gap-1">
                <span>🎵</span>
                <span>Audio Call: ${item.bird_name}</span>
              </span>
              <a href="${item.audio_url}" download class="text-stone-400 hover:text-white underline">Download</a>
            </div>
            <audio controls class="w-full h-7" src="${item.audio_url}"></audio>
          </div>
        ` : `
          <div class="text-[11px] text-stone-500 italic">No audio recorded for this item</div>
        `;

        return `
          <div class="rounded-3xl bg-canvas-card border border-canvas-cardBorder overflow-hidden glow-card flex flex-col justify-between hover:border-canvas-mint/30 transition">
            <div>
              <div class="aspect-square w-full bg-canvas-inner overflow-hidden relative">
                <img src="${item.image_url}" alt="${item.bird_name}" class="w-full h-full object-cover hover:scale-105 transition duration-500" loading="lazy" />
              </div>
              <div class="p-4 space-y-3">
                <div>
                  <h3 class="font-display font-bold text-lg text-white">${item.bird_name}</h3>
                  <p class="text-xs italic text-canvas-sage">${item.scientific_name || "Species"}</p>
                </div>
                ${audioLinkHtml}
              </div>
            </div>

            <div class="p-4 pt-0 border-t border-white/[0.04] mt-2 flex items-center justify-between text-[11px] text-stone-400">
              <span>${item.created_at || ""}</span>
              <a href="${item.image_url}" download="${item.bird_name}.png" class="px-3 py-1 rounded-xl bg-canvas-mint text-[#08150e] font-bold shadow-sm hover:opacity-90 transition">
                Download HD
              </a>
            </div>
          </div>
        `;
      }).join("");
    } catch (err) {
      console.warn("Could not load library:", err);
    }
  }

  // ------------------------------------------------------------------ Settings & Keys
  const KEY_NAME = "birdsong.geminiKey";
  const FAL_KEY_NAME = "birdsong.falKey";
  const PREFS_NAME = "birdsong.prefs";
  const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  const sanitizeKey = (k) => (k || "").replace(/[^\x20-\x7E]/g, "").trim().replace(/^["'`]|["'`]$/g, "").trim();

  const keyStore = {
    get: () => sanitizeKey(safe(() => localStorage.getItem(KEY_NAME) || sessionStorage.getItem(KEY_NAME)) || ""),
    set(key, remember) {
      const clean = sanitizeKey(key);
      safe(() => { localStorage.removeItem(KEY_NAME); sessionStorage.removeItem(KEY_NAME); });
      if (clean) safe(() => (remember ? localStorage : sessionStorage).setItem(KEY_NAME, clean));
    },
    getFal: () => sanitizeKey(safe(() => localStorage.getItem(FAL_KEY_NAME) || sessionStorage.getItem(FAL_KEY_NAME)) || ""),
    setFal(key, remember) {
      const clean = sanitizeKey(key);
      safe(() => { localStorage.removeItem(FAL_KEY_NAME); sessionStorage.removeItem(FAL_KEY_NAME); });
      if (clean) safe(() => (remember ? localStorage : sessionStorage).setItem(FAL_KEY_NAME, clean));
    },
    remembered: () => !!safe(() => localStorage.getItem(KEY_NAME) || localStorage.getItem(FAL_KEY_NAME)),
  };

  const prefs = {
    load: () => safe(() => JSON.parse(localStorage.getItem(PREFS_NAME)) || {}, {}),
    save: () => safe(() => localStorage.setItem(PREFS_NAME, JSON.stringify({
      audioModel: els.audioModel.value,
      imageModel: els.imageModel.value,
      aspectRatio: els.aspectRatio.value,
      imageSize: els.imageSize.value,
    }))),
  };

  const maskKey = (k) => (k && k.length > 8 ? `${k.slice(0, 4)}...${k.slice(-4)}` : "set");

  function setKeyIndicator(ok, label) {
    els.keyDot.className = `w-2 h-2 rounded-full ${ok ? "bg-canvas-mint shadow-[0_0_8px_#4ade80]" : "bg-amber-400"}`;
    els.keyPillLabel.textContent = label || "Gemini: Connected";
  }

  function openSettings(open) {
    els.settingsModal.classList.toggle("hidden", !open);
  }

  function fillSelect(select, models, preferred) {
    if (!models || !models.length) return;
    const current = preferred && models.includes(preferred) ? preferred : models[0];
    select.replaceChildren(...models.map((m) => new Option(m, m, m === current, m === current)));
  }

  async function checkKey({ quiet = false } = {}) {
    els.keySave.disabled = true;
    els.keySave.textContent = "Testing…";
    try {
      const data = await api("/api/key/check", { method: "POST" });
      const p = prefs.load();
      fillSelect(els.audioModel, data.audio_models, p.audioModel || data.default_audio_model);
      fillSelect(els.imageModel, data.image_models, p.imageModel || data.default_image_model);
      const k = keyStore.get();
      const fk = keyStore.getFal();
      const parts = [];
      if (k) parts.push(`Gemini: ${maskKey(k)}`);
      if (fk) parts.push(`Fal: ${maskKey(fk)}`);
      setKeyIndicator(true, parts.join(" | ") || "Gemini: Connected");
      els.keyStatus.textContent = `✓ ${data.audio_models.length} audio & ${data.image_models.length} image models available.`;
      els.keySave.textContent = "✓ Verified";
      if (!quiet) showAlert("Keys verified", "API keys saved and engines active!", "info");
      return true;
    } catch (err) {
      setKeyIndicator(false, "Gemini: Key needed");
      els.keyStatus.textContent = err.message;
      els.keySave.textContent = "Save & test";
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
      fillSelect(els.audioModel, [p.audioModel || config.audio_model]);
      fillSelect(els.imageModel, [p.imageModel || config.image_model]);
    } catch (err) {
      console.warn("Config fetch failed:", err);
    }

    const key = keyStore.get();
    const falKey = keyStore.getFal();
    els.keyInput.value = key;
    els.falKeyInput.value = falKey;
    els.keyRemember.checked = keyStore.remembered();

    if (key || falKey || config?.server_key_configured) {
      await checkKey({ quiet: true });
    } else {
      setKeyIndicator(false, "No API key configured");
      openSettings(true);
    }
  }

  // Settings Modal Listeners
  els.btnSettingsToggle.addEventListener("click", () => openSettings(true));
  if (els.navSettings) els.navSettings.addEventListener("click", (e) => { e.preventDefault(); openSettings(true); });
  els.btnSettingsClose.addEventListener("click", () => openSettings(false));
  els.settingsModal.addEventListener("click", (e) => {
    if (e.target === els.settingsModal) openSettings(false);
  });

  els.keyReveal.addEventListener("click", () => {
    const isPass = els.keyInput.type === "password";
    els.keyInput.type = isPass ? "text" : "password";
    els.keyReveal.textContent = isPass ? "Hide" : "Show";
  });
  els.falKeyReveal.addEventListener("click", () => {
    const isPass = els.falKeyInput.type === "password";
    els.falKeyInput.type = isPass ? "text" : "password";
    els.falKeyReveal.textContent = isPass ? "Hide" : "Show";
  });

  els.keySave.addEventListener("click", async () => {
    const key = els.keyInput.value.trim();
    const falKey = els.falKeyInput.value.trim();
    if (key) keyStore.set(key, els.keyRemember.checked);
    if (falKey) keyStore.setFal(falKey, els.keyRemember.checked);
    const ok = await checkKey();
    if (ok) {
      setTimeout(() => openSettings(false), 800);
    }
  });

  els.keyClear.addEventListener("click", () => {
    keyStore.set("", false);
    keyStore.setFal("", false);
    els.keyInput.value = "";
    els.falKeyInput.value = "";
    setKeyIndicator(false, "No key");
    els.keyStatus.textContent = "Keys cleared from this browser.";
  });

  [els.audioModel, els.imageModel, els.aspectRatio, els.imageSize].forEach((s) => s.addEventListener("change", prefs.save));

  // ------------------------------------------------------------------ Actions Wiring
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

  els.btnRegenerate.addEventListener("click", () => {
    hideAlert();
    generate();
  });

  if (els.btnForce) {
    els.btnForce.addEventListener("click", () => {
      hideAlert();
      els.lowConf.classList.add("hidden");
      generate();
    });
  }

  els.btnDownload.addEventListener("click", downloadImage);

  // Copy Buttons
  els.btnCopyAll.addEventListener("click", async () => {
    const text = `PROMPT:\n${els.metaPrompt.textContent}\n\nNEGATIVE PROMPT:\n${els.metaNegative.textContent}\n\nSPECS:\nImage model: ${els.metaImageModel.textContent}\nAspect ratio: ${els.metaAspectRatio.textContent}\nResolution: ${els.metaResolution.textContent}\nGeneration time: ${els.metaGenTime.textContent}\nRecognition model: ${els.metaRecModel.textContent}`;
    try {
      await navigator.clipboard.writeText(text);
      els.btnCopyAllLabel.textContent = "Copied!";
      setTimeout(() => (els.btnCopyAllLabel.textContent = "Copy all"), 1500);
    } catch {
      showAlert("Copy failed", "Could not write to clipboard.", "warn");
    }
  });

  els.btnCopyNeg.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.metaNegative.textContent);
      els.btnCopyNeg.textContent = "Copied!";
      setTimeout(() => (els.btnCopyNeg.textContent = "Copy"), 1500);
    } catch {
      showAlert("Copy failed", "Could not write to clipboard.", "warn");
    }
  });

  window.addEventListener("resize", sizeCanvas);
  sizeCanvas();
  updatePlayerUI();
  initSettings();
})();
