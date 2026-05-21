# Project Hail Rocky - Desktop

Rocky is an animated alien from Andy Weir's *Project Hail Mary* who lives in the corner of your screen, listens to you through your mic, thinks with a local LLM, and talks back in a voice you'd recognize from the book. No cloud. No subscriptions. Everything runs on your machine.

He bounces around the screen. You can drag him, throw him against walls, watch him panic when he goes airborne too long. He falls asleep if you ignore him for two minutes. He has opinions and expresses them in exactly the wrong number of words.

---

## What's inside

```
electron/          Electron main process - windows, tray, IPC, backend lifecycle
src/               React + TypeScript renderer - Rocky's animator, settings UI
AI/backend.py      FastAPI backend - STT (Whisper), LLM (Ollama), TTS (pocket_tts)
public/extracted_pieces/   Rocky's skin, ~50 PNG pieces
public/assembly_data.json  Affine transform matrices for skin assembly
SKIN/              Skin tooling (splitter, importer for custom skins)
PHR - APP/         Mobile companion app (separate repo / Flutter)
```

## Requirements

- **Node.js** 18+
- **Python** 3.10+
- **[Ollama](https://ollama.com)** running locally

Pull the model:
```sh
ollama pull crafteriumt/Rockyv8
```

Python deps install automatically on first backend run, or manually:
```sh
pip install fastapi uvicorn[standard] sounddevice soundfile numpy faster-whisper pocket-tts
```

## Running

```sh
npm install
run.bat
```

On startup a small launcher appears. Pick **Desktop** to run Rocky on your screen, or **Mobile** to get a QR code your phone can scan.

---

## How it works

Electron spawns `AI/backend.py` as a subprocess. The backend prints `PORT:<n>` to stdout once the models are loaded; Electron catches that and opens an SSE event stream for real-time events (emotes, AI state, responses, transcriptions). Settings changes go back to the backend over HTTP POST.

Rocky's animation runs in the browser renderer at 60fps via `requestAnimationFrame`. The physics engine (gravity, floor/wall bounce, limb spring ragdoll, 2-bone IK) is all in `src/App.tsx` and runs entirely client-side. Backend events get forwarded from the main process to the character window via Electron IPC.

The voice is a clone built with `pocket_tts`, trained on Rocky's speech patterns. It plays through your default audio output on the desktop, or streams WAV bytes to a connected phone.

## Skin system

Rocky's body is ~50 PNG pieces. Each piece has a world-space affine transform matrix stored in `assembly_data.json`. The renderer composites them in z-order, applying per-group IK transforms on top so limbs actually move. Custom skins can be imported through Settings. Drop a PNG in the right format and the splitter in `SKIN/` does the rest.

## System tray

Rocky runs headless-ish; the character window has no taskbar entry. The tray icon gives you: hide/show, settings, pin to top, skin switcher, activity modes (active/quiet/sleep), clear AI history, restart, quit.

## Mobile

When you pick Mobile mode, the backend binds to `0.0.0.0` and a QR window appears with the connection URL. Scan it with the Rocky companion app ([PHR - APP](https://github.com/adam1xz/project-hail-rocky-app)) and Rocky shows up on your phone with accelerometer-based gravity. The desktop handles all the AI; the phone just renders and handles mic input.

---

*"Rocky is engineer. Fix things. Build things. Keep engines running."*
