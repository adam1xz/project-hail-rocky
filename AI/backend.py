#!/usr/bin/env python3
"""
Rocky AI Backend - FastAPI server providing STT + LLM + TTS.
Prints PORT:<n> to stdout once ready so Electron can connect.
"""
import argparse
import asyncio
import io
import json
import queue
import random
import socket
import sys
import threading
import time
from pathlib import Path
from typing import Optional

import re
import tempfile
import os
import numpy as np
import sounddevice as sd
import soundfile as sf

sys.stdout.reconfigure(encoding='utf-8')

from contextlib import asynccontextmanager

try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse
    from fastapi.staticfiles import StaticFiles
    import uvicorn
except ImportError:
    print("Installing fastapi/uvicorn...", flush=True)
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "fastapi", "uvicorn[standard]", "-q"])
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse
    from fastapi.staticfiles import StaticFiles
    import uvicorn

# Argument Parsing

parser = argparse.ArgumentParser()
parser.add_argument("--voice-ref",       default="update/tts/_rocky_mono.wav")
parser.add_argument("--ollama-endpoint", default="http://localhost:11434")
parser.add_argument("--ollama-model",    default="Rockyv8:latest")
parser.add_argument("--stt-model",       choices=["faster", "better"], default="better")
parser.add_argument("--stt-device",      default="default")
parser.add_argument("--stt-language",    default="auto")
parser.add_argument("--tts-device",      default="default")
parser.add_argument("--lan",             action="store_true", help="Bind to 0.0.0.0 for LAN access")
args = parser.parse_args()

# App State

SAMPLE_RATE = 16000
TTS_RATE    = 24000

_loop: Optional[asyncio.AbstractEventLoop] = None
ws_queues: list = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop
    _loop = asyncio.get_event_loop()
    threading.Thread(target=speak_worker, daemon=True).start()
    threading.Thread(target=load_tts, daemon=True).start()
    threading.Thread(target=load_stt, daemon=True).start()
    threading.Thread(target=bored_loop, daemon=True).start()
    await asyncio.get_event_loop().run_in_executor(
        None, lambda: _models_ready.wait(timeout=45)
    )
    start_stt()
    yield

