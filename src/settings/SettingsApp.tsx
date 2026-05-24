import React, { useEffect, useLayoutEffect, useState, useCallback } from 'react';

const THEME_VARS: Record<string, Record<string, string>> = {
  night: {
    '--bg-a':         '#111113',
    '--bg-b':         '#1c1c22',
    '--bg-c':         '#0d0d10',
    '--border':       '#2e2e3c',
    '--text-1':       '#f4eedd',
    '--text-2':       '#b8a98a',
    '--text-3':       '#6e6252',
    '--accent':       '#c9a84c',
    '--accent-hover': '#d4b860',
    '--accent-dim':   'rgba(201,168,76,0.12)',
    '--accent-dark':  '#0d0d10',
    '--danger':       '#c94c4c',
    '--success':      '#4caa6e',
  },
  midnight: {
    '--bg-a':         '#010c1e',
    '--bg-b':         '#051428',
    '--bg-c':         '#020c1a',
    '--border':       '#0d254a',
    '--text-1':       '#fffafb',
    '--text-2':       '#a0c8c0',
    '--text-3':       '#3a6070',
    '--accent':       '#bcf0e8',
    '--accent-hover': '#cff5f0',
    '--accent-dim':   'rgba(188,240,232,0.12)',
    '--accent-dark':  '#002466',
    '--danger':       '#f08080',
    '--success':      '#80f0b8',
  },
  day: {
    '--bg-a':         '#f0f7f4',
    '--bg-b':         '#fafcfb',
    '--bg-c':         '#e5efe9',
    '--border':       '#c8d8ce',
    '--text-1':       '#37433a',
    '--text-2':       '#566059',
    '--text-3':       '#8a9a90',
    '--accent':       '#4a6b58',
    '--accent-hover': '#3d5a49',
    '--accent-dim':   'rgba(74,107,88,0.12)',
    '--accent-dark':  '#f0f7f4',
    '--danger':       '#aa3333',
    '--success':      '#3a7a52',
  },
};

