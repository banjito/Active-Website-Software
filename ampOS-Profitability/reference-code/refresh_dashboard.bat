@echo off
REM Daily refresh of the AMP Job Profitability dashboard (ampOS + QuickBooks).
REM Registered as Windows Task "AMP Job Dashboard". Logs to refresh.log.
set DIR=C:\Users\jerju\OneDrive\Focus CFO\Clients\AMP\Analysis\Job Profitability
echo ========== %DATE% %TIME% ========== >> "%DIR%\refresh.log"
"C:\Users\jerju\AppData\Local\Programs\Python\Python312\python.exe" "%DIR%\build_all.py" >> "%DIR%\refresh.log" 2>&1
echo exit code %ERRORLEVEL% >> "%DIR%\refresh.log"
