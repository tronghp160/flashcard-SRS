# Simple PowerShell HTTP Server
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
try {
    $listener.Start()
    Write-Host "PowerShell Server listening on http://localhost:8080/"
    
    # Run loop
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # Resolve request path
        $urlPath = $request.Url.LocalPath
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
            
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.OutputStream.Close()
    }
} catch {
    Write-Host "Error: $_"
} finally {
    $listener.Close()
}
