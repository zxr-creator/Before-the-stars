; Inno Setup script for Before the Stars. Built by .github/workflows/release.yml:
;   iscc /DAppVersion=0.3.0 /DSourceDir=..\..\dist\release\windows packaging\windows\installer.iss
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\dist\release\windows"
#endif

[Setup]
AppId={{6C0B3C0E-6B2B-4E0B-9C55-0B7E5A7A51A1}
AppName=Before the Stars
AppVersion={#AppVersion}
DefaultDirName={autopf}\Before the Stars
DefaultGroupName=Before the Stars
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist\release
OutputBaseFilename=Before-the-Stars-{#AppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourceDir}\Before the Stars.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\README.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Before the Stars"; Filename: "{app}\Before the Stars.exe"
Name: "{autodesktop}\Before the Stars"; Filename: "{app}\Before the Stars.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Before the Stars.exe"; Description: "{cm:LaunchProgram,Before the Stars}"; Flags: nowait postinstall skipifsilent
