@echo off
rem Starts the free writing model (first time: downloads ~2.5 GB), then tests every writing tool on it.
rem Results: writing-eval.json (answers) and writing-eval-log.txt (summary). Takes 10-30 minutes.
cd /d "%~dp0"
echo == starting the writing model (first start downloads it, please wait) ==
docker compose up -d llm
:wait
timeout /t 15 >nul
docker compose exec -T worker python -c "import httpx,sys; sys.exit(0 if httpx.get('http://llm:8080/health',timeout=5).status_code==200 else 1)" >nul 2>&1
if errorlevel 1 (echo   still loading... & goto wait)
echo == model ready, running the writing tests ==
docker compose exec -T worker python scripts/eval_llm_direct.py > writing-eval.json 2> writing-eval-log.txt
type writing-eval-log.txt
echo Done - results in writing-eval.json and writing-eval-log.txt
pause
