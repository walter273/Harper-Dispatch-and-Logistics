$ErrorActionPreference = 'Stop'
$root = "C:\Users\Mr. Harper\harper-work\repo"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$files = Get-ChildItem $root -Recurse -File -ErrorAction SilentlyContinue |
Where-Object {
  $_.FullName -notmatch "node_modules|\\\.git\\" -and
  $_.Extension -in '.js', '.json', '.md', '.html', '.example'
}

$changed = @()
foreach ($f in $files) {
  $text = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
  $before = $text

  # Temp-directory prefixes in tests: purely cosmetic, safe to rename.
  $text = $text -creplace "'alphaway-", "'harper-"
  # Demo fixture identity.
  $text = $text -creplace '"alphaway"', '"harper"'
  $text = $text -creplace 'Alphaway TMS', 'Harper TMS'
  $text = $text -creplace 'admin@alphaway\.local', 'admin@harper.local'
  $text = $text -creplace 'Alphaway Administrator', 'Harper Administrator'

  if ($text -ne $before) {
    [System.IO.File]::WriteAllText($f.FullName, $text, $utf8NoBom)
    $changed += $f.FullName.Replace($root, '')
  }
}

Write-Output "files changed: $($changed.Count)"
$changed | Sort-Object

Write-Output ""
Write-Output "=== BOM check ==="
$bad = 0
foreach ($f in $files) {
  $b = [System.IO.File]::ReadAllBytes($f.FullName)
  if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { $bad++; Write-Output "BOM: $($f.Name)" }
}
Write-Output "BOMs introduced: $bad"

Write-Output ""
Write-Output "=== remaining alphaway (all files) ==="
Get-ChildItem $root -Recurse -File -ErrorAction SilentlyContinue |
Where-Object { $_.FullName -notmatch "node_modules|\\\.git\\" } |
Select-String -Pattern "alphaway|Alphaway|ALPHAWAY" -AllMatches |
ForEach-Object { "$($_.Path.Replace($root,'')):$($_.LineNumber): $($_.Line.Trim().Substring(0,[Math]::Min(105,$_.Line.Trim().Length)))" }