$ErrorActionPreference = "Stop"

function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return
  }

  foreach ($line in Get-Content -Path $Path) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
      continue
    }

    $pair = $trimmed.Split("=", 2)
    if ($pair.Count -lt 2) {
      continue
    }

    $name = $pair[0].Trim()
    $value = $pair[1].Trim()
    if ($value.StartsWith("'") -and $value.EndsWith("'")) {
      $value = $value.Substring(1, $value.Length - 2)
    } elseif ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    Set-Item -Path "Env:$name" -Value $value
  }
}

function Get-PostgresConfig {
  $config = [ordered]@{
    Host = ""
    Port = "5432"
    User = ""
    Password = ""
    Name = ""
  }

  if ($env:DATABASE_URL) {
    $uri = [System.Uri]$env:DATABASE_URL
    $config.Host = $uri.Host
    if ($uri.Port -gt 0) {
      $config.Port = $uri.Port.ToString()
    }
    $userInfo = $uri.UserInfo
    if ($userInfo) {
      $parts = $userInfo.Split(":", 2)
      $config.User = [System.Uri]::UnescapeDataString($parts[0])
      if ($parts.Count -gt 1) {
        $config.Password = [System.Uri]::UnescapeDataString($parts[1])
      }
    }
    $config.Name = $uri.AbsolutePath.TrimStart("/")
    return $config
  }

  $config.Host = $env:DB_HOST
  if ($env:DB_PORT) {
    $config.Port = $env:DB_PORT
  }
  $config.User = $env:DB_USER
  $config.Password = $env:DB_PASSWORD
  $config.Name = $env:DB_NAME
  return $config
}

function Resolve-PsqlPath {
  $cmd = Get-Command psql -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Path
  }

  $registryKeys = @(
    "HKLM:\SOFTWARE\PostgreSQL\Installations",
    "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations"
  )

  foreach ($key in $registryKeys) {
    if (-not (Test-Path $key)) {
      continue
    }
    $subKeys = Get-ChildItem -Path $key -ErrorAction SilentlyContinue
    foreach ($subKey in $subKeys) {
      $installPath = (Get-ItemProperty -Path $subKey.PSPath -ErrorAction SilentlyContinue).BaseDirectory
      if (-not $installPath) {
        continue
      }
      $candidate = Join-Path $installPath "bin\psql.exe"
      if (Test-Path $candidate) {
        return $candidate
      }
    }
  }

  return $null
}

function Invoke-PsqlCommand {
  param(
    [string]$PsqlPath,
    [string]$Database,
    [string]$Command,
    [string]$User,
    [string]$Password,
    [Alias("Host")][string]$PgHost,
    [string]$Port,
    [switch]$Quiet
  )

  $prevPassword = $env:PGPASSWORD
  if ($Password) {
    $env:PGPASSWORD = $Password
  }

  $psqlArgs = @("-v", "ON_ERROR_STOP=1", "-d", $Database)
  if ($User) { $psqlArgs += @("-U", $User) }
  if ($PgHost) { $psqlArgs += @("-h", $PgHost) }
  if ($Port) { $psqlArgs += @("-p", $Port) }
  if ($Quiet) { $psqlArgs += "-q" }
  $psqlArgs += @("-c", $Command)

  & $PsqlPath @psqlArgs
  $exitCode = $LASTEXITCODE

  if ($null -eq $prevPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue | Out-Null
  } else {
    $env:PGPASSWORD = $prevPassword
  }

  return $exitCode
}

function Invoke-PsqlFile {
  param(
    [string]$PsqlPath,
    [string]$Database,
    [string]$FilePath,
    [string]$User,
    [string]$Password,
    [Alias("Host")][string]$PgHost,
    [string]$Port
  )

  $prevPassword = $env:PGPASSWORD
  if ($Password) {
    $env:PGPASSWORD = $Password
  }

  $psqlArgs = @("-v", "ON_ERROR_STOP=1", "-d", $Database, "-f", $FilePath)
  if ($User) { $psqlArgs += @("-U", $User) }
  if ($PgHost) { $psqlArgs += @("-h", $PgHost) }
  if ($Port) { $psqlArgs += @("-p", $Port) }

  & $PsqlPath @psqlArgs
  $exitCode = $LASTEXITCODE

  if ($null -eq $prevPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue | Out-Null
  } else {
    $env:PGPASSWORD = $prevPassword
  }

  return $exitCode
}

