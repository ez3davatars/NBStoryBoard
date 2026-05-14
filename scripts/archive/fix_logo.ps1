$content = Get-Content "c:\Users\clone\Desktop\Cast Director Studio\src\renderer\logo_base64.txt" -Raw
$prefix = 'export const LOGO_BASE64 = "'
$suffix = '";'
$final = $prefix + $content.Trim() + $suffix
Set-Content -Path "c:\Users\clone\Desktop\Cast Director Studio\src\renderer\assets\logo.ts" -Value $final