function applyTheme(name: string) {
  const vars = THEME_VARS[name] || THEME_VARS.night;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

type LangCode = 'en' | 'pl' | 'es' | 'de';

const TR: Record<LangCode, Record<string, string>> = {
  en: {
    tab_general: 'General', tab_appearance: 'Appearance', tab_animations: 'Animations',
    tab_skins: 'Skins', tab_ai: 'AI', tab_credits: 'Credits',
    section_general: 'General', lbl_language: 'Language', lbl_autostart: 'Auto-start on boot',
    tip_language: 'App interface language. Some changes may require a restart.',
    tip_autostart: 'Launch Rocky automatically when you log into Windows.',
    section_appearance: 'Appearance', lbl_theme: 'Theme', lbl_skin: 'Default skin',
    lbl_skin_opacity: 'Skin visibility', tip_skin_opacity: 'Opacity of the texture skin overlay. 100% = fully visible.',
    lbl_scale: 'Scale multiplier', lbl_win_w: 'Window width (px)', lbl_win_h: 'Window height (px)',
    lbl_corner: 'Corner', lbl_fontsize: 'Font size', lbl_pintop: 'Pin to top',
    lbl_speech_bubbles: 'Speech bubbles', tip_speech_bubbles: 'Show speech bubbles when you speak or when Rocky responds.',
    lbl_floor_offset: 'Floor offset', tip_floor_offset: 'Shift the floor position up or down. Positive moves floor up (useful when taskbar is tall).',
    lbl_gravity: 'Gravity', tip_gravity: 'How fast Rocky falls and how strongly limbs hang when held by a limb. 1.0 is default.',
    tip_theme: 'Color scheme for the settings window.',
    tip_scale: 'Size of the Rocky character window. 1.0 is the native size.',
    tip_win_w: 'Width of the transparent movable zone in pixels.',
    tip_win_h: 'Height of the transparent movable zone in pixels.',
    tip_corner: 'Which screen corner Rocky snaps to. "Full window" makes the zone cover the entire display.',
    lbl_display: 'Display', tip_display: 'Which monitor Rocky appears on.',
    full_window: 'Full window',
    tip_fontsize: 'Text size in the settings window.',
    tip_pintop: 'When enabled, Rocky stays above all other windows.',
    theme_night: 'Night', theme_day: 'Day', theme_midnight: 'Midnight',
    section_playback: 'Playback', lbl_anim_speed: 'Animation speed', lbl_idle: 'Idle animation',
    btn_reset_defaults: 'Reset animation toggles',
    tip_anim_speed: 'Global playback multiplier. 1.0 is normal. Higher values speed up all animations.',
    tip_idle: 'Play random idle animations when Rocky has nothing else to do.',
    section_enabled_anims: 'Enabled animations',
    section_import_anim: 'Import animation',
    ph_anim_name: 'Animation name',
    ph_anim_script: '// paste animation script here\npush(animate(s.hands.hand1.y, s.hands.hand1.y - 150, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.y = v }));\npush(animate(s.hands.hand2.y, s.hands.hand2.y - 150, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v }));\npush(animate(s.body.x, s.body.x + 20, { duration: 0.3, ease: "easeOut", onUpdate: v => s.body.x = v }));',
    lbl_context_size: 'Context window',
    tip_context_size: 'How many previous messages Rocky remembers. Higher = longer memory, but slower and more resource-intensive.',
    btn_preview: 'Preview', btn_add: 'Add', btn_play: 'Play',
    section_skins: 'Skins',
    btn_active: 'Active', btn_select: 'Select', btn_reset_skin: 'Reset to default',
    lbl_dl_template: 'Download skin template',
    tip_dl_template: 'Download the color-coded layout used to paint a custom skin. Each region color corresponds to a specific body part.',
    section_import_skin: 'Import skin',
    ph_skin_name: 'Skin name', btn_import: 'Import',
    lbl_import_file: 'Skin image (PNG)',
    section_llm: 'Language Model (Ollama)', section_stt: 'Speech to Text', section_tts: 'Text to Speech',
    lbl_ollama_dl: 'Get Ollama', lbl_endpoint: 'Endpoint', lbl_model: 'Model',
    btn_refresh: 'Refresh',
    tip_endpoint: 'URL of your running Ollama instance. Default: http://localhost:11434',
    tip_model: 'Ollama model to use for Rocky\'s responses. Must be pulled first.',
    lbl_stt_mode: 'STT mode', lbl_stt_model: 'STT model', lbl_microphone: 'Microphone',
    lbl_stt_language: 'Recognition language', lbl_speaker: 'Speaker',
    tip_stt_mode: 'How speech input is transcribed. Auto uses model-native audio if available, otherwise falls back to Whisper. Model STT sends audio directly to the LLM. External STT always uses the local Whisper/Moonshine pipeline.',
    tip_stt_model: 'Moonshine is fast but English-only. Whisper is slower but handles multiple languages.',
    tip_microphone: 'Audio input device used for voice recognition.',
    tip_stt_language: 'Language to recognize. Auto detects automatically. Only applies to the Accurate (Whisper) model.',
    tip_speaker: 'Audio output device used for Rocky\'s voice.',
    stt_fast: 'Fast (Moonshine, English only)', stt_accurate: 'Accurate (Whisper, multilingual)',
    stt_mode_auto: 'Auto (detect from model)', stt_mode_model: 'Model STT', stt_mode_external: 'External STT (Whisper)',
    btn_save: 'Save', saving: 'Saving...', saved: 'Saved!', loading: 'Loading...',
    opt_default: 'Default',
    btn_reset_all: 'Reset all settings to defaults',
    confirm_reset_all: 'Reset ALL settings to factory defaults? This cannot be undone.',
    credits_title: 'Credits',
    importing: 'Importing...',
    import_success: 'Imported!',
    import_failed: 'Import failed',
    btn_clear_history: 'Clear conversation history',
    tip_clear_history: 'Wipe all messages from Rocky\'s memory. He will greet you fresh.',
    history_cleared: 'History cleared!',
    section_ai_status: 'System Status',
    btn_run_diagnostics: 'Refresh',
    status_checking: 'Checking...',
    status_ollama_ok: 'Ollama connected',
    status_ollama_fail: 'Ollama unreachable',
    status_model_ok: 'Model found',
    status_model_missing: 'Model not found',
    status_stt_ok: 'STT ready',
    status_stt_loading: 'STT loading',
    status_stt_fail: 'STT unavailable',
    status_tts_ok: 'TTS ready',
    status_tts_fail: 'TTS unavailable',
    status_backend_offline: 'Backend offline',
    section_debug: 'Developer / Testing',
    lbl_debug_border: 'Debug border',
    tip_debug_border: 'Show colored glow around Rocky: green = listening, red = thinking/processing, blue = speaking.',
    lbl_debug_log: 'Conversation log',
    tip_debug_log: 'Save all conversations to ~/.rocky/conversation.log for inspection.',
    lbl_developer_mode: 'Developer mode',
    tip_developer_mode: 'Show advanced settings for development and debugging. Turn off before distributing.',
    lbl_activity_mode: 'Activity',
    tip_activity_mode: 'Control Rocky\'s state. Sleep plays the sleep animation and disables voice. Quiet disables voice but keeps animations running.',
    activity_active: 'Active',
    activity_quiet: 'Quiet',
    activity_sleep: 'Sleep',
    lbl_system_prompt: 'System prompt suffix',
    tip_system_prompt: 'Extra instructions appended below [USABLE EMOTES] in the system prompt. Runs after Rocky\'s built-in personality.',
    section_audio: 'Audio',
    lbl_tts_volume: 'TTS volume',
    tip_tts_volume: 'Volume of Rocky\'s text-to-speech output.',
    btn_confirm_reset: 'Yes, reset everything',
    btn_cancel: 'Cancel',
  },
  pl: {
    tab_general: 'Ogólne', tab_appearance: 'Wygląd', tab_animations: 'Animacje',
    tab_skins: 'Skórki', tab_ai: 'AI', tab_credits: 'Autorzy',
    section_general: 'Ogólne', lbl_language: 'Język', lbl_autostart: 'Uruchamiaj przy starcie',
    tip_language: 'Język interfejsu aplikacji. Niektóre zmiany wymagają restartu.',
    tip_autostart: 'Uruchamiaj Rocky automatycznie przy logowaniu.',
    section_appearance: 'Wygląd', lbl_theme: 'Motyw', lbl_skin: 'Domyślna skórka',
    lbl_skin_opacity: 'Widoczność skórki', tip_skin_opacity: 'Przezroczystość nakładki skórki. 100% = w pełni widoczna.',
    lbl_scale: 'Skala', lbl_win_w: 'Szerokość okna (px)', lbl_win_h: 'Wysokość okna (px)',
    lbl_corner: 'Narożnik', lbl_fontsize: 'Rozmiar czcionki', lbl_pintop: 'Przypnij na wierzchu',
    lbl_speech_bubbles: 'Dymki dialogowe', tip_speech_bubbles: 'Wyświetl dymki z wypowiedziami Rocky\'ego i Twoimi.',
    lbl_floor_offset: 'Odsunięcie podłogi', tip_floor_offset: 'Przesuń pozycję podłogi w górę lub w dół.',
    lbl_gravity: 'Grawitacja', tip_gravity: 'Jak szybko Rocky spada i jak mocno opadają kończyny gdy trzymasz go za ramię. 1.0 to wartość domyślna.',
    tip_theme: 'Schemat kolorów okna ustawień.',
    tip_scale: 'Rozmiar okna postaci Rocky. 1.0 to rozmiar natywny.',
    tip_win_w: 'Szerokość przezroczystej strefy ruchu w pikselach.',
    tip_win_h: 'Wysokość przezroczystej strefy ruchu w pikselach.',
    tip_corner: 'Narożnik ekranu Rocky\'ego. "Pełne okno" pokrywa cały monitor przezroczystą strefą.',
    lbl_display: 'Monitor', tip_display: 'Na którym monitorze Rocky ma się pojawić.',
    full_window: 'Pełne okno',
    tip_fontsize: 'Rozmiar tekstu w oknie ustawień.',
    tip_pintop: 'Gdy włączone, Rocky jest zawsze nad innymi oknami.',
    theme_night: 'Noc', theme_day: 'Dzień', theme_midnight: 'Północ',
    section_playback: 'Odtwarzanie', lbl_anim_speed: 'Prędkość animacji', lbl_idle: 'Animacja bezczynności',
    btn_reset_defaults: 'Resetuj przełączniki animacji',
    tip_anim_speed: 'Globalny mnożnik prędkości odtwarzania. 1.0 to normalna prędkość.',
    tip_idle: 'Odtwarzaj losowe animacje bezczynności gdy Rocky nie ma nic do roboty.',
    section_enabled_anims: 'Włączone animacje',
    section_import_anim: 'Importuj animację',
    ph_anim_name: 'Nazwa animacji',
    ph_anim_script: '// paste animation script here\npush(animate(s.hands.hand1.y, s.hands.hand1.y - 150, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.y = v }));\npush(animate(s.hands.hand2.y, s.hands.hand2.y - 150, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v }));\npush(animate(s.body.x, s.body.x + 20, { duration: 0.3, ease: "easeOut", onUpdate: v => s.body.x = v }));',
    lbl_context_size: 'Okno kontekstu',
    tip_context_size: 'Ile poprzednich wiadomości Rocky pamięta. Więcej = dłuższa pamięć, ale wolniejsze działanie.',
    btn_preview: 'Podgląd', btn_add: 'Dodaj', btn_play: 'Graj',
    section_skins: 'Skórki',
    btn_active: 'Aktywna', btn_select: 'Wybierz', btn_reset_skin: 'Przywróć domyślną',
    lbl_dl_template: 'Pobierz szablon skórki',
    tip_dl_template: 'Pobierz układ kolorów do malowania własnej skórki.',
    section_import_skin: 'Importuj skórkę',
    ph_skin_name: 'Nazwa skórki', btn_import: 'Importuj',
    lbl_import_file: 'Plik skórki (PNG)',
    section_llm: 'Model językowy (Ollama)', section_stt: 'Rozpoznawanie mowy', section_tts: 'Synteza mowy',
    lbl_ollama_dl: 'Pobierz Ollama', lbl_endpoint: 'Adres', lbl_model: 'Model',
    btn_refresh: 'Odśwież',
    tip_endpoint: 'Adres działającej instancji Ollama. Domyślnie: http://localhost:11434',
    tip_model: 'Model Ollama używany przez Rocky\'ego. Musi być wcześniej pobrany.',
    lbl_stt_mode: 'Tryb STT', lbl_stt_model: 'Model STT', lbl_microphone: 'Mikrofon',
    lbl_stt_language: 'Język rozpoznawania', lbl_speaker: 'Głośniki',
    tip_stt_mode: 'Sposób transkrypcji mowy. Auto używa audio modelu jeśli dostępne, w przeciwnym razie Whisper. Model STT wysyła audio bezpośrednio do LLM. Zewnętrzny STT zawsze używa lokalnego Whisper/Moonshine.',
    tip_stt_model: 'Moonshine jest szybki (tylko angielski). Whisper obsługuje wiele języków.',
    tip_microphone: 'Urządzenie wejściowe audio do rozpoznawania mowy.',
    tip_stt_language: 'Język do rozpoznawania mowy. Auto wykrywa automatycznie. Dotyczy tylko modelu Whisper.',
    tip_speaker: 'Urządzenie wyjściowe audio dla głosu Rocky\'ego.',
    stt_fast: 'Szybki (Moonshine, tylko angielski)', stt_accurate: 'Dokładny (Whisper, wielojęzyczny)',
    stt_mode_auto: 'Auto (wykryj z modelu)', stt_mode_model: 'STT modelu', stt_mode_external: 'Zewnętrzny STT (Whisper)',
    btn_save: 'Zapisz', saving: 'Zapisywanie...', saved: 'Zapisano!', loading: 'Ładowanie...',
    opt_default: 'Domyślny',
    btn_reset_all: 'Przywróć wszystkie ustawienia do domyślnych',
    confirm_reset_all: 'Przywrócić WSZYSTKIE ustawienia? Tej operacji nie można cofnąć.',
    credits_title: 'Autorzy',
    importing: 'Importowanie...', import_success: 'Zaimportowano!', import_failed: 'Import nieudany',
    btn_clear_history: 'Wyczyść historię rozmów',
    tip_clear_history: 'Usuń wszystkie wiadomości z pamięci Rocky\'ego.',
    history_cleared: 'Historia wyczyszczona!',
    section_debug: 'Deweloper / Testowanie',
    lbl_debug_border: 'Obramowanie debug',
    tip_debug_border: 'Pokaż kolorową poświatę wokół Rocky\'ego: zielona = nasłuch, czerwona = myślenie, niebieska = mówienie.',
    lbl_debug_log: 'Log rozmów',
    tip_debug_log: 'Zapisuj rozmowy do ~/.rocky/conversation.log.',
  },
  es: {
    tab_general: 'General', tab_appearance: 'Apariencia', tab_animations: 'Animaciones',
    tab_skins: 'Skins', tab_ai: 'IA', tab_credits: 'Créditos',
    section_general: 'General', lbl_language: 'Idioma', lbl_autostart: 'Iniciar con el sistema',
    tip_language: 'Idioma de la interfaz. Algunos cambios pueden requerir reinicio.',
    tip_autostart: 'Iniciar Rocky automáticamente al iniciar sesión.',
    section_appearance: 'Apariencia', lbl_theme: 'Tema', lbl_skin: 'Skin predeterminada',
    lbl_skin_opacity: 'Visibilidad skin', tip_skin_opacity: 'Opacidad de la superposición de textura. 100% = totalmente visible.',
    lbl_scale: 'Escala', lbl_win_w: 'Ancho de ventana (px)', lbl_win_h: 'Alto de ventana (px)',
    lbl_corner: 'Esquina', lbl_fontsize: 'Tamaño de fuente', lbl_pintop: 'Anclar encima',
    lbl_speech_bubbles: 'Burbujas de diálogo', tip_speech_bubbles: 'Muestra burbujas de diálogo para Rocky y el usuario.',
    lbl_floor_offset: 'Ajuste de suelo', tip_floor_offset: 'Desplazar la posición del suelo arriba o abajo.',
    lbl_gravity: 'Gravedad', tip_gravity: 'Con qué rapidez cae Rocky y cuánto cuelgan los miembros al sostenerlo. 1.0 es el valor predeterminado.',
    tip_theme: 'Esquema de colores de la ventana de configuración.',
    tip_scale: 'Tamaño de la ventana del personaje. 1.0 es el tamaño nativo.',
    tip_win_w: 'Ancho de la zona movible transparente en píxeles.',
    tip_win_h: 'Alto de la zona movible transparente en píxeles.',
    tip_corner: 'Esquina donde Rocky aparece. "Ventana completa" cubre todo el monitor.',
    lbl_display: 'Monitor', tip_display: 'En qué pantalla aparece Rocky.',
    full_window: 'Ventana completa',
    tip_fontsize: 'Tamaño de texto en la ventana de configuración.',
    tip_pintop: 'Cuando está activado, Rocky siempre está por encima de otras ventanas.',
    theme_night: 'Noche', theme_day: 'Día', theme_midnight: 'Medianoche',
    section_playback: 'Reproducción', lbl_anim_speed: 'Velocidad de animación', lbl_idle: 'Animación inactiva',
    btn_reset_defaults: 'Restablecer toggles de animación',
    tip_anim_speed: 'Multiplicador de velocidad global. 1.0 es normal.',
    tip_idle: 'Reproducir animaciones al azar cuando Rocky está inactivo.',
    section_enabled_anims: 'Animaciones habilitadas',
    section_import_anim: 'Importar animación',
    ph_anim_name: 'Nombre de animación',
    ph_anim_script: '// paste animation script here\npush(animate(s.hands.hand1.y, s.hands.hand1.y - 150, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.y = v }));\npush(animate(s.hands.hand2.y, s.hands.hand2.y - 150, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v }));\npush(animate(s.body.x, s.body.x + 20, { duration: 0.3, ease: "easeOut", onUpdate: v => s.body.x = v }));',
    lbl_context_size: 'Ventana de contexto',
    tip_context_size: 'Cuántos mensajes anteriores recuerda Rocky. Más = memoria más larga, pero más lento.',
    btn_preview: 'Vista previa', btn_add: 'Añadir', btn_play: 'Reproducir',
    section_skins: 'Skins',
    btn_active: 'Activa', btn_select: 'Seleccionar', btn_reset_skin: 'Restablecer',
    lbl_dl_template: 'Descargar plantilla de skin',
    tip_dl_template: 'Descarga el esquema de colores para pintar una skin personalizada.',
    section_import_skin: 'Importar skin',
    ph_skin_name: 'Nombre de skin', btn_import: 'Importar',
    lbl_import_file: 'Imagen de skin (PNG)',
    section_llm: 'Modelo de lenguaje (Ollama)', section_stt: 'Reconocimiento de voz', section_tts: 'Síntesis de voz',
    lbl_ollama_dl: 'Obtener Ollama', lbl_endpoint: 'Dirección', lbl_model: 'Modelo',
    btn_refresh: 'Actualizar',
    tip_endpoint: 'URL de la instancia de Ollama. Por defecto: http://localhost:11434',
    tip_model: 'Modelo de Ollama para Rocky. Debe estar descargado previamente.',
    lbl_stt_mode: 'Modo STT', lbl_stt_model: 'Modelo STT', lbl_microphone: 'Micrófono',
    lbl_stt_language: 'Idioma de reconocimiento', lbl_speaker: 'Altavoces',
    tip_stt_mode: 'Cómo se transcribe el audio. Auto usa audio nativo del modelo si está disponible. STT de modelo envía audio al LLM. STT externo usa Whisper/Moonshine local.',
    tip_stt_model: 'Moonshine es rápido (solo inglés). Whisper soporta múltiples idiomas.',
    tip_microphone: 'Dispositivo de entrada de audio para el reconocimiento de voz.',
    tip_stt_language: 'Idioma a reconocer. Auto detecta automáticamente. Solo aplica al modelo Whisper.',
    tip_speaker: 'Dispositivo de salida de audio para la voz de Rocky.',
    stt_fast: 'Rápido (Moonshine, solo inglés)', stt_accurate: 'Preciso (Whisper, multilingüe)',
    stt_mode_auto: 'Auto (detectar del modelo)', stt_mode_model: 'STT del modelo', stt_mode_external: 'STT externo (Whisper)',
    btn_save: 'Guardar', saving: 'Guardando...', saved: '¡Guardado!', loading: 'Cargando...',
    opt_default: 'Predeterminado',
    btn_reset_all: 'Restablecer toda la configuración',
    confirm_reset_all: '¿Restablecer TODA la configuración a valores de fábrica?',
    credits_title: 'Créditos',
    importing: 'Importando...', import_success: '¡Importado!', import_failed: 'Importación fallida',
    btn_clear_history: 'Borrar historial de conversación',
    tip_clear_history: 'Borrar todos los mensajes de la memoria de Rocky.',
    history_cleared: '¡Historial borrado!',
    section_debug: 'Desarrollador / Pruebas',
    lbl_debug_border: 'Borde de depuración',
    tip_debug_border: 'Mostrar brillo alrededor de Rocky: verde = escuchando, rojo = pensando, azul = hablando.',
    lbl_debug_log: 'Registro de conversación',
    tip_debug_log: 'Guardar conversaciones en ~/.rocky/conversation.log.',
  },
  de: {
    tab_general: 'Allgemein', tab_appearance: 'Darstellung', tab_animations: 'Animationen',
    tab_skins: 'Skins', tab_ai: 'KI', tab_credits: 'Mitwirkende',
    section_general: 'Allgemein', lbl_language: 'Sprache', lbl_autostart: 'Autostart',
    tip_language: 'Sprache der Benutzeroberfläche. Einige Änderungen erfordern einen Neustart.',
    tip_autostart: 'Rocky beim Anmelden automatisch starten.',
    section_appearance: 'Darstellung', lbl_theme: 'Theme', lbl_skin: 'Standard-Skin',
    lbl_skin_opacity: 'Skin-Sichtbarkeit', tip_skin_opacity: 'Deckkraft der Textur-Überlagerung. 100% = vollständig sichtbar.',
    lbl_scale: 'Skalierung', lbl_win_w: 'Fensterbreite (px)', lbl_win_h: 'Fensterhöhe (px)',
    lbl_corner: 'Ecke', lbl_fontsize: 'Schriftgröße', lbl_pintop: 'Immer im Vordergrund',
    lbl_speech_bubbles: 'Sprechblasen', tip_speech_bubbles: 'Sprechblasen für Rocky und den Nutzer anzeigen.',
    lbl_floor_offset: 'Bodenversatz', tip_floor_offset: 'Bodenposition nach oben oder unten verschieben.',
    lbl_gravity: 'Schwerkraft', tip_gravity: 'Wie schnell Rocky fällt und wie stark die Gliedmaßen hängen, wenn er gehalten wird. 1.0 ist der Standardwert.',
    tip_theme: 'Farbschema des Einstellungsfensters.',
    tip_scale: 'Größe des Charakterfensters. 1.0 ist die native Größe.',
    tip_win_w: 'Breite der transparenten Zone in Pixeln.',
    tip_win_h: 'Höhe der transparenten Zone in Pixeln.',
    tip_corner: 'Bildschirmecke für Rocky. "Vollbild" deckt den ganzen Monitor ab.',
    lbl_display: 'Monitor', tip_display: 'Auf welchem Monitor Rocky erscheint.',
    full_window: 'Vollbild',
    tip_fontsize: 'Textgröße im Einstellungsfenster.',
    tip_pintop: 'Wenn aktiviert, bleibt Rocky immer über anderen Fenstern.',
    theme_night: 'Nacht', theme_day: 'Tag', theme_midnight: 'Mitternacht',
    section_playback: 'Wiedergabe', lbl_anim_speed: 'Animationsgeschwindigkeit', lbl_idle: 'Leerlauf-Animation',
    btn_reset_defaults: 'Animationsschalter zurücksetzen',
    tip_anim_speed: 'Globaler Geschwindigkeitsmultiplikator. 1.0 ist normal.',
    tip_idle: 'Zufällige Leerlauf-Animationen abspielen.',
    section_enabled_anims: 'Aktivierte Animationen',
    section_import_anim: 'Animation importieren',
    ph_anim_name: 'Animationsname',
    ph_anim_script: '// paste animation script here\npush(animate(s.hands.hand1.y, s.hands.hand1.y - 150, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand1.y = v }));\npush(animate(s.hands.hand2.y, s.hands.hand2.y - 150, { duration: 0.3, ease: "easeOut", onUpdate: v => s.hands.hand2.y = v }));\npush(animate(s.body.x, s.body.x + 20, { duration: 0.3, ease: "easeOut", onUpdate: v => s.body.x = v }));',
    lbl_context_size: 'Kontextfenster',
    tip_context_size: 'Wie viele frühere Nachrichten Rocky sich merkt. Mehr = längeres Gedächtnis, aber langsamer.',
    btn_preview: 'Vorschau', btn_add: 'Hinzufügen', btn_play: 'Abspielen',
    section_skins: 'Skins',
    btn_active: 'Aktiv', btn_select: 'Auswählen', btn_reset_skin: 'Zurücksetzen',
    lbl_dl_template: 'Skin-Vorlage herunterladen',
    tip_dl_template: 'Lade das Farbschema zum Malen eines eigenen Skins herunter.',
    section_import_skin: 'Skin importieren',
    ph_skin_name: 'Skin-Name', btn_import: 'Importieren',
    lbl_import_file: 'Skin-Bild (PNG)',
    section_llm: 'Sprachmodell (Ollama)', section_stt: 'Spracherkennung', section_tts: 'Sprachausgabe',
    lbl_ollama_dl: 'Ollama herunterladen', lbl_endpoint: 'Adresse', lbl_model: 'Modell',
    btn_refresh: 'Aktualisieren',
    tip_endpoint: 'URL der laufenden Ollama-Instanz. Standard: http://localhost:11434',
    tip_model: 'Ollama-Modell für Rockys Antworten. Muss vorher geladen werden.',
    lbl_stt_mode: 'STT-Modus', lbl_stt_model: 'STT-Modell', lbl_microphone: 'Mikrofon',
    lbl_stt_language: 'Erkennungssprache', lbl_speaker: 'Lautsprecher',
    tip_stt_mode: 'Wie Spracheingabe transkribiert wird. Auto nutzt natives Modell-Audio wenn verfügbar. Modell-STT sendet Audio direkt ans LLM. Externer STT nutzt immer lokales Whisper/Moonshine.',
    tip_stt_model: 'Moonshine ist schnell (nur Englisch). Whisper unterstützt mehrere Sprachen.',
    tip_microphone: 'Audioeingang für die Spracherkennung.',
    tip_stt_language: 'Sprache zur Erkennung. Auto erkennt automatisch. Gilt nur für das Whisper-Modell.',
    tip_speaker: 'Audioausgang für Rockys Stimme.',
    stt_fast: 'Schnell (Moonshine, nur Englisch)', stt_accurate: 'Genau (Whisper, mehrsprachig)',
    stt_mode_auto: 'Auto (vom Modell erkennen)', stt_mode_model: 'Modell-STT', stt_mode_external: 'Externer STT (Whisper)',
    btn_save: 'Speichern', saving: 'Speichern...', saved: 'Gespeichert!', loading: 'Laden...',
    opt_default: 'Standard',
    btn_reset_all: 'Alle Einstellungen zurücksetzen',
    confirm_reset_all: 'ALLE Einstellungen auf Werkseinstellungen zurücksetzen?',
    credits_title: 'Mitwirkende',
    importing: 'Importieren...', import_success: 'Importiert!', import_failed: 'Import fehlgeschlagen',
    btn_clear_history: 'Gesprächsverlauf löschen',
    tip_clear_history: 'Alle Nachrichten aus Rockys Gedächtnis löschen.',
    history_cleared: 'Verlauf gelöscht!',
    section_debug: 'Entwickler / Tests',
    lbl_debug_border: 'Debug-Rahmen',
    tip_debug_border: 'Farbiges Leuchten um Rocky: grün = hören, rot = denken, blau = sprechen.',
    lbl_debug_log: 'Gesprächsprotokoll',
    tip_debug_log: 'Gespräche in ~/.rocky/conversation.log speichern.',
  },
};

const LANG_LABELS: Record<LangCode, string> = {
  en: 'English', pl: 'Polski', es: 'Español', de: 'Deutsch',
};

const DEFAULT_SETTINGS = {
  theme: 'night', skin: 'rocky', skinOpacity: 1.0, scale: 1.0,
  corner: 'bottom-right', displayIndex: 0, windowWidth: 750, windowHeight: 860,
  gravityScale: 1.0,
  pinToTop: true, idleEnabled: true, animationSpeed: 1.0,
  disabledAnimations: [] as string[], fontSize: 14, language: 'en', autoStart: false,
  developerMode: false, activityMode: 'active', systemPromptSuffix: '',
  ollama: { endpoint: 'http://localhost:11434', model: 'Rockyv8:latest' },
  stt: { model: 'better', device: 'default', language: 'auto', mode: 'auto' },
  tts: { device: 'default', volume: 1.0 },
  debug: { showBorder: false, logConversation: false },
  contextSize: 12,
};

const BUILTIN_ANIM_NAMES = new Set([
  'freeze', 'sleep', 'dance', 'crouch', 'sad', 'default',
  'jump', 'nod', 'shake', 'stomp', 'point', 'stretch',
  'wave', 'wave_left', 'wave_right', 'celebrate', 'bounce',
  'panic', 'clap', 'confused', 'chirp', 'harmonic',
]);

const TAB_IDS = ['general', 'appearance', 'animations', 'skins', 'ai', 'credits'] as const;
type TabId = typeof TAB_IDS[number];
const TAB_KEYS: Record<TabId, string> = {
  general: 'tab_general', appearance: 'tab_appearance', animations: 'tab_animations',
  skins: 'tab_skins', ai: 'tab_ai', credits: 'tab_credits',
};
const CORNER_KEYS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

const CONTEXT_STEPS = [4, 12, 30, 60, 128, 256, 512, 1048];

function HamburgerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function TabIcon({ id }: { id: TabId }) {
  const common = {
    fill: 'none' as const, stroke: 'currentColor',
    strokeWidth: '1.8', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  const content: Record<TabId, React.ReactNode> = {
    general: <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
    appearance: <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </>,
    animations: <polygon points="5 3 19 12 5 21 5 3" />,
    skins: <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>,
    ai: <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </>,
    credits: <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>,
  };
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...common} style={{ flexShrink: 0 }}>
      {content[id]}
    </svg>
  );
}

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{
        width: 14, height: 14, borderRadius: '50%',
        border: '1px solid var(--text-3)',
        color: 'var(--text-3)',
        fontSize: 9,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'help', userSelect: 'none', flexShrink: 0,
        lineHeight: 1, fontFamily: 'system-ui',
      }}>?</span>
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'var(--bg-b)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '7px 11px',
          fontSize: 11, lineHeight: 1.5,
          color: 'var(--text-2)',
          maxWidth: 230, width: 'max-content',
          boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
          fontFamily: "'Manrope', system-ui, sans-serif",
          whiteSpace: 'pre-wrap',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

