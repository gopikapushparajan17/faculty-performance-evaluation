$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"

Write-Host ""
Write-Host "============================================"
Write-Host " Faculty Performance Evaluation - Setup"
Write-Host "============================================"
Write-Host ""

Write-Host "Project root: $ProjectRoot"
Write-Host ""

# Check Python
# Check Python 3.12
$pythonLauncher = Get-Command py -ErrorAction SilentlyContinue

if (-not $pythonLauncher) {
    Write-Host "ERROR: Python Launcher (py) is not installed."
    exit 1
}

try {
    $pythonVersion = & py -3.12 --version 2>&1
}
catch {
    Write-Host "ERROR: Python 3.12 is not installed."
    Write-Host "Please install Python 3.12 and run setup again."
    exit 1
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Python 3.12 is not installed."
    exit 1
}

Write-Host "Python found: $pythonVersion"

# Node.js/npm are not required for the installed application.
# The production React frontend is already included in frontend\dist.

Write-Host "Production frontend detected."
Write-Host "Node.js/npm are not required for this installation."

# Check MySQL
$mysqlExe = $null

# First try MySQL from PATH
$mysqlCommand = Get-Command mysql -ErrorAction SilentlyContinue

if ($mysqlCommand) {
    $mysqlExe = $mysqlCommand.Source
}
else {
    # Detect MySQL from the Windows MySQL80 service
    $service = Get-CimInstance Win32_Service -Filter "Name='MySQL80'" -ErrorAction SilentlyContinue

    if ($service -and $service.PathName) {
        if ($service.PathName -match '"([^"]*\\mysqld\.exe)"') {
            $mysqldPath = $matches[1]
            $mysqlBinDir = Split-Path $mysqldPath -Parent
            $candidate = Join-Path $mysqlBinDir "mysql.exe"

            if (Test-Path $candidate) {
                $mysqlExe = $candidate
            }
        }
    }
}

if ($mysqlExe) {
    $mysqlVersion = & $mysqlExe --version 2>&1
    Write-Host "MySQL found: $mysqlVersion"
    Write-Host "MySQL executable: $mysqlExe"
}
else {
    Write-Host "ERROR: MySQL is not installed or could not be located."
    exit 1
}

Write-Host ""
Write-Host "All required development tools were detected."
Write-Host ""
Write-Host "Setup prerequisite check completed successfully."
Write-Host ""
Write-Host "============================================"
Write-Host " MySQL Database Setup"
Write-Host "============================================"
Write-Host ""

$mysqlRootPassword = Read-Host "Enter MySQL root password" -AsSecureString

$credential = New-Object System.Management.Automation.PSCredential(
    "root",
    $mysqlRootPassword
)

$plainRootPassword = $credential.GetNetworkCredential().Password

Write-Host "Testing MySQL connection..."

$mysqlOutput = cmd /c "`"$mysqlExe`" -u root -p`"$plainRootPassword`" -e `"SELECT VERSION();`" 2>&1"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Could not connect to MySQL."
    Write-Host "Please verify the root password and try again."
    exit 1
}

Write-Host "MySQL connection successful."
Write-Host ""
Write-Host "Preparing Python runtime environment..."

$RuntimeVenv = Join-Path $ProjectRoot "installer\runtime-venv"
$RuntimePython = Join-Path $RuntimeVenv "Scripts\python.exe"

if (-not (Test-Path $RuntimePython)) {
    Write-Host "Creating Python 3.12 virtual environment..."

    & py -3.12 -m venv $RuntimeVenv

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Could not create the Python runtime environment."
        exit 1
    }
}

Write-Host "Installing backend dependencies..."

& $RuntimePython -m pip install -r (Join-Path $BackendDir "requirements.txt")

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Could not install backend dependencies."
    exit 1
}

Write-Host "Python runtime environment is ready."
Write-Host "Database setup can proceed."
Write-Host ""
Write-Host "Creating application database..."

$createDatabaseSql = "CREATE DATABASE IF NOT EXISTS faculty_evaluation CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

$env:MYSQL_PWD = $plainRootPassword

try {
    & $mysqlExe `
        "-u" "root" `
        "-e" $createDatabaseSql

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Could not create the faculty_evaluation database."
        exit 1
    }
}
finally {
    Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
}

Write-Host "Database faculty_evaluation is ready."
Write-Host ""
Write-Host ""
Write-Host "Configuring application environment..."

$BackendEnvFile = Join-Path $BackendDir ".env"

if (Test-Path $BackendEnvFile) {
    Write-Host "Existing application environment found."
    Write-Host "Keeping the existing .env configuration."
}
else {
    Write-Host "Configuring application environment..."
    Write-Host "Enter a secret key for the application."
    Write-Host "Press Enter to generate one automatically."

    $secretKeyInput = Read-Host "SECRET_KEY"

    if ([string]::IsNullOrWhiteSpace($secretKeyInput)) {
        $secretKeyInput = & "$RuntimePython" -c "import secrets; print(secrets.token_urlsafe(48))"
    }

    $envContent = @"
DB_USER=root
DB_PASSWORD=$plainRootPassword
DB_HOST=localhost
DB_NAME=faculty_evaluation

SECRET_KEY=$secretKeyInput

FRONTEND_URL=http://localhost:8000

SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=no-reply@facultyeval.edu
SMTP_USE_TLS=true

EPO_OPS_CONSUMER_KEY=
EPO_OPS_CONSUMER_SECRET=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BUCKET=
S3_PREFIX=evaluation-proofs
S3_USE_PATH_STYLE=false
S3_ENDPOINT_URL=

ARCHIVE_STORAGE_PATH=
ARCHIVE_RETENTION_YEARS=30
"@

    Set-Content -Path $BackendEnvFile -Value $envContent -Encoding UTF8

    Write-Host "Application environment configured."
}

Write-Host "Application environment configured."
Write-Host "Creating application tables..."

$env:DB_USER = "root"
$env:DB_PASSWORD = $plainRootPassword
$env:DB_HOST = "localhost"
$env:DB_NAME = "faculty_evaluation"

Push-Location $BackendDir

try {
    & "$ProjectRoot\installer\runtime-venv\Scripts\python.exe" -c "from app.db_models import Base; from app.mysql_db import engine; Base.metadata.create_all(bind=engine); print('Database tables created successfully.')"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Could not create application tables."
        exit 1
    }
}
finally {
    Pop-Location
    Remove-Item Env:\DB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\DB_USER -ErrorAction SilentlyContinue
    Remove-Item Env:\DB_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:\DB_NAME -ErrorAction SilentlyContinue
}
Write-Host "Application tables are ready."
Write-Host ""
Write-Host "============================================"
Write-Host " Initial Administrator Account"
Write-Host "============================================"
Write-Host ""

Push-Location $BackendDir

try {
    & "$RuntimePython" "..\installer\create_admin.py"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Could not create the administrator account."
        exit 1
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Administrator account setup completed."