@echo off
chcp 65001 > nul
cd /d "%~dp0"
where node > nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js が入っていません。
  echo https://nodejs.org を開いて、緑の大きなボタンから入れてください。
  echo 入れたら、もう一度この online.bat をダブルクリックしてください。
  echo.
  pause
  exit /b
)
echo.
echo 山羊の野望 を「インターネットで遊ぶ」モードで起動しています...
echo しばらくすると、下と、ブラウザのロビーに「友だちに送るURL」が出ます。
echo やめるときは、この黒い画面を閉じてください。
echo.
set ONLINE=1
start "" http://localhost:3000
node server.js
pause
