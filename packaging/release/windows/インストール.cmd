@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo.
echo   NeuraFusion Desktop
echo   ------------------------------------------
echo.

set "TGZ="
for %%F in (neurafusion-desktop-*.tgz) do set "TGZ=%%F"

if "%TGZ%"=="" (
  echo   本体のファイルが見つかりません。
  echo   ダウンロードした zip を「すべて展開」してから、
  echo   展開先の中にある このファイルを実行してください。
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js が入っていません。
  echo.
  echo     先に Node.js 24 以上を入れてください:
  echo       https://nodejs.org/     ^(LTS を選んでください^)
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODEMAJOR=%%V"
if %NODEMAJOR% LSS 24 (
  echo   Node.js のバージョンが足りません。24 以上が必要です。
  echo     https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node -v') do set "NODEVER=%%V"
echo   Node.js %NODEVER% を確認しました。
echo   導入します。数分かかります...
echo.

call npm install -g ".\%TGZ%"
if errorlevel 1 (
  echo.
  echo   失敗しました。
  echo   PowerShell か コマンドプロンプトを「管理者として実行」して、
  echo   もう一度このファイルを実行してみてください。
  echo.
  pause
  exit /b 1
)

echo.
echo   導入できました。
echo.
echo   PowerShell で次を打つと始まります:
echo       neurafusion onboard
echo.
echo   鍵はこの端末の 資格情報マネージャー に入ります。
echo   当社は預かりません。
echo.
pause
