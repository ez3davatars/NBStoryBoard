import fs from 'fs';
import path from 'path';

const basePath = path.join(process.cwd(), 'src', 'renderer');
const extensions = ['.tsx', '.ts'];

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (extensions.includes(path.extname(file))) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

const allFiles = getAllFiles(basePath);
const fileContents = allFiles.map(f => fs.readFileSync(f, 'utf8'));

const potentiallyUnused = [];
const ignoreNames = ['App', 'main', 'index', 'env.d'];

for (const file of allFiles) {
  const name = path.basename(file, path.extname(file));
  if (ignoreNames.includes(name)) continue;
  if (file.includes('__tests__') || file.includes('test')) continue;
  
  // Look for the component/filename in other files
  let count = 0;
  for (const content of fileContents) {
    // very naive regex or string include, but effective enough
    if (content.includes(name)) {
      count++;
    }
  }

  // If a file is only referenced in itself (count=1), it's potentially unused
  if (count <= 1) {
    potentiallyUnused.push(file.replace(basePath, ''));
  }
}

console.log("Potentially unused files:");
console.log(potentiallyUnused.join('\n'));
