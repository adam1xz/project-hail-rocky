
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
from collections import deque
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


parser = argparse.ArgumentParser()
parser.add_argument("--voice-ref",       default="update/tts/_rocky_mono.wav")
parser.add_argument("--ollama-endpoint", default="http://localhost:11434")
parser.add_argument("--ollama-model",    default="Rockyv8:latest")
parser.add_argument("--stt-model",       choices=["faster", "better"], default="better")
parser.add_argument("--stt-device",      default="default")
parser.add_argument("--stt-language",    default="auto")
parser.add_argument("--stt-mode",        choices=["auto", "model", "external"], default="auto")
parser.add_argument("--tts-device",      default="default")
parser.add_argument("--lan",             action="store_true", help="Bind to 0.0.0.0 for LAN access")
args = parser.parse_args()


SAMPLE_RATE = 16000
TTS_RATE    = 24000

_loop: Optional[asyncio.AbstractEventLoop] = None
ws_queues: list = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop
    _loop = asyncio.get_event_loop()
    threading.Thread(target=load_tts, daemon=True).start()
    threading.Thread(target=load_stt, daemon=True).start()
    threading.Thread(target=bored_loop, daemon=True).start()
    threading.Thread(target=speak_worker, daemon=True).start()
    await asyncio.get_event_loop().run_in_executor(
        None, lambda: _models_ready.wait(timeout=45)
    )
    global _model_audio_capable
    _model_audio_capable = check_model_audio_capability()
    start_stt()
    yield

