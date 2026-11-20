#define MyAppName "Faculty Performance Evaluation System"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Faculty Performance Evaluation"
#define MyAppExeName "start.bat"

[Setup]
AppId={{8B0E6F4B-5D0E-4B8E-9C3D-7F6E5A2B1C90}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}

DefaultDirName={autopf}\Faculty Performance Evaluation
DefaultGroupName={#MyAppName}

OutputDir=..\installer-output
OutputBaseFilename=FacultyPerformanceEvaluationSetup

Compression=lzma
SolidCompression=yes

PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible

DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\frontend\dist\facultyeval-mark.svg

[Files]

; Backend application
Source: "..\backend\app\*"; DestDir: "{app}\backend\app"; \
    Flags: ignoreversion recursesubdirs createallsubdirs; \
    Excludes: "__pycache__\*"

Source: "..\backend\data\*"; DestDir: "{app}\backend\data"; \
    Flags: ignoreversion recursesubdirs createallsubdirs

Source: "..\backend\main.py"; DestDir: "{app}\backend"; \
    Flags: ignoreversion

Source: "..\backend\requirements.txt"; DestDir: "{app}\backend"; \
    Flags: ignoreversion

; Frontend production build only
Source: "..\frontend\dist\*"; DestDir: "{app}\frontend\dist"; \
    Flags: ignoreversion recursesubdirs createallsubdirs

; Installer scripts
Source: "setup.ps1"; DestDir: "{app}\installer"; \
    Flags: ignoreversion

Source: "start.bat"; DestDir: "{app}\installer"; \
    Flags: ignoreversion

Source: "create_admin.py"; DestDir: "{app}\installer"; \
    Flags: ignoreversion

[Dirs]
Name: "{app}\backend\uploads"; Permissions: users-modify
Name: "{app}\backend\data"; Permissions: users-modify

[Icons]
Name: "{autodesktop}\Faculty Performance Evaluation"; \
    Filename: "{app}\installer\start.bat"; \
    WorkingDir: "{app}\backend"

Name: "{group}\Faculty Performance Evaluation"; \
    Filename: "{app}\installer\start.bat"; \
    WorkingDir: "{app}\backend"

[Run]
Filename: "powershell.exe"; \
    Parameters: "-ExecutionPolicy Bypass -File ""{app}\installer\setup.ps1"""; \
    WorkingDir: "{app}"; \
    Flags: runascurrentuser waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{app}"