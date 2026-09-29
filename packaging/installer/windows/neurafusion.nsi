; NeuraFusion Desktop — Windows のインストーラ（DK-09）。NSIS 3（zlib/libpng ライセンス）で作る。
;   makensis -DSTAGE=<同梱物の置き場> -DOUTFILE=<出力> -DVERSION=<版> neurafusion.nsi
; 管理者の権限は要らない（本人の %LOCALAPPDATA%\Programs に入れる）。
; 入れる途中で、同梱の Node 24 で本体（npm tarball）を本人のデータの置き場に入れる（初回の準備）。
; 署名はしない（コード署名の証明書は購入待ち。docs/overlay-windows-signing.md）。

Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user

!include "MUI2.nsh"

Name "NeuraFusion"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\NeuraFusion"
InstallDirRegKey HKCU "Software\NeuraFusion" "InstallDir"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1041 "ProductName" "NeuraFusion"
VIAddVersionKey /LANG=1041 "FileDescription" "NeuraFusion Desktop のインストーラ"
VIAddVersionKey /LANG=1041 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1041 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1041 "LegalCopyright" "NeuraFusion"

!define MUI_ICON "${STAGE}\neurafusion.ico"
!define MUI_UNICON "${STAGE}\neurafusion.ico"
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchNeuraFusion
!define MUI_FINISHPAGE_RUN_TEXT "NeuraFusion を起動する（AI アプリの右下に丸が出ます）"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README-ja.txt"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Japanese"

Function LaunchNeuraFusion
  Exec '"$INSTDIR\node\node.exe" "$INSTDIR\nf-launch.mjs"'
FunctionEnd

Section "NeuraFusion" SecMain
  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*.*"
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\NeuraFusion" "InstallDir" "$INSTDIR"

  ; 入口（ランチャーを同梱の node で動かす。コンソールは最小化で開く）
  CreateShortcut "$SMPROGRAMS\NeuraFusion.lnk" "$INSTDIR\node\node.exe" '"$INSTDIR\nf-launch.mjs"' "$INSTDIR\neurafusion.ico" 0 SW_SHOWMINIMIZED
  CreateShortcut "$SMPROGRAMS\NeuraFusion をアンインストール.lnk" "$INSTDIR\uninstall.exe"

  ; 初回の準備（本体を入れる。失敗しても、最初に開いたときにもう一度試す）
  DetailPrint "初回の準備をしています（数分かかります）…"
  nsExec::ExecToLog '"$INSTDIR\node\node.exe" "$INSTDIR\nf-launch.mjs" --install-only'
  Pop $0
  StrCmp $0 "0" +2
    DetailPrint "準備はまだです（最初に開いたときにもう一度試します。インターネットが要ります）"

  ; 「アプリと機能」に出す
  !define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\NeuraFusion"
  WriteRegStr HKCU "${UNINST}" "DisplayName" "NeuraFusion"
  WriteRegStr HKCU "${UNINST}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST}" "Publisher" "NeuraFusion"
  WriteRegStr HKCU "${UNINST}" "DisplayIcon" "$INSTDIR\neurafusion.ico"
  WriteRegStr HKCU "${UNINST}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKCU "${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\NeuraFusion.lnk"
  Delete "$SMPROGRAMS\NeuraFusion をアンインストール.lnk"
  RMDir /r "$INSTDIR"
  ; 入れた本体だけ消す（設定と「読めた・読めない」の記録は残す）
  RMDir /r "$LOCALAPPDATA\NeuraFusion\cli"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NeuraFusion"
  DeleteRegKey HKCU "Software\NeuraFusion"
SectionEnd