function Row({ label, tip, children, stacked }: { label: string; tip?: string; children: React.ReactNode; stacked?: boolean }) {
  if (stacked) {
    return (
      <div style={{ padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{label}</span>
          {tip && <Tooltip text={tip} />}
        </div>
        <div style={{ width: '100%' }}>{children}</div>
      </div>
    );
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 16px', minHeight: 44,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{label}</span>
        {tip && <Tooltip text={tip} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const arr = React.Children.toArray(children).filter(Boolean);
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{
        fontFamily: "'CindieMono', 'Courier New', monospace",
        fontSize: 10.5, fontWeight: 700,
        letterSpacing: '0.09em', textTransform: 'uppercase',
        color: 'var(--accent)', marginBottom: 7, paddingLeft: 4,
      }}>{title}</p>
      <div style={{
        background: 'var(--bg-b)',
        borderRadius: 14,
        border: '1px solid var(--border)',
      }}>
        {arr.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div style={{ height: 1, background: 'var(--border)', margin: '0 14px' }} />
            )}
            {child}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        position: 'relative', width: 42, height: 24, borderRadius: 12,
        border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
        background: value ? 'var(--accent)' : 'var(--border)',
        transition: 'background 0.2s ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: value ? 21 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: value ? 'var(--accent-dark)' : 'var(--text-1)',
        transition: 'left 0.2s ease',
        opacity: value ? 1 : 0.9,
      }} />
    </button>
  );
}

