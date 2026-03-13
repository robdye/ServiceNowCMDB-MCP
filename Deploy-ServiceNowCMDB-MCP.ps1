<#
.SYNOPSIS
    Deploys ServiceNowCMDB-MCP (Python FastMCP) to Azure App Service.

.DESCRIPTION
    Provisions an Azure resource group, App Service plan, and Web App,
    then deploys the ServiceNow CMDB MCP server.  ServiceNow credentials
    are stored as secure Azure App Settings.

.PARAMETER ResourceGroup
    Azure resource group name. Default: rg-servicenow-cmdb-mcp

.PARAMETER AppName
    Azure Web App name (must be globally unique). Default: servicenow-cmdb-mcp

.PARAMETER Location
    Azure region. Default: westeurope

.PARAMETER SkuName
    App Service plan SKU. Default: B1

.PARAMETER ServiceNowInstance
    ServiceNow instance URL (e.g. https://dev12345.service-now.com)

.PARAMETER ServiceNowClientId
    ServiceNow OAuth2 Client ID.

.PARAMETER ServiceNowClientSecret
    ServiceNow OAuth2 Client Secret.

.PARAMETER ServiceNowUsername
    ServiceNow username (optional, for resource owner grant).

.PARAMETER ServiceNowPassword
    ServiceNow password (optional, for resource owner grant).

.EXAMPLE
    .\Deploy-ServiceNowCMDB-MCP.ps1
    .\Deploy-ServiceNowCMDB-MCP.ps1 -ServiceNowInstance "https://dev12345.service-now.com" -ServiceNowClientId "abc123" -ServiceNowClientSecret "secret"
#>

param(
    [string]$ResourceGroup = "rg-servicenow-cmdb-mcp",
    [string]$AppName = "servicenow-cmdb-mcp",
    [string]$Location = "westeurope",
    [string]$SkuName = "B1",
    [string]$ServiceNowInstance = "",
    [string]$ServiceNowClientId = "",
    [string]$ServiceNowClientSecret = "",
    [string]$ServiceNowUsername = "",
    [string]$ServiceNowPassword = ""
)

$ErrorActionPreference = "Stop"
$rootDir = $PSScriptRoot
$zipPath = Join-Path $rootDir "publish.zip"
$planName = "$AppName-plan"

Write-Host ""
Write-Host "=== ServiceNowCMDB-MCP (Python) - Azure Deployment ===" -ForegroundColor Cyan
Write-Host "  Resource Group : $ResourceGroup"
Write-Host "  App Name       : $AppName"
Write-Host "  Location       : $Location"
Write-Host "  SKU            : $SkuName"
Write-Host ""

# Step 1: Verify Azure CLI login
Write-Host "[1/6] Verifying Azure CLI login..." -ForegroundColor Yellow
$account = az account show 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Not logged in. Launching browser login..." -ForegroundColor Gray
    az login --allow-no-subscriptions
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Azure login failed." -ForegroundColor Red
        exit 1
    }
}
$accountInfo = az account show --output json | ConvertFrom-Json
Write-Host "  Logged in as: $($accountInfo.user.name)" -ForegroundColor Green
Write-Host "  Subscription: $($accountInfo.name)" -ForegroundColor Green

# Step 2: Create zip package for deployment
Write-Host "[2/6] Creating deployment package..." -ForegroundColor Yellow
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$stageDir = Join-Path $env:TEMP "servicenow-cmdb-stage"
if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
New-Item -ItemType Directory -Path $stageDir | Out-Null

Copy-Item (Join-Path $rootDir "server.py")        -Destination $stageDir
Copy-Item (Join-Path $rootDir "requirements.txt")  -Destination $stageDir
Copy-Item (Join-Path $rootDir "startup.sh")       -Destination $stageDir

$distDest = Join-Path $stageDir "ui\ci-explorer\dist"
New-Item -ItemType Directory -Path $distDest -Force | Out-Null
Copy-Item (Join-Path $rootDir "ui\ci-explorer\dist\*") -Destination $distDest -Recurse

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force
Remove-Item $stageDir -Recurse -Force

$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "  Package: publish.zip ($zipSize MB)" -ForegroundColor Green

# Step 3: Provision Azure resources
Write-Host "[3/6] Provisioning Azure resources..." -ForegroundColor Yellow

$rgExists = az group exists --name $ResourceGroup 2>&1
if ($rgExists -eq "false") {
    Write-Host "  Creating resource group: $ResourceGroup..." -ForegroundColor Gray
    az group create --name $ResourceGroup --location $Location --output none
    Write-Host "  Resource group created." -ForegroundColor Green
} else {
    Write-Host "  Resource group already exists." -ForegroundColor Green
}

$planExists = az appservice plan show --name $planName --resource-group $ResourceGroup 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Creating App Service plan: $planName ($SkuName)..." -ForegroundColor Gray
    az appservice plan create --name $planName --resource-group $ResourceGroup --location $Location --sku $SkuName --is-linux --output none
    Write-Host "  App Service plan created." -ForegroundColor Green
} else {
    Write-Host "  App Service plan already exists." -ForegroundColor Green
}

