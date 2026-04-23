@echo off
setlocal
echo Baixando atualizacao do Revisor de Conteudo direto do GitHub...

set "REPO=marcelopaludetto/extensao-revisao"
set "BRANCH=main"
set "ZIP=%TEMP%\ext-update.zip"
set "TMPDIR=%TEMP%\ext-update-extract"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "Invoke-WebRequest -Uri 'https://github.com/%REPO%/archive/refs/heads/%BRANCH%.zip' -OutFile '%ZIP%';" ^
  "if (Test-Path '%TMPDIR%') { Remove-Item -Recurse -Force '%TMPDIR%' };" ^
  "Expand-Archive -Path '%ZIP%' -DestinationPath '%TMPDIR%' -Force;" ^
  "$inner = Get-ChildItem '%TMPDIR%' -Directory | Select-Object -First 1;" ^
  "Copy-Item -Path (Join-Path $inner.FullName '*') -Destination '%~dp0' -Recurse -Force;" ^
  "Remove-Item -Recurse -Force '%TMPDIR%';" ^
  "Remove-Item -Force '%ZIP%'"

if errorlevel 1 (
  echo.
  echo Falha ao atualizar. Verifique conexao/permissoes.
  pause
  exit /b 1
)

echo.
echo Feito! Agora:
echo 1. Abra o Chrome e acesse chrome://extensions
echo 2. Clique em "Recarregar" na extensao Revisor de Conteudo
echo.
start chrome "chrome://extensions"
pause
