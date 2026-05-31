# Script to find large folders on C: drive (especially under the user profile)
$TargetDir = "$env:USERPROFILE"
Write-Host "Scanning $TargetDir for folders larger than 500MB..." -ForegroundColor Cyan

function Get-FolderSize ($Path) {
    $sizes = @()
    try {
        $subdirs = Get-ChildItem -Path $Path -Directory -Force -ErrorAction SilentlyContinue
        foreach ($dir in $subdirs) {
            # Skip symlinks/junctions to avoid infinite loops
            if ($dir.Attributes -match "ReparsePoint") { continue }
            
            $size = 0
            # Sum up file sizes in the directory recursively
            $files = Get-ChildItem -Path $dir.FullName -File -Recurse -Force -ErrorAction SilentlyContinue
            if ($files) {
                $size = ($files | Measure-Object -Property Length -Sum).Sum
            }
            if ($size -ge 500MB) {
                $sizes += [PSCustomObject]@{
                    Path = $dir.FullName
                    SizeGB = [Math]::Round($size / 1GB, 2)
                    SizeMB = [Math]::Round($size / 1MB, 2)
                }
            }
        }
    } catch {
        Write-Host "Error scanning $Path" -ForegroundColor Red
    }
    return $sizes
}

$userFolders = Get-FolderSize -Path $TargetDir
$appDataFolders = Get-FolderSize -Path "$env:USERPROFILE\AppData\Local"
$appDataRoamingFolders = Get-FolderSize -Path "$env:USERPROFILE\AppData\Roaming"

$allFolders = $userFolders + $appDataFolders + $appDataRoamingFolders | Sort-Object SizeGB -Descending

Write-Host "`nTop Large Folders (>= 500MB):" -ForegroundColor Green
$allFolders | Format-Table -Property Path, SizeGB, SizeMB -AutoSize
