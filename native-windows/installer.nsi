Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
Name "My Patch Native"
OutFile "..\Native-Windows-Release\MyPatch-Native-Setup-0.1.0-x64.exe"
InstallDir "$LOCALAPPDATA\Programs\MyPatchNative"
InstallDirRegKey HKCU "Software\MyPatchNative" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "..\windows-app\icon.ico"
!define MUI_UNICON "..\windows-app\icon.ico"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
VIProductVersion "0.1.0.0"
VIAddVersionKey /LANG=1033 "ProductName" "My Patch Native"
VIAddVersionKey /LANG=1033 "FileDescription" "Native Windows network planning application"
VIAddVersionKey /LANG=1033 "FileVersion" "0.1.0"
VIAddVersionKey /LANG=1033 "LegalCopyright" "My Patch"
Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "My Patch Native requires 64-bit Windows."
    Abort
  ${EndIf}
FunctionEnd
Section "My Patch Native"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File "..\Native-Windows-Release\app\MyPatch.Native.exe"
  File /oname=README.md "README.md"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\My Patch Native"
  CreateShortcut "$SMPROGRAMS\My Patch Native\My Patch Native.lnk" "$INSTDIR\MyPatch.Native.exe"
  CreateShortcut "$DESKTOP\My Patch Native.lnk" "$INSTDIR\MyPatch.Native.exe"
  WriteRegStr HKCU "Software\MyPatchNative" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyPatchNative" "DisplayName" "My Patch Native"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyPatchNative" "DisplayVersion" "0.1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyPatchNative" "DisplayIcon" "$INSTDIR\MyPatch.Native.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyPatchNative" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyPatchNative" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyPatchNative" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\My Patch Native.lnk"
  Delete "$SMPROGRAMS\My Patch Native\My Patch Native.lnk"
  RMDir "$SMPROGRAMS\My Patch Native"
  Delete "$INSTDIR\MyPatch.Native.exe"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MyPatchNative"
  DeleteRegKey HKCU "Software\MyPatchNative"
  ; User projects and history in LocalAppData\MyPatchNative are deliberately retained.
SectionEnd
