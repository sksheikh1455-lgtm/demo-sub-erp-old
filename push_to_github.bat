@echo off
set "PATH=%LOCALAPPDATA%\MinGit\cmd;%PATH%"
echo ==============================================
echo Pushing Suborno ERP to GitHub Repository...
echo ==============================================
git remote remove origin 2>nul
git remote add origin https://github.com/sksheikh1455-lgtm/demo-sub-erp-old.git
git branch -M main
git push -u origin main
pause