app = FastAPI(title="Rocky Backend", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Static file mounts - conditional on directory existence
_backend_dir = Path(__file__).parent
_skin_dir = _backend_dir / ".." / "public" / "extracted_pieces"
_skins_root = _backend_dir / ".." / "public" / "skins"
_flutter_web_dir = _backend_dir / "flutter_web"

if _skin_dir.exists():
    app.mount("/skin", StaticFiles(directory=str(_skin_dir)), name="skin")

if _skins_root.exists():
    app.mount("/skins", StaticFiles(directory=str(_skins_root)), name="skins")

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
BORED_TIMEOUT         = 120.0
_HAS_TTS_STREAM       = False
_audio_lock           = threading.Lock()
_current_player       = None
_model_audio_capable  = False

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

def load_tts():
    global tts_model, tts_voice, _HAS_TTS_STREAM
    try:
        from pocket_tts import TTSModel
        print("Loading TTS...", flush=True)
        tts_model = TTSModel.load_model()

        _HAS_TTS_STREAM = hasattr(tts_model, 'generate_audio_stream')
        if _HAS_TTS_STREAM:
            backend_log("[TTS] Native streaming generation available")
        else:
            backend_log("[TTS] Streaming NOT available - will use chunked fallback")

        ref = Path(args.voice_ref)
        safetensors_path = ref.with_suffix(".safetensors")

        if safetensors_path.exists():
            print(f"[TTS] Loading cached voice state from {safetensors_path}...", flush=True)
            loaded = False
            try:
                from pocket_tts import import_model_state
                tts_voice = import_model_state(str(safetensors_path))
                backend_log("[TTS] Voice state loaded from safetensors cache")
                loaded = True
            except ImportError:
                pass
            except Exception as e:
                backend_log(f"[TTS] import_model_state failed: {e}")

            if not loaded:
                try:
                    import torch
                    tts_voice = torch.load(str(safetensors_path), weights_only=False)
                    backend_log("[TTS] Voice state loaded from torch cache")
                    loaded = True
                except Exception as e:
                    backend_log(f"[TTS] torch.load failed: {e} - deleting bad cache, recomputing from WAV")
                    try:
                        safetensors_path.unlink()
                    except Exception:
                        pass

        if not tts_voice and ref.exists():
            print(f"[TTS] Computing voice state from {ref}...", flush=True)
            tts_voice = tts_model.get_state_for_audio_prompt(str(ref))
            try:
                from pocket_tts import export_model_state
                export_model_state(tts_voice, str(safetensors_path))
                backend_log(f"[TTS] Voice state cached to {safetensors_path}")
            except (ImportError, Exception) as cache_err:
                try:
                    import torch
                    torch.save(tts_voice, str(safetensors_path))
                    backend_log(f"[TTS] Voice state cached (torch format) to {safetensors_path}")
                except Exception as e2:
                    backend_log(f"[TTS] Could not cache voice state: {e2}")

        if tts_voice:
            _ = tts_model.generate_audio(model_state=tts_voice, text_to_generate=".")
            backend_log("[TTS] Voice warmup complete")
        else:
            backend_log("[TTS] WARNING: tts_voice is None - TTS will be silent")

        print("TTS ready.", flush=True)
    except Exception as e:
        backend_log(f"[TTS] Fatal error: {e}")
        print(f"TTS unavailable: {e}", flush=True)

class StreamingAudioPlayer:
    """
    Gapless audio player using sounddevice callback + deque buffer.
    Pre-buffers 250ms before starting playback to absorb timing jitter
    between sentences.
    """
    PREBUFFER_SECONDS = 0.25

    def __init__(self, sample_rate: int = 24000, device=None):
        self.sample_rate = sample_rate
        self.device = device
        self._chunks: deque = deque()
        self._current_chunk = None
        self._current_pos = 0
        self._lock = threading.Lock()
        self._done = False
        self._finished = threading.Event()
        self._stream_started = False
        self._total_buffered = 0
        self._prebuffer_target = int(self.PREBUFFER_SECONDS * sample_rate)
        self._stream = None

    def feed(self, audio: np.ndarray):
        audio = audio.astype(np.float32).ravel()
        should_start = False
        with self._lock:
            self._chunks.append(audio)
            self._total_buffered += len(audio)
            if not self._stream_started and self._total_buffered >= self._prebuffer_target:
                self._stream_started = True
                should_start = True
        if should_start:
            self._create_and_start_stream()

    def signal_end(self):
        with self._lock:
            self._done = True

    def wait_done(self, timeout: float = 60.0):
        with self._lock:
            if not self._stream_started and self._total_buffered > 0:
                self._stream_started = True
            if not self._stream_started:
                return
        self._create_and_start_stream()
        self._finished.wait(timeout=timeout)
        self._cleanup()

    def cancel(self):
        with self._lock:
            self._chunks.clear()
            self._current_chunk = None
            self._current_pos = 0
            self._done = True
        self._finished.set()
        self._cleanup()

    def _create_and_start_stream(self):
        if self._stream is not None:
            try:
                self._stream.start()
            except Exception:
                pass
            return

        blocksize = int(0.05 * self.sample_rate)

        def callback(outdata, frames, _time, _status):
            with self._lock:
                written = 0
                while written < frames:
                    if self._current_chunk is not None and self._current_pos < len(self._current_chunk):
                        available = len(self._current_chunk) - self._current_pos
                        to_read = min(available, frames - written)
                        outdata[written:written + to_read, 0] = \
                            self._current_chunk[self._current_pos:self._current_pos + to_read]
                        self._current_pos += to_read
                        written += to_read
                    elif self._chunks:
                        self._current_chunk = self._chunks.popleft()
                        self._current_pos = 0
                    else:
                        outdata[written:, 0] = 0
                        if self._done:
                            self._finished.set()
                        break

        self._stream = sd.OutputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype='float32',
            callback=callback,
            blocksize=blocksize,
            device=self.device,
        )
        self._stream.start()

    def _cleanup(self):
        if self._stream:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None


