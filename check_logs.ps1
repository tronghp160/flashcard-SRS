$logPath = Join-Path $env:USERPROFILE ".gemini\antigravity-ide\brain\53a9a41e-f284-48a8-be22-96044be150ac\.system_generated\logs\transcript.jsonl"
if (Test-Path $logPath) {
    $lines = Get-Content $logPath
    $lines | Where-Object { $_ -like "*error*" -or $_ -like "*console*" } | Select-Object -Last 10 | Write-Host
} else {
    Write-Host "Log file not found at $logPath"
}