function StyledSelect({ value, options, onChange, style }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: 'var(--bg-a)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        color: 'var(--text-1)',
        fontSize: 12,
        padding: '5px 10px',
        outline: 'none', cursor: 'pointer',
        fontFamily: "'Manrope', system-ui, sans-serif",
        ...style,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function StyledInput({ value, onChange, placeholder, style, type = 'text' }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; style?: React.CSSProperties; type?: string;
}) {
  return (
    <input
      type={type} value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: 'var(--bg-a)',
        border: '1px solid var(--border)',
        borderRadius: 8, color: 'var(--text-1)',
        fontSize: 12, padding: '6px 10px', outline: 'none',
        fontFamily: "'Manrope', system-ui, sans-serif",
        width: '100%',
        ...style,
      }}
    />
  );
}

function Btn({ onClick, disabled, danger, outline, children, style }: {
  onClick?: () => void; disabled?: boolean;
  danger?: boolean; outline?: boolean;
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    border: 'none', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Manrope', system-ui, sans-serif",
    fontWeight: 600, fontSize: 12, padding: '7px 16px',
    opacity: disabled ? 0.45 : 1,
    transition: 'opacity 0.15s, background 0.15s',
    ...style,
  };
  if (danger && outline) {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        ...base, background: 'transparent',
        border: '1px solid var(--danger)', color: 'var(--danger)',
      }}>{children}</button>
    );
  }
  if (danger) {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        ...base, background: 'var(--danger)', color: '#fff',
      }}>{children}</button>
    );
  }
  if (outline) {
    return (
      <button onClick={onClick} disabled={disabled} style={{
        ...base, background: 'transparent',
        border: '1px solid var(--border)', color: 'var(--text-2)',
      }}>{children}</button>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...base, background: 'var(--accent)', color: 'var(--accent-dark)',
    }}>{children}</button>
  );
}

function SliderRow({ label, tip, min, max, step, value, onChange, fmt }: {
  label: string; tip?: string;
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <Row label={label} tip={tip}>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: 96, accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <span style={{ color: 'var(--text-3)', fontSize: 12, width: 36, textAlign: 'right' }}>
        {fmt ? fmt(value) : value}
      </span>
    </Row>
  );
}

