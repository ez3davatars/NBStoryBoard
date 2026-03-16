const https = require('https');
const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'public', 'assets', 'imgly');
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

const files = [
    'resources.json',
    'isnet_fp16.onnx',
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.wasm',
    'ort-wasm-simd.wasm',
    'ort-wasm-threaded.wasm',
    'ort-wasm.wasm'
];

const baseUrl = 'https://unpkg.com/@imgly/background-removal-data@1.7.0/dist/';

async function downloadFile(filename) {
    const url = baseUrl + filename;
    const dest = path.join(targetDir, filename);
    
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${filename}...`);
        const file = fs.createWriteStream(dest);
        
        const request = https.get(url, function(response) {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Handle redirect
                https.get(response.headers.location, function(res) {
                    res.pipe(file);
                    file.on('finish', () => {
                        file.close(() => resolve(true));
                    });
                }).on('error', (err) => {
                    fs.unlink(dest, () => {});
                    resolve(false);
                    console.error(`Error downloading ${filename}: ${err.message}`);
                });
            } else if (response.statusCode !== 200) {
                resolve(false);
                console.error(`Error downloading ${filename}: HTTP Status ${response.statusCode}`);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(() => resolve(true));
                });
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            resolve(false);
            console.error(`Error downloading ${filename}: ${err.message}`);
        });
    });
}

async function start() {
    let success = true;
    for (const f of files) {
        const ok = await downloadFile(f);
        if (!ok) success = false;
    }
    if (success) {
        console.log("ALL FILES DOWNLOADED SUCCESSFULLY!");
    } else {
        console.log("SOME FILES FAILED TO DOWNLOAD.");
    }
}

start();
