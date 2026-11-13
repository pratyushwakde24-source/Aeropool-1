# ==============================================================================
# AeroPool — Secure Supabase CLI Local Authentication Helper
# Prompts for personal access token using hidden input, authenticates via
# the Supabase CLI, and verifies access to project krxkxhieyqcytknixqdm.
# ==============================================================================

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host 'AeroPool Supabase CLI Secure Authentication' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

# 1. Prompt securely with hidden characters
$promptMessage = 'Enter Supabase Personal Access Token'
$secureToken = Read-Host -Prompt $promptMessage -AsSecureString

if (-not $secureToken) {
    Write-Error 'No token provided. Authentication aborted.'
    exit 1
}

# 2. Convert in memory without logging or echoing
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

# 3. Validate format without printing token
if (-not ($plainToken -like 'sbp_*')) {
    $plainToken = $null
    $secureToken = $null
    [System.GC]::Collect()
    Write-Error 'Invalid token format. Supabase personal access tokens must begin with sbp_.'
    exit 1
}

# 4. Authenticate Supabase CLI using official login --token and file/env fallback
$trimmedToken = $plainToken.Trim()

# 4.1 Save to user profile ~/.supabase/access-token
$supabaseDir = Join-Path $HOME '.supabase'
if (-not (Test-Path $supabaseDir)) {
    New-Item -ItemType Directory -Path $supabaseDir | Out-Null
}
$tokenPath = Join-Path $supabaseDir 'access-token'
[System.IO.File]::WriteAllText($tokenPath, $trimmedToken)

# 4.2 Set process environment variable
$env:SUPABASE_ACCESS_TOKEN = $trimmedToken

# 4.3 Execute official CLI login
& npx supabase login --token $trimmedToken

# 5. Clean up memory immediately
$trimmedToken = $null
$plainToken = $null
$secureToken = $null
[System.GC]::Collect()

Write-Host ''
Write-Host 'Verifying project access with npx supabase projects list...' -ForegroundColor Cyan

# 6. Verify projects list
& npx supabase projects list
