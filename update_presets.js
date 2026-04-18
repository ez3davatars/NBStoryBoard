const fs = require('fs');
let content = fs.readFileSync('src/renderer/utils/shotsPresets.ts', 'utf8');

content = content.replace('cropRule: string;', 'cameraOffsetX: number;\n  cameraOffsetY: number;\n  cameraOffsetZ: number;\n  yaw: number;\n  pitch: number;\n  fov: number;\n  targetOccupancy: number;\n\n  cropRule: string;');

function inject(id, x, y, z, yaw, pitch, fov, occ) {
    const replacement = 'cameraOffsetX: ' + x + ',\n    cameraOffsetY: ' + y + ',\n    cameraOffsetZ: ' + z + ',\n    yaw: ' + yaw + ',\n    pitch: ' + pitch + ',\n    fov: ' + fov + ',\n    targetOccupancy: ' + occ + ',\n    cropRule:';
    const regex = new RegExp("id: '" + id + "',([\\s\\S]*?)cropRule:", 'g');
    content = content.replace(regex, "id: '" + id + "',$1" + replacement);
}

inject('closeup', 0, 0, -1.5, 0, 0, 35, 0.85);
inject('mediumClose', 0, 0, -0.8, 0, 0, 45, 0.65);
inject('medium', 0, 0, 0, 0, 0, 50, 0.5);
inject('wide', 0, 0, 1.5, 0, 0, 60, 0.3);
inject('full', 0, 0, 2.0, 0, 0, 65, 0.25);
inject('lowAngleHero', 0, -1.0, 0, 0, 0.35, 45, 0.6);
inject('highAngle', 0, 1.2, 0, 0, -0.4, 45, 0.5);
inject('threeQuarterLeft', -1.2, 0, -0.2, -0.35, 0, 45, 0.6);
inject('threeQuarterRight', 1.2, 0, -0.2, 0.35, 0, 45, 0.6);
inject('profile', -2.0, 0, -0.5, -0.85, 0, 45, 0.75);
inject('overTheShoulder', 0, 0, -0.5, 0, 0, 45, 0.6);

fs.writeFileSync('src/renderer/utils/shotsPresets.ts', content);
console.log('Update complete');
