param(
    [string]$Pattern = "",
    [string]$Extract = "",
    [string]$Out = ""
)
$ErrorActionPreference = "Stop"
$research = "C:\Users\xzdes\Documents\deepseek-harness\default-workspace\.research"
$asar = "C:\Users\xzdes\AppData\Local\Programs\DeepSeek Harness\resources\app.asar"
$j = Get-Content "$research\asar-header.json" -Raw | ConvertFrom-Json
$script:map = @{}
function Walk($node, $path) {
    foreach ($p in $node.PSObject.Properties) {
        $p2 = if ($path) { "$path/$($p.Name)" } else { $p.Name }
        if ($p.Value.files) { Walk $p.Value.files $p2 }
        else { $script:map[$p2] = @([int64]($p.Value.offset), [int64]($p.Value.size)) }
    }
}
Walk $j.files ""
if ($Pattern) {
    $script:map.Keys | Where-Object { $_ -match $Pattern } | Sort-Object | ForEach-Object { "{0}`t{1}" -f $script:map[$_][1], $_ }
    exit
}
if ($Extract) {
    $fs = [System.IO.File]::OpenRead($asar)
    $base = 16 + 3392048
    $e = $script:map[$Extract]
    if (-not $e) { Write-Host "NOT FOUND: $Extract"; $fs.Close(); exit 1 }
    $fs.Seek($base + $e[0], 'Begin') | Out-Null
    $buf = New-Object byte[] $e[1]
    $read = 0
    while ($read -lt $e[1]) { $n = $fs.Read($buf, $read, $e[1] - $read); if ($n -le 0) { break }; $read += $n }
    $fs.Close()
    if ($Out) { [System.IO.File]::WriteAllBytes($Out, $buf) }
    else { [System.Text.Encoding]::UTF8.GetString($buf) }
}
