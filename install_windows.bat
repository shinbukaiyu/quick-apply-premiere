@echo off
setlocal
rem Quick Apply - cai dat cho Premiere Pro (Windows)
set "SRC=%~dp0extension"
set "DEST=%APPDATA%\Adobe\CEP\extensions\QuickApply_PR"

if not exist "%SRC%\CSXS\manifest.xml" (
  echo Khong tim thay folder "extension" canh file cai dat. Hay giai nen day du file zip truoc.
  pause
  exit /b 1
)

rem Cho phep chay extension chua ky (unsigned)
for %%v in (9 10 11 12 13) do (
  reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
)

if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
robocopy "%SRC%" "%DEST%" /E /NFL /NDL /NJH /NJS /NP >nul
if %ERRORLEVEL% GEQ 8 (
  echo Loi khi copy file. Thu chay lai bang quyen Administrator.
  pause
  exit /b 1
)

echo.
echo Da cai vao: %DEST%
echo Khoi dong lai Premiere Pro, mo Window ^> Extensions ^> Quick Apply
echo.
pause
