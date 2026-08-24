[CmdletBinding()]
param(
    [switch] $StaticOnly
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ObsIntegration.Common.ps1')

function Assert-IlyTest {
    param(
        [Parameter(Mandatory = $true)]
        [bool] $Condition,

        [Parameter(Mandatory = $true)]
        [string] $Message
    )

    if (-not $Condition) {
        throw "Validation failed: $Message"
    }
}

$results = New-Object System.Collections.Generic.List[object]
$repositoryRoot = Get-IlyFullPath -Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$resourceRoot = Join-Path $repositoryRoot 'resources\obs-integration'
$themePath = Join-Path $resourceRoot 'themes\ilyStream_Cyber_Neon.ovt'

$scriptFiles = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File -ErrorAction Stop)
foreach ($scriptFile in $scriptFiles) {
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($scriptFile.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
    Assert-IlyTest -Condition ($parseErrors.Count -eq 0) -Message "$($scriptFile.Name) has PowerShell syntax errors: $($parseErrors -join '; ')"
}
$results.Add([pscustomobject]@{ Check = 'PowerShell syntax'; Result = "PASS ($($scriptFiles.Count) scripts)" })

$operationalScripts = @($scriptFiles | Where-Object { $_.Name -ne 'Test-IlyStreamObsIntegration.ps1' })
$allScriptContent = ($operationalScripts | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`n"
Assert-IlyTest -Condition ($allScriptContent -notmatch '(?i)\b(?:Stop-Process|Start-Process|taskkill|Restart-Computer|shutdown\.exe)\b') -Message 'A script contains process-start, process-stop, or restart behavior.'
$results.Add([pscustomobject]@{ Check = 'Never restart OBS'; Result = 'PASS' })

Assert-IlyThemeSource -Path $themePath
$themeContent = Get-Content -LiteralPath $themePath -Raw -ErrorAction Stop
Assert-IlyTest -Condition (($themeContent.ToCharArray() | Where-Object { $_ -eq '{' }).Count -eq ($themeContent.ToCharArray() | Where-Object { $_ -eq '}' }).Count) -Message 'Theme braces are unbalanced.'
foreach ($requiredColor in @('#05070D', '#0D1321', '#19C8FF', '#D035F1', '#F5F8FF')) {
    Assert-IlyTest -Condition ($themeContent -match [regex]::Escape($requiredColor)) -Message "Theme is missing palette color $requiredColor."
}
$results.Add([pscustomobject]@{ Check = 'OBS theme contract'; Result = "PASS ($(Get-IlySha256 -Path $themePath))" })

$schemaPath = Join-Path $resourceRoot 'plugin-package\obs-plugin-package.schema.json'
$null = Get-Content -LiteralPath $schemaPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
$results.Add([pscustomobject]@{ Check = 'Package schema JSON'; Result = 'PASS' })

$detected = @(Get-IlyObsInstallations)
if ($detected.Count -gt 0) {
    $results.Add([pscustomobject]@{ Check = 'Local OBS discovery'; Result = "PASS ($($detected[0].Origin): $($detected[0].Root))" })
    if (Test-IlyObsRootUsesSharedPlugins -Installation $detected[0]) {
        $localLayout = Resolve-IlyPluginInstallLayout -Installation $detected[0] -PluginId 'ilystream-obs'
        $expectedSharedRoot = Get-IlyFullPath -Path (Join-Path $env:ProgramData 'obs-studio\plugins\ilystream-obs')
        Assert-IlyTest -Condition ([string]$localLayout.Kind -eq 'ProgramData' -and [string]$localLayout.InstallRoot -eq $expectedSharedRoot) -Message 'Standard OBS did not default to the recommended ProgramData plugin layout.'
        $results.Add([pscustomobject]@{ Check = 'Recommended layout default'; Result = "PASS ($($localLayout.InstallRoot))" })
    }
    if ($detected[0].Origin -eq 'Running') {
        $blockedRunningTarget = $false
        try {
            Assert-IlyObsNotRunning -ObsRoot $detected[0].Root
        }
        catch {
            $blockedRunningTarget = $true
        }
        Assert-IlyTest -Condition $blockedRunningTarget -Message 'The native plugin guard did not reject the running OBS installation.'
        $results.Add([pscustomobject]@{ Check = 'Loaded-DLL guard'; Result = 'PASS (running target rejected)' })
    }
}
else {
    $results.Add([pscustomobject]@{ Check = 'Local OBS discovery'; Result = 'SKIP (no local OBS found)' })
}

if (-not $StaticOnly) {
    $temporaryParent = Get-IlyFullPath -Path ([System.IO.Path]::GetTempPath())
    $temporaryRoot = Join-Path $temporaryParent ('ilyobs-' + [System.Guid]::NewGuid().ToString('N'))
    $resolvedTemporaryRoot = Get-IlyFullPath -Path $temporaryRoot
    Assert-IlyTest -Condition (Test-IlyPathWithin -ChildPath $resolvedTemporaryRoot -ParentPath $temporaryParent) -Message 'Temporary validation root escaped the system temp directory.'
    Assert-IlyTest -Condition ((Split-Path -Leaf $resolvedTemporaryRoot) -like 'ilyobs-*') -Message 'Temporary validation root has an unexpected name.'

    try {
        $fakeObsRoot = Join-Path $resolvedTemporaryRoot 'fake-obs'
        $fakeExecutable = Join-Path $fakeObsRoot 'bin\64bit\obs64.exe'
        $fakeBaseTheme = Join-Path $fakeObsRoot 'data\obs-studio\themes\Yami.obt'
        New-Item -ItemType Directory -Path (Split-Path -Parent $fakeExecutable), (Split-Path -Parent $fakeBaseTheme) -Force -ErrorAction Stop | Out-Null
        [System.IO.File]::WriteAllBytes($fakeExecutable, [byte[]](0, 1, 2, 3))
        [System.IO.File]::WriteAllText($fakeBaseTheme, "@OBSThemeMeta { id: 'com.obsproject.Yami'; }", (New-Object System.Text.UTF8Encoding($false)))
        [System.IO.File]::WriteAllText((Join-Path $fakeObsRoot 'portable_mode.txt'), '', (New-Object System.Text.UTF8Encoding($false)))

        $fakeInstallation = Select-IlyObsInstallation -ObsRoot $fakeObsRoot
        Assert-IlyTest -Condition $fakeInstallation.IsPortable -Message 'Portable marker was not detected.'
        Assert-IlyTest -Condition ($fakeInstallation.ConfigRoot -eq (Get-IlyFullPath -Path (Join-Path $fakeObsRoot 'config\obs-studio'))) -Message 'Portable config root was not selected.'
        $results.Add([pscustomobject]@{ Check = 'Custom/portable discovery'; Result = 'PASS' })

        $fakeStandardObsRoot = Join-Path $resolvedTemporaryRoot 'fake-standard-obs'
        $fakeStandardExecutable = Join-Path $fakeStandardObsRoot 'bin\64bit\obs64.exe'
        $fakeStandardBaseTheme = Join-Path $fakeStandardObsRoot 'data\obs-studio\themes\Yami.obt'
        New-Item -ItemType Directory -Path (Split-Path -Parent $fakeStandardExecutable), (Split-Path -Parent $fakeStandardBaseTheme) -Force -ErrorAction Stop | Out-Null
        [System.IO.File]::WriteAllBytes($fakeStandardExecutable, [byte[]](0, 1, 2, 3))
        [System.IO.File]::WriteAllText($fakeStandardBaseTheme, "@OBSThemeMeta { id: 'com.obsproject.Yami'; }", (New-Object System.Text.UTF8Encoding($false)))

        $dryRunConfig = Join-Path $resolvedTemporaryRoot 'theme-dry-run-config'
        & (Join-Path $PSScriptRoot 'Install-IlyStreamObsTheme.ps1') -ObsRoot $fakeObsRoot -ObsConfigRoot $dryRunConfig -WhatIf -Confirm:$false | Out-Null
        Assert-IlyTest -Condition (-not (Test-Path -LiteralPath $dryRunConfig)) -Message 'Theme -WhatIf created its target config directory.'
        $results.Add([pscustomobject]@{ Check = 'Theme dry run'; Result = 'PASS (no destination writes)' })

        $roundTripConfig = Join-Path $resolvedTemporaryRoot 'round-trip-config'
        $roundTripThemeDirectory = Join-Path $roundTripConfig 'themes'
        $roundTripThemePath = Join-Path $roundTripThemeDirectory $script:IlyObsThemeFileName
        New-Item -ItemType Directory -Path $roundTripThemeDirectory -Force -ErrorAction Stop | Out-Null
        [System.IO.File]::WriteAllText($roundTripThemePath, 'preexisting-theme-sentinel', (New-Object System.Text.UTF8Encoding($false)))
        $preexistingThemeHash = Get-IlySha256 -Path $roundTripThemePath

        & (Join-Path $PSScriptRoot 'Install-IlyStreamObsTheme.ps1') -ObsRoot $fakeObsRoot -ObsConfigRoot $roundTripConfig -Confirm:$false | Out-Null
        Assert-IlyTest -Condition ((Get-IlySha256 -Path $roundTripThemePath) -eq (Get-IlySha256 -Path $themePath)) -Message 'Installed theme hash is incorrect.'
        & (Join-Path $PSScriptRoot 'Uninstall-IlyStreamObsTheme.ps1') -ObsRoot $fakeObsRoot -ObsConfigRoot $roundTripConfig -Confirm:$false | Out-Null
        Assert-IlyTest -Condition ((Get-IlySha256 -Path $roundTripThemePath) -eq $preexistingThemeHash) -Message 'Theme uninstall did not restore the preexisting file.'
        $results.Add([pscustomobject]@{ Check = 'Theme install/rollback'; Result = 'PASS (hash-exact restore)' })

        $packageRoot = Join-Path $resolvedTemporaryRoot 'plugin-package'
        $packageBinaryDirectory = Join-Path $packageRoot 'obs-plugins\64bit'
        $packageDataDirectory = Join-Path $packageRoot 'data\obs-plugins\ilyStream-obs\locale'
        New-Item -ItemType Directory -Path $packageBinaryDirectory, $packageDataDirectory -Force -ErrorAction Stop | Out-Null
        $packageDll = Join-Path $packageBinaryDirectory 'ilyStream-obs.dll'
        [System.IO.File]::WriteAllBytes($packageDll, [byte[]](73, 76, 89, 83, 84, 82, 69, 65, 77))
        [System.IO.File]::WriteAllText((Join-Path $packageDataDirectory 'en-US.ini'), "Plugin.Name=ilyStream`n", (New-Object System.Text.UTF8Encoding($false)))
        [System.IO.File]::WriteAllText((Join-Path $packageRoot 'obs-plugin-package.json'), '{"schemaVersion":1,"pluginId":"ilyStream-obs","version":"test-1","architecture":"x64"}', (New-Object System.Text.UTF8Encoding($false)))

        $dryRunStageRoot = Join-Path $resolvedTemporaryRoot 'plugin-dry-run-stage'
        & (Join-Path $PSScriptRoot 'Stage-IlyStreamObsPlugin.ps1') -PackagePath $packageRoot -ObsRoot $fakeObsRoot -ObsConfigRoot $roundTripConfig -StageRoot $dryRunStageRoot -WhatIf -Confirm:$false | Out-Null
        Assert-IlyTest -Condition (-not (Test-Path -LiteralPath $dryRunStageRoot)) -Message 'Plugin stage -WhatIf created its target directory.'
        $results.Add([pscustomobject]@{ Check = 'Plugin stage dry run'; Result = 'PASS (no destination writes)' })

        $stageRoot = Join-Path $resolvedTemporaryRoot 'plugin-stage'
        $stageResult = & (Join-Path $PSScriptRoot 'Stage-IlyStreamObsPlugin.ps1') -PackagePath $packageRoot -ObsRoot $fakeObsRoot -ObsConfigRoot $roundTripConfig -StageRoot $stageRoot -Confirm:$false
        Assert-IlyTest -Condition (Test-Path -LiteralPath $stageResult.StagePath -PathType Container) -Message 'Plugin stage directory was not created.'
        $stageManifest = Read-IlyJsonFile -Path (Join-Path $stageResult.StagePath 'ilyStream-stage.json')
        Assert-IlyTest -Condition ([string]$stageManifest.bundleSha256 -eq [string]$stageResult.BundleSha256) -Message 'Stage manifest bundle hash does not match the stage result.'
        $results.Add([pscustomobject]@{ Check = 'Plugin staging'; Result = 'PASS (verified content-addressed stage)' })

        $stagedDataPath = Join-Path $stageResult.StagePath 'data\obs-plugins\ilyStream-obs\locale\en-US.ini'
        [System.IO.File]::AppendAllText($stagedDataPath, "tampered=true`n", (New-Object System.Text.UTF8Encoding($false)))
        $tamperRejected = $false
        try {
            & (Join-Path $PSScriptRoot 'Install-StagedIlyStreamObsPlugin.ps1') -StagePath $stageResult.StagePath -ObsRoot $fakeObsRoot -ObsConfigRoot $roundTripConfig -WhatIf -Confirm:$false | Out-Null
        }
        catch {
            $tamperRejected = $true
        }
        Assert-IlyTest -Condition $tamperRejected -Message 'A tampered staged plugin file was not rejected.'
        $null = Copy-IlyFileVerified -SourcePath (Join-Path $packageDataDirectory 'en-US.ini') -DestinationPath $stagedDataPath
        $results.Add([pscustomobject]@{ Check = 'Stage tamper detection'; Result = 'PASS (changed hash rejected)' })

        $standardConfig = Join-Path $resolvedTemporaryRoot 'standard-config'
        $sharedPluginRoot = Join-Path $resolvedTemporaryRoot 'program-data\obs-studio\plugins'
        $standardStageRoot = Join-Path $resolvedTemporaryRoot 'plugin-stage-programdata'
        $standardStageResult = & (Join-Path $PSScriptRoot 'Stage-IlyStreamObsPlugin.ps1') -PackagePath $packageRoot -ObsRoot $fakeStandardObsRoot -ObsConfigRoot $standardConfig -StageRoot $standardStageRoot -PluginLayout ProgramData -SharedPluginRoot $sharedPluginRoot -Confirm:$false
        Assert-IlyTest -Condition ([string]$standardStageResult.PreferredInstallLayout -eq 'ProgramData') -Message 'Standard stage did not record the recommended ProgramData layout.'

        $sharedPluginDirectory = Join-Path $sharedPluginRoot 'ilyStream-obs\bin\64bit'
        New-Item -ItemType Directory -Path $sharedPluginDirectory -Force -ErrorAction Stop | Out-Null
        $sharedPluginDll = Join-Path $sharedPluginDirectory 'ilyStream-obs.dll'
        [System.IO.File]::WriteAllText($sharedPluginDll, 'preexisting-shared-plugin-sentinel', (New-Object System.Text.UTF8Encoding($false)))
        $preexistingSharedPluginHash = Get-IlySha256 -Path $sharedPluginDll

        & (Join-Path $PSScriptRoot 'Install-StagedIlyStreamObsPlugin.ps1') -StagePath $standardStageResult.StagePath -ObsRoot $fakeStandardObsRoot -ObsConfigRoot $standardConfig -PluginLayout ProgramData -SharedPluginRoot $sharedPluginRoot -Confirm:$false | Out-Null
        Assert-IlyTest -Condition ((Get-IlySha256 -Path $sharedPluginDll) -eq (Get-IlySha256 -Path $packageDll)) -Message 'ProgramData-layout plugin DLL hash is incorrect.'
        $sharedDataPath = Join-Path $sharedPluginRoot 'ilyStream-obs\data\locale\en-US.ini'
        Assert-IlyTest -Condition (Test-Path -LiteralPath $sharedDataPath -PathType Leaf) -Message 'ProgramData-layout plugin data file is missing.'
        $sharedState = Read-IlyJsonFile -Path (Join-Path $standardConfig 'ilyStream\obs-integration\plugin-install.json')
        Assert-IlyTest -Condition ([int]$sharedState.schemaVersion -eq 2 -and [string]$sharedState.plugin.installLayout.kind -eq 'ProgramData') -Message 'ProgramData install state did not record schema/layout.'
        Assert-IlyTest -Condition ([string]$sharedState.plugin.installLayout.installRoot -eq (Get-IlyFullPath -Path (Join-Path $sharedPluginRoot 'ilyStream-obs'))) -Message 'ProgramData install state recorded the wrong install root.'
        Assert-IlyTest -Condition ([string]$sharedState.obs.configRoot -eq (Get-IlyFullPath -Path $standardConfig)) -Message 'ProgramData install state recorded the wrong OBS config root.'

        & (Join-Path $PSScriptRoot 'Uninstall-IlyStreamObsPlugin.ps1') -ObsRoot $fakeStandardObsRoot -ObsConfigRoot $standardConfig -Confirm:$false | Out-Null
        Assert-IlyTest -Condition ((Get-IlySha256 -Path $sharedPluginDll) -eq $preexistingSharedPluginHash) -Message 'ProgramData uninstall did not restore the preexisting DLL.'
        Assert-IlyTest -Condition (-not (Test-Path -LiteralPath $sharedDataPath -PathType Leaf)) -Message 'ProgramData uninstall did not remove integration-owned data.'
        $results.Add([pscustomobject]@{ Check = 'ProgramData install/rollback'; Result = 'PASS (recommended layout, hash-exact restore)' })

        $livePluginDirectory = Join-Path $fakeObsRoot 'obs-plugins\64bit'
        New-Item -ItemType Directory -Path $livePluginDirectory -Force -ErrorAction Stop | Out-Null
        $livePluginDll = Join-Path $livePluginDirectory 'ilyStream-obs.dll'
        [System.IO.File]::WriteAllText($livePluginDll, 'preexisting-plugin-sentinel', (New-Object System.Text.UTF8Encoding($false)))
        $preexistingPluginHash = Get-IlySha256 -Path $livePluginDll

        & (Join-Path $PSScriptRoot 'Install-StagedIlyStreamObsPlugin.ps1') -StagePath $stageResult.StagePath -ObsRoot $fakeObsRoot -ObsConfigRoot $roundTripConfig -Confirm:$false | Out-Null
        Assert-IlyTest -Condition ((Get-IlySha256 -Path $livePluginDll) -eq (Get-IlySha256 -Path $packageDll)) -Message 'Applied plugin DLL hash is incorrect.'
        $liveDataPath = Join-Path $fakeObsRoot 'data\obs-plugins\ilyStream-obs\locale\en-US.ini'
        Assert-IlyTest -Condition (Test-Path -LiteralPath $liveDataPath -PathType Leaf) -Message 'Applied plugin data file is missing.'
        $portableState = Read-IlyJsonFile -Path (Join-Path $roundTripConfig 'ilyStream\obs-integration\plugin-install.json')
        Assert-IlyTest -Condition ([int]$portableState.schemaVersion -eq 2 -and [string]$portableState.plugin.installLayout.kind -eq 'ObsRoot') -Message 'Portable install state did not record the root-relative layout.'
        Assert-IlyTest -Condition ([string]$portableState.plugin.installLayout.installRoot -eq (Get-IlyFullPath -Path $fakeObsRoot)) -Message 'Portable install state recorded the wrong OBS-root install layout.'
        Assert-IlyTest -Condition ([string]$portableState.obs.configRoot -eq (Get-IlyFullPath -Path $roundTripConfig)) -Message 'Portable install state recorded the wrong OBS config root.'

        & (Join-Path $PSScriptRoot 'Uninstall-IlyStreamObsPlugin.ps1') -ObsRoot $fakeObsRoot -ObsConfigRoot $roundTripConfig -Confirm:$false | Out-Null
        Assert-IlyTest -Condition ((Get-IlySha256 -Path $livePluginDll) -eq $preexistingPluginHash) -Message 'Plugin uninstall did not restore the preexisting DLL.'
        Assert-IlyTest -Condition (-not (Test-Path -LiteralPath $liveDataPath -PathType Leaf)) -Message 'Plugin uninstall did not remove integration-owned data.'
        $results.Add([pscustomobject]@{ Check = 'Portable install/rollback'; Result = 'PASS (root-relative layout, hash-exact restore)' })
    }
    finally {
        if (Test-Path -LiteralPath $resolvedTemporaryRoot -PathType Container) {
            $verifiedCleanupPath = (Resolve-Path -LiteralPath $resolvedTemporaryRoot -ErrorAction Stop).ProviderPath
            if (-not (Test-IlyPathWithin -ChildPath $verifiedCleanupPath -ParentPath $temporaryParent) -or
                (Split-Path -Leaf $verifiedCleanupPath) -notlike 'ilyobs-*') {
                throw "Refusing to remove unverified validation path '$verifiedCleanupPath'."
            }
            Remove-Item -LiteralPath $verifiedCleanupPath -Recurse -Force -ErrorAction Stop
        }
    }
}

$results | Format-Table -AutoSize
Write-Output "Validation complete: $($results.Count) checks passed or explicitly skipped."
