#Requires -Version 5.1
param(
  [int[]]$Ports = @(8081, 5001)
)

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$privateRanges = @(
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16"
)

if (-not (Test-IsAdministrator)) {
  Write-Host "ERROR: Administrator privileges are required to create Windows Firewall rules." -ForegroundColor Red
  Write-Host "Right-click PowerShell, choose Run as administrator, then run:"
  Write-Host ("  powershell -ExecutionPolicy Bypass -File `"{0}`"" -f $PSCommandPath)
  exit 1
}

Get-NetConnectionProfile | Where-Object {
  $_.InterfaceAlias -match "Wi-?Fi|WLAN|Ethernet" -and $_.NetworkCategory -ne "Private"
} | ForEach-Object {
  Write-Host ("Setting network profile '{0}' ({1}) to Private..." -f $_.Name, $_.InterfaceAlias)
  Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private
}

foreach ($port in $Ports) {
  $displayName = "BuiltGlory Dev LAN TCP $port"
  $existing = Get-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue

  if ($existing) {
    Write-Host "Updating firewall rule: $displayName"
    Set-NetFirewallRule -DisplayName $displayName -Enabled True -Profile Private -Action Allow -Direction Inbound | Out-Null
    Get-NetFirewallRule -DisplayName $displayName | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -RemoteAddress $privateRanges | Out-Null
    Get-NetFirewallRule -DisplayName $displayName | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $port | Out-Null
  } else {
    Write-Host "Creating firewall rule: $displayName"
    New-NetFirewallRule `
      -DisplayName $displayName `
      -Name "BuiltGlory-Dev-LAN-TCP-$port" `
      -Direction Inbound `
      -Action Allow `
      -Protocol TCP `
      -LocalPort $port `
      -Profile Private `
      -RemoteAddress $privateRanges `
      -Description "BuiltGlory local development: allow same-Wi-Fi devices to reach TCP $port. Private profile + RFC1918 only." | Out-Null
  }
}

$portList = $Ports -join ", "
Write-Host ""
Write-Host "Windows Firewall LAN rules are ready (Private profile, RFC1918 remotes only)."
Write-Host "Ports: $portList"
exit 0
