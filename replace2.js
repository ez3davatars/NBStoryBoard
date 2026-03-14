const fs = require('fs');
let text = fs.readFileSync('src/renderer/components/veo/VeoBottomDock.tsx', 'utf8');

text = text.replace(
/if \(draft\.negativePrompt\) \{\s*base \+\= \` \-\-no \$\{draft\.negativePrompt\.trim\(\)\}\`;\s*\}/g,
''
);

fs.writeFileSync('src/renderer/components/veo/VeoBottomDock.tsx', text);
console.log("Stripped negativePrompt appending from VeoBottomDock!");
