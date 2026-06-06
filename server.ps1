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
        $context = $null
        $response = $null
        try {
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
                        users = @()
                        folders = @()
                        sets = @()
                        cards = @()
                        study_log = @()
                    }
                }
                
                # Ensure arrays are initialized robustly using NoteProperties
                $properties = @("users", "folders", "sets", "cards", "study_log")
                foreach ($prop in $properties) {
                    if ($null -eq $db.psobject.Properties[$prop]) {
                        $db | Add-Member -MemberType NoteProperty -Name $prop -Value @() -Force
                    } elseif ($null -eq $db.psobject.Properties[$prop].Value) {
                        $db.psobject.Properties[$prop].Value = @()
                    }
                }
                
                # Helper to băm mật khẩu
                function Get-PasswordHash ($pwd) {
                    if (-not $pwd) { return "" }
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($pwd)
                    $sha = [System.Security.Cryptography.SHA256]::Create()
                    $hashBytes = $sha.ComputeHash($bytes)
                    $hashString = [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
                    return $hashString
                }

                # Helper to check token from Authorization Header
                $currentUser = $null
                $authHeader = $request.Headers["Authorization"]
                if ($authHeader -and $authHeader.StartsWith("Bearer ")) {
                    $token = $authHeader.Substring(7)
                    try {
                        $decodedBytes = [System.Convert]::FromBase64String($token)
                        $decodedStr = [System.Text.Encoding]::UTF8.GetString($decodedBytes)
                        $parts = $decodedStr.Split(":")
                        if ($parts.Count -eq 3) {
                            $userId = $parts[0]
                            $role = $parts[1]
                            $ticks = [Int64]::Parse($parts[2])
                            
                            $sevenDaysTicks = 7 * 24 * 60 * 60 * 10000000
                            $nowTicks = (Get-Date).Ticks
                            if ($nowTicks - $ticks -lt $sevenDaysTicks) {
                                foreach ($u in $db.users) {
                                    if ($u.id -eq $userId) {
                                        $currentUser = [PSCustomObject]@{
                                            id = $userId
                                            role = $u.role
                                            username = $u.username
                                        }
                                        break
                                    }
                                }
                            }
                        }
                    } catch {
                        # Invalid token format
                    }
                }
                
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

                # Authorization Check
                $isAuthorized = $true
                if ($urlPath -ne "/api/status" -and $urlPath -notlike "/api/auth/*") {
                    if ($null -eq $currentUser) {
                        $isAuthorized = $false
                        $statusCode = 401
                        $responseData = @{ error = "Unauthorized" }
                    }
                }

                if ($isAuthorized) {
                    # 0. Public Status Check
                    if ($urlPath -eq "/api/status") {
                        $responseData = @{ status = "online" }
                        $statusCode = 200
                    }
                    # 0.1 Register
                    elseif ($urlPath -eq "/api/auth/register") {
                        if ($method -eq "POST") {
                            $regReq = ConvertFrom-Json $body
                            $username = $regReq.username.Trim().ToLower()
                            $password = $regReq.password
                            
                            if (-not $username -or -not $password) {
                                $statusCode = 400
                                $responseData = @{ error = "Username and password are required" }
                            } else {
                                $exists = $false
                                foreach ($u in $db.users) {
                                    if ($u.username.ToLower() -eq $username) {
                                        $exists = $true
                                        break
                                    }
                                }
                                if ($exists) {
                                    $statusCode = 400
                                    $responseData = @{ error = "Username already exists" }
                                } else {
                                    $role = "user"
                                    if ($db.users.Count -eq 0) {
                                        $role = "admin"
                                    }
                                    
                                    $newUserId = "user_" + [Guid]::NewGuid().ToString().Substring(0, 8)
                                    $newUser = [PSCustomObject]@{
                                        id = $newUserId
                                        username = $username
                                        passwordHash = Get-PasswordHash $password
                                        role = $role
                                        settings = [PSCustomObject]@{ tts_enabled = $true; tts_rate = 0.9; tts_voice = "en-US"; auto_speak_on_flip = $false; audio_feedback = $true }
                                    }
                                    $db.users = @($db.users) + $newUser
                                    &$saveDb $db
                                    
                                    $statusCode = 201
                                    $responseData = @{
                                        id = $newUserId
                                        username = $username
                                        role = $role
                                    }
                                }
                            }
                        }
                    }
                    # 0.2 Login
                    elseif ($urlPath -eq "/api/auth/login") {
                        if ($method -eq "POST") {
                            $loginReq = ConvertFrom-Json $body
                            $username = $loginReq.username.Trim().ToLower()
                            $password = $loginReq.password
                            
                            $foundUser = $null
                            foreach ($u in $db.users) {
                                if ($u.username.ToLower() -eq $username) {
                                    $foundUser = $u
                                    break
                                }
                            }
                            
                            if ($null -eq $foundUser -or (Get-PasswordHash $password) -ne $foundUser.passwordHash) {
                                $statusCode = 401
                                $responseData = @{ error = "Incorrect username or password" }
                            } else {
                                $ticks = (Get-Date).Ticks
                                $tokenStr = "$($foundUser.id):$($foundUser.role):$ticks"
                                $tokenBytes = [System.Text.Encoding]::UTF8.GetBytes($tokenStr)
                                $token = [Convert]::ToBase64String($tokenBytes)
                                
                                $statusCode = 200
                                $responseData = @{
                                    token = $token
                                    user = @{
                                        id = $foundUser.id
                                        username = $foundUser.username
                                        role = $foundUser.role
                                    }
                                }
                            }
                        }
                    }
                    # 0.3 Admin endpoints
                    elseif ($urlPath -like "/api/admin*") {
                        if ($currentUser.role -ne "admin") {
                            $statusCode = 403
                            $responseData = @{ error = "Access denied" }
                        } else {
                            if ($urlPath -eq "/api/admin/users") {
                                if ($method -eq "GET") {
                                    $userList = @($db.users | ForEach-Object {
                                        [PSCustomObject]@{
                                            id = $_.id
                                            username = $_.username
                                            role = $_.role
                                        }
                                    })
                                    $responseData = $userList
                                }
                            }
                            elseif ($urlPath -match "^/api/admin/users/([^/]+)/role$") {
                                $targetUserId = $Matches[1]
                                if ($method -eq "PUT") {
                                    $req = ConvertFrom-Json $body
                                    $newRole = $req.role
                                    if ($newRole -ne "admin" -and $newRole -ne "user") {
                                        $statusCode = 400
                                        $responseData = @{ error = "Invalid role" }
                                    } else {
                                        $found = $false
                                        for ($i=0; $i -lt $db.users.Count; $i++) {
                                            if ($db.users[$i].id -eq $targetUserId) {
                                                $db.users[$i].role = $newRole
                                                $found = $true
                                                $responseData = @{ id = $targetUserId; role = $newRole }
                                                break
                                            }
                                        }
                                        if ($found) {
                                            &$saveDb $db
                                        } else {
                                            $statusCode = 404
                                            $responseData = @{ error = "User not found" }
                                        }
                                    }
                                }
                            }
                            elseif ($urlPath -match "^/api/admin/users/([^/]+)$") {
                                $targetUserId = $Matches[1]
                                if ($method -eq "DELETE") {
                                    if ($targetUserId -eq $currentUser.id) {
                                        $statusCode = 400
                                        $responseData = @{ error = "Cannot delete your own account" }
                                    } else {
                                        $db.users = @($db.users | Where-Object { $_.id -ne $targetUserId })
                                        
                                        # Cascade delete user's data
                                        $db.folders = @($db.folders | Where-Object { $_.user_id -ne $targetUserId })
                                        $db.sets = @($db.sets | Where-Object { $_.user_id -ne $targetUserId })
                                        $db.cards = @($db.cards | Where-Object { $_.user_id -ne $targetUserId })
                                        $db.study_log = @($db.study_log | Where-Object { $_.user_id -ne $targetUserId })
                                        
                                        &$saveDb $db
                                        $responseData = @{ success = $true }
                                    }
                                }
                            }
                            elseif ($urlPath -eq "/api/admin/stats") {
                                if ($method -eq "GET") {
                                    $dbSize = 0
                                    if (Test-Path $dbPath) {
                                        $dbSize = (Get-Item $dbPath).Length
                                    }
                                    $proc = [System.Diagnostics.Process]::GetCurrentProcess()
                                    $uptimeSeconds = [Math]::Round(( (Get-Date) - $proc.StartTime ).TotalSeconds)
                                    
                                    $responseData = @{
                                        totalUsers = $db.users.Count
                                        totalSets = $db.sets.Count
                                        totalCards = $db.cards.Count
                                        dbSize = $dbSize
                                        uptimeSeconds = $uptimeSeconds
                                    }
                                }
                            }
                        }
                    }
                    # 0.4 Upload (authorized)
                    elseif ($urlPath -eq "/api/upload") {
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
                    # 1. Folders (filtered by user_id)
                    elseif ($urlPath -eq "/api/folders") {
                        if ($method -eq "GET") {
                            $responseData = @($db.folders | Where-Object { $_.user_id -eq $currentUser.id })
                        }
                        elseif ($method -eq "POST") {
                            $newFolder = ConvertFrom-Json $body
                            $newFolderId = "folder_" + [Guid]::NewGuid().ToString().Substring(0, 8)
                            $newFolder | Add-Member -MemberType NoteProperty -Name "id" -Value $newFolderId -Force
                            $newFolder | Add-Member -MemberType NoteProperty -Name "user_id" -Value $currentUser.id -Force
                            
                            $db.folders = @($db.folders) + $newFolder
                            &$saveDb $db
                            $responseData = $newFolder
                            $statusCode = 201
                        }
                    }
                    elseif ($urlPath -match "^/api/folders/([^/]+)$") {
                        $folderId = $Matches[1]
                        # Find folder first and check user_id
                        $folder = $null
                        foreach ($f in $db.folders) {
                            if ($f.id -eq $folderId) { $folder = $f; break }
                        }
                        
                        if ($null -eq $folder) {
                            $statusCode = 404
                            $responseData = @{ error = "Folder not found" }
                        } elseif ($folder.user_id -ne $currentUser.id -and $currentUser.role -ne "admin") {
                            $statusCode = 403
                            $responseData = @{ error = "Access denied" }
                        } else {
                            if ($method -eq "PUT") {
                                $updateData = ConvertFrom-Json $body
                                $folder.name = $updateData.name
                                &$saveDb $db
                                $responseData = $folder
                            }
                            elseif ($method -eq "DELETE") {
                                $db.folders = @($db.folders | Where-Object { $_.id -ne $folderId })
                                
                                # Cascade delete sets and cards belonging to this folder if they belong to this user
                                $setsToDelete = @($db.sets | Where-Object { $_.folder_id -eq $folderId -and $_.user_id -eq $currentUser.id })
                                $db.sets = @($db.sets | Where-Object { -not ($_.folder_id -eq $folderId -and $_.user_id -eq $currentUser.id) })
                                
                                $setIdsToDelete = @($setsToDelete | ForEach-Object { $_.id })
                                if ($setIdsToDelete.Count -gt 0) {
                                    $db.cards = @($db.cards | Where-Object { $_.set_id -notin $setIdsToDelete })
                                }
                                
                                &$saveDb $db
                                $responseData = @{ success = $true }
                            }
                        }
                    }
                    # 2. Sets (filtered by user_id)
                    elseif ($urlPath -eq "/api/sets") {
                        if ($method -eq "GET") {
                            $folderId = $request.QueryString["folderId"]
                            $userSets = @($db.sets | Where-Object { $_.user_id -eq $currentUser.id })
                            if ($folderId) {
                                $responseData = @($userSets | Where-Object { $_.folder_id -eq $folderId })
                            } else {
                                $responseData = $userSets
                            }
                        }
                        elseif ($method -eq "POST") {
                            $newSet = ConvertFrom-Json $body
                            if (-not $newSet.id) {
                                $newSetId = "set_" + [Guid]::NewGuid().ToString().Substring(0, 8)
                                $newSet | Add-Member -MemberType NoteProperty -Name "id" -Value $newSetId -Force
                            }
                            if ($null -eq $newSet.psobject.Properties["user_id"]) {
                                $newSet | Add-Member -MemberType NoteProperty -Name "user_id" -Value $currentUser.id -Force
                            }
                            
                            $existingSetIndex = -1
                            for ($i = 0; $i -lt $db.sets.Count; $i++) {
                                if ($db.sets[$i].id -eq $newSet.id) {
                                    $existingSetIndex = $i
                                    break
                                }
                            }
                            
                            if ($existingSetIndex -ne -1) {
                                # Check ownership
                                if ($db.sets[$existingSetIndex].user_id -ne $currentUser.id -and $currentUser.role -ne "admin") {
                                    $statusCode = 403
                                    $responseData = @{ error = "Access denied" }
                                } else {
                                    $db.sets[$existingSetIndex].title = $newSet.title
                                    $db.sets[$existingSetIndex].description = $newSet.description
                                    $responseData = $db.sets[$existingSetIndex]
                                    &$saveDb $db
                                }
                            } else {
                                $db.sets = @($db.sets) + $newSet
                                $responseData = $newSet
                                &$saveDb $db
                            }
                        }
                    }
                    elseif ($urlPath -match "^/api/sets/([^/]+)$") {
                        $setId = $Matches[1]
                        $found = $null
                        foreach ($s in $db.sets) {
                            if ($s.id -eq $setId) { $found = $s; break }
                        }
                        
                        if ($null -eq $found) {
                            $statusCode = 404
                            $responseData = @{ error = "Set not found" }
                        } elseif ($found.user_id -ne $currentUser.id -and $currentUser.role -ne "admin") {
                            $statusCode = 403
                            $responseData = @{ error = "Access denied" }
                        } else {
                            if ($method -eq "GET") {
                                $responseData = $found
                            }
                            elseif ($method -eq "DELETE") {
                                $db.sets = @($db.sets | Where-Object { $_.id -ne $setId })
                                $db.cards = @($db.cards | Where-Object { $_.set_id -ne $setId })
                                &$saveDb $db
                                $responseData = @{ success = $true }
                            }
                        }
                    }
                    elseif ($urlPath -match "^/api/sets/([^/]+)/highscore$") {
                        $setId = $Matches[1]
                        $foundSet = $null
                        foreach ($s in $db.sets) {
                            if ($s.id -eq $setId) { $foundSet = $s; break }
                        }
                        
                        if ($null -eq $foundSet) {
                            $statusCode = 404
                            $responseData = @{ error = "Set not found" }
                        } elseif ($foundSet.user_id -ne $currentUser.id -and $currentUser.role -ne "admin") {
                            $statusCode = 403
                            $responseData = @{ error = "Access denied" }
                        } else {
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
                    }
                    # 3. Cards (filtered by set ownership)
                    elseif ($urlPath -eq "/api/cards") {
                        if ($method -eq "GET") {
                            $setId = $request.QueryString["setId"]
                            $userSets = @($db.sets | Where-Object { $_.user_id -eq $currentUser.id })
                            $userSetIds = @($userSets | ForEach-Object { $_.id })
                            $userCards = @($db.cards | Where-Object { $_.set_id -in $userSetIds })
                            
                            if ($setId) {
                                $responseData = @($userCards | Where-Object { $_.set_id -eq $setId })
                            } else {
                                $responseData = $userCards
                            }
                        }
                    }
                    elseif ($urlPath -match "^/api/sets/([^/]+)/cards$") {
                        $setId = $Matches[1]
                        $foundSet = $null
                        foreach ($s in $db.sets) {
                            if ($s.id -eq $setId) { $foundSet = $s; break }
                        }
                        
                        if ($null -eq $foundSet) {
                            $statusCode = 404
                            $responseData = @{ error = "Set not found" }
                        } elseif ($foundSet.user_id -ne $currentUser.id -and $currentUser.role -ne "admin") {
                            $statusCode = 403
                            $responseData = @{ error = "Access denied" }
                        } else {
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
                                    if ($null -eq $card.psobject.Properties["user_id"]) {
                                        $card | Add-Member -MemberType NoteProperty -Name "user_id" -Value $currentUser.id -Force
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
                    }
                    elseif ($urlPath -match "^/api/cards/([^/]+)$") {
                        $cardId = $Matches[1]
                        $foundCard = $null
                        foreach ($c in $db.cards) {
                            if ($c.id -eq $cardId) { $foundCard = $c; break }
                        }
                        
                        if ($null -eq $foundCard) {
                            $statusCode = 404
                            $responseData = @{ error = "Card not found" }
                        } else {
                            # Verify parent set ownership
                            $parentSet = $null
                            foreach ($s in $db.sets) {
                                if ($s.id -eq $foundCard.set_id) { $parentSet = $s; break }
                            }
                            if ($null -ne $parentSet -and $parentSet.user_id -ne $currentUser.id -and $currentUser.role -ne "admin") {
                                $statusCode = 403
                                $responseData = @{ error = "Access denied" }
                            } else {
                                if ($method -eq "PATCH" -or $method -eq "PUT") {
                                    $updatedFields = ConvertFrom-Json $body
                                    foreach ($prop in $updatedFields.psobject.Properties) {
                                        if ($foundCard.psobject.Properties[$prop.Name]) {
                                            $foundCard.psobject.Properties[$prop.Name].Value = $prop.Value
                                        } else {
                                            $foundCard | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value -Force
                                        }
                                    }
                                    &$saveDb $db
                                    $responseData = $foundCard
                                }
                            }
                        }
                    }
                    # 4. Study Log (filtered by user_id)
                    elseif ($urlPath -eq "/api/study-log") {
                        if ($method -eq "GET") {
                            $responseData = @($db.study_log | Where-Object { $_.user_id -eq $currentUser.id })
                        }
                        elseif ($method -eq "POST") {
                            $logEntry = ConvertFrom-Json $body
                            $logEntry | Add-Member -MemberType NoteProperty -Name "id" -Value ("log_" + [Guid]::NewGuid().ToString().Substring(0,8)) -Force
                            $logEntry | Add-Member -MemberType NoteProperty -Name "user_id" -Value $currentUser.id -Force
                            
                            $db.study_log = @($db.study_log) + $logEntry
                            # Keep only last 5000 entries to prevent file bloat
                            $userLogs = @($db.study_log | Where-Object { $_.user_id -ne $currentUser.id })
                            if ($userLogs.Count -gt 5000) {
                                $db.study_log = @($db.study_log | Where-Object { $_.user_id -ne $currentUser.id }) + @($userLogs | Select-Object -Last 5000)
                            }
                            &$saveDb $db
                            $responseData = @{ success = $true }
                            $statusCode = 201
                        }
                    }
                    # 5. Settings (stored in user object)
                    elseif ($urlPath -eq "/api/settings") {
                        # Find user
                        $userIdx = -1
                        for ($i = 0; $i -lt $db.users.Count; $i++) {
                            if ($db.users[$i].id -eq $currentUser.id) { $userIdx = $i; break }
                        }
                        
                        if ($userIdx -eq -1) {
                            $statusCode = 404
                            $responseData = @{ error = "User not found" }
                        } else {
                            if ($method -eq "GET") {
                                if ($null -eq $db.users[$userIdx].settings) {
                                    $db.users[$userIdx] | Add-Member -MemberType NoteProperty -Name "settings" -Value ([PSCustomObject]@{ tts_enabled = $true; tts_rate = 0.9; tts_voice = "en-US"; auto_speak_on_flip = $false; audio_feedback = $true }) -Force
                                    &$saveDb $db
                                }
                                $responseData = $db.users[$userIdx].settings
                            }
                            elseif ($method -eq "PUT" -or $method -eq "POST") {
                                $newSettings = ConvertFrom-Json $body
                                if ($null -eq $db.users[$userIdx].settings) {
                                    $db.users[$userIdx] | Add-Member -MemberType NoteProperty -Name "settings" -Value ([PSCustomObject]@{}) -Force
                                }
                                foreach ($prop in $newSettings.psobject.Properties) {
                                    if ($db.users[$userIdx].settings.psobject.Properties[$prop.Name]) {
                                        $db.users[$userIdx].settings.psobject.Properties[$prop.Name].Value = $prop.Value
                                    } else {
                                        $db.users[$userIdx].settings | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value -Force
                                    }
                                }
                                &$saveDb $db
                                $responseData = $db.users[$userIdx].settings
                            }
                        }
                    }
                    # 6. Backups (unfiltered)
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
                                $ts = Get-Date -Format "yyyyMMdd_HHmmss"
                                $preRestorePath = Join-Path $backupsDir "pre_restore_$ts.json"
                                $currentJson = [System.IO.File]::ReadAllText($dbPath, [System.Text.Encoding]::UTF8)
                                [System.IO.File]::WriteAllText($preRestorePath, $currentJson, [System.Text.Encoding]::UTF8)
                                
                                $restoreJson = [System.IO.File]::ReadAllText($backupPath, [System.Text.Encoding]::UTF8)
                                [System.IO.File]::WriteAllText($dbPath, $restoreJson, [System.Text.Encoding]::UTF8)
                                $responseData = @{ success = $true }
                            } else {
                                $statusCode = 404
                                $responseData = @{ error = "Backup file not found" }
                            }
                        }
                    }
                    # 7. Sync (filtered/merged per user)
                    elseif ($urlPath -eq "/api/sync") {
                        if ($method -eq "POST") {
                            try {
                                $backupsDir = Join-Path (Get-Location) "backups"
                                if (-not (Test-Path $backupsDir)) { New-Item -ItemType Directory -Path $backupsDir | Out-Null }
                                $ts = Get-Date -Format "yyyyMMdd_HHmmss"
                                $preSyncPath = Join-Path $backupsDir "pre_sync_$ts.json"
                                if (Test-Path $dbPath) {
                                    $currentJson = [System.IO.File]::ReadAllText($dbPath, [System.Text.Encoding]::UTF8)
                                    [System.IO.File]::WriteAllText($preSyncPath, $currentJson, [System.Text.Encoding]::UTF8)
                                }

                                $syncData = ConvertFrom-Json $body
                                
                                # Clean user's old data
                                $db.folders = @($db.folders | Where-Object { $_.user_id -ne $currentUser.id })
                                $db.sets = @($db.sets | Where-Object { $_.user_id -ne $currentUser.id })
                                $db.cards = @($db.cards | Where-Object { $_.user_id -ne $currentUser.id })
                                $db.study_log = @($db.study_log | Where-Object { $_.user_id -ne $currentUser.id })

                                # Insert sync folders
                                if ($null -ne $syncData.folders) {
                                    foreach ($f in $syncData.folders) {
                                        if ($null -eq $f.psobject.Properties["user_id"]) {
                                            $f | Add-Member -MemberType NoteProperty -Name "user_id" -Value $currentUser.id -Force
                                        } else {
                                            $f.user_id = $currentUser.id
                                        }
                                        $db.folders = @($db.folders) + $f
                                    }
                                }
                                # Insert sync sets
                                if ($null -ne $syncData.sets) {
                                    foreach ($s in $syncData.sets) {
                                        if ($null -eq $s.psobject.Properties["user_id"]) {
                                            $s | Add-Member -MemberType NoteProperty -Name "user_id" -Value $currentUser.id -Force
                                        } else {
                                            $s.user_id = $currentUser.id
                                        }
                                        $db.sets = @($db.sets) + $s
                                    }
                                }
                                # Insert sync cards
                                if ($null -ne $syncData.cards) {
                                    foreach ($c in $syncData.cards) {
                                        if ($null -eq $c.psobject.Properties["user_id"]) {
                                            $c | Add-Member -MemberType NoteProperty -Name "user_id" -Value $currentUser.id -Force
                                        } else {
                                            $c.user_id = $currentUser.id
                                        }
                                        $db.cards = @($db.cards) + $c
                                    }
                                }
                                # Insert sync study log
                                if ($null -ne $syncData.study_log) {
                                    foreach ($l in $syncData.study_log) {
                                        if ($null -eq $l.psobject.Properties["user_id"]) {
                                            $l | Add-Member -MemberType NoteProperty -Name "user_id" -Value $currentUser.id -Force
                                        } else {
                                            $l.user_id = $currentUser.id
                                        }
                                        $db.study_log = @($db.study_log) + $l
                                    }
                                }

                                &$saveDb $db
                                $responseData = @{ success = $true }
                            } catch {
                                $statusCode = 500
                                $responseData = @{ error = "Sync failed: $_" }
                            }
                        }
                    }
                }
                
                $response.StatusCode = $statusCode
                $respJson = Serialize-Json $responseData
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
                $response.ContentLength64 = $bytes.Length
                if ($request.HttpMethod -ne "HEAD") {
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
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
                    if ($request.HttpMethod -ne "HEAD") {
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    }
                } else {
                    $response.StatusCode = 404
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                    $response.ContentLength64 = $errBytes.Length
                    if ($request.HttpMethod -ne "HEAD") {
                        $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                    }
                }
            }
            $response.OutputStream.Close()
        } catch {
            Write-Host "Request error: $_"
            if ($null -ne $response) {
                try { $response.Close() } catch {}
            }
        }
    }
} catch {
    Write-Host "Error: $_"
} finally {
    $listener.Close()
}