class SentenceAccumulator:
    """
    Accumulates LLM stream tokens and yields complete speakable chunks
    as soon as a sentence boundary is detected.
    """
    SENTENCE_END = re.compile(r'[.!?]')
    COMMA_SPLIT  = re.compile(r'[,;:]\s+')
    EMOTE_TAG    = re.compile(r'\[([^\]]+)\]')

    def __init__(self, max_chunk_words: int = 12):
        self.buffer = ""
        self.max_chunk_words = max_chunk_words
        self.pending_emote = None
        self._emote_checked = False

    def add_token(self, token: str) -> list:
        self.buffer += token
        return self._extract_chunks()

    def flush(self) -> list:
        remaining = self.buffer.strip()
        self.buffer = ""
        if remaining:
            clean = self.EMOTE_TAG.sub('', remaining).strip()
            if clean:
                return [clean]
        return []

    def _extract_chunks(self) -> list:
        chunks = []

        if not self._emote_checked:
            m = re.match(r'^\s*\[([^\]]+)\]\s*', self.buffer)
            if m:
                tag = m.group(1).strip().lower().replace(' ', '_')
                if tag in VALID_ANIMS:
                    self.pending_emote = tag
                self.buffer = self.buffer[m.end():]
            if self.buffer.strip() and not re.match(r'^\s*\[', self.buffer):
                self._emote_checked = True

        while True:
            m = self.SENTENCE_END.search(self.buffer)
            if m:
                raw_chunk = self.buffer[:m.end()]
                self.buffer = self.buffer[m.end():].lstrip()
                clean = self.EMOTE_TAG.sub('', raw_chunk).strip()
                if clean:
                    chunks.append(clean)
            else:
                break

        if self.buffer:
            clean = self.EMOTE_TAG.sub('', self.buffer).strip()
            words = clean.split()
            if len(words) >= self.max_chunk_words:
                m = self.COMMA_SPLIT.search(self.buffer)
                if m:
                    raw_chunk = self.buffer[:m.end()]
                    self.buffer = self.buffer[m.end():].lstrip()
                    clean_chunk = self.EMOTE_TAG.sub('', raw_chunk).strip()
                    if clean_chunk:
                        chunks.append(clean_chunk)
                else:
                    split_at = self.max_chunk_words
                    raw_chunk = " ".join(words[:split_at])
                    self.buffer = " ".join(words[split_at:])
                    if raw_chunk:
                        chunks.append(raw_chunk)

        return chunks


def _stream_tts(text: str, audio_sink, is_first: bool = False):
    """
    Stream TTS audio for text into audio_sink.
    audio_sink can be a StreamingAudioPlayer or a callable(chunk_np, is_first, is_final).
    """
    if not tts_model or not tts_voice:
        return

    def _feed(chunk_np: np.ndarray, final: bool = False):
        if chunk_np.size == 0:
            return
        if _tts_volume != 1.0:
            chunk_np = chunk_np * _tts_volume
        chunk_np = chunk_np.astype(np.float32)
        if isinstance(audio_sink, StreamingAudioPlayer):
            audio_sink.feed(chunk_np)
        elif callable(audio_sink):
            audio_sink(chunk_np, is_first=is_first, is_final=final)

    if _HAS_TTS_STREAM:
        for chunk in tts_model.generate_audio_stream(
            model_state=tts_voice, text_to_generate=text
        ):
            chunk_np = chunk.squeeze().cpu().numpy() if hasattr(chunk, 'cpu') else np.array(chunk).squeeze()
            _feed(chunk_np)
    else:
        audio = tts_model.generate_audio(model_state=tts_voice, text_to_generate=text)
        chunk_np = audio.squeeze().cpu().numpy() if hasattr(audio, 'cpu') else np.array(audio).squeeze()
        _feed(chunk_np, final=True)


def speak(text: str):
    if not tts_model or not tts_voice:
        print(f"[TTS] Skipped (no model): {repr(text[:40])}", flush=True)
        return
    if mobile_connected:
        push_state("speaking")
        approx_seconds = max(0.6, len(text) / 15.0)
        time.sleep(approx_seconds)
        push_state("idle")
        return
    try:
        audio = tts_model.generate_audio(model_state=tts_voice, text_to_generate=text)
        audio_np = audio.squeeze().cpu().numpy() if hasattr(audio, 'squeeze') else np.array(audio).squeeze()
        if _tts_volume != 1.0:
            audio_np = audio_np * _tts_volume
        device = None if args.tts_device == "default" else args.tts_device
        push_state("speaking")
        sd.play(audio_np.astype(np.float32), samplerate=TTS_RATE, device=device)
        sd.wait()
        push_state("idle")
    except Exception as e:
        print(f"[TTS] Error: {e}", flush=True)
        push_state("idle")


def speak_worker():
    while True:
        text = speak_queue.get()
        if text is None:
            break
        with _audio_lock:
            speak(text)
        speak_queue.task_done()

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