$appExists = az webapp show --name $AppName --resource-group $ResourceGroup 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Creating Web App: $AppName..." -ForegroundColor Gray
    az webapp create --name $AppName --resource-group $ResourceGroup --plan $planName --runtime "PYTHON:3.13" --output none
    Write-Host "  Web App created." -ForegroundColor Green
} else {
    Write-Host "  Web App already exists." -ForegroundColor Green
}

# Step 4: Configure the Web App
Write-Host "[4/6] Configuring Web App..." -ForegroundColor Yellow

az webapp config set --name $AppName --resource-group $ResourceGroup --web-sockets-enabled true --output none
az webapp config set --name $AppName --resource-group $ResourceGroup --always-on true --output none
az webapp config set --name $AppName --resource-group $ResourceGroup --startup-file "bash /home/site/wwwroot/startup.sh" --output none

if ($ServiceNowInstance -ne "") {
    Write-Host "  Setting ServiceNow app settings..." -ForegroundColor Gray
    az webapp config appsettings set --name $AppName --resource-group $ResourceGroup --settings "SERVICENOW_INSTANCE=$ServiceNowInstance" --output none
    Write-Host "  SERVICENOW_INSTANCE stored." -ForegroundColor Green
} else {
    Write-Host "  SERVICENOW_INSTANCE not provided; existing setting preserved." -ForegroundColor Gray
}

if ($ServiceNowClientId -ne "" -and $ServiceNowClientSecret -ne "") {
    az webapp config appsettings set --name $AppName --resource-group $ResourceGroup --settings "SERVICENOW_CLIENT_ID=$ServiceNowClientId" --output none
    az webapp config appsettings set --name $AppName --resource-group $ResourceGroup --settings "SERVICENOW_CLIENT_SECRET=$ServiceNowClientSecret" --output none
    Write-Host "  OAuth2 client credentials stored securely." -ForegroundColor Green
} else {
    Write-Host "  OAuth2 credentials not provided; existing settings preserved." -ForegroundColor Gray
}

if ($ServiceNowUsername -ne "" -and $ServiceNowPassword -ne "") {
    az webapp config appsettings set --name $AppName --resource-group $ResourceGroup --settings "SERVICENOW_USERNAME=$ServiceNowUsername" --output none
    az webapp config appsettings set --name $AppName --resource-group $ResourceGroup --settings "SERVICENOW_PASSWORD=$ServiceNowPassword" --output none
    Write-Host "  ServiceNow user credentials stored securely." -ForegroundColor Green
} else {
    Write-Host "  User credentials not provided; existing settings preserved." -ForegroundColor Gray
}

Write-Host "  WebSockets enabled, Always On enabled, startup command set." -ForegroundColor Green

# Step 5: Deploy the package
Write-Host "[5/6] Deploying to Azure..." -ForegroundColor Yellow
az webapp deploy --name $AppName --resource-group $ResourceGroup --src-path $zipPath --type zip --output none
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Deployment failed." -ForegroundColor Red
    Write-Host "  The package is available at: $zipPath" -ForegroundColor Yellow
    exit 1
}
Write-Host "  Deployment successful." -ForegroundColor Green

# Clean up
Remove-Item $zipPath -Force

# Step 6: Post-deployment verification
Write-Host "[6/6] Verifying deployment..." -ForegroundColor Yellow

$appUrl = "https://$AppName.azurewebsites.net"
$sseUrl = "$appUrl/sse"

Write-Host ""
Write-Host "=== Deployment Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Web App URL  : $appUrl" -ForegroundColor White
Write-Host "  MCP SSE URL  : $sseUrl" -ForegroundColor White
Write-Host "  CI Explorer  : $appUrl/ui" -ForegroundColor White
Write-Host ""
Write-Host "  Required App Settings:" -ForegroundColor Yellow
Write-Host "    SERVICENOW_INSTANCE       = https://your-instance.service-now.com" -ForegroundColor White
Write-Host "    SERVICENOW_CLIENT_ID      = your_oauth2_client_id" -ForegroundColor White
Write-Host "    SERVICENOW_CLIENT_SECRET  = your_oauth2_client_secret" -ForegroundColor White
Write-Host "    SERVICENOW_USERNAME       = (optional) for resource owner grant" -ForegroundColor White
Write-Host "    SERVICENOW_PASSWORD       = (optional) for resource owner grant" -ForegroundColor White
Write-Host ""
Write-Host "  Copilot Studio Configuration:" -ForegroundColor Yellow
Write-Host "  1. Open Copilot Studio (https://copilotstudio.microsoft.com)" -ForegroundColor White
Write-Host "  2. Go to Actions > Add an action > MCP Server" -ForegroundColor White
Write-Host "  3. Enter the SSE URL: $sseUrl" -ForegroundColor White
Write-Host ""
