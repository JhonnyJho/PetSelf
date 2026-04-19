$ts = Get-Date -Format yyyyMMddHHmmss
$email = "tasks-ci-$ts@example.com"
$pwd = "Password123!"
$body = @{ email = $email; password = $pwd } | ConvertTo-Json
Write-Output "Registering $email"
try {
  $register = Invoke-RestMethod -Uri 'http://localhost:4000/api/register' -Method Post -Body $body -ContentType 'application/json' -ErrorAction Stop
  Write-Output "Register succeeded: $($register | ConvertTo-Json -Depth 3)"
} catch {
  Write-Output "Register error: $($_.Exception.Message)"
}
$loginBody = @{ email = $email; password = $pwd } | ConvertTo-Json
Write-Output "Logging in..."
$login = Invoke-RestMethod -Uri 'http://localhost:4000/api/login' -Method Post -Body $loginBody -ContentType 'application/json' -ErrorAction Stop
$token = $login.token
Write-Output "Token acquired: $token"
Write-Output "Seeding tasks..."
$seed = Invoke-RestMethod -Uri 'http://localhost:4000/api/tasks/seed' -Method Post -Headers @{ Authorization = "Bearer $token" } -ErrorAction Stop
Write-Output "Seed response: $($seed | ConvertTo-Json -Depth 3)"
Write-Output "Fetching tasks..."
$tasks = Invoke-RestMethod -Uri 'http://localhost:4000/api/tasks' -Method Get -Headers @{ Authorization = "Bearer $token" } -ErrorAction Stop
Write-Output "Tasks: $($tasks | ConvertTo-Json -Depth 5)"
