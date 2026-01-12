$content = Get-Content "d:\NanobananaProStudio\NBStoryBoard\src\renderer\logo_base64.txt" -Raw
$prefix = 'export const LOGO_BASE64 = "'
$suffix = '";'
$final = $prefix + $content.Trim() + $suffix
Set-Content -Path "d:\NanobananaProStudio\NBStoryBoard\src\renderer\assets\logo.ts" -Value $final
