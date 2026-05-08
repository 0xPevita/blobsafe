param(
  [string]$Endpoint = $env:SHELBY_S3_GATEWAY_URL,
  [string]$Bucket = $env:SHELBY_S3_BUCKET,
  [string]$Prefix = $env:BLOBSAFE_S3_PREFIX,
  [string]$ObjectKey = $env:BLOBSAFE_S3_OBJECT_KEY,
  [string]$Region = $env:SHELBY_S3_REGION,
  [string]$AccessKeyId = $env:SHELBY_S3_ACCESS_KEY_ID,
  [string]$SecretAccessKey = $env:SHELBY_S3_SECRET_ACCESS_KEY
)

$ErrorActionPreference = "Stop"

if (-not $Endpoint) { $Endpoint = "http://localhost:9000" }
if (-not $Prefix) { $Prefix = "blobsafe/" }
if (-not $Region) { $Region = "shelbyland" }
if (-not $AccessKeyId) { $AccessKeyId = "AKIAIOSFODNN7EXAMPLE" }
if (-not $SecretAccessKey) { $SecretAccessKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" }

if (-not $Bucket) {
  throw "Set SHELBY_S3_BUCKET to your Shelby account address, for example: `$env:SHELBY_S3_BUCKET='0x...'"
}

$aws = Get-Command aws -ErrorAction SilentlyContinue
if (-not $aws) {
  throw "AWS CLI is required. Install it, then run: aws --version"
}

$env:AWS_ACCESS_KEY_ID = $AccessKeyId
$env:AWS_SECRET_ACCESS_KEY = $SecretAccessKey
$env:AWS_DEFAULT_REGION = $Region

function Invoke-AwsChecked {
  param([string[]]$Arguments)
  & aws --endpoint-url $Endpoint @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "aws $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

Write-Host "BlobSafe S3 validation" -ForegroundColor Cyan
Write-Host "Endpoint: $Endpoint"
Write-Host "Bucket:   $Bucket"
Write-Host "Prefix:   $Prefix"
Write-Host ""

Write-Host "1. Listing configured buckets..." -ForegroundColor Cyan
Invoke-AwsChecked @("s3", "ls")

Write-Host ""
Write-Host "2. Listing BlobSafe namespace..." -ForegroundColor Cyan
Invoke-AwsChecked @("s3", "ls", "s3://$Bucket/$Prefix", "--recursive")

if ($ObjectKey) {
  Write-Host ""
  Write-Host "3. Reading object metadata..." -ForegroundColor Cyan
  Invoke-AwsChecked @("s3api", "head-object", "--bucket", $Bucket, "--key", $ObjectKey)

  $safeName = ($ObjectKey -replace "[^a-zA-Z0-9._-]", "_")
  $downloadPath = Join-Path $env:TEMP "blobsafe-s3-$safeName"

  Write-Host ""
  Write-Host "4. Downloading object to $downloadPath..." -ForegroundColor Cyan
  Invoke-AwsChecked @("s3", "cp", "s3://$Bucket/$ObjectKey", $downloadPath)
  Write-Host "Downloaded. Public/plain objects should open directly; encrypted BlobSafe objects remain sealed bytes." -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "Optional: set BLOBSAFE_S3_OBJECT_KEY to head/download a specific object." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "S3 Gateway validation completed." -ForegroundColor Green