def query_ollama_streaming(user_text: str):
    """
    Stream tokens from Ollama. Yields (token, full_reply_so_far).
    On error, yields remaining fallback text as a single token.
    """
    history.append({"role": "user", "content": user_text})
    if len(history) > _context_size:
        del history[:-_context_size]

    context_messages = history[-_context_size:]
    full_prompt = SYSTEM_PROMPT + ("\n\n" + _system_prompt_suffix if _system_prompt_suffix else "")
    messages = [{"role": "system", "content": full_prompt}] + context_messages
    payload = json.dumps({
        "model": args.ollama_model,
        "messages": messages,
        "stream": True,
        "options": {"num_predict": 60},
    }).encode()

    full_reply = ""
    start_time = time.time()
    backend_log(f"[LLM-STREAM] >>> User: {repr(user_text)}")

    try:
        req = urllib.request.Request(
            f"{args.ollama_endpoint}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            for raw_line in resp:
                line = raw_line.decode('utf-8').strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if data.get("done", False):
                    elapsed = time.time() - start_time
                    eval_count = data.get("eval_count", 0)
                    eval_dur = data.get("eval_duration", 0) / 1e9
                    tps = eval_count / eval_dur if eval_dur > 0 else 0
                    backend_log(
                        f"[LLM-STREAM] <<< Done ({elapsed:.2f}s | "
                        f"{eval_count} tok @ {tps:.1f} t/s): {repr(full_reply)}"
                    )
                    break

                token = data.get("message", {}).get("content", "")
                if token:
                    full_reply += token
                    yield token, full_reply

        if full_reply:
            history.append({"role": "assistant", "content": full_reply})

    except Exception as e:
        backend_log(f"[LLM-STREAM] Error: {type(e).__name__}: {e}")
        if not full_reply:
            fallback = random.choice(FALLBACK_RESPONSES)
            history.append({"role": "assistant", "content": fallback})
            yield fallback, fallback


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

def check_model_audio_capability() -> bool:
    """Check if the configured Ollama model reports audio capability."""
    try:
        payload = json.dumps({"name": args.ollama_model}).encode()
        req = urllib.request.Request(
            f"{args.ollama_endpoint}/api/show",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
            caps = data.get("capabilities", [])
            has_audio = "audio" in caps
            backend_log(f"[CAPS] Model={args.ollama_model} capabilities={caps} audio={has_audio}")
            return has_audio
    except Exception as e:
        backend_log(f"[CAPS] Could not check capabilities: {e}")
        return False


def query_ollama_streaming_with_audio(audio_np: np.ndarray):
    """Stream Ollama response for an audio user message (model-native STT)."""
    import base64

    # Save debug copy so the clip can be inspected
    debug_wav_path = _log_dir / "debug_audio_latest.wav"
    sf.write(str(debug_wav_path), audio_np, SAMPLE_RATE)
    duration = len(audio_np) / SAMPLE_RATE
    backend_log(f"[STT-MODEL] Audio clip: {duration:.2f}s, saved to {debug_wav_path}")

    wav_buf = io.BytesIO()
    sf.write(wav_buf, audio_np, SAMPLE_RATE, format="WAV")
    audio_b64 = base64.b64encode(wav_buf.getvalue()).decode("ascii")
    backend_log(f"[STT-MODEL] Encoded size: {len(audio_b64)} chars base64")

    history.append({"role": "user", "content": "[voice message]"})
    if len(history) > _context_size:
        del history[:-_context_size]

    context_messages = history[-_context_size:]
    full_prompt = SYSTEM_PROMPT + ("\n\n" + _system_prompt_suffix if _system_prompt_suffix else "")
    prior = list(context_messages[:-1])
    audio_msg = {"role": "user", "content": "", "audio": [audio_b64]}
    messages = [{"role": "system", "content": full_prompt}] + prior + [audio_msg]

    payload = json.dumps({
        "model": args.ollama_model,
        "messages": messages,
        "stream": True,
        "options": {"num_predict": 60},
    }).encode()
    backend_log(f"[STT-MODEL] Payload size: {len(payload)} bytes, model={args.ollama_model}")

    full_reply = ""
    start_time = time.time()
    first_response_logged = False
    backend_log("[LLM-STREAM-AUDIO] Sending audio message to model")

    try:
        req = urllib.request.Request(
            f"{args.ollama_endpoint}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            for raw_line in resp:
                line = raw_line.decode('utf-8').strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not first_response_logged:
                    first_response_logged = True
                    backend_log(f"[LLM-STREAM-AUDIO] First response keys: {list(data.keys())}")
                    if "error" in data:
                        backend_log(f"[LLM-STREAM-AUDIO] ERROR from Ollama: {data['error']}")
                if data.get("done", False):
                    elapsed = time.time() - start_time
                    eval_count = data.get("eval_count", 0)
                    eval_dur = data.get("eval_duration", 0) / 1e9
                    tps = eval_count / eval_dur if eval_dur > 0 else 0
                    backend_log(f"[LLM-STREAM-AUDIO] Done ({elapsed:.2f}s | {eval_count} tok @ {tps:.1f} t/s): {repr(full_reply)}")
                    break
                token = data.get("message", {}).get("content", "")
                if token:
                    full_reply += token
                    yield token, full_reply
        if full_reply:
            history.append({"role": "assistant", "content": full_reply})
    except Exception as e:
        backend_log(f"[LLM-STREAM-AUDIO] Error: {type(e).__name__}: {e}")
        if not full_reply:
            fallback = random.choice(FALLBACK_RESPONSES)
            history.append({"role": "assistant", "content": fallback})
            yield fallback, fallback


def _write_wav_tmp(audio: np.ndarray, sample_rate: int) -> str:
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    sf.write(path, audio, sample_rate)
    return path

def _normalize_audio(chunk: np.ndarray) -> np.ndarray:
    peak = np.max(np.abs(chunk))
    if peak > 0.01:
        chunk = chunk * (0.9 / peak)
    return chunk

def transcribe_chunk(chunk: np.ndarray) -> str:
    global stt_model_obj
    if not stt_model_obj:
        return ""
    chunk = _normalize_audio(chunk)
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
                segs, _ = model.transcribe(tmp, beam_size=5, language=lang, vad_filter=True)
                return " ".join(s.text.strip() for s in segs).strip()
            finally:
                os.unlink(tmp)
    except Exception as e:
        print(f"[STT] Transcription error: {type(e).__name__}: {e}", flush=True)
        stt_model_obj = None
        threading.Thread(target=load_stt, daemon=True).start()
        return ""

SILENCE_RMS    = 0.018
SILENCE_SECS   = 0.7
PREROLL_SECS   = 0.3
MIN_UTTER_SECS = 0.8

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
                            effective_mode = args.stt_mode
                            if effective_mode == "auto":
                                effective_mode = "model" if _model_audio_capable else "external"
                            if effective_mode == "model" and not _model_audio_capable:
                                backend_log("[STT-MODEL] Model has no audio capability - falling back to external STT")
                                effective_mode = "external"
                            captured     = buf.copy()
                            buf          = np.zeros(0, dtype=np.float32)
                            preroll      = np.zeros(0, dtype=np.float32)
                            silence_run  = 0
                            was_speaking = False
                            if effective_mode == "model":
                                handle_utterance_with_audio(captured)
                            else:
                                text = transcribe_chunk(captured)
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

    with _audio_lock:
        device = None if args.tts_device == "default" else args.tts_device

        # Phase 1: Stream LLM and collect all sentences
        accumulator = SentenceAccumulator(max_chunk_words=10)
        raw_reply = ""
        sentences = []

        try:
            for token, full_reply_so_far in query_ollama_streaming(text):
                raw_reply = full_reply_so_far
                sentences.extend(accumulator.add_token(token))
            sentences.extend(accumulator.flush())
        except Exception as e:
            backend_log(f"[PIPELINE] LLM error: {e}")
            if not raw_reply:
                raw_reply = random.choice(FALLBACK_RESPONSES)
                sentences = [raw_reply]

        # Phase 2: Push response text and emote immediately (bubble shows now)
        spoken, explicit_anim = parse_reply(raw_reply)
        emote = accumulator.pending_emote or explicit_anim or pick_emote(spoken)
        push_event({"type": "response", "text": spoken})
        if emote:
            push_event({"type": "emote", "name": emote})

        # Phase 3: TTS + audio playback
        if mobile_connected:
            mobile_seq = [0]

            def mobile_sink(chunk_np, is_first=False, is_final=False):
                import base64
                pcm_int16 = (chunk_np.clip(-1, 1) * 32767).astype(np.int16).tobytes()
                push_event({
                    "type": "audio_chunk",
                    "pcm_b64": base64.b64encode(pcm_int16).decode('ascii'),
                    "sample_rate": TTS_RATE,
                    "channels": 1,
                    "dtype": "int16",
                    "seq": mobile_seq[0],
                    "is_first": is_first and mobile_seq[0] == 0,
                    "is_final": is_final,
                })
                mobile_seq[0] += 1

            for i, sentence in enumerate(sentences):
                try:
                    _stream_tts(sentence, mobile_sink, is_first=(i == 0))
                except Exception as e:
                    backend_log(f"[TTS] Error on sentence {repr(sentence[:30])}: {e}")
            push_event({
                "type": "audio_chunk",
                "pcm_b64": "",
                "sample_rate": TTS_RATE,
                "seq": -1,
                "is_first": False,
                "is_final": True,
            })
            push_state("idle")
        elif tts_model and tts_voice and sentences:
            push_state("speaking")
            backend_log(f"[TTS] Playing {len(sentences)} sentence(s)")
            for sentence in sentences:
                try:
                    audio = tts_model.generate_audio(model_state=tts_voice, text_to_generate=sentence)
                    audio_np = audio.squeeze().cpu().numpy() if hasattr(audio, 'squeeze') else np.array(audio).squeeze()
                    if _tts_volume != 1.0:
                        audio_np = audio_np * _tts_volume
                    sd.play(audio_np.astype(np.float32), samplerate=TTS_RATE, device=device)
                    sd.wait()
                except Exception as e:
                    backend_log(f"[TTS] Error on sentence {repr(sentence[:30])}: {e}")
            push_state("idle")
        else:
            if sentences:
                backend_log(f"[TTS] Skipped - tts_model={tts_model is not None} tts_voice={tts_voice is not None} sentences={len(sentences)}")
            push_state("idle")

        metrics = {
            "elapsed": 0, "eval_count": 0, "tokens_per_sec": 0,
            "context_messages": len(history), "fallback": False,
        }
        log_conversation(text, raw_reply, spoken, emote, metrics)


def handle_utterance_with_audio(audio_input: np.ndarray):
    """Handle a voice utterance using the model's native audio input. No user bubble is shown."""
    global _bored, _last_activity
    backend_log("[STT-MODEL] Processing audio utterance via model-native input")
    _last_activity = time.time()
    if _bored:
        _bored = False
        push_event({"type": "wakeup"})
        backend_log("[BORED] Waking up - sending wakeup event.")

    with _audio_lock:
        device = None if args.tts_device == "default" else args.tts_device

        accumulator = SentenceAccumulator(max_chunk_words=10)
        raw_reply = ""
        sentences = []

        try:
            for token, full_reply_so_far in query_ollama_streaming_with_audio(audio_input):
                raw_reply = full_reply_so_far
                sentences.extend(accumulator.add_token(token))
            sentences.extend(accumulator.flush())
        except Exception as e:
            backend_log(f"[PIPELINE-AUDIO] LLM error: {e}")
            if not raw_reply:
                raw_reply = random.choice(FALLBACK_RESPONSES)
                sentences = [raw_reply]

        spoken, explicit_anim = parse_reply(raw_reply)
        emote = accumulator.pending_emote or explicit_anim or pick_emote(spoken)
        push_event({"type": "response", "text": spoken})
        if emote:
            push_event({"type": "emote", "name": emote})

        if mobile_connected:
            mobile_seq = [0]

            def mobile_sink(chunk_np, is_first=False, is_final=False):
                import base64
                pcm_int16 = (chunk_np.clip(-1, 1) * 32767).astype(np.int16).tobytes()
                push_event({
                    "type": "audio_chunk",
                    "pcm_b64": base64.b64encode(pcm_int16).decode('ascii'),
                    "sample_rate": TTS_RATE,
                    "channels": 1,
                    "dtype": "int16",
                    "seq": mobile_seq[0],
                    "is_first": is_first and mobile_seq[0] == 0,
                    "is_final": is_final,
                })
                mobile_seq[0] += 1

            for i, sentence in enumerate(sentences):
                try:
                    _stream_tts(sentence, mobile_sink, is_first=(i == 0))
                except Exception as e:
                    backend_log(f"[TTS] Error on sentence {repr(sentence[:30])}: {e}")
            push_event({
                "type": "audio_chunk",
                "pcm_b64": "", "sample_rate": TTS_RATE,
                "seq": -1, "is_first": False, "is_final": True,
            })
            push_state("idle")
        elif tts_model and tts_voice and sentences:
            push_state("speaking")
            backend_log(f"[TTS] Playing {len(sentences)} sentence(s)")
            for sentence in sentences:
                try:
                    tts_out = tts_model.generate_audio(model_state=tts_voice, text_to_generate=sentence)
                    tts_np = tts_out.squeeze().cpu().numpy() if hasattr(tts_out, 'squeeze') else np.array(tts_out).squeeze()
                    if _tts_volume != 1.0:
                        tts_np = tts_np * _tts_volume
                    sd.play(tts_np.astype(np.float32), samplerate=TTS_RATE, device=device)
                    sd.wait()
                except Exception as e:
                    backend_log(f"[TTS] Error on sentence {repr(sentence[:30])}: {e}")
            push_state("idle")
        else:
            if sentences:
                backend_log(f"[TTS] Skipped - tts_model={tts_model is not None} tts_voice={tts_voice is not None} sentences={len(sentences)}")
            push_state("idle")

        metrics = {
            "elapsed": 0, "eval_count": 0, "tokens_per_sec": 0,
            "context_messages": len(history), "fallback": False,
        }
        log_conversation("[voice message]", raw_reply, spoken, emote, metrics)

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

@app.get("/skin-layout")
def skin_layout(id: str = "rocky"):
    """Per-part PCA layout for the Flutter companion. Generated by
    SKIN/skin_layout.py at skin-import time. Filenames in the response
    resolve under /skins/<id>/."""
    safe_id = id.replace("/", "").replace("\\", "").replace("..", "")
    layout = _skins_root / safe_id / "layout.json"
    if not layout.exists():
        return {"id": safe_id, "parts": []}
    with open(layout, encoding="utf-8") as f:
        return {"id": safe_id, "parts": json.load(f)}

@app.get("/skin-list")
def skin_list():
    skins_json = _skins_root / "skins.json"
    if not skins_json.exists():
        return []
    with open(skins_json, encoding="utf-8") as f:
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

@app.get("/tts-audio-stream")
async def tts_audio_stream(text: str):
    """Stream TTS audio as 16-bit PCM chunks. Low latency for HTTP clients."""
    if not tts_model or not tts_voice:
        from fastapi import HTTPException
        raise HTTPException(503, "TTS not ready")

    def audio_generator():
        if _HAS_TTS_STREAM:
            for chunk in tts_model.generate_audio_stream(
                model_state=tts_voice, text_to_generate=text
            ):
                chunk_np = chunk.squeeze().cpu().numpy() if hasattr(chunk, 'cpu') else np.array(chunk).squeeze()
                if chunk_np.size > 0:
                    if _tts_volume != 1.0:
                        chunk_np = chunk_np * _tts_volume
                    yield (chunk_np.clip(-1, 1) * 32767).astype(np.int16).tobytes()
        else:
            audio = tts_model.generate_audio(model_state=tts_voice, text_to_generate=text)
            chunk_np = audio.squeeze().cpu().numpy() if hasattr(audio, 'cpu') else np.array(audio).squeeze()
            if _tts_volume != 1.0:
                chunk_np = chunk_np * _tts_volume
            yield (chunk_np.clip(-1, 1) * 32767).astype(np.int16).tobytes()

    return StreamingResponse(
        audio_generator(),
        media_type="audio/pcm",
        headers={"X-Sample-Rate": str(TTS_RATE), "X-Channels": "1", "X-Dtype": "int16"},
    )


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
        "audio_capable":     _model_audio_capable,
        "stt_mode":          args.stt_mode,
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
    global stt_thread, stt_active, stt_model_obj, _context_size, _tts_volume, _system_prompt_suffix, _model_audio_capable
    restart_stt_needed = False

    if "ollama_model" in body:
        args.ollama_model = body["ollama_model"]
        print(f"[LLM] Model → {args.ollama_model}", flush=True)
        _model_audio_capable = check_model_audio_capability()
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
    if "stt_mode" in body and body["stt_mode"] in ("auto", "model", "external"):
        args.stt_mode = body["stt_mode"]
        print(f"[STT] Mode → {args.stt_mode}", flush=True)
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
            global mobile_connected, stt_active, stt_thread
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
                    # Ack so Flutter knows the flag is set before it relies on
                    # /tts-audio (avoids race where first response plays on desktop)
                    await ws.send_json({"type": "mobile_ack"})
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
