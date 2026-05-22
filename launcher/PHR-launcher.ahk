#Requires AutoHotkey v2.0
#SingleInstance Force

; PHR Launcher - starts the backend and Electron app
; Supports --minimized flag for auto-start via Task Scheduler

AppDir      := A_ScriptDir "\.."
BackendDir  := AppDir "\backend"
VenvPython  := BackendDir "\venv\Scripts\python.exe"
BackendPy   := BackendDir "\AI\backend.py"
ElectronExe := AppDir "\app\Rocky.exe"
VoiceRef    := AppDir "\update\tts\_rocky_mono.wav"
TrayIconPath := AppDir "\app\resources\app.ico"

BackendPort  := 0
BackendPID   := 0
LaunchMode   := ""
StartMinimized := False

; ---- Parse command line ----

for _, arg in A_Args {
    if (arg = "--minimized")
        StartMinimized := True
    if (InStr(arg, "--mode="))
        LaunchMode := SubStr(arg, 8)
}

; ---- Tray setup ----

TraySetIcon(TrayIconPath, , true)
A_TrayMenu.Delete()
A_TrayMenu.Add("Open PHR", (*) => ShowLauncher())
A_TrayMenu.Add("Desktop Mode", (*) => Launch("desktop"))
A_TrayMenu.Add("Mobile Mode", (*) => Launch("mobile"))
A_TrayMenu.Add()
A_TrayMenu.Add("Quit", (*) => ExitApp())
A_TrayMenu.Default := "Open PHR"

; ---- Start ----

if (StartMinimized) {
    ; Start to tray, launch backend preemptively in desktop mode
    TrayTip("Project Hail Rocky", "Running in background. Double-click tray icon to open.", 3)
    return
}

if (LaunchMode != "") {
    Launch(LaunchMode)
    return
}

ShowLauncher()
return

; ---- Launcher Window ----

ShowLauncher() {
    global LauncherGui
    if IsSet(LauncherGui) && WinExist("ahk_id " LauncherGui.Hwnd)
        return

    LauncherGui := Gui("+AlwaysOnTop -Resize", "Project Hail Rocky")
    LauncherGui.BackColor := "1A1A2E"
    LauncherGui.SetFont("s11 cF0F0F0", "Segoe UI")

    LauncherGui.Add("Text", "x30 y30 w300 Center cE0E0FF s16 Bold", "Project Hail Rocky")
    LauncherGui.Add("Text", "x30 y62 w300 Center c888899 s9", "Choose how to start Rocky")

    LauncherGui.SetFont("s11 cF0F0F0", "Segoe UI")

    BtnDesktop := LauncherGui.Add("Button", "x30 y104 w300 h52", "  Rocky - Desktop Mode")
    BtnDesktop.OnEvent("Click", (*) => Launch("desktop"))

    BtnMobile := LauncherGui.Add("Button", "x30 y168 w300 h52", "  Rocky - Mobile Mode")
    BtnMobile.OnEvent("Click", (*) => Launch("mobile"))

    LauncherGui.Add("Text", "x0 y240 w360 h1 Background333355")

    LauncherGui.SetFont("s9 c888899")
    BtnSettings := LauncherGui.Add("Text", "x30 y252 w80 Underline cAAAAAA", "Settings")
    BtnAbout    := LauncherGui.Add("Text", "x130 y252 w60 Underline cAAAAAA", "About")
    BtnQuit     := LauncherGui.Add("Text", "x220 y252 w60 Underline cAAAAAA", "Quit")

    BtnSettings.OnEvent("Click", (*) => Run(ElectronExe " --open-settings"))
    BtnAbout.OnEvent("Click",    (*) => Run("https://github.com/adam1xz/project-hail-rocky"))
    BtnQuit.OnEvent("Click",     (*) => ExitApp())

    LauncherGui.OnEvent("Close", (*) => LauncherGui.Hide())
    LauncherGui.Show("w360 h286")
}

; ---- Launch sequence ----

Launch(mode) {
    global BackendPort, BackendPID, LaunchMode
    LaunchMode := mode

    if IsSet(LauncherGui)
        LauncherGui.Hide()

    if (BackendPort = 0) {
        if !StartBackend()
            return
    }

    args := "--backend-port " BackendPort " --mode " mode
    try {
        Run(ElectronExe " " args)
    } catch as e {
        MsgBox("Could not launch Rocky.`n`nPath: " ElectronExe "`nError: " e.Message,
            "Launch Error", 0x10)
    }
}

; ---- Backend management ----

StartBackend() {
    global BackendPort, BackendPID, VenvPython, BackendPy, VoiceRef

    if !(FileExist(VenvPython)) {
        MsgBox("Python virtual environment not found.`n`nExpected: " VenvPython
            "`n`nRun the PHR installer to set up the backend.",
            "Backend Error", 0x10)
        return false
    }
    if !(FileExist(BackendPy)) {
        MsgBox("backend.py not found.`n`nExpected: " BackendPy,
            "Backend Error", 0x10)
        return false
    }

    voiceArg := FileExist(VoiceRef) ? "--voice-ref `"" VoiceRef "`"" : ""
    cmd := "`"" VenvPython "`" `"" BackendPy "`" " voiceArg " --lan"

    StatusGui := Gui("+AlwaysOnTop -SysMenu", "Starting Rocky...")
    StatusGui.BackColor := "1A1A2E"
    StatusGui.SetFont("s10 cF0F0F0", "Segoe UI")
    StatusLbl := StatusGui.Add("Text", "x20 y20 w280", "Starting backend...")
    StatusGui.Show("w320 h80")

    pipe := {}
    BackendPID := 0

    try {
        obj := ComObject("WScript.Shell")
        exec := obj.Exec("%ComSpec% /c " cmd)
        BackendPID := exec.ProcessID

        deadline := A_TickCount + 45000
        while (A_TickCount < deadline) {
            if !exec.StdOut.AtEndOfStream {
                line := Trim(exec.StdOut.ReadLine())
                if (SubStr(line, 1, 5) = "PORT:") {
                    BackendPort := Integer(SubStr(line, 6))
                    StatusLbl.Value := "Backend ready on port " BackendPort
                    break
                }
            }
            Sleep(200)
        }
    } catch as e {
        StatusGui.Destroy()
        MsgBox("Failed to start backend.`n" e.Message, "Error", 0x10)
        return false
    }

    StatusGui.Destroy()

    if (BackendPort = 0) {
        MsgBox("Backend did not report a port within 45 seconds.`n`nCheck logs at:`n%USERPROFILE%\.phr\logs\",
            "Backend Timeout", 0x30)
        return false
    }

    return true
}

; ---- Tray double-click ----

OnMessage(0x404, TrayEvent)
TrayEvent(wParam, lParam, *) {
    if (lParam = 0x203)  ; double-click
        ShowLauncher()
}

; ---- Cleanup on exit ----

OnExit(CleanupBackend)
CleanupBackend(*) {
    global BackendPID
    if (BackendPID > 0) {
        try ProcessClose(BackendPID)
        catch
    }
}
