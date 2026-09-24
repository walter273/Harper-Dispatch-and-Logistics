$ErrorActionPreference = 'Stop'
$root = "C:\Users\Mr. Harper\harper-work\repo"

$files = Get-ChildItem $root -Recurse -File -ErrorAction SilentlyContinue |
Where-Object {
  $_.FullName -notmatch "node_modules|\\\.git\\" -and
  $_.Extension -in '.js', '.json', '.md', '.html', '.example'
}

$stripped = @()
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

foreach ($f in $files) {
  $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    # Drop the three BOM bytes and rewrite as plain UTF-8.
    $text = [System.Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
    [System.IO.File]::WriteAllText($f.FullName, $text, $utf8NoBom)
    $stripped += $f.FullName.Replace($root, '')
  }
}

Write-Output "BOM stripped from $($stripped.Count) files"
Write-Output ""

Write-Output "=== VERIFY: any BOM left? ==="
$remaining = 0
foreach ($f in $files) {
  $b = [System.IO.File]::ReadAllBytes($f.FullName)
  if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) {
    Write-Output "STILL HAS BOM: $($f.FullName.Replace($root,''))"
    $remaining++
  }
}
Write-Output "remaining: $remaining"