#Requires AutoHotkey v2.0
#SingleInstance Force

; Global paths - resolved relative to this script's directory
AppDir      := A_ScriptDir . "\.."
VenvPython  := AppDir . "\backend\venv\Scripts\python.exe"
BackendPy   := AppDir . "\backend\AI\backend.py"
ElectronExe := AppDir . "\app\Rocky.exe"
VoiceRef    := AppDir . "\update\tts\_rocky_mono.wav"

; Global state
BackendPort    := 0
BackendPID     := 0
StartMinimized := false
LaunchMode     := ""

; ---- Parse command line ----
for _, arg in A_Args {
    if (arg = "--minimized")
        StartMinimized := true
    else if (SubStr(arg, 1, 7) = "--mode=")
        LaunchMode := SubStr(arg, 8)
}

; ---- Tray setup ----
trayIcon := AppDir . "\app\resources\app.ico"
if FileExist(trayIcon)
    TraySetIcon(trayIcon)

A_TrayMenu.Delete()
A_TrayMenu.Add("Open PHR",      MenuOpen)
A_TrayMenu.Add("Desktop Mode",  MenuDesktop)
A_TrayMenu.Add("Mobile Mode",   MenuMobile)
A_TrayMenu.Add()
A_TrayMenu.Add("Quit",          MenuQuit)
A_TrayMenu.Default := "Open PHR"

MenuOpen(*)    { ShowLauncher() }
MenuDesktop(*) { Launch("desktop") }
MenuMobile(*)  { Launch("mobile") }
MenuQuit(*)    { ExitApp() }

; ---- Entry point ----
if StartMinimized {
    TrayTip("Project Hail Rocky", "Running in background. Double-click tray to open.", 3000)
    return
}
if (LaunchMode != "") {
    Launch(LaunchMode)
    return
}
ShowLauncher()
return

; -----------------------------------------------------------------------

ShowLauncher() {
    global LauncherGui
    if IsSet(LauncherGui) && WinExist("ahk_id " . LauncherGui.Hwnd)
        return

    LauncherGui := Gui("+AlwaysOnTop -Resize", "Project Hail Rocky")
    LauncherGui.BackColor := "1A1A2E"
    LauncherGui.SetFont("s16 Bold cE0E0FF", "Segoe UI")
    LauncherGui.Add("Text", "x30 y30 w300 Center", "Project Hail Rocky")
    LauncherGui.SetFont("s9 c888899", "Segoe UI")
    LauncherGui.Add("Text", "x30 y60 w300 Center", "Choose how to start Rocky")

    LauncherGui.SetFont("s11 cF0F0F0", "Segoe UI")
    dBtn := LauncherGui.Add("Button", "x30 y100 w300 h50", "Rocky - Desktop Mode")
    mBtn := LauncherGui.Add("Button", "x30 y162 w300 h50", "Rocky - Mobile Mode")

    dBtn.OnEvent("Click", (*) => Launch("desktop"))
    mBtn.OnEvent("Click", (*) => Launch("mobile"))

    LauncherGui.SetFont("s9 c888899", "Segoe UI")
    LauncherGui.Add("Text", "x0 y234 w360 h1 Background333355")
    sBtn := LauncherGui.Add("Text", "x30 y246 w70",  "Settings")
    aBtn := LauncherGui.Add("Text", "x120 y246 w60", "About")
    qBtn := LauncherGui.Add("Text", "x210 y246 w60", "Quit")

    sBtn.OnEvent("Click", (*) => RunElectron("--open-settings"))
    aBtn.OnEvent("Click", (*) => Run("https://github.com/adam1xz/project-hail-rocky"))
    qBtn.OnEvent("Click", (*) => ExitApp())

    LauncherGui.OnEvent("Close", (*) => LauncherGui.Hide())
    LauncherGui.Show("w360 h278")
}

Launch(mode) {
    global BackendPort, LaunchMode, LauncherGui
    LaunchMode := mode

    if IsSet(LauncherGui) && WinExist("ahk_id " . LauncherGui.Hwnd)
        LauncherGui.Hide()

    if (BackendPort = 0) {
        if !StartBackend()
            return
    }

    RunElectron("--backend-port " . BackendPort . " --mode " . mode)
}

RunElectron(extraArgs := "") {
    global ElectronExe
    target := (extraArgs != "") ? (ElectronExe . " " . extraArgs) : ElectronExe
    try {
        Run(target)
    } catch as e {
        MsgBox("Could not launch Rocky.`nPath: " . ElectronExe . "`nError: " . e.Message,
            "Launch Error", 0x10)
    }
}

StartBackend() {
    global BackendPort, BackendPID, VenvPython, BackendPy, VoiceRef

    if !FileExist(VenvPython) {
        MsgBox("Python venv not found.`nExpected: " . VenvPython
            . "`n`nRun the PHR installer to set up the backend.", "Backend Error", 0x10)
        return false
    }
    if !FileExist(BackendPy) {
        MsgBox("backend.py not found.`nExpected: " . BackendPy, "Backend Error", 0x10)
        return false
    }

    voiceArg := FileExist(VoiceRef) ? ("--voice-ref `"" . VoiceRef . "`"") : ""
    cmd := "`"" . VenvPython . "`" `"" . BackendPy . "`" " . voiceArg . " --lan"

    pBar := Gui("+AlwaysOnTop -SysMenu", "Starting Rocky...")
    pBar.BackColor := "1A1A2E"
    pBar.SetFont("s10 cF0F0F0", "Segoe UI")
    lbl := pBar.Add("Text", "x20 y20 w280", "Starting backend, please wait...")
    pBar.Show("w320 h80")

    shell  := ComObject("WScript.Shell")
    proc   := shell.Exec("%ComSpec% /c " . cmd)
    BackendPID := proc.ProcessID

    deadline := A_TickCount + 45000
    found    := false
    while (A_TickCount < deadline && !proc.StdOut.AtEndOfStream) {
        line := Trim(proc.StdOut.ReadLine())
        if SubStr(line, 1, 5) = "PORT:" {
            BackendPort := Integer(SubStr(line, 6))
            lbl.Value := "Backend ready on port " . BackendPort
            found := true
            break
        }
        Sleep(200)
    }

    pBar.Destroy()

    if !found {
        MsgBox("Backend did not report a port within 45 seconds.`n`nCheck: " . A_MyDocuments . "\.phr\logs\",
            "Timeout", 0x30)
        return false
    }
    return true
}

; Tray double-click -> show launcher
OnMessage(0x404, OnTrayMsg)
OnTrayMsg(wp, lp, *) {
    if (lp = 0x203)
        ShowLauncher()
}

; Kill backend on exit
OnExit(OnAppExit)
OnAppExit(reason, code) {
    global BackendPID
    if (BackendPID > 0) {
        try ProcessClose(BackendPID)
    }
}