function CornerPicker({ value, onChange, t }: {
  value: string;
  onChange: (v: string) => void;
  t: (k: string) => string;
}) {
  const btn = (c: string, symbol: string) => {
    const active = value === c;
    return (
      <button
        onClick={() => onChange(c)}
        title={c}
        style={{
          width: 36, height: 30, borderRadius: 6, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
          background: active ? 'var(--accent-dim)' : 'var(--bg-a)',
          color: active ? 'var(--accent)' : 'var(--text-3)',
          cursor: 'pointer', fontSize: 14, fontWeight: 600,
          fontFamily: 'system-ui',
          transition: 'all 0.15s',
        }}
      >{symbol}</button>
    );
  };
  const fullActive = value === 'full-window';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
        {btn('top-left', '↖')}
        {btn('top-right', '↗')}
        {btn('bottom-left', '↙')}
        {btn('bottom-right', '↘')}
      </div>
      <button
        onClick={() => onChange('full-window')}
        style={{
          padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
          border: `1px solid ${fullActive ? 'var(--accent)' : 'var(--border)'}`,
          background: fullActive ? 'var(--accent-dim)' : 'var(--bg-a)',
          color: fullActive ? 'var(--accent)' : 'var(--text-3)',
          cursor: 'pointer', fontFamily: "'Manrope', system-ui, sans-serif",
          whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}
      >
        {t('full_window')}
      </button>
    </div>
  );
}

