@echo off
chcp 65001 > nul
cd /d "%~dp0"
where node > nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js が入っていません。
  echo https://nodejs.org を開いて、緑の大きなボタンから入れてください。
  echo 入れたら、もう一度この start.bat をダブルクリックしてください。
  echo.
  pause
  exit /b
)
echo.
echo 魔王ヤギュー討伐戦 を起動しています...
echo ブラウザが開かなかったら http://localhost:3000 を開いてください。
echo やめるときは、この黒い画面を閉じてください。
echo.
start "" http://localhost:3000
node server.js
pause
