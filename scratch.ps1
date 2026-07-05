$response = Invoke-RestMethod -Uri 'https://api.github.com/repos/ilydrw/ilyStream/pulls?state=open'
$response | Select-Object html_url, title | ConvertTo-Json -Depth 3 | Out-File -FilePath C:\Dev\ilyStream\pulls.txt
