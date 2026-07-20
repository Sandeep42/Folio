@echo off
REM Setup VS dev environment and run cargo
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b 1
echo cl.exe found: 
where cl.exe
echo.
cargo %*
