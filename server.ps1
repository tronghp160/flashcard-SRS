# Simple PowerShell HTTP Server
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
try {
    $listener.Start()
    Write-Host "PowerShell Server listening on http://localhost:8080/"
    
    # Auto-backup on startup
    $dbPathForBackup = Join-Path (Get-Location) "database.json"
    if (Test-Path $dbPathForBackup) {
        $backupsDirInit = Join-Path (Get-Location) "backups"
        if (-not (Test-Path $backupsDirInit)) { New-Item -ItemType Directory -Path $backupsDirInit | Out-Null }
        $tsInit = Get-Date -Format "yyyyMMdd_HHmmss"
        $initBackupPath = Join-Path $backupsDirInit "auto_$tsInit.json"
        Copy-Item $dbPathForBackup $initBackupPath -Force
        # Keep only 7 most recent backups
        $allBk = Get-ChildItem -Path $backupsDirInit -Filter "*.json" | Sort-Object LastWriteTime -Descending
        if ($allBk.Count -gt 7) { $allBk | Select-Object -Skip 7 | ForEach-Object { Remove-Item $_.FullName -Force } }
        Write-Host "Auto-backup created: $initBackupPath"
    }
    
    # Run loop
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # Resolve request path
        $urlPath = $request.Url.LocalPath
        
        if ($urlPath -like "/api*") {
            $response.ContentType = "application/json; charset=utf-8"
            
            # Read database.json
            $dbPath = Join-Path (Get-Location) "database.json"
            if (Test-Path $dbPath) {
                $dbJson = [System.IO.File]::ReadAllText($dbPath, [System.Text.Encoding]::UTF8)
                $db = ConvertFrom-Json $dbJson
            } else {
                $db = [PSCustomObject]@{
                    folders = @()
                    sets = @()
                    cards = @()
                }
            }
            
            # Ensure arrays are initialized
            if ($null -eq $db.folders) { $db.folders = @() }
            if ($null -eq $db.sets) { $db.sets = @() }
            if ($null -eq $db.cards) { $db.cards = @() }
            
            # Helper to save database.json
            $saveDb = {
                param($data)
                $json = ConvertTo-Json -InputObject $data -Depth 10 -Compress
                [System.IO.File]::WriteAllText($dbPath, $json, [System.Text.Encoding]::UTF8)
            }
            
            # Helper to serialize JSON arrays correctly
            function Serialize-Json ($obj) {
                if ($null -eq $obj) { return "[]" }
                if ($obj -is [Array] -or $obj -is [System.Collections.ArrayList] -or $obj -is [System.Collections.Generic.List[Object]]) {
                    if ($obj.Count -eq 0) { return "[]" }
                    if ($obj.Count -eq 1) {
                        $itemJson = ConvertTo-Json -InputObject $obj[0] -Depth 10 -Compress
                        return "[$itemJson]"
                    }
                }
                return ConvertTo-Json -InputObject $obj -Depth 10 -Compress
            }
            
            # Read request body
            $body = ""
            if ($request.HasEntityBody) {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()
            }
            
            $method = $request.HttpMethod
            $responseData = $null
            $statusCode = 200
            
            # Route definitions
            if ($urlPath -eq "/api/upload") {
                if ($method -eq "POST") {
                    $uploadsDir = Join-Path (Get-Location) "uploads"
                    if (-not (Test-Path $uploadsDir)) {
                        New-Item -ItemType Directory -Path $uploadsDir | Out-Null
                    }

                    $uploadReq = ConvertFrom-Json $body
                    $base64String = $uploadReq.base64Data
                    if ($base64String -match "^data:[^;]+;base64,(.+)$") {
                        $base64String = $Matches[1]
                    }

                    try {
                        $bytes = [Convert]::FromBase64String($base64String)
                        $ext = [System.IO.Path]::GetExtension($uploadReq.filename)
                        if (-not $ext) { $ext = ".png" }
                        
                        $uniqueName = [Guid]::NewGuid().ToString().Substring(0, 8) + "_" + (Get-Date -UFormat "%Y%m%d%H%M%S") + $ext
                        $filePath = Join-Path $uploadsDir $uniqueName
                        
                        [System.IO.File]::WriteAllBytes($filePath, $bytes)
                        
                        $responseData = @{
                            success = $true
                            url = "/uploads/" + $uniqueName
                        }
                        $statusCode = 200
                    } catch {
                        $statusCode = 500
                        $responseData = @{ error = "Upload failed: $_" }
                    }
                }
            }
            # 1. Folders
            elseif ($urlPath -eq "/api/folders") {
                if ($method -eq "GET") {
                    $responseData = $db.folders
                }
                elseif ($method -eq "POST") {
                    $newFolder = ConvertFrom-Json $body
                    $newFolderId = "folder_" + [Guid]::NewGuid().ToString().Substring(0, 8)
                    $newFolder | Add-Member -MemberType NoteProperty -Name "id" -Value $newFolderId -Force
                    
                    $db.folders = @($db.folders) + $newFolder
                    &$saveDb $db
                    $responseData = $newFolder
                    $statusCode = 201
                }
            }
            elseif ($urlPath -match "^/api/folders/([^/]+)$") {
                $folderId = $Matches[1]
                if ($method -eq "PUT") {
                    $updateData = ConvertFrom-Json $body
                    $found = $false
                    foreach ($f in $db.folders) {
                        if ($f.id -eq $folderId) {
                            $f.name = $updateData.name
                            $found = $true
                            $responseData = $f
                            break
                        }
                    }
                    if ($found) {
                        &$saveDb $db
                    } else {
                        $statusCode = 404
                        $responseData = @{ error = "Folder not found" }
                    }
                }
                elseif ($method -eq "DELETE") {
                    $db.folders = @($db.folders | Where-Object { $_.id -ne $folderId })
                    
                    # Cascade delete study sets and cards
                    $setsToDelete = @($db.sets | Where-Object { $_.folder_id -eq $folderId })
                    $db.sets = @($db.sets | Where-Object { $_.folder_id -ne $folderId })
                    
                    $setIdsToDelete = @($setsToDelete | ForEach-Object { $_.id })
                    if ($setIdsToDelete.Count -gt 0) {
                        $db.cards = @($db.cards | Where-Object { $_.set_id -notin $setIdsToDelete })
                    }
                    
                    &$saveDb $db
                    $responseData = @{ success = $true }
                }
            }
            # 2. Sets
            elseif ($urlPath -eq "/api/sets") {
                if ($method -eq "GET") {
                    $folderId = $request.QueryString["folderId"]
                    if ($folderId) {
                        $responseData = @($db.sets | Where-Object { $_.folder_id -eq $folderId })
                    } else {
                        $responseData = $db.sets
                    }
                }
                elseif ($method -eq "POST") {
                    $newSet = ConvertFrom-Json $body
                    if (-not $newSet.id) {
                        $newSetId = "set_" + [Guid]::NewGuid().ToString().Substring(0, 8)
                        $newSet | Add-Member -MemberType NoteProperty -Name "id" -Value $newSetId -Force
                    }
                    
                    $existingSetIndex = -1
                    for ($i = 0; $i -lt $db.sets.Count; $i++) {
                        if ($db.sets[$i].id -eq $newSet.id) {
                            $existingSetIndex = $i
                            break
                        }
                    }
                    
                    if ($existingSetIndex -ne -1) {
                        $db.sets[$existingSetIndex].title = $newSet.title
                        $db.sets[$existingSetIndex].description = $newSet.description
                        $responseData = $db.sets[$existingSetIndex]
                    } else {
                        $db.sets = @($db.sets) + $newSet
                        $responseData = $newSet
                    }
                    
                    &$saveDb $db
                }
            }
            elseif ($urlPath -match "^/api/sets/([^/]+)$") {
                $setId = $Matches[1]
                if ($method -eq "GET") {
                    $found = $null
                    foreach ($s in $db.sets) {
                        if ($s.id -eq $setId) { $found = $s; break }
                    }
                    if ($found) {
                        $responseData = $found
                    } else {
                        $statusCode = 404
                        $responseData = @{ error = "Set not found" }
                    }
                }
                elseif ($method -eq "DELETE") {
                    $db.sets = @($db.sets | Where-Object { $_.id -ne $setId })
                    $db.cards = @($db.cards | Where-Object { $_.set_id -ne $setId })
                    &$saveDb $db
                    $responseData = @{ success = $true }
                }
            }
            elseif ($urlPath -match "^/api/sets/([^/]+)/highscore$") {
                $setId = $Matches[1]
                if ($method -eq "POST") {
                    $req = ConvertFrom-Json $body
                    $score = $req.score
                    $found = $false
                    for ($i = 0; $i -lt $db.sets.Count; $i++) {
                        if ($db.sets[$i].id -eq $setId) {
                            if ($null -eq $db.sets[$i].highscore -or $score -lt $db.sets[$i].highscore) {
                                if ($null -eq $db.sets[$i].psobject.Properties["highscore"]) {
                                    $db.sets[$i] | Add-Member -MemberType NoteProperty -Name "highscore" -Value $score -Force
                                } else {
                                    $db.sets[$i].highscore = $score
                                }
                                $found = $true
                            }
                            $responseData = $db.sets[$i]
                            break
                        }
                    }
                    if ($found) {
                        &$saveDb $db
                    }
                    $statusCode = 200
                }
            }
            # 3. Cards
            elseif ($urlPath -eq "/api/cards") {
                if ($method -eq "GET") {
                    $setId = $request.QueryString["setId"]
                    if ($setId) {
                        $responseData = @($db.cards | Where-Object { $_.set_id -eq $setId })
                    } else {
                        $responseData = $db.cards
                    }
                }
            }
            elseif ($urlPath -match "^/api/sets/([^/]+)/cards$") {
                $setId = $Matches[1]
                if ($method -eq "POST") {
                    $reqData = ConvertFrom-Json $body
                    $cardsList = @($reqData.cards)
                    
                    # Remove existing cards for this set
                    $db.cards = @($db.cards | Where-Object { $_.set_id -ne $setId })
                    
                    # Process and add new cards
                    foreach ($card in $cardsList) {
                        if (-not $card.id) {
                            $newCardId = "card_" + [Guid]::NewGuid().ToString().Substring(0, 8) + [Guid]::NewGuid().ToString().Substring(0, 4)
                            $card | Add-Member -MemberType NoteProperty -Name "id" -Value $newCardId -Force
                        }
                        if (-not $card.set_id) {
                            $card | Add-Member -MemberType NoteProperty -Name "set_id" -Value $setId -Force
                        }
                        $db.cards = @($db.cards) + $card
                    }
                    
                    &$saveDb $db
                    $responseData = @{ success = $true; count = $cardsList.Count }
                }
            }
            elseif ($urlPath -match "^/api/cards/([^/]+)$") {
                $cardId = $Matches[1]
                if ($method -eq "PATCH" -or $method -eq "PUT") {
                    $updatedFields = ConvertFrom-Json $body
                    $found = $false
                    foreach ($card in $db.cards) {
                        if ($card.id -eq $cardId) {
                            foreach ($prop in $updatedFields.psobject.Properties) {
                                if ($card.psobject.Properties[$prop.Name]) {
                                    $card.psobject.Properties[$prop.Name].Value = $prop.Value
                                } else {
                                    $card | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value -Force
                                }
                            }
                            $found = $true
                            $responseData = $card
                            break
                        }
                    }
                    if ($found) {
                        &$saveDb $db
                    } else {
                        $statusCode = 404
                        $responseData = @{ error = "Card not found" }
                    }
                }
            }
            elseif ($urlPath -eq "/api/study-log") {
                if ($method -eq "GET") {
                    if ($null -eq $db.study_log) { $db.study_log = @() }
                    $responseData = $db.study_log
                }
                elseif ($method -eq "POST") {
                    $logEntry = ConvertFrom-Json $body
                    if ($null -eq $db.study_log) { $db.study_log = @() }
                    $logEntry | Add-Member -MemberType NoteProperty -Name "id" -Value ("log_" + [Guid]::NewGuid().ToString().Substring(0,8)) -Force
                    $db.study_log = @($db.study_log) + $logEntry
                    # Keep only last 5000 entries to prevent file bloat
                    if ($db.study_log.Count -gt 5000) {
                        $db.study_log = @($db.study_log | Select-Object -Last 5000)
                    }
                    &$saveDb $db
                    $responseData = @{ success = $true }
                    $statusCode = 201
                }
            }
            elseif ($urlPath -eq "/api/settings") {
                if ($method -eq "GET") {
                    if ($null -eq $db.settings) {
                        $db.settings = [PSCustomObject]@{ tts_enabled = $true; tts_rate = 0.9; tts_voice = "en-US"; auto_speak_on_flip = $false }
                    }
                    $responseData = $db.settings
                }
                elseif ($method -eq "PUT" -or $method -eq "POST") {
                    $newSettings = ConvertFrom-Json $body
                    if ($null -eq $db.settings) { $db.settings = [PSCustomObject]@{} }
                    foreach ($prop in $newSettings.psobject.Properties) {
                        if ($db.settings.psobject.Properties[$prop.Name]) {
                            $db.settings.psobject.Properties[$prop.Name].Value = $prop.Value
                        } else {
                            $db.settings | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value -Force
                        }
                    }
                    &$saveDb $db
                    $responseData = $db.settings
                }
            }
            elseif ($urlPath -eq "/api/backups") {
                if ($method -eq "GET") {
                    $backupsDir = Join-Path (Get-Location) "backups"
                    if (-not (Test-Path $backupsDir)) { New-Item -ItemType Directory -Path $backupsDir | Out-Null }
                    $files = Get-ChildItem -Path $backupsDir -Filter "*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 10
                    $backupList = @($files | ForEach-Object {
                        @{ filename = $_.Name; size = $_.Length; date = $_.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ss") }
                    })
                    $responseData = $backupList
                }
                elseif ($method -eq "POST") {
                    # Create manual backup
                    $backupsDir = Join-Path (Get-Location) "backups"
                    if (-not (Test-Path $backupsDir)) { New-Item -ItemType Directory -Path $backupsDir | Out-Null }
                    $ts = Get-Date -Format "yyyyMMdd_HHmmss"
                    $backupName = "backup_$ts.json"
                    $backupPath = Join-Path $backupsDir $backupName
                    $currentDbJson = [System.IO.File]::ReadAllText($dbPath, [System.Text.Encoding]::UTF8)
                    [System.IO.File]::WriteAllText($backupPath, $currentDbJson, [System.Text.Encoding]::UTF8)
                    # Keep only 7 most recent backups
                    $allBackups = Get-ChildItem -Path $backupsDir -Filter "*.json" | Sort-Object LastWriteTime -Descending
                    if ($allBackups.Count -gt 7) {
                        $allBackups | Select-Object -Skip 7 | ForEach-Object { Remove-Item $_.FullName -Force }
                    }
                    $responseData = @{ success = $true; filename = $backupName }
                    $statusCode = 201
                }
            }
            elseif ($urlPath -match "^/api/restore/(.+)$") {
                $backupFileName = $Matches[1]
                if ($method -eq "POST") {
                    $backupsDir = Join-Path (Get-Location) "backups"
                    $backupPath = Join-Path $backupsDir $backupFileName
                    if (Test-Path $backupPath) {
                        # Backup current before restore
                        $ts = Get-Date -Format "yyyyMMdd_HHmmss"
                        $preRestorePath = Join-Path $backupsDir "pre_restore_$ts.json"
                        $currentJson = [System.IO.File]::ReadAllText($dbPath, [System.Text.Encoding]::UTF8)
                        [System.IO.File]::WriteAllText($preRestorePath, $currentJson, [System.Text.Encoding]::UTF8)
                        # Restore
                        $restoreJson = [System.IO.File]::ReadAllText($backupPath, [System.Text.Encoding]::UTF8)
                        [System.IO.File]::WriteAllText($dbPath, $restoreJson, [System.Text.Encoding]::UTF8)
                        $responseData = @{ success = $true }
                    } else {
                        $statusCode = 404
                        $responseData = @{ error = "Backup file not found" }
                    }
                }
            }
            elseif ($urlPath -eq "/api/sync") {
                if ($method -eq "POST") {
                    try {
                        # Backup current database.json before overwriting
                        $backupsDir = Join-Path (Get-Location) "backups"
                        if (-not (Test-Path $backupsDir)) { New-Item -ItemType Directory -Path $backupsDir | Out-Null }
                        $ts = Get-Date -Format "yyyyMMdd_HHmmss"
                        $preSyncPath = Join-Path $backupsDir "pre_sync_$ts.json"
                        if (Test-Path $dbPath) {
                            $currentJson = [System.IO.File]::ReadAllText($dbPath, [System.Text.Encoding]::UTF8)
                            [System.IO.File]::WriteAllText($preSyncPath, $currentJson, [System.Text.Encoding]::UTF8)
                        }

                        # Save the body directly as database.json
                        [System.IO.File]::WriteAllText($dbPath, $body, [System.Text.Encoding]::UTF8)
                        $responseData = @{ success = $true }
                    } catch {
                        $statusCode = 500
                        $responseData = @{ error = "Sync failed: $_" }
                    }
                }
            }
            

            $response.StatusCode = $statusCode
            $respJson = Serialize-Json $responseData
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            if ($urlPath -eq "/") { $urlPath = "/index.html" }
            
            # Clean urlPath for Windows paths
            $cleanPath = $urlPath.Replace("/", "\")
            $filePath = Join-Path (Get-Location) $cleanPath
            
            if (Test-Path $filePath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                
                # Content Type header
                if ($filePath.EndsWith(".html")) { 
                    $response.ContentType = "text/html; charset=utf-8" 
                }
                elseif ($filePath.EndsWith(".js")) { 
                    $response.ContentType = "application/javascript; charset=utf-8" 
                }
                elseif ($filePath.EndsWith(".css")) { 
                    $response.ContentType = "text/css; charset=utf-8" 
                }
                elseif ($filePath.EndsWith(".png")) { 
                    $response.ContentType = "image/png" 
                }
                elseif ($filePath.EndsWith(".jpg") -or $filePath.EndsWith(".jpeg")) { 
                    $response.ContentType = "image/jpeg" 
                }
                elseif ($filePath.EndsWith(".gif")) { 
                    $response.ContentType = "image/gif" 
                }
                elseif ($filePath.EndsWith(".svg")) { 
                    $response.ContentType = "image/svg+xml" 
                }
                elseif ($filePath.EndsWith(".json")) {
                    $response.ContentType = "application/json; charset=utf-8"
                }
                elseif ($filePath.EndsWith(".webmanifest")) {
                    $response.ContentType = "application/manifest+json; charset=utf-8"
                }
                elseif ($filePath.EndsWith(".ico")) {
                    $response.ContentType = "image/x-icon"
                }
                elseif ($filePath.EndsWith(".webp")) {
                    $response.ContentType = "image/webp"
                }
                
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.ContentLength64 = $errBytes.Length
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
        }
        $response.OutputStream.Close()
    }
} catch {
    Write-Host "Error: $_"
} finally {
    $listener.Close()
}
