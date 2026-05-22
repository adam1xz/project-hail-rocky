#define MyAppName    "Project Hail Rocky"
#define MyAppVersion "1.0.0"
#define MyAppExeName "PHR.exe"
#define MyAppId      "{A8C7F2E1-4D93-4B5A-9E6F-2C1A8D730B47}"
#define MyAppURL     "https://github.com/adam1xz/project-hail-rocky"
#define OllamaModel  "crafteriumt/Rockyv8"

[Setup]
AppId={#MyAppId}
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
WizardImageFile=assets\side-panel.bmp
WizardImageStretch=yes
WizardSmallImageFile=assets\icon-small.bmp
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
MinVersion=10.0.17763
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableWelcomePage=no
LicenseFile=assets\license.txt

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "polish"; MessagesFile: "compiler:Languages\Polish.isl"

[Types]
Name: "full";   Description: "Full installation"
Name: "custom"; Description: "Custom installation"; Flags: iscustom

[Components]
Name: "app";              Description: "PHR Desktop App";                   Types: full custom; Flags: fixed
Name: "backend";          Description: "Python backend + dependencies";     Types: full custom
Name: "ollama";           Description: "Ollama (install if not present)";   Types: full custom
Name: "model";            Description: "Pull Rocky v8 model (~4-8 GB)";    Types: full custom
Name: "shortcut_desktop"; Description: "Desktop shortcut";                  Types: full custom
Name: "shortcut_menu";    Description: "Start Menu entry";                  Types: full custom
Name: "autostart";        Description: "Start on Windows login (to tray)";  Types: custom

[Files]
; Launcher (compiled AHK)
Source: "..\launcher\PHR.exe"; DestDir: "{app}"; Flags: ignoreversion

; Electron desktop app (unpacked build from electron-builder --dir)
Source: "..\dist-release\win-unpacked\*"; DestDir: "{app}\app"; \
  Flags: ignoreversion recursesubdirs createallsubdirs

; Python backend
Source: "..\AI\backend.py";       DestDir: "{app}\backend\AI"; \
  Components: backend; Flags: ignoreversion
Source: "..\AI\requirements.txt"; DestDir: "{app}\backend";    \
  Components: backend; Flags: ignoreversion

; Skin assets
Source: "..\SKIN\assembly_data.json"; DestDir: "{app}\skin"; \
  Flags: ignoreversion skipifsourcedoesntexist
Source: "..\SKIN\extracted_pieces\*"; DestDir: "{app}\skin\extracted_pieces"; \
  Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; Voice reference file
Source: "..\update\tts\_rocky_mono.wav"; DestDir: "{app}\update\tts"; \
  Flags: ignoreversion skipifsourcedoesntexist

; Post-install scripts (run from {tmp}, deleted after)
Source: "scripts\setup-backend.ps1"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "scripts\setup-ollama.ps1";  DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "scripts\pull-model.ps1";    DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{autodesktop}\{#MyAppName}";          Filename: "{app}\{#MyAppExeName}"; \
  Components: shortcut_desktop
Name: "{group}\{#MyAppName}";                Filename: "{app}\{#MyAppExeName}"; \
  Components: shortcut_menu
Name: "{group}\Uninstall {#MyAppName}";      Filename: "{uninstallexe}";        \
  Components: shortcut_menu

[Run]
; Create .phr home directory
Filename: "cmd.exe"; Parameters: "/c mkdir ""{userappdata}\.phr\history"" ""{userappdata}\.phr\logs"""; \
  Flags: runhidden; StatusMsg: "Creating user data directory..."

; Write initial config
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""if (-not (Test-Path '{userappdata}\.phr\config.json')) {{ '{{""firstRun"":true,""language"":""en""}}' | Set-Content '{userappdata}\.phr\config.json' }}"""; \
  Flags: runhidden; StatusMsg: "Writing default configuration..."

; Python venv + pip install
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\setup-backend.ps1"" -AppDir ""{app}"""; \
  Components: backend; Flags: runhidden; StatusMsg: "Setting up Python virtual environment..."

; Ollama install (if needed)
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\setup-ollama.ps1"" -TmpDir ""{tmp}"""; \
  Components: ollama; Flags: runhidden; StatusMsg: "Checking Ollama..."

; Pull Rocky v8 model
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\pull-model.ps1"" -Model ""{#OllamaModel}"""; \
  Components: model; Flags: runhidden; StatusMsg: "Pulling Rocky v8 model (this will take a few minutes)..."

; Launch app on finish
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; \
  Flags: nowait postinstall skipifsilent

[Code]

var
  LangPage:   TWizardPage;
  QrPage:     TWizardPage;
  AdvPanel:   TPanel;
  AdvToggle:  TLabel;
  PyPathEdit: TEdit;
  OllamaPort: TEdit;
  AdvVisible: Boolean;

{ ---- Language Page ---- }

procedure CreateLanguagePage;
var
  Lbl:     TLabel;
  BtnEn:   TRadioButton;
  BtnPl:   TRadioButton;
begin
  LangPage := CreateCustomPage(wpWelcome,
    'Language / Jezyk',
    'Choose installer language and default app language.');

  Lbl := TLabel.Create(LangPage);
  Lbl.Parent  := LangPage.Surface;
  Lbl.Caption := 'Select your language:';
  Lbl.Font.Size := 10;
  Lbl.Left := 0;
  Lbl.Top  := 16;
  Lbl.Width := 300;

  BtnEn := TRadioButton.Create(LangPage);
  BtnEn.Parent  := LangPage.Surface;
  BtnEn.Caption := 'English';
  BtnEn.Left    := 0;
  BtnEn.Top     := 48;
  BtnEn.Width   := 200;
  BtnEn.Font.Size := 11;
  BtnEn.Checked := True;

  BtnPl := TRadioButton.Create(LangPage);
  BtnPl.Parent  := LangPage.Surface;
  BtnPl.Caption := 'Polski';
  BtnPl.Left    := 0;
  BtnPl.Top     := 80;
  BtnPl.Width   := 200;
  BtnPl.Font.Size := 11;
end;

{ ---- QR / Mobile Page ---- }

procedure CreateQrPage;
var
  ImgLbl:    TLabel;
  TextLbl:   TLabel;
  ManualLbl: TLabel;
begin
  QrPage := CreateCustomPage(wpSelectComponents,
    'Rocky on Android',
    'Get the Rocky companion app on your phone.');

  ImgLbl := TLabel.Create(QrPage);
  ImgLbl.Parent    := QrPage.Surface;
  ImgLbl.Caption   := '[QR]';
  ImgLbl.Font.Size := 32;
  ImgLbl.Left      := 20;
  ImgLbl.Top       := 20;
  ImgLbl.Width     := 120;
  ImgLbl.Height    := 120;

  TextLbl := TLabel.Create(QrPage);
  TextLbl.Parent    := QrPage.Surface;
  TextLbl.Caption   := 'Scan this code with your Android phone' + #13#10 +
                        'to install the Rocky companion app.';
  TextLbl.Left      := 160;
  TextLbl.Top       := 20;
  TextLbl.Width     := 280;
  TextLbl.WordWrap  := True;
  TextLbl.Font.Size := 10;

  ManualLbl := TLabel.Create(QrPage);
  ManualLbl.Parent   := QrPage.Surface;
  ManualLbl.Caption  := 'Manual download:' + #13#10 +
    'github.com/adam1xz/project-hail-rocky-app/releases' + #13#10 + #13#10 +
    'You can also enter your PC' + #39 + 's IP address' + #13#10 +
    'manually in the Rocky app settings.';
  ManualLbl.Left     := 160;
  ManualLbl.Top      := 80;
  ManualLbl.Width    := 280;
  ManualLbl.WordWrap := True;
  ManualLbl.Font.Size := 9;
end;

{ ---- Advanced Toggle on Components Page ---- }

procedure AdvToggleClick(Sender: TObject);
begin
  AdvVisible := not AdvVisible;
  AdvPanel.Visible := AdvVisible;
  if AdvVisible then
    AdvToggle.Caption := 'Advanced options (hide)'
  else
    AdvToggle.Caption := 'Advanced options...';
end;

procedure CreateAdvancedPanel;
var
  PyLbl:     TLabel;
  PortLbl:   TLabel;
begin
  AdvToggle := TLabel.Create(WizardForm);
  AdvToggle.Parent   := WizardForm.SelectComponentsPage;
  AdvToggle.Caption  := 'Advanced options...';
  AdvToggle.Font.Color := clBlue;
  AdvToggle.Cursor   := crHand;
  AdvToggle.Font.Style := [fsUnderline];
  AdvToggle.Top      := WizardForm.SelectComponentsPage.Height - 60;
  AdvToggle.Left     := 8;
  AdvToggle.OnClick  := @AdvToggleClick;

  AdvPanel := TPanel.Create(WizardForm);
  AdvPanel.Parent  := WizardForm.SelectComponentsPage;
  AdvPanel.BevelOuter := bvNone;
  AdvPanel.Top     := WizardForm.SelectComponentsPage.Height - 44;
  AdvPanel.Left    := 8;
  AdvPanel.Width   := WizardForm.SelectComponentsPage.Width - 16;
  AdvPanel.Height  := 40;
  AdvPanel.Visible := False;

  PyLbl := TLabel.Create(AdvPanel);
  PyLbl.Parent  := AdvPanel;
  PyLbl.Caption := 'Python path override:';
  PyLbl.Left    := 0;
  PyLbl.Top     := 4;
  PyLbl.Width   := 140;

  PyPathEdit := TEdit.Create(AdvPanel);
  PyPathEdit.Parent := AdvPanel;
  PyPathEdit.Left   := 144;
  PyPathEdit.Top    := 0;
  PyPathEdit.Width  := 180;
  PyPathEdit.Text   := '';

  PortLbl := TLabel.Create(AdvPanel);
  PortLbl.Parent  := AdvPanel;
  PortLbl.Caption := 'Ollama port:';
  PortLbl.Left    := 336;
  PortLbl.Top     := 4;
  PortLbl.Width   := 80;

  OllamaPort := TEdit.Create(AdvPanel);
  OllamaPort.Parent := AdvPanel;
  OllamaPort.Left   := 420;
  OllamaPort.Top    := 0;
  OllamaPort.Width  := 60;
  OllamaPort.Text   := '11434';
end;

{ ---- Autostart Task ---- }

procedure CreateAutostartTask;
var
  AppExe:     String;
  ResultCode: Integer;
begin
  AppExe := ExpandConstant('{app}\{#MyAppExeName}');
  Exec('schtasks.exe',
    '/create /tn "PHR - Project Hail Rocky" /tr """' + AppExe + '"" --minimized"' +
    ' /sc onlogon /rl limited /f',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure RemoveAutostartTask;
var
  ResultCode: Integer;
begin
  Exec('schtasks.exe',
    '/delete /tn "PHR - Project Hail Rocky" /f',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

{ ---- Wire everything up ---- }

procedure InitializeWizard;
begin
  AdvVisible := False;
  CreateLanguagePage;
  CreateQrPage;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    if IsComponentSelected('autostart') then
      CreateAutostartTask;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpSelectComponents then
    CreateAdvancedPanel;
end;

{ ---- Uninstall: remove autostart task ---- }

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RemoveAutostartTask;
end;
