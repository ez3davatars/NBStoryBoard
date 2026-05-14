const fs = require('fs');
const filePath = 'c:\\\\Users\\\\clone\\\\Desktop\\\\Cast Director Studio\\\\src\\\\renderer\\\\components\\\\NanoCastingDirector.tsx';
let str = fs.readFileSync(filePath, 'utf-8');

const reps = [
    {
        t: "            if (refLayout === 'form_focus') {\\r\\n                finalPrompt += `[LAYOUT A]: Vertical Split.\\n`;\\r\\n                finalPrompt += `LEFT PANEL (50%): 3 Full Standing Figures. LENS 1: Frontal, LENS 2: Left 3/4, LENS 3: Back View.\\n`;\\r\\n                finalPrompt += `RIGHT PANEL (50%): 2x2 Grid of 4 HEADSHOTS. LENS 4: Extreme Close-Up Front, LENS 5: EXTREME LEFT PROFILE, LENS 6: EXTREME RIGHT PROFILE, LENS 7: Looking Up.\\n`;\\r\\n            } else if (refLayout === 'face_focus') {",
        r: "            if (refLayout === 'form_focus') {\\r\\n                finalPrompt += `[LAYOUT A]: Vertical Split.\\n`;\\r\\n                finalPrompt += `LEFT PANEL (50%): 3 Full Standing Figures. `;\\r\\n                finalPrompt += `LENS 1: Frontal Full Body. `;\\r\\n                finalPrompt += `LENS 2: Left 3/4 Full Body with natural head-to-torso alignment. `;\\r\\n                finalPrompt += `LENS 3: TRUE BACK VIEW Full Body. Character faces fully away from camera. Back of head visible. No face visible. Neck in neutral alignment.\\n`;\\r\\n                finalPrompt += `RIGHT PANEL (50%): 2x2 Grid of 4 HEADSHOTS. LENS 4: Extreme Close-Up Front, LENS 5: EXTREME LEFT PROFILE, LENS 6: EXTREME RIGHT PROFILE, LENS 7: Looking Up.\\n`;\\r\\n            } else if (refLayout === 'face_focus') {"
    },
    {
        t: "            } else {\\r\\n                finalPrompt += `[LAYOUT C]: Horizontal Split.\\n`;\\r\\n                finalPrompt += `UPPER SECTION (60%): 3 Full Standing Figures. LENS 1: Frontal, LENS 2: Right 3/4, LENS 3: Back View.\\n`;\\r\\n                finalPrompt += `LOWER SECTION (40%): Row of 5 Headshots. LENS 4: Frontal, LENS 5: EXTREME LEFT PROFILE, LENS 6: EXTREME RIGHT PROFILE, LENS 7: 45-degree Left, LENS 8: High Detail Hero Shot.\\n`;\\r\\n            }",
        r: "            } else {\\r\\n                finalPrompt += `[LAYOUT C]: Horizontal Split.\\n`;\\r\\n                finalPrompt += `UPPER SECTION (60%): 3 Full Standing Figures. `;\\r\\n                finalPrompt += `LENS 1: Frontal Full Body. `;\\r\\n                finalPrompt += `LENS 2: Right 3/4 Full Body with natural head-to-torso alignment. `;\\r\\n                finalPrompt += `LENS 3: TRUE BACK VIEW Full Body. Character faces fully away from camera. Back of head visible. No face visible. Neck in neutral alignment.\\n`;\\r\\n                finalPrompt += `LOWER SECTION (40%): Row of 5 Headshots. LENS 4: Frontal, LENS 5: EXTREME LEFT PROFILE, LENS 6: EXTREME RIGHT PROFILE, LENS 7: 45-degree Left, LENS 8: High Detail Hero Shot.\\n`;\\r\\n            }"
    },
    {
        t: "            finalPrompt += `IDENTITY INVARIANCE RULE:\\n`;\\r\\n            finalPrompt += `Variation is permitted only in camera angle, head rotation, body angle, and expression.\\n`;\\r\\n            finalPrompt += `Variation is NOT permitted in identity construction, skull shape, facial structure, costume interpretation, or style rendering.\\n`;\\r\\n            finalPrompt += `All panels depict the same exact character model.\\n\\n`;\\r\\n\\r\\n            // NEW: IDENTITY AUTHORITY STACK",
        r: "            finalPrompt += `IDENTITY INVARIANCE RULE:\\n`;\\r\\n            finalPrompt += `Variation is permitted only in camera angle, head rotation, body angle, and expression.\\n`;\\r\\n            finalPrompt += `Variation is NOT permitted in identity construction, skull shape, facial structure, costume interpretation, or style rendering.\\n`;\\r\\n            finalPrompt += `All panels depict the same exact character model.\\n\\n`;\\r\\n\\r\\n            finalPrompt += `TURNAROUND POSE DISCIPLINE (MAXIMUM PRIORITY):\\n`;\\r\\n            finalPrompt += `- Back-view panels must be true back views.\\n`;\\r\\n            finalPrompt += `- In back-view panels, the head must align naturally with the torso unless a turn is explicitly requested.\\n`;\\r\\n            finalPrompt += `- Do not rotate the head farther than a natural neutral pose for the selected view.\\n`;\\r\\n            finalPrompt += `- Do not twist the neck unnaturally just to keep the face visible.\\n`;\\r\\n            finalPrompt += `- For rear 3/4 views, only a natural minimal partial cheek or nose bridge may be visible if anatomically appropriate.\\n`;\\r\\n            finalPrompt += `- For true back views, the face must not be visible.\\n`;\\r\\n            finalPrompt += `- Maintain anatomically believable cervical spine rotation and head-to-shoulder alignment.\\n\\n`;\\r\\n\\r\\n            finalPrompt += `VISIBILITY CHEAT FORBIDDEN:\\n`;\\r\\n            finalPrompt += `- Do not expose extra facial features in a back-facing panel just to preserve recognizability.\\n`;\\r\\n            finalPrompt += `- Camera/viewpoint accuracy is more important than keeping the face visible.\\n\\n`;\\r\\n\\r\\n            // NEW: IDENTITY AUTHORITY STACK"
    },
    {
        t: "                finalPrompt += `3. CONFLICT RULE: If there is any conflict, biometric geometry wins for facial structure and profile anatomy, while ${portraitText} wins for style/render/costume appearance.\\n`;\\r\\n                finalPrompt += `4. MODEL RULE: All panels must depict the SAME EXACT CHARACTER MODEL rotated in 3D space. Do not redesign or reinterpret the person per panel.\\n\\n`;\\r\\n            } else if (effectiveIdentitySource === 'generated') {",
        r: "                finalPrompt += `3. CONFLICT RULE: If there is any conflict, biometric geometry wins for facial structure and profile anatomy, while ${portraitText} wins for style/render/costume appearance.\\n`;\\r\\n                finalPrompt += `4. MODEL RULE: All panels must depict the SAME EXACT CHARACTER MODEL rotated in 3D space. Do not redesign or reinterpret the person per panel.\\n`;\\r\\n                finalPrompt += `5. TURNAROUND RULE: For body turnaround panels, pose accuracy and natural head-to-torso alignment are mandatory. Do not twist the head unnaturally to preserve face visibility.\\n\\n`;\\r\\n            } else if (effectiveIdentitySource === 'generated') {"
    },
    {
        t: "            } else if (effectiveIdentitySource === 'generated') {\\r\\n                finalPrompt += `1. ${portraitText} is the APPROVED FINAL CHARACTER MASTER.\\n`;\\r\\n                finalPrompt += `2. Every panel must depict the exact same character from ${portraitText}.\\n`;\\r\\n                finalPrompt += `3. Rotate the same character model in 3D space across views. Do not redesign or approximate side anatomy.\\n\\n`;\\r\\n            } else {",
        r: "            } else if (effectiveIdentitySource === 'generated') {\\r\\n                finalPrompt += `1. ${portraitText} is the APPROVED FINAL CHARACTER MASTER.\\n`;\\r\\n                finalPrompt += `2. Every panel must depict the exact same character from ${portraitText}.\\n`;\\r\\n                finalPrompt += `3. Rotate the same character model in 3D space across views. Do not redesign or approximate side anatomy.\\n`;\\r\\n                finalPrompt += `4. For turnaround panels, maintain natural head-to-torso alignment and do not twist the neck unnaturally to keep the face visible.\\n\\n`;\\r\\n            } else {"
    },
    {
        t: "            finalPrompt += `NEGATIVE CONSTRAINTS:\\n`;\\r\\n            finalPrompt += `different person, face swap, generic face, altered skull, incorrect profile, inconsistent nose projection, inconsistent jawline, inconsistent ear placement, inconsistent beard silhouette, inconsistent hairline, off-model panels, panel-to-panel face drift, restyled face, generic profile, beautified profile, style-averaged face, new character per panel, costume reinterpretation, shader inconsistency, mismatched stylization, extra people, text, watermarks, scenery, maps, landscape, background graphics.\\n`;\\r\\n            finalPrompt += `cropped legs, cut off feet, unapproved wardrobe, source-image clothing, accidental costume redesign.\\n\\n`;",
        r: "            finalPrompt += `NEGATIVE CONSTRAINTS:\\n`;\\r\\n            finalPrompt += `different person, face swap, generic face, altered skull, incorrect profile, inconsistent nose projection, inconsistent jawline, inconsistent ear placement, inconsistent beard silhouette, inconsistent hairline, off-model panels, panel-to-panel face drift, restyled face, generic profile, beautified profile, style-averaged face, new character per panel, costume reinterpretation, shader inconsistency, mismatched stylization, unnatural neck twist, owl turn, over-rotated head, visible face in true back view, cheating face visibility in rear panel, head misaligned with torso, extra people, text, watermarks, scenery, maps, landscape, background graphics.\\n`;\\r\\n            finalPrompt += `cropped legs, cut off feet, unapproved wardrobe, source-image clothing, accidental costume redesign.\\n\\n`;"
    }
];

let allReplaced = true;
reps.forEach((rep, i) => {
    if (str.includes(rep.t)) {
        str = str.replace(rep.t, rep.r);
        console.log("Replaced block " + (i + 1) + " exactly.");
    } else {
        const regexStr = rep.t.replace(/\\r\\n/g, '\\n').replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\n/g, '\\\\r?\\\\n');
        const regex = new RegExp(regexStr);
        if (regex.test(str)) {
            str = str.replace(regex, rep.r.replace(/\\r\\n/g, '\\n'));
            console.log("Replaced block " + (i + 1) + " via regex.");
        } else {
            console.error("Failed to match block " + (i + 1));
            allReplaced = false;
        }
    }
});

if (allReplaced) {
    fs.writeFileSync(filePath, str, 'utf-8');
    console.log('Successfully patched NanoCastingDirector.tsx');
} else {
    process.exit(1);
}
