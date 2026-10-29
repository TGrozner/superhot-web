$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$repo = 'TGrozner/superhot-web'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git absent : installe Git pour Windows : https://git-scm.com/downloads/win' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI absent : lance winget install --id GitHub.cli -e (puis relance PowerShell)' }

& cmd.exe /c 'gh auth status >NUL 2>&1'
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Connexion GitHub initiale (une seule fois).' -ForegroundColor Cyan
  & gh auth login --web -p https
  if ($LASTEXITCODE -ne 0) { throw 'Authentification GitHub impossible.' }
}
$who = (& gh api user --jq '.login').Trim()
if ($who -ne 'TGrozner') { throw "Mauvais compte GitHub : $who (attendu : TGrozner)" }

if (-not (Test-Path .git)) { & git init -b main; if ($LASTEXITCODE -ne 0) { throw 'git init a échoué' } }
& git branch -M main
if ($LASTEXITCODE -ne 0) { throw 'Impossible de sélectionner main' }
& git add .
if ($LASTEXITCODE -ne 0) { throw 'git add a échoué' }
& git diff --cached --quiet
$diffStatus = $LASTEXITCODE
if ($diffStatus -eq 1) {
  & git -c user.name=TGrozner -c user.email=9461179+TGrozner@users.noreply.github.com commit -m 'feat: playable WebGL2 time-manipulation FPS prototype'
  if ($LASTEXITCODE -ne 0) { throw 'git commit a échoué' }
} elseif ($diffStatus -ne 0) { throw 'git diff a échoué' }

& cmd.exe /c 'gh repo view TGrozner/superhot-web >NUL 2>&1'
$exists = ($LASTEXITCODE -eq 0)
if (-not $exists) {
  Write-Host "Création du dépôt public $repo ..." -ForegroundColor Cyan
  & gh repo create $repo --public --source . --remote origin --push
  if ($LASTEXITCODE -ne 0) { throw 'Création du dépôt impossible.' }
} else {
  # Only push updates if this local folder already belongs to this exact repository.
  $remote = (& cmd.exe /c 'git remote get-url origin 2>NUL')
  if ($LASTEXITCODE -ne 0 -or -not $remote) {
    throw "Le dépôt $repo existe déjà. Publication annulée : vérifie son contenu avant de définir origin."
  }
  if ($remote.Trim() -notmatch '^(https://github\.com/|git@github\.com:)TGrozner/superhot-web(\.git)?$') {
    throw "L'origin local ($remote) n'est pas le dépôt attendu."
  }
  & git push -u origin main
  if ($LASTEXITCODE -ne 0) { throw 'git push a échoué' }

}

Write-Host 'Configuration de GitHub Pages ...' -ForegroundColor Cyan
& cmd.exe /c 'gh api repos/TGrozner/superhot-web/pages >NUL 2>&1'
if ($LASTEXITCODE -ne 0) {
  & gh api -X POST "repos/$repo/pages" -f 'source[branch]=main' -f 'source[path]=/' --jq '.html_url'
  if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Le dépôt a été publié, mais GitHub Pages doit être activé manuellement : Settings > Pages > Deploy from a branch > main / (root).'
  }
}
Write-Host "Repo : https://github.com/$repo" -ForegroundColor Green
Write-Host 'Page attendue : https://tgrozner.github.io/superhot-web/' -ForegroundColor Green
Write-Host 'La première mise en ligne GitHub Pages peut nécessiter un délai de construction.'