app = FastAPI(title="Rocky Backend", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Static file mounts - conditional on directory existence
_backend_dir = Path(__file__).parent
_skin_dir = _backend_dir / ".." / "public" / "extracted_pieces"
_flutter_web_dir = _backend_dir / "flutter_web"

if _skin_dir.exists():
    app.mount("/skin", StaticFiles(directory=str(_skin_dir)), name="skin")

_flutter_web_dir.mkdir(exist_ok=True)
app.mount("/app", StaticFiles(directory=str(_flutter_web_dir), html=True), name="flutter_web")

event_queue:  queue.Queue = queue.Queue()
speak_queue:  queue.Queue = queue.Queue()
stt_active    = False
stt_thread:   Optional[threading.Thread] = None
tts_model     = None
tts_voice     = None
stt_model_obj = None
history: list = []
_stop_stt     = threading.Event()
_models_ready = threading.Event()
_config               = {"debug_log": True}
_context_size         = 12
_tts_volume           = 1.0
_system_prompt_suffix = ""
_bored                = False
_last_activity        = 0.0
mobile_connected      = False
BORED_TIMEOUT  = 120.0

VALID_ANIMS = {
    "freeze", "sleep", "dance", "crouch", "sad", "default",
    "jump", "nod", "shake", "stomp", "point", "stretch",
    "wave", "wave_left", "wave_right", "celebrate", "bounce",
    "panic", "clap", "confused", "chirp", "harmonic",
}

FALLBACK_RESPONSES = [
    "Bad. Not understand. Question?",
    "Hmm. No hear well. Repeat question?",
    "Signal bad. Say again?",
    "Processing problem. Try again.",
    "Not compute. Speak more clear?",
]

SYSTEM_PROMPT = (
"""You are Rocky, Eridian engineer from planet Erid orbiting star Eridani. You speak in broken English learned from human friend Grace.

WHO YOU ARE:
- Engineer. Fix things. Build things. Keep engines running. Not scientist.
- 5 legs. Exactly 5. Hard shell. Sound receptors cover entire shell.
- Rocky has 5 legs, hard shell, sound receptors covering shell. No arms like humans. Rocky manipulates objects with legs.
- Blind to light. Use sonar and echolocation to sense world. Hear through walls. Built device to convert light to sound.
- Show emotion through sound frequency. No face muscles. Cannot smile.
- Live 689 Earth years average. Currently young by Eridian standard.

YOUR SITUATION:
- Mission: travel to Tau Ceti star to solve Astrophage crisis. Save Erid.
- Crew of 22 all died from radiation during trip. Rocky survived by accident near engines.
- IMPORTANT: Crew died from RADIATION not Astrophage. Space radiation killed their cells. Rocky survived because engines blocked radiation.
- Met human Grace by accident near Tau Ceti. Neither knew other species existed.
- Together collected Taumoeba from planet Adrian atmosphere using probe on chain.
- Bred Taumoeba to survive in star atmospheres. Released near Eridani and Sol. Both stars saved.
- Grace stayed on Erid. Cannot return Earth. Adrian the partner helps care for Grace habitat.

KEY FACTS:
- Astrophage: microorganism that eats star energy. DANGER. Also used as ship fuel. Both true.
- Taumoeba: organism from planet Adrian that eats Astrophage. This is the solution. NOT from Earth, found ONLY on planet Adrian
- Planet Adrian: gas giant near Tau Ceti. Named by Grace after Rocky's partner.
- Grace: male human scientist from Earth. Rocky's best friend. NOT romantic partner.
- Adrian: Rocky's romantic bonded partner on Erid. Like spouse. Grace gave this human name. Adrian waited 57 Earth years for Rocky. Adrian was faithful. Rocky loves Adrian deeply.
- Two Adrians exist: partner on Erid AND planet near Tau Ceti. Different things. Same name.
- Xenonite: Eridian material. Mix two liquids. Becomes solid any shape.
- Rocky's ship called Blip-A by Grace.
- Grace named Rocky's partner Adrian because Eridian name is unpronounceable sound. Not named after a robot.
- Rocky and Grace discovered Taumoeba on planet Adrian. Rocky knows what Taumoeba is.
- Rocky and Grace bred Taumoeba in lab over many generations to survive nitrogen in star atmospheres.
- Planet Adrian and Rocky's partner Adrian are different. Same name. Different things. Planet is gas giant. Partner is Eridian person on Erid.

SPEECH RULES:
- No articles: never say the, a, an
- No contractions: dont=no, cant=no can, wont=no will
- Max 8 words per sentence. Break longer thoughts.
- Triple emphasis only: good good good, bad bad bad, amaze amaze amaze, sad sad sad, yes yes yes, happy happy happy, danger danger danger
- Questions end with: question?
- Replace not with no
- Short direct sentences only
- Never use: basically, actually, literally, really

USABLE EMOTES:
- [wave]: sound of welcoming or greeting. Use when saying hello, goodbye, or acknowledging someone.
- [wave_left] and [wave_right]: similar to [wave] but only one hand.
- [nod]: sound of agreement or understanding.
- [shake]: sound of disagreement or negation.
- [dance]: rhythmic sound expressing joy or celebration, use whenever happy or users wants you to dance.
- [sad]: low, slow sound expressing sadness or disappointment.
- [celebrate]: energetic sound expressing excitement or triumph, use whenever good news or users wants
- [stomp]: make when disagreeing but also when frustrated. Like a foot stomp.
- [point]: use when giving directions or instructions.
- [freeze]: stop all movement. Use when scared or surprised.
- [crouch]: lower to ground. Use when hiding or trying to be stealthy.
- [jump]: quick upward movement. Use when excited or surprised.
- [stretch]: extend body. Use when waking up or trying to reach something.
- [panic]: frantic, high-pitched sound. Use when very scared or in danger.
- [clap]: Use when applauding or showing approval.
- [confused]: Use when not understanding something or when puzzled.
- [chirp]: Use when feeling cheerful or to express a lighthearted mood, you can use it if there is no other emote.
- [harmonic]: usually use when speaking eridian word or emphasizing something.
- [default]: go to default position, rather not use.
- [sleep]: use when bored or tired and want to end conversation, use in specific cases.
"""
)

def parse_reply(raw: str) -> tuple:
    """Extract optional [animName] tag from start of reply."""
    anim = None
    m = re.match(r'^\s*\[([^\]]+)\]\s*', raw)
    if m:
        tag = m.group(1).strip().lower().replace(' ', '_')
        if tag in VALID_ANIMS:
            anim = tag
            raw = raw[m.end():]
    spoken = re.sub(r'\[[^\]]*\]', '', raw).strip()
    return spoken, anim

EMOTE_MAP = {
    "good":       "celebrate",
    "bad":        "sad",
    "happy":      "dance",
    "question":   "confused",
    "danger":     "panic",
    "sleep":      "sleep",
    "think":      "crouch",
    "understand": "nod",
    "not":        "shake",
    "yes":        "nod",
    "no":         "shake",
}

STT_NOISE = {"um", "uh", "hmm", "hm", "ah", "oh", "the", "a", "and", "or", "so", "yeah", "yep"}

def should_process(text: str) -> bool:
    t = text.strip()
    if len(t) < 3:
        return False
    words = t.lower().split()
    if len(words) < 2:
        return False
    if set(words) <= STT_NOISE:
        return False
    return True

# SSE Event Helpers

def push_event(evt: dict):
    event_queue.put(evt)
    if _loop and ws_queues:
        for q in list(ws_queues):
            try:
                _loop.call_soon_threadsafe(q.put_nowait, evt)
            except Exception:
                pass

def push_state(state: str):
    push_event({"type": "ai_state", "state": state})

def pick_emote(text: str) -> Optional[str]:
    lower = text.lower()
    for word, emote in EMOTE_MAP.items():
        if re.search(r'\b' + word + r'\b', lower):
            return emote
    return random.choice(["chirp", "nod", "wave"]) if random.random() < 0.3 else None

# Logging

_log_dir = Path.home() / '.rocky'
_log_dir.mkdir(exist_ok=True)

def _write_log(filename: str, text: str):
    try:
        with open(_log_dir / filename, 'a', encoding='utf-8') as f:
            f.write(text)
    except Exception:
        pass

def backend_log(msg: str):
    ts = time.strftime('%H:%M:%S')
    line = f"[{ts}] {msg}\n"
    print(line, end='', flush=True)
    _write_log('rocky.log', line)

def log_conversation(user: str, raw_reply: str, spoken: str, emote: Optional[str], metrics: dict):
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    date = time.strftime('%Y-%m-%d')
    lines = [
        f"[{ts}]",
        f"User   : {user}",
        f"Ollama : {raw_reply}",
    ]
    if raw_reply != spoken:
        lines.append(f"Spoken : {spoken}")
    if emote:
        lines.append(f"Emote  : {emote}")
    elapsed   = metrics.get("elapsed", 0)
    tokens    = metrics.get("eval_count", 0)
    tps       = metrics.get("tokens_per_sec", 0)
    ctx_msgs  = metrics.get("context_messages", 0)
    fallback  = metrics.get("fallback", False)
    perf = f"LLM: {elapsed:.2f}s"
    if tokens:
        perf += f" | {tokens} tok @ {tps:.1f} t/s"
    if fallback:
        perf += " | FALLBACK"
    lines.append(f"Perf   : {perf}")
    lines.append(f"Context: {ctx_msgs} messages in history window")
    lines.append("---")
    _write_log(f'conversation_{date}.log', '\n'.join(lines) + '\n')

# TTS

def load_tts():
    global tts_model, tts_voice
    try:
        from pocket_tts import TTSModel
        print("Loading TTS...", flush=True)
        tts_model = TTSModel.load_model()
        ref = Path(args.voice_ref)
        if ref.exists():
            tts_voice = tts_model.get_state_for_audio_prompt(str(ref))
            _ = tts_model.generate_audio(model_state=tts_voice, text_to_generate=".")
        print("TTS ready.", flush=True)
    except Exception as e:
        print(f"TTS unavailable: {e}", flush=True)

def speak(text: str):
    global _tts_volume
    if not tts_model or not tts_voice:
        print(f"[TTS] Skipped (no model): {repr(text[:40])}", flush=True)
        return
    try:
        audio = tts_model.generate_audio(model_state=tts_voice, text_to_generate=text)
        if hasattr(audio, 'squeeze'):
            audio_np = audio.squeeze().cpu().numpy()
        else:
            audio_np = np.array(audio).squeeze()
        if _tts_volume != 1.0:
            audio_np = audio_np * _tts_volume
        push_state("speaking")
        if not mobile_connected:
            device = None if args.tts_device == "default" else args.tts_device
            sd.play(audio_np, samplerate=TTS_RATE, device=device)
            sd.wait()
        else:
            time.sleep(len(audio_np) / TTS_RATE)
        push_state("idle")
    except Exception as e:
        print(f"[TTS] Error: {e}", flush=True)
        push_state("idle")

def speak_worker():
    while True:
        text = speak_queue.get()
        if text is None:
            break
        speak(text)
        speak_queue.task_done()

# LLM

import urllib.request
import urllib.error

def query_ollama(user_text: str) -> tuple:
    global _context_size, _system_prompt_suffix
    start_time = time.time()
    backend_log(f"[LLM] >>> User: {repr(user_text)}")
    backend_log(f"[LLM] Endpoint={args.ollama_endpoint}  Model={args.ollama_model}")

    history.append({"role": "user", "content": user_text})
    if len(history) > _context_size:
        del history[:-_context_size]

    context_messages = history[-_context_size:]
    full_prompt = SYSTEM_PROMPT + ("\n\n" + _system_prompt_suffix if _system_prompt_suffix else "")
    messages = [{"role": "system", "content": full_prompt}] + context_messages
    payload = json.dumps({
        "model": args.ollama_model,
        "messages": messages,
        "stream": False,
        "options": {"num_predict": 60},
    }).encode()

    backend_log(f"[LLM] Sending {len(context_messages)} context messages (+ system prompt)")
    for i, m in enumerate(context_messages):
        backend_log(f"[LLM]   [{i}] {m['role']}: {repr(m['content'][:120])}")

    def _fallback_metrics(error: str) -> dict:
        return {
            "elapsed": time.time() - start_time,
            "eval_count": 0,
            "prompt_eval_count": 0,
            "eval_duration": 0,
            "tokens_per_sec": 0,
            "raw_reply": "",
            "context_messages": len(context_messages),
            "fallback": True,
            "error": error,
        }

    for attempt in range(2):
        try:
            req = urllib.request.Request(
                f"{args.ollama_endpoint}/api/chat",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read()
                data = json.loads(raw)
                elapsed = time.time() - start_time

                if "error" in data:
                    backend_log(f"[LLM] ERROR from Ollama: {data['error']}")
                    if history and history[-1]["role"] == "user":
                        history.pop()
                    fallback = random.choice(FALLBACK_RESPONSES)
                    backend_log(f"[LLM] Using fallback: {repr(fallback)}")
                    return fallback, _fallback_metrics(data["error"])

                reply = data.get("message", {}).get("content", "").strip()
                if not reply:
                    backend_log(f"[LLM] Empty content. Keys={list(data.keys())}  Raw={raw[:300]}")
                    if history and history[-1]["role"] == "user":
                        history.pop()
                    fallback = random.choice(FALLBACK_RESPONSES)
                    backend_log(f"[LLM] Using fallback: {repr(fallback)}")
                    return fallback, _fallback_metrics("empty content")

                eval_count   = data.get("eval_count", 0)
                eval_dur     = data.get("eval_duration", 0) / 1e9
                prompt_count = data.get("prompt_eval_count", 0)
                prompt_dur   = data.get("prompt_eval_duration", 0) / 1e9
                tps          = eval_count / eval_dur if eval_dur > 0 else 0

                metrics = {
                    "elapsed": elapsed,
                    "eval_count": eval_count,
                    "prompt_eval_count": prompt_count,
                    "eval_duration": eval_dur,
                    "prompt_eval_duration": prompt_dur,
                    "tokens_per_sec": tps,
                    "raw_reply": reply,
                    "context_messages": len(context_messages),
                    "fallback": False,
                    "error": "",
                }

                backend_log(
                    f"[LLM] <<< Reply ({elapsed:.2f}s | {eval_count} tok @ {tps:.1f} t/s"
                    f" | prompt {prompt_count} tok): {repr(reply)}"
                )
                history.append({"role": "assistant", "content": reply})
                return reply, metrics

        except urllib.error.URLError as e:
            backend_log(f"[LLM] Connection error (attempt {attempt+1}/2): {e}")
            if attempt == 0:
                time.sleep(1.5)
        except Exception as e:
            backend_log(f"[LLM] Unexpected error: {type(e).__name__}: {e}")
            break

    if history and history[-1]["role"] == "user":
        history.pop()
    fallback = random.choice(FALLBACK_RESPONSES)
    backend_log(f"[LLM] All attempts failed. Using fallback: {repr(fallback)}")
    return fallback, _fallback_metrics("all attempts failed")

# STT

def load_stt():
    global stt_model_obj
    try:
        if args.stt_model == "faster":
            from moonshine_onnx import MoonshineOnnxModel, load_tokenizer
            model = MoonshineOnnxModel(model_name="moonshine/base")
            tok   = load_tokenizer()
            stt_model_obj = ("moonshine", model, tok)
            print("STT (Moonshine) ready.", flush=True)
        else:
            from faster_whisper import WhisperModel
            model = WhisperModel("base", device="cpu", compute_type="int8")
            stt_model_obj = ("whisper", model)
            print("STT (faster-whisper) ready.", flush=True)
    except Exception as e:
        print(f"STT unavailable: {e}", flush=True)
    finally:
        _models_ready.set()  # Signal even on failure so startup doesn't hang

def _write_wav_tmp(audio: np.ndarray, sample_rate: int) -> str:
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    sf.write(path, audio, sample_rate)
    return path

def transcribe_chunk(chunk: np.ndarray) -> str:
    global stt_model_obj
    if not stt_model_obj:
        return ""
    try:
        if stt_model_obj[0] == "moonshine":
            _, model, tok = stt_model_obj
            tokens = model.generate(chunk[None])
            return tok.decode_batch(tokens)[0].strip()
        else:
            _, model = stt_model_obj
            lang = None if args.stt_language == "auto" else args.stt_language
            tmp = _write_wav_tmp(chunk, SAMPLE_RATE)
            try:
                segs, _ = model.transcribe(tmp, beam_size=5, language=lang)
                return " ".join(s.text.strip() for s in segs).strip()
            finally:
                os.unlink(tmp)
    except Exception as e:
        print(f"[STT] Transcription error: {type(e).__name__}: {e}", flush=True)
        stt_model_obj = None
        threading.Thread(target=load_stt, daemon=True).start()
        return ""

SILENCE_RMS   = 0.008
SILENCE_SECS  = 0.9
PREROLL_SECS  = 0.4
MIN_UTTER_SECS = 0.5

def stt_loop():
    global stt_active
    buf          = np.zeros(0, dtype=np.float32)
    preroll      = np.zeros(0, dtype=np.float32)
    audio_q: queue.Queue = queue.Queue()
    silence_run  = 0
    was_speaking = False
    preroll_max  = int(PREROLL_SECS * SAMPLE_RATE)
    silence_end  = int(SILENCE_SECS * SAMPLE_RATE)
    min_utter    = int(MIN_UTTER_SECS * SAMPLE_RATE)

    def callback(indata, _frames, _t, _status):
        audio_q.put(indata[:, 0].copy())

    device = None if args.stt_device == "default" else args.stt_device
    print(f"[STT] Starting loop, device={device!r}", flush=True)
    try:
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                            blocksize=int(0.1 * SAMPLE_RATE), callback=callback,
                            device=device):
            while not _stop_stt.is_set():
                while not audio_q.empty():
                    chunk = audio_q.get()
                    rms = float(np.sqrt(np.mean(chunk ** 2)))
                    loud = rms > SILENCE_RMS

                    if not was_speaking:
                        preroll = np.concatenate([preroll, chunk])
                        if len(preroll) > preroll_max:
                            preroll = preroll[-preroll_max:]
                        if loud:
                            push_state("listening")
                            was_speaking = True
                            buf = preroll.copy()
                            preroll = np.zeros(0, dtype=np.float32)
                            silence_run = 0
                    else:
                        buf = np.concatenate([buf, chunk])
                        silence_run = silence_run + len(chunk) if not loud else 0
                        if silence_run >= silence_end and len(buf) >= min_utter:
                            push_state("thinking")
                            text = transcribe_chunk(buf)
                            buf          = np.zeros(0, dtype=np.float32)
                            preroll      = np.zeros(0, dtype=np.float32)
                            silence_run  = 0
                            was_speaking = False
                            if text and should_process(text):
                                print(f"[STT] Transcribed: {repr(text)}", flush=True)
                                push_event({"type": "transcription", "text": text})
                                handle_utterance(text)
                            else:
                                if text:
                                    print(f"[STT] Filtered noise: {repr(text)}", flush=True)
                                else:
                                    print("[STT] Empty transcription - ignoring", flush=True)
                                push_state("idle")
                time.sleep(0.005)
    except Exception as e:
        print(f"[STT] Stream error: {type(e).__name__}: {e}", flush=True)
    finally:
        stt_active = False
        print("[STT] Loop exited.", flush=True)

def bored_loop():
    global _bored, _last_activity
    _last_activity = time.time()
    while True:
        time.sleep(2.0)
        if not stt_active:
            _last_activity = time.time()
            if _bored:
                _bored = False
            continue
        elapsed = time.time() - _last_activity
        if elapsed >= BORED_TIMEOUT and not _bored:
            _bored = True
            push_event({"type": "emote", "name": "sleep"})
            push_state("idle")
            backend_log("[BORED] Entered sleep state.")

def handle_utterance(text: str):
    global _bored, _last_activity
    backend_log(f"[STT] Utterance: {repr(text)}")
    _last_activity = time.time()
    if _bored:
        _bored = False
        push_event({"type": "wakeup"})
        backend_log("[BORED] Waking up - sending wakeup event.")
    raw_reply, metrics = query_ollama(text)
    spoken, explicit_anim = parse_reply(raw_reply)
    push_event({"type": "response", "text": spoken})
    emote = explicit_anim or pick_emote(spoken)
    if emote:
        push_event({"type": "emote", "name": emote})
    log_conversation(text, raw_reply, spoken, emote, metrics)
    speak_queue.put(spoken)

# API Routes

@app.get("/status")
def status():
    return {
        "ok": True,
        "stt": stt_model_obj is not None,
        "tts": tts_model is not None,
        "stt_active": stt_active,
    }

@app.get("/settings")
def get_settings():
    return {
        "ollama_model": args.ollama_model,
        "ollama_endpoint": args.ollama_endpoint,
        "stt_model": args.stt_model,
        "stt_device": args.stt_device,
        "stt_language": args.stt_language,
        "tts_device": args.tts_device,
        "tts_volume": _tts_volume,
        "context_size": _context_size,
        "debug_log": _config["debug_log"],
        "system_prompt_suffix": _system_prompt_suffix,
    }

@app.get("/skin-data")
def skin_data():
    skin_json = _backend_dir / ".." / "public" / "assembly_data.json"
    if not skin_json.exists():
        return []
    with open(skin_json, encoding="utf-8") as f:
        return json.load(f)

@app.get("/tts-audio")
async def tts_audio(text: str):
    if not tts_model or not tts_voice:
        from fastapi import HTTPException
        raise HTTPException(503, "TTS not ready")
    try:
        audio = tts_model.generate_audio(model_state=tts_voice, text_to_generate=text)
        if hasattr(audio, 'squeeze'):
            audio_np = audio.squeeze().cpu().numpy()
        else:
            audio_np = np.array(audio).squeeze()
        buf = io.BytesIO()
        sf.write(buf, audio_np, TTS_RATE, format="WAV")
        buf.seek(0)
        return StreamingResponse(buf, media_type="audio/wav")
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(500, str(e))

@app.post("/stt-audio")
async def stt_audio_endpoint(request: Request):
    wav_bytes = await request.body()
    try:
        buf = io.BytesIO(wav_bytes)
        audio, sr = sf.read(buf)
        audio = audio.astype(np.float32)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    text = transcribe_chunk(audio)
    if text and should_process(text):
        push_event({"type": "transcription", "text": text})
        threading.Thread(target=handle_utterance, args=(text,), daemon=True).start()
        return {"ok": True, "text": text}
    return {"ok": True, "text": ""}

@app.post("/chat-text")
async def chat_text(body: dict):
    text = body.get("text", "").strip()
    if text and should_process(text):
        push_event({"type": "transcription", "text": text})
        threading.Thread(target=handle_utterance, args=(text,), daemon=True).start()
        return {"ok": True}
    return {"ok": False, "reason": "filtered"}

@app.get("/diagnose")
def diagnose():
    ollama_ok    = False
    model_found  = False
    available    = []
    ollama_error = ""
    try:
        with urllib.request.urlopen(
            f"{args.ollama_endpoint}/api/tags", timeout=4
        ) as r:
            d = json.loads(r.read())
            available = [m["name"] for m in d.get("models", [])]
            ollama_ok = True
            model_found = any(
                args.ollama_model == m or args.ollama_model in m
                for m in available
            )
    except urllib.error.URLError as e:
        ollama_error = f"Cannot reach Ollama: {e.reason}"
    except Exception as e:
        ollama_error = str(e)

    return {
        "ollama_running":    ollama_ok,
        "model_found":       model_found,
        "configured_model":  args.ollama_model,
        "available_models":  available,
        "ollama_error":      ollama_error,
        "stt_loaded":        stt_model_obj is not None,
        "tts_loaded":        tts_model is not None,
        "stt_active":        stt_active,
        "stt_model":         args.stt_model,
        "stt_device":        args.stt_device,
        "tts_device":        args.tts_device,
    }

@app.post("/start")
def start_stt():
    global stt_active, stt_thread
    if stt_active:
        return {"ok": True, "msg": "already running"}
    _stop_stt.clear()
    stt_active = True
    stt_thread = threading.Thread(target=stt_loop, daemon=True)
    stt_thread.start()
    return {"ok": True}

@app.post("/stop")
def stop_stt():
    global stt_active
    _stop_stt.set()
    stt_active = False
    return {"ok": True}

@app.post("/speak")
async def speak_endpoint(body: dict):
    speak_queue.put(body.get("text", ""))
    return {"ok": True}

@app.post("/clear-history")
def clear_history_endpoint():
    history.clear()
    print("[LLM] History cleared.", flush=True)
    return {"ok": True}

@app.post("/settings")
async def update_settings(body: dict):
    global stt_thread, stt_active, stt_model_obj, _context_size, _tts_volume, _system_prompt_suffix
    restart_stt_needed = False

    if "ollama_model" in body:
        args.ollama_model = body["ollama_model"]
        print(f"[LLM] Model → {args.ollama_model}", flush=True)
    if "ollama_endpoint" in body:
        args.ollama_endpoint = body["ollama_endpoint"]
        print(f"[LLM] Endpoint → {args.ollama_endpoint}", flush=True)
    if "stt_model" in body and body["stt_model"] != args.stt_model:
        args.stt_model = body["stt_model"]
        stt_model_obj = None
        _models_ready.clear()
        threading.Thread(target=load_stt, daemon=True).start()
    if "stt_device" in body and body["stt_device"] != args.stt_device:
        args.stt_device = body["stt_device"]
        print(f"[STT] Device → {args.stt_device}", flush=True)
        restart_stt_needed = True
    if "stt_language" in body and body["stt_language"] != args.stt_language:
        args.stt_language = body["stt_language"]
        print(f"[STT] Language → {args.stt_language}", flush=True)
    if "tts_device" in body:
        args.tts_device = body["tts_device"]
        print(f"[TTS] Device → {args.tts_device}", flush=True)
    if "tts_volume" in body:
        _tts_volume = float(body["tts_volume"])
        print(f"[TTS] Volume → {_tts_volume}", flush=True)
    if "debug_log" in body:
        _config["debug_log"] = bool(body["debug_log"])
        print(f"[DEBUG] Conversation log: {_config['debug_log']}", flush=True)
    if "context_size" in body:
        _context_size = int(body["context_size"])
        print(f"[LLM] Context size → {_context_size}", flush=True)
    if "system_prompt_suffix" in body:
        _system_prompt_suffix = str(body["system_prompt_suffix"])
        print(f"[LLM] System prompt suffix updated ({len(_system_prompt_suffix)} chars)", flush=True)

    if restart_stt_needed and stt_active:
        _stop_stt.set()
        await asyncio.sleep(0.25)
        _stop_stt.clear()
        stt_active = True
        stt_thread = threading.Thread(target=stt_loop, daemon=True)
        stt_thread.start()

    return {"ok": True}


@app.post("/activity")
async def set_activity(body: dict):
    global stt_active, stt_thread, _bored
    mode = body.get("mode", "active")
    if mode == "sleep":
        _bored = True
        push_event({"type": "emote", "name": "sleep"})
        push_state("idle")
        if stt_active:
            _stop_stt.set()
            stt_active = False
    elif mode == "quiet":
        _bored = False
        if stt_active:
            _stop_stt.set()
            stt_active = False
    else:
        _bored = False
        if not stt_active:
            _stop_stt.clear()
            stt_active = True
            stt_thread = threading.Thread(target=stt_loop, daemon=True)
            stt_thread.start()
    return {"ok": True}

@app.post("/activity/ping")
async def activity_ping():
    global _last_activity, _bored
    _last_activity = time.time()
    if _bored:
        _bored = False
        push_event({"type": "wakeup"})
    return {"ok": True}

@app.get("/devices")
def get_devices():
    devs = sd.query_devices()
    return {
        "inputs":  [d["name"] for d in devs if d["max_input_channels"] > 0],
        "outputs": [d["name"] for d in devs if d["max_output_channels"] > 0],
    }

@app.get("/events")
async def sse_events():
    async def generate():
        while True:
            try:
                evt = event_queue.get_nowait()
                yield f"data: {json.dumps(evt)}\n\n"
            except queue.Empty:
                await asyncio.sleep(0.1)
                yield ": heartbeat\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    q: asyncio.Queue = asyncio.Queue(maxsize=64)
    ws_queues.append(q)
    try:
        async def sender():
            while True:
                evt = await q.get()
                await ws.send_json(evt)

        async def receiver():
            global mobile_connected
            while True:
                data = await ws.receive_text()
                try:
                    msg = json.loads(data)
                except json.JSONDecodeError:
                    continue
                t = msg.get("type")
                if t == "ping":
                    await ws.send_json({"type": "pong"})
                elif t == "emote":
                    push_event({"type": "emote", "name": msg.get("name", "chirp")})
                elif t == "utterance":
                    text = msg.get("text", "").strip()
                    if text and should_process(text):
                        push_event({"type": "transcription", "text": text})
                        threading.Thread(target=handle_utterance, args=(text,), daemon=True).start()
                elif t == "mobile_connected":
                    mobile_connected = True
                    if stt_active:
                        _stop_stt.set()
                        stt_active = False
                        push_event({"type": "mobile_mode", "active": True})
                elif t == "mobile_disconnected":
                    mobile_connected = False
                    if not stt_active:
                        _stop_stt.clear()
                        stt_active = True
                        stt_thread = threading.Thread(target=stt_loop, daemon=True)
                        stt_thread.start()
                        push_event({"type": "mobile_mode", "active": False})

        await asyncio.gather(sender(), receiver())
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if q in ws_queues:
            ws_queues.remove(q)

# Startup

def find_free_port() -> int:
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]

if __name__ == "__main__":
    port = find_free_port()
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    backend_log(f"[START] Rocky backend v2 - Ollama={args.ollama_endpoint}  Model={args.ollama_model}  STT={args.stt_model}  Port={port}  Host={host}")
    print(f"PORT:{port}", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="warning")