function SegmentedControl({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{
      display: 'flex',
      background: 'var(--bg-a)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 2,
      gap: 2,
    }}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: '5px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: active ? 700 : 400,
              fontFamily: "'Manrope', system-ui, sans-serif",
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-dark)' : 'var(--text-3)',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsApp() {
  const [tab, setTab]               = useState<TabId>('general');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draft, setDraft]           = useState<any>(null);
  const [lang, setLang]             = useState<LangCode>('en');
  const [skins, setSkins]           = useState<any[]>([]);
  const [animations, setAnimations] = useState<string[]>([]);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [audioDevices, setAudioDevices] = useState<{ inputs: string[]; outputs: string[] }>({ inputs: [], outputs: [] });
  const [displays, setDisplays] = useState<Array<{ index: number; label: string }>>([]);
  const [skinImportName, setSkinImportName] = useState('');
  const [skinImportFile, setSkinImportFile] = useState<File | null>(null);
  const [skinImportStatus, setSkinImportStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [skinImporting, setSkinImporting] = useState(false);
  const [animImportName, setAnimImportName] = useState('');
  const [animImportScript, setAnimImportScript] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const t = useCallback((key: string) => TR[lang]?.[key] ?? TR.en[key] ?? key, [lang]);

  useLayoutEffect(() => {
    applyTheme(draft?.theme || 'night');
  }, [draft?.theme]);

  useLayoutEffect(() => {
    if (draft?.fontSize) {
      document.documentElement.style.fontSize = `${draft.fontSize}px`;
    }
  }, [draft?.fontSize]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setDraft({ ...DEFAULT_SETTINGS });
      return;
    }

    Promise.all([
      api.getSettings(), api.getSkins(), api.getAnimations(),
      api.getOllamaModels(), api.getAudioDevices(),
      api.getDisplays?.() ?? Promise.resolve([]),
    ]).then(([s, sk, an, om, ad, dp]) => {
      setDraft(s);
      setLang((s.language as LangCode) || 'en');
      applyTheme(s.theme || 'night');
      setSkins(sk); setAnimations(an);
      setOllamaModels(om); setAudioDevices(ad);
      setDisplays(dp ?? []);
    });

    api.navigateTab((t) => setTab(t as TabId));
    api.onSkinImported((r) => {
      setSkinImporting(false);
      if (r.success) {
        setSkinImportStatus({ type: 'success', text: `"${r.name}" imported successfully!` });
        setSkinImportName('');
        setSkinImportFile(null);
        api.getSkins().then(setSkins);
      } else {
        const detail = r.error
          ? r.error.replace(/^Error:\s*/i, '').slice(0, 200)
          : 'Unknown error. Ensure Python and opencv-python are installed.';
        setSkinImportStatus({ type: 'error', text: detail });
      }
    });

    return () => {
      api.removeAllListeners('navigate-tab');
      api.removeAllListeners('skin-imported');
    };
  }, []);

  const set = useCallback((key: string, val: any) => {
    setDraft((d: any) => {
      const parts = key.split('.');
      if (parts.length === 1) return { ...d, [key]: val };
      if (parts.length === 2) return { ...d, [parts[0]]: { ...d[parts[0]], [parts[1]]: val } };
      return { ...d, [parts[0]]: { ...d[parts[0]], [parts[1]]: { ...d[parts[0]]?.[parts[1]], [parts[2]]: val } } };
    });
    if (key === 'language') setLang(val as LangCode);
    if (key === 'theme') applyTheme(val);
    if (key === 'activityMode') {
      window.electronAPI?.setActivityMode?.(val);
      if (val === 'sleep') window.electronAPI?.triggerEmote?.('sleep');
      else if (val === 'active') window.electronAPI?.triggerEmote?.('default');
    }
  }, []);

  const handleSave = async () => {
    if (!window.electronAPI || !draft) return;
    setSaving(true);
    await window.electronAPI.saveSettings(draft);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!draft) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-a)', color: 'var(--text-3)',
        fontFamily: "'Manrope', system-ui, sans-serif", fontSize: 13,
      }}>
        {t('loading')}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden', position: 'relative',
      fontFamily: "'Manrope', system-ui, sans-serif",
      fontSize: 13, background: 'var(--bg-a)', color: 'var(--text-1)',
    }}>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 100,
          width: sidebarOpen ? 176 : 52,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-c)',
          borderRight: '1px solid var(--border)',
          transition: 'width 0.22s ease',
          overflow: 'hidden',
        }}>
        <button
          onClick={() => setSidebarOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 48, width: '100%', flexShrink: 0,
            background: 'transparent', border: 'none',
            borderBottom: '1px solid var(--border)',
            color: 'var(--text-3)', cursor: 'pointer',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
        >
          <HamburgerIcon />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 6, gap: 2 }}>
          {TAB_IDS.map(id => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => { setTab(id); setSidebarOpen(false); }}
                title={!sidebarOpen ? t(TAB_KEYS[id]) : undefined}
                style={{
                  display: 'flex', alignItems: 'center',
                  gap: 10, padding: '9px 0 9px 17px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: active ? 'var(--accent)' : 'var(--text-3)',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                  fontFamily: "'Manrope', system-ui, sans-serif",
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  whiteSpace: 'nowrap', width: '100%', textAlign: 'left',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-3)'; }}
              >
                <TabIcon id={id} />
                {sidebarOpen && (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t(TAB_KEYS[id])}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingLeft: 52 }}
        onClick={() => { if (sidebarOpen) setSidebarOpen(false); }}
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {tab === 'general' && (
            <GeneralTab draft={draft} set={set} t={t} lang={lang}
              onResetAll={() => {
                setDraft({ ...DEFAULT_SETTINGS });
                setLang(DEFAULT_SETTINGS.language as LangCode);
                applyTheme(DEFAULT_SETTINGS.theme);
              }}
            />
          )}
          {tab === 'appearance' && <AppearanceTab draft={draft} set={set} t={t} displays={displays} isDev={!!draft.developerMode} />}
          {tab === 'animations' && (
            <AnimationsTab
              draft={draft} set={set} t={t} animations={animations}
              isDev={!!draft.developerMode}
              importName={animImportName} setImportName={setAnimImportName}
              importScript={animImportScript} setImportScript={setAnimImportScript}
              onAnimationAdded={setAnimations}
              onDeleteAnimation={async (name) => {
                const updated = await window.electronAPI?.deleteCustomAnimation?.(name);
                if (updated) setAnimations(updated);
              }}
            />
          )}
          {tab === 'skins' && (
            <SkinsTab
              draft={draft} set={set} t={t} isDev={!!draft.developerMode} skins={skins}
              importName={skinImportName} setImportName={setSkinImportName}
              importFile={skinImportFile} setImportFile={setSkinImportFile}
              importStatus={skinImportStatus} setImportStatus={setSkinImportStatus}
              importing={skinImporting} setImporting={setSkinImporting}
            />
          )}
          {tab === 'ai' && (
            <AiTab
              draft={draft} set={set} t={t}
              isDev={!!draft.developerMode}
              ollamaModels={ollamaModels} audioDevices={audioDevices}
              refreshModels={() => window.electronAPI?.getOllamaModels().then(setOllamaModels)}
              onClearHistory={async () => {
                const r = await window.electronAPI?.clearHistory?.();
                return r?.ok ?? false;
              }}
            />
          )}
          {tab === 'credits' && <CreditsTab t={t} isDev={!!draft.developerMode} draft={draft} set={set} />}
        </div>

        <div style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-c)',
          padding: '11px 22px',
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
        }}>
          {saved && (
            <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600 }}>
              {t('saved')}
            </span>
          )}
          <Btn onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('btn_save')}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function GeneralTab({ draft, set, t, lang, onResetAll }: {
  draft: any; set: (k: string, v: any) => void;
  t: (k: string) => string; lang: string; onResetAll: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const isDev = !!draft.developerMode;

  return (
    <>
      <Section title={t('section_general')}>
        <Row label={t('lbl_language')} tip={t('tip_language')}>
          <StyledSelect
            value={lang}
            options={Object.entries(LANG_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            onChange={v => set('language', v)}
          />
        </Row>
        <Row label={t('lbl_autostart')} tip={t('tip_autostart')}>
          <Toggle value={!!draft.autoStart} onChange={v => set('autoStart', v)} />
        </Row>
        <Row label={t('lbl_pintop')} tip={t('tip_pintop')}>
          <Toggle value={!!draft.pinToTop} onChange={v => set('pinToTop', v)} />
        </Row>
        <Row label={t('lbl_speech_bubbles')} tip={t('tip_speech_bubbles')}>
          <Toggle value={draft.speechBubbles !== false} onChange={v => set('speechBubbles', v)} />
        </Row>
        <Row label={t('lbl_activity_mode')} tip={t('tip_activity_mode')}>
          <SegmentedControl
            value={draft.activityMode ?? 'active'}
            onChange={v => set('activityMode', v)}
            options={[
              { value: 'active', label: t('activity_active') },
              { value: 'quiet', label: t('activity_quiet') },
              { value: 'sleep', label: t('activity_sleep') },
            ]}
          />
        </Row>
        <Row label={t('lbl_developer_mode')} tip={t('tip_developer_mode')}>
          <Toggle value={isDev} onChange={v => set('developerMode', v)} />
        </Row>
      </Section>

      {isDev && (
        <Section title={t('section_debug')}>
          <Row label={t('lbl_debug_border')} tip={t('tip_debug_border')}>
            <Toggle
              value={!!draft?.debug?.showBorder}
              onChange={v => set('debug.showBorder', v)}
            />
          </Row>
          <Row label={t('lbl_debug_log')} tip={t('tip_debug_log')}>
            <Toggle
              value={!!draft?.debug?.logConversation}
              onChange={v => set('debug.logConversation', v)}
            />
          </Row>
        </Section>
      )}

      <div style={{ marginTop: 8 }}>
        {confirmReset ? (
          <div style={{
            background: 'var(--bg-b)', border: '1px solid var(--danger)',
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
              {t('confirm_reset_all')}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn danger style={{ flex: 1, padding: '8px 0' }} onClick={() => {
                onResetAll();
                setConfirmReset(false);
              }}>
                {t('btn_confirm_reset')}
              </Btn>
              <Btn outline style={{ flex: 1, padding: '8px 0' }} onClick={() => setConfirmReset(false)}>
                {t('btn_cancel')}
              </Btn>
            </div>
          </div>
        ) : (
          <Btn onClick={() => setConfirmReset(true)} danger outline style={{ width: '100%', padding: '9px 16px' }}>
            {t('btn_reset_all')}
          </Btn>
        )}
      </div>
    </>
  );
}

function AppearanceTab({ draft, set, t, displays, isDev }: {
  draft: any; set: (k: string, v: any) => void;
  t: (k: string) => string;
  displays: Array<{ index: number; label: string }>;
  isDev: boolean;
}) {
  return (
    <Section title={t('section_appearance')}>
      <Row label={t('lbl_theme')} tip={t('tip_theme')}>
        <StyledSelect
          value={draft.theme ?? 'night'}
          options={['night', 'day', 'midnight'].map(v => ({ value: v, label: t(`theme_${v}`) }))}
          onChange={v => set('theme', v)}
        />
      </Row>
      <SliderRow
        label={t('lbl_skin_opacity')} tip={t('tip_skin_opacity')}
        min={0} max={1} step={0.01} value={draft.skinOpacity ?? 1}
        onChange={v => set('skinOpacity', v)}
        fmt={v => `${Math.round(v * 100)}%`}
      />
      <SliderRow
        label={t('lbl_scale')} tip={t('tip_scale')}
        min={0.5} max={3} step={0.1} value={draft.scale ?? 1}
        onChange={v => set('scale', v)}
        fmt={v => `${v.toFixed(1)}x`}
      />
      <Row label={t('lbl_corner')} tip={t('tip_corner')}>
        <CornerPicker value={draft.corner ?? 'bottom-right'} onChange={v => set('corner', v)} t={t} />
      </Row>
      {displays.length > 1 && (
        <Row label={t('lbl_display')} tip={t('tip_display')}>
          <StyledSelect
            value={String(draft.displayIndex ?? 0)}
            options={displays.map(d => ({ value: String(d.index), label: d.label }))}
            onChange={v => set('displayIndex', parseInt(v))}
          />
        </Row>
      )}
      {isDev && (
        <Row label={t('lbl_win_w')} tip={t('tip_win_w')}>
          <StyledInput
            value={String(draft.windowWidth ?? 750)}
            onChange={v => set('windowWidth', parseInt(v) || 750)}
            style={{ width: 80 }}
          />
        </Row>
      )}
      {isDev && (
        <Row label={t('lbl_win_h')} tip={t('tip_win_h')}>
          <StyledInput
            value={String(draft.windowHeight ?? 860)}
            onChange={v => set('windowHeight', parseInt(v) || 860)}
            style={{ width: 80 }}
          />
        </Row>
      )}
      {isDev && (
        <SliderRow
          label={t('lbl_floor_offset')} tip={t('tip_floor_offset')}
          min={-200} max={200} step={1} value={draft.floorOffset ?? 0}
          onChange={v => set('floorOffset', v)}
          fmt={v => `${v > 0 ? '+' : ''}${v}px`}
        />
      )}
      {isDev && (
        <SliderRow
          label={t('lbl_gravity')} tip={t('tip_gravity')}
          min={0.2} max={3.0} step={0.05} value={draft.gravityScale ?? 1.0}
          onChange={v => set('gravityScale', v)}
          fmt={v => `${v.toFixed(2)}x`}
        />
      )}
    </Section>
  );
}

function AnimationsTab({ draft, set, t, animations, isDev, importName, setImportName, importScript, setImportScript, onAnimationAdded, onDeleteAnimation }: {
  draft: any; set: (k: string, v: any) => void; t: (k: string) => string;
  animations: string[]; isDev: boolean;
  importName: string; setImportName: (v: string) => void;
  importScript: string; setImportScript: (v: string) => void;
  onAnimationAdded: (names: string[]) => void;
  onDeleteAnimation: (name: string) => void;
}) {
  const [addStatus, setAddStatus] = useState<'idle' | 'adding' | 'added' | 'error'>('idle');
  const disabled: string[] = draft.disabledAnimations || [];

  return (
    <>
      <Section title={t('section_playback')}>
        <SliderRow
          label={t('lbl_anim_speed')} tip={t('tip_anim_speed')}
          min={0.4} max={2.0} step={0.1} value={draft.animationSpeed ?? 1}
          onChange={v => set('animationSpeed', v)}
          fmt={v => `${v.toFixed(1)}x`}
        />
        <Row label={t('lbl_idle')} tip={t('tip_idle')}>
          <Toggle value={!!draft.idleEnabled} onChange={v => set('idleEnabled', v)} />
        </Row>
      </Section>

      {isDev && (
        <Section title={t('section_enabled_anims')}>
          <div style={{ maxHeight: 220, overflowY: 'auto', overflowX: 'hidden' }}>
            {animations.map(name => (
              <div key={name}>
                <Row label={name}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!BUILTIN_ANIM_NAMES.has(name) && (
                      <button
                        onClick={() => onDeleteAnimation(name)}
                        title="Delete"
                        style={{
                          background: 'transparent', border: '1px solid var(--danger)',
                          borderRadius: 6, color: 'var(--danger)',
                          fontSize: 10, fontWeight: 700, padding: '3px 8px',
                          cursor: 'pointer', fontFamily: "'Manrope', system-ui, sans-serif",
                          lineHeight: 1.4,
                        }}
                      >
                        ✕
                      </button>
                    )}
                    <button
                      onClick={() => window.electronAPI?.triggerEmote?.(name)}
                      title={t('btn_play')}
                      style={{
                        background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                        borderRadius: 6, color: 'var(--accent)',
                        fontSize: 10, fontWeight: 700, padding: '3px 8px',
                        cursor: 'pointer', fontFamily: "'Manrope', system-ui, sans-serif",
                        lineHeight: 1.4,
                      }}
                    >
                      {t('btn_play')}
                    </button>
                    <Toggle
                      value={!disabled.includes(name)}
                      onChange={() => {
                        const next = disabled.includes(name)
                          ? disabled.filter((a: string) => a !== name)
                          : [...disabled, name];
                        set('disabledAnimations', next);
                      }}
                    />
                  </div>
                </Row>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
            <Btn outline onClick={() => set('disabledAnimations', [])}>
              {t('btn_reset_defaults')}
            </Btn>
          </div>
        </Section>
      )}

      {isDev && (
        <Section title={t('section_import_anim')}>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <StyledInput value={importName} onChange={setImportName} placeholder={t('ph_anim_name')} />
            <textarea
              placeholder={t('ph_anim_script')}
              value={importScript}
              onChange={e => setImportScript(e.target.value)}
              rows={5}
              style={{
                background: 'var(--bg-a)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text-1)',
                fontSize: 12, padding: '8px 10px', outline: 'none',
                fontFamily: "'Courier New', monospace",
                resize: 'none', width: '100%', lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Btn outline disabled={!importName} onClick={() => window.electronAPI?.triggerEmote?.(importName)}>{t('btn_preview')}</Btn>
              <Btn
                disabled={!importName || !importScript || addStatus === 'adding'}
                onClick={async () => {
                  if (!importName || !importScript || !window.electronAPI) return;
                  setAddStatus('adding');
                  try {
                    const names = await window.electronAPI.addCustomAnimation!(importName, importScript);
                    onAnimationAdded(names);
                    setImportName('');
                    setImportScript('');
                    setAddStatus('added');
                    setTimeout(() => setAddStatus('idle'), 2000);
                  } catch {
                    setAddStatus('error');
                    setTimeout(() => setAddStatus('idle'), 2000);
                  }
                }}
              >{t('btn_add')}</Btn>
              {addStatus === 'added' && (
                <span style={{ color: 'var(--success)', fontSize: 11 }}>{t('import_success')}</span>
              )}
              {addStatus === 'error' && (
                <span style={{ color: 'var(--danger)', fontSize: 11 }}>{t('import_failed')}</span>
              )}
            </div>
          </div>
        </Section>
      )}
    </>
  );
}

function SkinsTab({ draft, set, t, isDev, skins, importName, setImportName, importFile, setImportFile,
  importStatus, setImportStatus, importing, setImporting }: {
  draft: any; set: (k: string, v: any) => void; t: (k: string) => string;
  isDev: boolean; skins: any[]; importName: string; setImportName: (v: string) => void;
  importFile: File | null; setImportFile: (f: File | null) => void;
  importStatus: { type: 'success' | 'error'; text: string } | null;
  setImportStatus: (s: { type: 'success' | 'error'; text: string } | null) => void;
  importing: boolean; setImporting: (v: boolean) => void;
}) {
  const previewUrl = importFile ? URL.createObjectURL(importFile) : null;

  const handleImport = async () => {
    if (!importFile || !importName || !window.electronAPI) return;
    setImporting(true);
    setImportStatus(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = (e.target?.result as string).split(',')[1];
      await window.electronAPI!.importSkin({ name: importName, pngBase64: b64 });
    };
    reader.readAsDataURL(importFile);
  };

  const handleDownloadTemplate = async () => {
    await window.electronAPI?.downloadSkinTemplate?.();
  };

  return (
    <>
      <Section title={t('section_skins')}>
        {skins.map(sk => {
          const isActive = draft.skin === sk.id;
          return (
            <div key={sk.id}>
              <Row label={sk.name}>
                <button
                  onClick={() => set('skin', sk.id)}
                  style={{
                    background: isActive ? 'var(--accent)' : 'var(--bg-a)',
                    color: isActive ? 'var(--accent-dark)' : 'var(--text-2)',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 7, padding: '4px 12px',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'Manrope', system-ui, sans-serif",
                    transition: 'all 0.15s',
                  }}
                >
                  {isActive ? t('btn_active') : t('btn_select')}
                </button>
              </Row>
            </div>
          );
        })}
        <div style={{ padding: '10px 16px' }}>
          <button
            onClick={() => set('skin', 'rocky')}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', fontSize: 12,
              fontFamily: "'Manrope', system-ui, sans-serif",
              textDecoration: 'underline', padding: 0,
            }}
          >
            {t('btn_reset_skin')}
          </button>
        </div>
      </Section>

      {isDev && <Section title={t('section_import_skin')}>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StyledInput
            value={importName} onChange={setImportName}
            placeholder={t('ph_skin_name')}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleDownloadTemplate}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--accent)', fontSize: 12,
                fontFamily: "'Manrope', system-ui, sans-serif",
                textDecoration: 'underline', padding: 0,
              }}
            >
              {t('lbl_dl_template')}
            </button>
            <Tooltip text={t('tip_dl_template')} />
          </div>

          <div>
            <label style={{
              display: 'block', color: 'var(--text-3)',
              fontSize: 11, marginBottom: 6,
              fontFamily: "'Manrope', system-ui, sans-serif",
            }}>
              {t('lbl_import_file')}
            </label>
            <input
              type="file" accept="image/png"
              onChange={e => {
                setImportFile(e.target.files?.[0] ?? null);
                setImportStatus(null);
              }}
              style={{
                color: 'var(--text-2)', fontSize: 12,
                fontFamily: "'Manrope', system-ui, sans-serif",
                width: '100%',
              }}
            />
          </div>

          {previewUrl && (
            <div style={{
              background: 'var(--bg-a)', border: '1px solid var(--border)',
              borderRadius: 10, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 8, maxHeight: 140,
            }}>
              <img src={previewUrl} alt="preview"
                style={{ maxHeight: 124, maxWidth: '100%', objectFit: 'contain', borderRadius: 6 }}
              />
            </div>
          )}

          {importStatus && (
            <div style={{
              padding: '8px 12px', borderRadius: 8,
              background: importStatus.type === 'success' ? 'var(--accent-dim)' : 'rgba(201,76,76,0.1)',
              border: `1px solid ${importStatus.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
              color: importStatus.type === 'success' ? 'var(--success)' : 'var(--danger)',
              fontSize: 12, lineHeight: 1.5,
              fontFamily: "'Manrope', system-ui, sans-serif",
            }}>
              {importStatus.text}
            </div>
          )}

          <Btn
            onClick={handleImport}
            disabled={!importFile || !importName || importing}
          >
            {importing ? t('importing') : t('btn_import')}
          </Btn>
        </div>
      </Section>}
    </>
  );
}

type DiagnoseResult = {
  ollama_running: boolean; model_found: boolean;
  configured_model?: string; available_models?: string[];
  ollama_error?: string;
  stt_loaded: boolean; tts_loaded: boolean; stt_active: boolean;
  audio_capable?: boolean; stt_mode?: string;
  error?: string;
};

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = ok ? 'var(--success)' : warn ? '#d4a84c' : 'var(--danger)';
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, flexShrink: 0, marginRight: 6,
    }} />
  );
}

function AiStatusPanel({ t }: { t: (k: string) => string }) {
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [checking, setChecking] = useState(false);

  const run = async () => {
    if (!window.electronAPI) return;
    setChecking(true);
    try {
      const r = await window.electronAPI.diagnoseAi();
      setResult(r as DiagnoseResult);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { run(); }, []);

  const rows: React.ReactNode[] = [];

  if (!result || result.error === 'Backend not running') {
    rows.push(
      <div key="offline" style={{ padding: '10px 16px', color: 'var(--danger)', fontSize: 12 }}>
        <StatusDot ok={false} /> {t('status_backend_offline')}
      </div>
    );
  } else {
    rows.push(
      <div key="ollama" style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-2)' }}>
          <StatusDot ok={result.ollama_running} />
          {result.ollama_running ? t('status_ollama_ok') : t('status_ollama_fail')}
        </div>
        {result.ollama_error && (
          <div style={{ fontSize: 11, color: 'var(--danger)', paddingLeft: 14 }}>
            {result.ollama_error}
          </div>
        )}
        {result.ollama_running && (
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
            <StatusDot ok={result.model_found} warn={!result.model_found} />
            {result.model_found
              ? `${t('status_model_ok')}: ${result.configured_model}`
              : `${t('status_model_missing')}: ${result.configured_model}`}
          </div>
        )}
        {!result.model_found && result.available_models && result.available_models.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-3)', paddingLeft: 14 }}>
            Available: {result.available_models.slice(0, 5).join(', ')}
          </div>
        )}
        {result.ollama_running && result.model_found && result.audio_capable !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
            <StatusDot ok={result.audio_capable} warn={!result.audio_capable} />
            {result.audio_capable
              ? `Audio STT · mode: ${result.stt_mode ?? 'auto'}`
              : `No audio STT · mode: ${result.stt_mode ?? 'auto'}`}
          </div>
        )}
      </div>
    );
    rows.push(
      <div key="stt" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 0, fontSize: 12, color: 'var(--text-2)' }}>
        <StatusDot ok={result.stt_loaded} />
        {result.stt_loaded ? t('status_stt_ok') : t('status_stt_fail')}
      </div>
    );
    rows.push(
      <div key="tts" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-2)' }}>
        <StatusDot ok={result.tts_loaded} />
        {result.tts_loaded ? t('status_tts_ok') : t('status_tts_fail')}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, paddingLeft: 4 }}>
        <p style={{
          fontFamily: "'CindieMono', 'Courier New', monospace",
          fontSize: 10.5, fontWeight: 700,
          letterSpacing: '0.09em', textTransform: 'uppercase',
          color: 'var(--accent)',
        }}>{t('section_ai_status')}</p>
        <button
          onClick={run}
          disabled={checking}
          style={{
            background: 'transparent', border: 'none', cursor: checking ? 'wait' : 'pointer',
            color: 'var(--accent)', fontSize: 11,
            fontFamily: "'Manrope', system-ui, sans-serif",
            opacity: checking ? 0.5 : 1, padding: 0,
          }}
        >
          {checking ? t('status_checking') : t('btn_run_diagnostics')}
        </button>
      </div>
      <div style={{
        background: 'var(--bg-b)', borderRadius: 14,
        border: '1px solid var(--border)',
      }}>
        {rows.map((r, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '0 14px' }} />}
            {r}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function AiTab({ draft, set, t, isDev, ollamaModels, audioDevices, refreshModels, onClearHistory }: {
  draft: any; set: (k: string, v: any) => void; t: (k: string) => string;
  isDev: boolean; ollamaModels: string[]; audioDevices: { inputs: string[]; outputs: string[] };
  refreshModels: () => void;
  onClearHistory: () => Promise<boolean>;
}) {
  const [cleared, setCleared] = useState(false);
  const defaultOpt = (label: string) => [{ value: 'default', label }];

  return (
    <>
      <AiStatusPanel t={t} />

      <Section title={t('section_llm')}>
        {isDev && (
          <Row label={t('lbl_ollama_dl')}>
            <button
              onClick={() => window.electronAPI?.openExternal?.('https://ollama.com/download')}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--accent)', fontSize: 12,
                fontFamily: "'Manrope', system-ui, sans-serif",
                textDecoration: 'underline', padding: 0,
              }}
            >
              ollama.com/download
            </button>
          </Row>
        )}
        {isDev && (
          <Row label={t('lbl_endpoint')} tip={t('tip_endpoint')}>
            <StyledInput
              value={draft.ollama?.endpoint ?? 'http://localhost:11434'}
              onChange={v => set('ollama.endpoint', v)}
              style={{ width: 196 }}
            />
          </Row>
        )}
        {isDev && (
          <Row label={t('lbl_model')} tip={t('tip_model')}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StyledSelect
                value={draft.ollama?.model ?? 'Rockyv8:latest'}
                options={ollamaModels.length
                  ? ollamaModels.map(m => ({ value: m, label: m }))
                  : [{ value: draft.ollama?.model ?? 'Rockyv8:latest', label: draft.ollama?.model ?? 'Rockyv8:latest' }]
                }
                onChange={v => set('ollama.model', v)}
              />
              <button
                onClick={refreshModels}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--accent)', fontSize: 12,
                  fontFamily: "'Manrope', system-ui, sans-serif",
                  textDecoration: 'underline', padding: 0,
                }}
              >
                {t('btn_refresh')}
              </button>
            </div>
          </Row>
        )}
        {isDev && (
          <Row label={t('lbl_context_size')} tip={t('tip_context_size')}>
            {(() => {
              const cur = draft.contextSize ?? 12;
              const idx = CONTEXT_STEPS.reduce((best, v, i) =>
                Math.abs(v - cur) < Math.abs(CONTEXT_STEPS[best] - cur) ? i : best, 0);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range" min={0} max={CONTEXT_STEPS.length - 1} step={1} value={idx}
                    onChange={e => set('contextSize', CONTEXT_STEPS[parseInt(e.target.value)])}
                    style={{ width: 96, accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <span style={{ color: 'var(--text-3)', fontSize: 12, minWidth: 80, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {CONTEXT_STEPS[idx]} messages
                  </span>
                </div>
              );
            })()}
          </Row>
        )}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <Btn
            onClick={async () => {
              const ok = await onClearHistory();
              if (ok) { setCleared(true); setTimeout(() => setCleared(false), 2500); }
            }}
            danger outline
            style={{ width: '100%', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span>{t('btn_clear_history')}</span>
            {cleared && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 400 }}>{t('history_cleared')}</span>}
          </Btn>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
            {t('tip_clear_history')}
          </p>
        </div>
        {isDev && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{t('lbl_system_prompt')}</span>
              <Tooltip text={t('tip_system_prompt')} />
            </div>
            <textarea
              value={draft.systemPromptSuffix ?? ''}
              onChange={e => set('systemPromptSuffix', e.target.value)}
              rows={4}
              placeholder="e.g. Always respond in under 2 sentences."
              style={{
                background: 'var(--bg-a)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text-1)',
                fontSize: 12, padding: '8px 10px', outline: 'none',
                fontFamily: "'Manrope', system-ui, sans-serif",
                resize: 'none', width: '100%', lineHeight: 1.6,
              }}
            />
          </div>
        )}
      </Section>

      <Section title={t('section_audio')}>
        {isDev && (
          <Row label={t('lbl_stt_mode')} tip={t('tip_stt_mode')}>
            <StyledSelect
              value={draft.stt?.mode ?? 'auto'}
              options={[
                { value: 'auto',     label: t('stt_mode_auto') },
                { value: 'model',    label: t('stt_mode_model') },
                { value: 'external', label: t('stt_mode_external') },
              ]}
              onChange={v => set('stt.mode', v)}
            />
          </Row>
        )}
        {isDev && (
          <Row label={t('lbl_stt_model')} tip={t('tip_stt_model')}>
            <StyledSelect
              value={draft.stt?.model ?? 'faster'}
              options={[
                { value: 'faster', label: t('stt_fast') },
                { value: 'better', label: t('stt_accurate') },
              ]}
              onChange={v => set('stt.model', v)}
            />
          </Row>
        )}
        <Row label={t('lbl_microphone')} tip={t('tip_microphone')} stacked>
          <StyledSelect
            value={draft.stt?.device ?? 'default'}
            options={[
              ...defaultOpt(t('opt_default')),
              ...audioDevices.inputs.map(d => ({ value: d, label: d })),
            ]}
            onChange={v => set('stt.device', v)}
            style={{ width: '100%' }}
          />
        </Row>
        <Row label={t('lbl_stt_language')} tip={t('tip_stt_language')} stacked>
          <StyledSelect
            value={draft.stt?.language ?? 'auto'}
            options={[
              { value: 'auto',  label: 'Auto (detect)' },
              { value: 'en',    label: 'English' },
              { value: 'zh',    label: 'Chinese' },
              { value: 'de',    label: 'German' },
              { value: 'es',    label: 'Spanish' },
              { value: 'ru',    label: 'Russian' },
              { value: 'ko',    label: 'Korean' },
              { value: 'fr',    label: 'French' },
              { value: 'ja',    label: 'Japanese' },
              { value: 'pt',    label: 'Portuguese' },
              { value: 'tr',    label: 'Turkish' },
              { value: 'pl',    label: 'Polish' },
              { value: 'nl',    label: 'Dutch' },
              { value: 'ar',    label: 'Arabic' },
              { value: 'sv',    label: 'Swedish' },
              { value: 'it',    label: 'Italian' },
              { value: 'id',    label: 'Indonesian' },
              { value: 'hi',    label: 'Hindi' },
              { value: 'fi',    label: 'Finnish' },
              { value: 'vi',    label: 'Vietnamese' },
            ]}
            onChange={v => set('stt.language', v)}
            style={{ width: '100%' }}
          />
        </Row>
        <Row label={t('lbl_speaker')} tip={t('tip_speaker')} stacked>
          <StyledSelect
            value={draft.tts?.device ?? 'default'}
            options={[
              ...defaultOpt(t('opt_default')),
              ...audioDevices.outputs.map(d => ({ value: d, label: d })),
            ]}
            onChange={v => set('tts.device', v)}
            style={{ width: '100%' }}
          />
        </Row>
        <SliderRow
          label={t('lbl_tts_volume')} tip={t('tip_tts_volume')}
          min={0} max={1} step={0.05} value={draft.tts?.volume ?? 1}
          onChange={v => set('tts.volume', v)}
          fmt={v => `${Math.round(v * 100)}%`}
        />
      </Section>
    </>
  );
}

function GitHubIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
    </svg>
  );
}

function OllamaIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd">
      <path d="M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z"/>
    </svg>
  );
}

function CreditsTab({ t }: { t: (k: string) => string; isDev: boolean; draft: any; set: (k: string, v: any) => void }) {
  const open = (url: string) => window.electronAPI?.openExternal?.(url);

  const card: React.CSSProperties = {
    background: 'var(--bg-b)', borderRadius: 12,
    border: '1px solid var(--border)', padding: '12px 15px',
  };
  const tag: React.CSSProperties = {
    fontFamily: "'CindieMono', monospace", fontSize: 9, fontWeight: 700,
    letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'var(--text-3)', marginBottom: 6,
  };
  const iconBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--accent)', padding: 0, lineHeight: 0,
    display: 'flex', alignItems: 'center', flexShrink: 0,
    opacity: 0.75, filter: 'drop-shadow(0 0 6px rgba(201,168,76,0.25))',
    transition: 'opacity 0.15s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      <div style={card}>
        <p style={tag}>Development</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <span style={{ fontFamily: "'CindieMono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-1)' }}>
            ADAM
          </span>
          <button onClick={() => open('https://github.com/adam1xz')} style={iconBtn} title="github.com/adam1xz">
            <GitHubIcon />
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
          Project idea creator, user interface, animations, IK, project maintainer.
        </p>
      </div>

      <div style={card}>
        <p style={tag}>Model Trainer</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <span style={{ fontFamily: "'CindieMono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-1)' }}>
            MIKOLAJ
          </span>
          <button onClick={() => open('https://ollama.com/crafteriumt/Rockyv8')} style={iconBtn} title="crafteriumt/Rockyv8 on Ollama">
            <OllamaIcon />
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
          Trained Qwen to act like Rocky.
        </p>
      </div>

      <div style={card}>
        <p style={{...tag, fontSize: 8}}>Source Material</p>
        <p style={{ fontFamily: "'CindieMono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-1)', marginBottom: 6 }}>
          Project Hail Mary
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>Andy Weir, 2021</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
          Rocky’s character and lore come from the book, well, also the movie. Go read it, then go watch it. Fan project, not affiliated.
        </p>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {([
          ['Model',      'Qwen 3.5 (via Ollama)'],
          ['STT',        'faster-whisper / Moonshine'],
          ['TTS',        'pocket-tts'],
          ['Framework',  'Electron · React 19 · Vite'],
          ['Mobile',     'Flutter · Dart'],
          ['Fonts',      'Manrope · CindieMono'],
          ['Icons',      'Lucide'],
        ] as [string, string][]).map(([k, v], i, arr) => (
          <React.Fragment key={k}>
            <div style={{ padding: '7px 15px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: "'CindieMono', monospace", letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{k}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-2)', textAlign: 'right', whiteSpace: 'nowrap' }}>{v}</span>
            </div>
            {i < arr.length - 1 && <div style={{ height: 1, background: 'var(--border)', margin: '0 15px' }} />}
          </React.Fragment>
        ))}
      </div>

    </div>
  );
}
