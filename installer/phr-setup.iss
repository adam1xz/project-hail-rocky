#define MyAppName    "Project Hail Rocky"
#define MyAppVersion "1.0.0"
#define MyAppExeName "PHR.exe"
#define MyAppURL     "https://github.com/adam1xz/project-hail-rocky"
#define OllamaModel  "crafteriumt/Rockyv8"

[Setup]
AppId={{A8C7F2E1-4D93-4B5A-9E6F-2C1A8D730B47}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=adam1xz
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
DefaultDirName={localappdata}\PHR
DefaultGroupName=PHR
AllowNoIcons=yes
OutputDir=..\dist-installer
OutputBaseFilename=PHR-Setup-{#MyAppVersion}
SetupIconFile=assets\icon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
WizardImageFile=assets\side-panel.png
WizardImageStretch=yes
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
MinVersion=10.0.17763
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=assets\license.txt

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "polish";  MessagesFile: "compiler:Languages\Polish.isl"

[Types]
Name: "full";   Description: "Full installation"
Name: "custom"; Description: "Custom installation"; Flags: iscustom

[Components]
Name: "app";              Description: "PHR Desktop App (required)";          Types: full custom; Flags: fixed
Name: "backend";          Description: "Python backend + dependencies";        Types: full custom
Name: "ollama";           Description: "Ollama - install if not present";      Types: full custom
Name: "model";            Description: "Download Rocky v8 model  (~4-8 GB)";  Types: full custom
Name: "shortcut_desktop"; Description: "Desktop shortcut";                     Types: full custom
Name: "shortcut_menu";    Description: "Start Menu entry";                     Types: full custom
Name: "autostart";        Description: "Start on Windows login (to tray)";     Types: custom

[Files]
; Launcher (compiled from launcher\PHR-launcher.ahk)
Source: "..\launcher\PHR.exe"; DestDir: "{app}"; Flags: ignoreversion

; Electron desktop app  (from: npm run build && electron-builder --dir)
Source: "..\dist-release\win-unpacked\*"; DestDir: "{app}\app"; \
  Flags: ignoreversion recursesubdirs createallsubdirs

; Python backend
Source: "..\AI\backend.py";       DestDir: "{app}\backend\AI"; \
  Components: backend; Flags: ignoreversion
Source: "..\AI\requirements.txt"; DestDir: "{app}\backend";    \
  Components: backend; Flags: ignoreversion

; Skin assets - desktop (extracted SVG pieces used by Electron renderer)
Source: "..\SKIN\assembly_data.json";  DestDir: "{app}\skin"; \
  Flags: ignoreversion skipifsourcedoesntexist
Source: "..\SKIN\extracted_pieces\*";  DestDir: "{app}\skin\extracted_pieces"; \
  Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; Skin assets - backend (served by FastAPI for mobile /skin-layout and /skins/* endpoints)
Source: "..\public\assembly_data.json"; DestDir: "{app}\backend\public"; \
  Flags: ignoreversion skipifsourcedoesntexist
Source: "..\public\extracted_pieces\*"; DestDir: "{app}\backend\public\extracted_pieces"; \
  Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: "..\public\skins\*"; DestDir: "{app}\backend\public\skins"; \
  Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; Voice reference + TTS voice-cloning weights (Kyutai pocket-tts, CC-BY-4.0)
; Weights ship as <100MB .partNN chunks (GitHub's file size limit) and are
; reassembled automatically on first backend launch - see backend.py
Source: "..\update\tts\_rocky_mono.wav"; DestDir: "{app}\update\tts"; \
  Flags: ignoreversion skipifsourcedoesntexist
Source: "..\update\tts\pocket-tts-cloning-english.safetensors.part*"; DestDir: "{app}\update\tts"; \
  Flags: ignoreversion skipifsourcedoesntexist

; Post-install helper scripts (extracted to temp, auto-deleted after [Run])
Source: "scripts\write-config.ps1";  DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "scripts\setup-backend.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall; Components: backend
Source: "scripts\setup-ollama.ps1";  DestDir: "{tmp}"; Flags: deleteafterinstall; Components: ollama
Source: "scripts\pull-model.ps1";    DestDir: "{tmp}"; Flags: deleteafterinstall; Components: model

[UninstallDelete]
; Inno's auto-uninstall only removes files it itself installed via [Files].
; The Python venv (and any pip/pycache leftovers) is created at runtime by
; setup-backend.ps1 and is invisible to that mechanism, which left {app}
; non-empty and undeleted. Force-remove the whole tree instead.
Type: filesandordirs; Name: "{app}"

[Icons]
Name: "{autodesktop}\{#MyAppName}";          Filename: "{app}\{#MyAppExeName}"; \
  Components: shortcut_desktop
Name: "{group}\{#MyAppName}";                Filename: "{app}\{#MyAppExeName}"; \
  Components: shortcut_menu
Name: "{group}\Uninstall {#MyAppName}";      Filename: "{uninstallexe}";        \
  Components: shortcut_menu

[Run]
; Create .phr home dir and write initial config
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\write-config.ps1"""; \
  Flags: runhidden; StatusMsg: "Creating user data directory..."

; Set up Python venv and install packages
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\setup-backend.ps1"" -AppDir ""{app}"""; \
  Components: backend; Flags: runhidden; StatusMsg: "Setting up Python virtual environment..."

; Download and install Ollama if not present
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\setup-ollama.ps1"" -TmpDir ""{tmp}"""; \
  Components: ollama; Flags: runhidden; StatusMsg: "Checking Ollama..."

; Pull Rocky v8 model (slow - several GB)
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\pull-model.ps1"" -Model ""{#OllamaModel}"""; \
  Components: model; Flags: runhidden; \
  StatusMsg: "Pulling Rocky v8 model... this may take several minutes"

; Offer to launch after finish
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; \
  Flags: nowait postinstall skipifsilent

[Code]

var
  QrPage:     TWizardPage;
  ResultCode: Integer;

{ ---- Screen 5: Mobile QR ---- }

procedure CreateQrPage;
var
  HeadLbl:  TLabel;
  LinkLbl:  TLabel;
  NoteLbl:  TLabel;
begin
  QrPage := CreateCustomPage(wpSelectComponents,
    'Rocky on Android',
    'The companion app is coming soon.');

  HeadLbl := TLabel.Create(QrPage);
  HeadLbl.Parent     := QrPage.Surface;
  HeadLbl.Caption    := 'Coming Soon';
  HeadLbl.Font.Size  := 18;
  HeadLbl.Font.Style := [fsBold];
  HeadLbl.Left       := 0;
  HeadLbl.Top        := 16;
  HeadLbl.Width      := 420;
  HeadLbl.Alignment  := taCenter;

  LinkLbl := TLabel.Create(QrPage);
  LinkLbl.Parent    := QrPage.Surface;
  LinkLbl.Caption   := 'github.com/adam1xz';
  LinkLbl.Left      := 0;
  LinkLbl.Top       := 80;
  LinkLbl.Width     := 420;
  LinkLbl.Alignment := taCenter;
  LinkLbl.Font.Size := 9;
  LinkLbl.Font.Color := clNavy;

  NoteLbl := TLabel.Create(QrPage);
  NoteLbl.Parent    := QrPage.Surface;
  NoteLbl.Caption   := 'Click Next to continue.';
  NoteLbl.Left      := 0;
  NoteLbl.Top       := 110;
  NoteLbl.Width     := 420;
  NoteLbl.Alignment := taCenter;
  NoteLbl.Font.Size := 8;
  NoteLbl.Font.Color := clGray;
end;

{ ---- Autostart task (created in ssPostInstall) ---- }

procedure CreateAutostartTask;
begin
  Exec('schtasks.exe',
    '/create /tn "PHR - Project Hail Rocky" /tr """' +
    ExpandConstant('{app}\{#MyAppExeName}') +
    '"" --minimized" /sc onlogon /rl limited /f',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure RemoveAutostartTask;
begin
  Exec('schtasks.exe', '/delete /tn "PHR - Project Hail Rocky" /f',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

{ ---- Wire up ---- }

procedure InitializeWizard;
begin
  CreateQrPage;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    if WizardIsComponentSelected('autostart') then
      CreateAutostartTask;
end;

{ ---- Uninstall: ask about user data, remove autostart task ---- }

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  PhrDir, RockyLogDir, SettingsDir, Listing: String;
begin
  case CurUninstallStep of

    usUninstall: begin
      { .phr: legacy install/setup logs. .rocky: runtime conversation/debug
        logs (backend.py). rocky-desktop: electron-store settings + browser
        caches (Electron's userData dir, named after package.json "name"). }
      PhrDir      := GetEnv('USERPROFILE') + '\.phr';
      RockyLogDir := GetEnv('USERPROFILE') + '\.rocky';
      SettingsDir := GetEnv('APPDATA') + '\rocky-desktop';

      Listing := '';
      if DirExists(PhrDir)      then Listing := Listing + #13#10 + PhrDir;
      if DirExists(RockyLogDir) then Listing := Listing + #13#10 + RockyLogDir;
      if DirExists(SettingsDir) then Listing := Listing + #13#10 + SettingsDir;

      if Listing <> '' then begin
        if MsgBox(
          'Delete Rocky user data?' + #13#10#13#10 +
          'Locations:' + Listing + #13#10#13#10 +
          '(chat history, settings, logs, cache)' + #13#10#13#10 +
          'Click Yes to delete. Click No to keep it.',
          mbConfirmation, MB_YESNO) = IDYES then
        begin
          if DirExists(PhrDir)      then DelTree(PhrDir, True, True, True);
          if DirExists(RockyLogDir) then DelTree(RockyLogDir, True, True, True);
          if DirExists(SettingsDir) then DelTree(SettingsDir, True, True, True);
        end;
      end;
    end;

    usPostUninstall: begin
      RemoveAutostartTask;
    end;

  end;
end;