function Invoke-PsqlQuery {
  param(
    [string]$PsqlPath,
    [string]$Database,
    [string]$Query,
    [string]$User,
    [string]$Password,
    [Alias("Host")][string]$PgHost,
    [string]$Port
  )

  $prevPassword = $env:PGPASSWORD
  if ($Password) {
    $env:PGPASSWORD = $Password
  }

  $psqlArgs = @("-t", "-A", "-d", $Database, "-c", $Query)
  if ($User) { $psqlArgs += @("-U", $User) }
  if ($PgHost) { $psqlArgs += @("-h", $PgHost) }
  if ($Port) { $psqlArgs += @("-p", $Port) }

  $output = & $PsqlPath @psqlArgs
  $exitCode = $LASTEXITCODE

  if ($null -eq $prevPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue | Out-Null
  } else {
    $env:PGPASSWORD = $prevPassword
  }

  return @{
    ExitCode = $exitCode
    Output = $output
  }
}

function Wait-Postgres {
  param(
    [string]$PsqlPath,
    [string]$User,
    [string]$Password,
    [Alias("Host")][string]$PgHost,
    [string]$Port,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $exitCode = Invoke-PsqlCommand -PsqlPath $PsqlPath -Database "postgres" -Command "SELECT 1;" -User $User -Password $Password -Host $PgHost -Port $Port -Quiet
    if ($exitCode -eq 0) {
      return $true
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Invoke-Migrate {
  param(
    [string]$BackendDir,
    [Alias("Args")][string[]]$MigrateArgs
  )
  Push-Location $BackendDir
  try {
    & (Join-Path $BackendDir "django_api.exe") @MigrateArgs
    return $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installRoot = Resolve-Path (Join-Path $scriptDir "..")
$backendDir = Join-Path $installRoot "backend"
$backendExe = Join-Path $backendDir "django_api.exe"
$schemaPath = Join-Path $installRoot "db\schema.sql"

$programData = $env:LOCALAPPDATA
if (-not $programData) {
  $programData = $env:APPDATA
}
if (-not $programData) {
  $programData = $env:ProgramData
}
if (-not $programData) {
  $programData = $env:PROGRAMDATA
}
if (-not $programData) {
  $programData = "C:\ProgramData"
}

$programDataRoot = Join-Path $programData "POS System"
$logDir = Join-Path $programDataRoot "logs"
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$transcriptPath = Join-Path $logDir "db-init.log"
$transcriptStarted = $false
try {
  Start-Transcript -Path $transcriptPath -Append | Out-Null
  $transcriptStarted = $true
} catch {
  Write-Warning "Failed to start transcript: $($_.Exception.Message)"
}

if (-not (Test-Path $backendExe)) {
  throw "Backend executable not found at $backendExe"
}

try {
  $envPathProgramData = Join-Path $programDataRoot "backend\.env"
  $envPathInstall = Join-Path $backendDir ".env"
  if (Test-Path $envPathProgramData) {
    $envPath = $envPathProgramData
  } elseif (Test-Path $envPathInstall) {
    $envPath = $envPathInstall
  } else {
    $envPath = $envPathProgramData
    Write-Warning "No .env found at $envPathProgramData or $envPathInstall. Database initialization may fail."
  }

  Import-DotEnv -Path $envPath

  $engine = $env:DB_ENGINE
  $usePostgres = $false
  if ($engine -and $engine -like "*postgres*") {
    $usePostgres = $true
  } elseif ($env:DATABASE_URL) {
    $usePostgres = $true
  } elseif ($env:DB_HOST) {
    $usePostgres = $true
  }

  if ($envPath) {
    $env:ENV_FILE = $envPath
  }

  $exitCode = 0

  if (-not $usePostgres) {
    Write-Error "Only PostgreSQL is supported. Set DATABASE_URL or DB_* PostgreSQL values in .env."
    exit 7
  } else {
    $config = Get-PostgresConfig
    if (-not $config.Name) {
      throw "PostgreSQL database name is missing. Set DATABASE_URL or DB_NAME."
    }

    $psql = Resolve-PsqlPath
    if (-not $psql) {
      Write-Error "psql was not found. Install PostgreSQL or add it to PATH, then re-run init_db.ps1."
      exit 2
    }

    $appUser = $env:POS_APP_DB_USER
    if (-not $appUser) {
      $appUser = $config.User
    }
    if (-not $appUser) {
      $appUser = "pos_app"
    }

    $appPassword = $env:POS_APP_DB_PASSWORD
    if (-not $appPassword) {
      $appPassword = $config.Password
    }
    if (-not $appPassword) {
      Write-Error "Application database password is required. Set DB_PASSWORD or POS_APP_DB_PASSWORD."
      exit 6
    }

    $superUser = $env:PGUSER
    if (-not $superUser) {
      $superUser = $env:POS_PG_SUPERUSER
    }
    if (-not $superUser) {
      $superUser = "postgres"
    }
      $superPassword = $env:PGPASSWORD
      if (-not $superPassword) {
        $superPassword = $env:POS_PG_SUPERPASS
      }
      if (-not $superPassword) {
        $superPassword = $env:POS_PG_PASSWORD
      }

    $ready = Wait-Postgres -PsqlPath $psql -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port -TimeoutSeconds 60
    if (-not $ready) {
      Write-Error "PostgreSQL did not become ready within 60 seconds."
      exit 3
    }

    $roleNameForQuery = $appUser.Replace("'", "''")
    $roleNameForIdentifier = $appUser.Replace('"', '""')
    $passForSql = $appPassword.Replace("'", "''")
    $roleQuery = "SELECT 1 FROM pg_roles WHERE rolname = '$roleNameForQuery';"
    $roleResult = Invoke-PsqlQuery -PsqlPath $psql -Database "postgres" -Query $roleQuery -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
      if ($roleResult.ExitCode -ne 0) {
        if (-not $superPassword) {
          Write-Error "PostgreSQL authentication failed for superuser. Provide POS_PG_SUPERPASS (or PGPASSWORD) if password auth is required."
          exit 4
        }
        Write-Error "PostgreSQL authentication failed for superuser. Verify POS_PG_SUPERPASS."
        exit 5
      }
    if (-not ($roleResult.Output -match "1")) {
      $createRole = "CREATE ROLE `"$roleNameForIdentifier`" LOGIN PASSWORD '$passForSql';"
      $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database "postgres" -Command $createRole -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
      if ($exitCode -ne 0) {
        exit $exitCode
      }
    } else {
      $alterRole = "ALTER ROLE `"$roleNameForIdentifier`" WITH LOGIN PASSWORD '$passForSql';"
      $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database "postgres" -Command $alterRole -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
      if ($exitCode -ne 0) {
        exit $exitCode
      }
    }

    $dbNameForQuery = $config.Name.Replace("'", "''")
    $dbNameForIdentifier = $config.Name.Replace('"', '""')
    $dbQuery = "SELECT 1 FROM pg_database WHERE datname = '$dbNameForQuery';"
    $dbResult = Invoke-PsqlQuery -PsqlPath $psql -Database "postgres" -Query $dbQuery -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
      if ($dbResult.ExitCode -ne 0) {
        if (-not $superPassword) {
          Write-Error "PostgreSQL authentication failed for superuser. Provide POS_PG_SUPERPASS (or PGPASSWORD) if password auth is required."
          exit 4
        }
        Write-Error "PostgreSQL authentication failed for superuser. Verify POS_PG_SUPERPASS."
        exit 5
      }
    if (-not ($dbResult.Output -match "1")) {
      $createDb = "CREATE DATABASE `"$dbNameForIdentifier`" OWNER `"$roleNameForIdentifier`";"
      $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database "postgres" -Command $createDb -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
      if ($exitCode -ne 0) {
        exit $exitCode
      }
    } else {
      $alterDbOwner = "ALTER DATABASE `"$dbNameForIdentifier`" OWNER TO `"$roleNameForIdentifier`";"
      $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database "postgres" -Command $alterDbOwner -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
      if ($exitCode -ne 0) {
        exit $exitCode
      }
    }

    $grantDb = "GRANT ALL PRIVILEGES ON DATABASE `"$dbNameForIdentifier`" TO `"$roleNameForIdentifier`";"
    $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database "postgres" -Command $grantDb -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
    if ($exitCode -ne 0) {
      exit $exitCode
    }

    $schemaName = $env:DB_SCHEMA
    if (-not $schemaName) {
      $schemaName = "pos_loc"
    }

    $searchPathRole = "ALTER ROLE `"$roleNameForIdentifier`" SET search_path TO `"$schemaName`", public;"
    $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database $config.Name -Command $searchPathRole -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
    if ($exitCode -ne 0) {
      exit $exitCode
    }

    $searchPathDb = "ALTER DATABASE `"$dbNameForIdentifier`" SET search_path TO `"$schemaName`", public;"
    $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database "postgres" -Command $searchPathDb -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
    if ($exitCode -ne 0) {
      exit $exitCode
    }

    if ($superPassword) {
      $ensureSchema = "CREATE SCHEMA IF NOT EXISTS `"$schemaName`"; ALTER SCHEMA `"$schemaName`" OWNER TO `"$roleNameForIdentifier`";"
      $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database $config.Name -Command $ensureSchema -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
      if ($exitCode -ne 0) {
        exit $exitCode
      }

      $extSchemaQuery = "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'uuid-ossp';"
      $extSchemaResult = Invoke-PsqlQuery -PsqlPath $psql -Database $config.Name -Query $extSchemaQuery -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
      if ($extSchemaResult.ExitCode -eq 0) {
          # uuid-ossp has a hyphen; it must be double-quoted in SQL.
          $uuidOsspForPsql = '"uuid-ossp"'
        $extSchema = ($extSchemaResult.Output | Select-Object -First 1).Trim()
        if (-not $extSchema) {
          $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database $config.Name -Command "CREATE EXTENSION IF NOT EXISTS $uuidOsspForPsql WITH SCHEMA $schemaName;" -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
          if ($exitCode -ne 0) {
            exit $exitCode
          }
        } elseif ($extSchema -ne $schemaName) {
          $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database $config.Name -Command "ALTER EXTENSION $uuidOsspForPsql SET SCHEMA $schemaName;" -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
          if ($exitCode -ne 0) {
            exit $exitCode
          }
        }
      } else {
        Write-Warning "Failed to check uuid-ossp extension schema."
      }
    } else {
      Write-Warning "Superuser password missing; skipping schema/extension ensure."
    }

    if (Test-Path $schemaPath) {
      $tableCountQuery = "SELECT count(*) FROM information_schema.tables WHERE table_schema = '$schemaName';"
      $tableResult = Invoke-PsqlQuery -PsqlPath $psql -Database $config.Name -Query $tableCountQuery -User $appUser -Password $appPassword -Host $config.Host -Port $config.Port
      if ($tableResult.ExitCode -ne 0) {
        Write-Error "Failed to access database '$($config.Name)' as user '$appUser'."
        exit $tableResult.ExitCode
      }

      if ($tableResult.Output -match "^[1-9]") {
        Write-Host "Schema '$schemaName' already populated. Skipping base schema import."
      } else {
        $prevPassword = $env:PGPASSWORD
        if ($appPassword) {
          $env:PGPASSWORD = $appPassword
        }
        $psqlArgs = @("-v", "ON_ERROR_STOP=1", "-1", "-d", $config.Name, "-f", $schemaPath)
        if ($appUser) { $psqlArgs += @("-U", $appUser) }
        if ($config.Host) { $psqlArgs += @("-h", $config.Host) }
        if ($config.Port) { $psqlArgs += @("-p", $config.Port) }
        & $psql @psqlArgs
        $exitCode = $LASTEXITCODE
        if ($null -eq $prevPassword) {
          Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue | Out-Null
        } else {
          $env:PGPASSWORD = $prevPassword
        }
        if ($exitCode -ne 0) {
          exit $exitCode
        }
      }
    } else {
      Write-Warning "schema.sql not found at $schemaPath. Skipping base schema import."
    }

    if ($superPassword) {
      $grantSql = "GRANT USAGE ON SCHEMA `"$schemaName`" TO `"$roleNameForIdentifier`"; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA `"$schemaName`" TO `"$roleNameForIdentifier`"; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA `"$schemaName`" TO `"$roleNameForIdentifier`"; ALTER DEFAULT PRIVILEGES IN SCHEMA `"$schemaName`" GRANT ALL ON TABLES TO `"$roleNameForIdentifier`"; ALTER DEFAULT PRIVILEGES IN SCHEMA `"$schemaName`" GRANT ALL ON SEQUENCES TO `"$roleNameForIdentifier`";"
      $exitCode = Invoke-PsqlCommand -PsqlPath $psql -Database $config.Name -Command $grantSql -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
      if ($exitCode -ne 0) {
        exit $exitCode
      }

      $rlsSql = @"
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = '$schemaName' LOOP
    EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
    EXECUTE format('ALTER TABLE %I.%I NO FORCE ROW LEVEL SECURITY', r.schemaname, r.tablename);
  END LOOP;
END $$;
"@
      $rlsFile = Join-Path $env:TEMP "pos_disable_rls.sql"
      Set-Content -Path $rlsFile -Value $rlsSql -Encoding ASCII
      $exitCode = Invoke-PsqlFile -PsqlPath $psql -Database $config.Name -FilePath $rlsFile -User $superUser -Password $superPassword -Host $config.Host -Port $config.Port
      if ($exitCode -ne 0) {
        exit $exitCode
      }
    } else {
      Write-Warning "Superuser password missing; skipping RLS disable/grants."
    }

    $exitCode = Invoke-Migrate -BackendDir $backendDir -MigrateArgs @("migrate", "--fake-initial", "--noinput")
  }

  exit $exitCode
} finally {
  if ($transcriptStarted) {
    try {
      Stop-Transcript | Out-Null
    } catch {
      Write-Warning "Failed to stop transcript: $($_.Exception.Message)"
    }
  }
}
