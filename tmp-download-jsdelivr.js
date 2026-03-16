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
    // We can copy WASM from node_modules, but try to download anyway
];

const baseUrl = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal-data@1.4.5/dist/';

async function downloadFile(filename) {
    const url = baseUrl + filename;
    const dest = path.join(targetDir, filename);
    
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${filename} from JSDelivr...`);
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
        
        // Timeout
        request.setTimeout(10000, function() {
            request.destroy();
            console.error(`Timeout downloading ${filename}`);
            resolve(false);
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
        console.log("JSDELIVR DOWNLOAD SUCCESSFUL");
    } else {
        console.log("JSDELIVR DOWNLOAD FAILED");
    }
}

start();
