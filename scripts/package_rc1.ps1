$stageDir = "kings-grill-mobile-rc1-final-package"
if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
New-Item -ItemType Directory -Path "$stageDir/screenshots" -Force | Out-Null
New-Item -ItemType Directory -Path "$stageDir/qa-reports" -Force | Out-Null

Copy-Item "MOBILE_RC1_ACCEPTANCE.md" -Destination "$stageDir/MOBILE_RC1_ACCEPTANCE.md" -Force
Copy-Item "REAL_DEVICE_TEST.md" -Destination "$stageDir/REAL_DEVICE_TEST.md" -Force
Copy-Item "BUILD_INFO_RC1.md" -Destination "$stageDir/BUILD_INFO_RC1.md" -Force

# Root screenshots
Copy-Item "23b_public_bill_stamp_FINAL.png" -Destination "$stageDir/23b_public_bill_stamp_FINAL.png" -Force
Copy-Item "22g_customer_fully_filled_FINAL.png" -Destination "$stageDir/22g_customer_fully_filled_FINAL.png" -Force

# Subfolder screenshots
Copy-Item "23b_public_bill_stamp_FINAL.png" -Destination "$stageDir/screenshots/23b_public_bill_stamp_FINAL.png" -Force
Copy-Item "22g_customer_fully_filled_FINAL.png" -Destination "$stageDir/screenshots/22g_customer_fully_filled_FINAL.png" -Force

# QA reports
Copy-Item "kings-grill-mobile-post-upgrade-audit/AUDIT_RESULTS.json" -Destination "$stageDir/qa-reports/AUDIT_RESULTS.json" -Force
Copy-Item "kings-grill-mobile-post-upgrade-audit/AUDIT_RESULTS_PRE_CORRECTIVE.json" -Destination "$stageDir/qa-reports/AUDIT_RESULTS_PRE_CORRECTIVE.json" -Force
Copy-Item "kings-grill-mobile-post-upgrade-audit/FINAL_RC_ASSERTIONS.json" -Destination "$stageDir/qa-reports/FINAL_RC_ASSERTIONS.json" -Force

# Also README for ChatGPT
$readme = @"
# KING'S GRILL — MOBILE v2.5.0-APEX RC1 SUBMISSION PACKAGE

This archive contains all final release candidate deliverables for mobile acceptance:
- 23b_public_bill_stamp_FINAL.png: Visual proof of fully loaded public bill with stamp (0px² overlap)
- 22g_customer_fully_filled_FINAL.png: Visual proof of fully filled customer form (guestCount: 8, no '- khách')
- MOBILE_RC1_ACCEPTANCE.md: Executive gate report with 11/11 PASS status
- REAL_DEVICE_TEST.md: Physical device smoke test sign-off (iPhone Safari + Android Chrome)
- BUILD_INFO_RC1.md: Git checkpoint, commit b9de70f, tag mobile-apex-redesign-v1.1-rc, and test metrics
- qa-reports/: Cleansed and historical audit JSON files
"@
Set-Content -Path "$stageDir/README.md" -Value $readme -Encoding utf8

$zipFile = "kings-grill-mobile-rc1-final-package.zip"
if (Test-Path $zipFile) { Remove-Item -Force $zipFile }
Compress-Archive -Path "$stageDir/*" -DestinationPath $zipFile -Force
Get-Item $zipFile | Select-Object Name, Length
