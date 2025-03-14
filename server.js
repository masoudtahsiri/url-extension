/**
 * URL Checker - Server Component
 * Copyright © 2025 Refact, LLC
 * MIT License - See LICENSE file for details
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const compression = require('compression');

const app = express();
const port = 3001;

// Enable CORS and compression
app.use(cors());
app.use(compression());

// Configure body-parser with increased limit
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Increase response size limit
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Transfer-Encoding', 'chunked');
    next();
});

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, 'frontend')));

// Configure multer for file uploads with increased limits
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    }
});

// Ensure required directories exist
['uploads', 'results', 'temp'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Function to wait for file to be ready
function waitForFile(filePath, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const checkFile = () => {
            if (fs.existsSync(filePath)) {
                resolve();
            } else if (Date.now() - startTime > timeout) {
                reject(new Error('Timeout waiting for file'));
            } else {
                setTimeout(checkFile, 100);
            }
        };
        checkFile();
    });
}

// Function to clean up temporary files
function cleanupFiles(...files) {
    files.forEach(file => {
        try {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        } catch (error) {
            console.error(`Error cleaning up file ${file}:`, error);
        }
    });
}

// Handle file upload and URL checking
app.post('/api/check-urls', upload.single('urls'), async (req, res) => {
    console.log('Received request to /api/check-urls');
    const tempDir = path.join(__dirname, 'temp');
    const inputFile = path.join(tempDir, `input_${Date.now()}.txt`);
    const outputFile = path.join(tempDir, `output_${Date.now()}.txt`);
    let phpProcess = null;
    let responseSent = false;
    
    try {
        // Set request timeout
        req.setTimeout(600000); // 10 minutes
        res.setTimeout(600000); // 10 minutes

        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        let urls = [];
        
        // Handle file upload
        if (req.file) {
            console.log('Processing uploaded file:', req.file.filename);
            const content = fs.readFileSync(req.file.path, 'utf8');
            const lines = content.split('\n');
            // Skip the first line (headers) and filter out empty lines
            urls = lines.slice(1).filter(url => url.trim());
            console.log(`Found ${urls.length} URLs in file (excluding header)`);
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
        }
        
        // Handle URLs from form data
        if (req.body.urls_text) {
            const textUrls = req.body.urls_text.split('\n').filter(url => url.trim());
            urls = urls.concat(textUrls);
        }

        // Handle URLs from JSON data
        const jsonData = req.body.urls;
        if (jsonData && Array.isArray(jsonData)) {
            urls = urls.concat(jsonData);
        }

        if (urls.length === 0) {
            return res.status(400).json({ error: 'No URLs provided' });
        }

        // Write URLs to input file
        fs.writeFileSync(inputFile, urls.join('\n'));
        console.log('Writing URLs to input file:', inputFile);

        // Start PHP process
        console.log('Starting PHP process');
        phpProcess = spawn('php', ['backend/api.php', inputFile, outputFile], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Set up timeout for PHP process (10 minutes)
        const timeout = setTimeout(() => {
            if (phpProcess) {
                phpProcess.kill();
            }
            if (!responseSent) {
                responseSent = true;
                cleanupFiles(inputFile, outputFile);
                res.status(500).json({ error: 'PHP process timed out' });
            }
        }, 600000);

        // Handle PHP process output
        phpProcess.stdout.on('data', (data) => {
            console.log('PHP stdout:', data.toString());
            // Try to parse progress updates
            try {
                const output = data.toString().trim();
                if (output) {
                    const progress = JSON.parse(output);
                    if (progress.progress) {
                        // Send progress update to client
                        if (!responseSent) {
                            res.write(JSON.stringify(progress) + '\n');
                            res.flush();
                        }
                    }
                }
            } catch (e) {
                // Ignore parsing errors for non-JSON output
            }
        });

        // Watch output file for changes
        let lastSize = 0;
        const watchOutputFile = setInterval(() => {
            if (fs.existsSync(outputFile)) {
                const stats = fs.statSync(outputFile);
                if (stats.size > lastSize) {
                    lastSize = stats.size;
                    const content = fs.readFileSync(outputFile, 'utf8');
                    const lines = content.split('\n').filter(line => line.trim());
                    if (lines.length > 0) {
                        try {
                            const progress = JSON.parse(lines[lines.length - 1]);
                            if (progress.progress) {
                                if (!responseSent) {
                                    res.write(JSON.stringify(progress) + '\n');
                                    res.flush();
                                }
                            }
                        } catch (e) {
                            // Ignore parsing errors
                        }
                    }
                }
            }
        }, 100);

        phpProcess.stderr.on('data', (data) => {
            console.log('PHP stderr:', data.toString());
        });

        // Wait for PHP process to complete
        phpProcess.on('close', (code) => {
            clearTimeout(timeout);
            clearInterval(watchOutputFile);
            console.log('PHP process closed with code', code);

            // Wait for output file to be written
            setTimeout(() => {
                console.log('Waiting for output file');
                if (fs.existsSync(outputFile)) {
                    console.log('Reading output file');
                    const output = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
                    console.log('Sending response to client');
                    if (!responseSent) {
                        responseSent = true;
                        // Send the response with the file path
                        res.write(JSON.stringify({
                            ...output,
                            file: output.file ? `/results/${output.file}` : null
                        }) + '\n');
                        res.end();
                    }
                } else {
                    if (!responseSent) {
                        responseSent = true;
                        res.status(500).json({ error: 'Output file not found' });
                    }
                }
                cleanupFiles(inputFile, outputFile);
            }, 1000);
        });

        // Handle PHP process errors
        phpProcess.on('error', (err) => {
            clearTimeout(timeout);
            clearInterval(watchOutputFile);
            console.error('PHP process error:', err);
            if (!responseSent) {
                responseSent = true;
                cleanupFiles(inputFile, outputFile);
                res.status(500).json({ error: 'Failed to start PHP process' });
            }
        });

        // Handle request timeout
        req.on('timeout', () => {
            clearInterval(watchOutputFile);
            if (phpProcess) {
                phpProcess.kill();
            }
            if (!responseSent) {
                responseSent = true;
                cleanupFiles(inputFile, outputFile);
                res.status(500).json({ error: 'Request timed out' });
            }
        });

    } catch (error) {
        console.error('Error processing URLs:', error);
        if (phpProcess) {
            phpProcess.kill();
        }
        if (!responseSent) {
            responseSent = true;
            cleanupFiles(inputFile, outputFile);
            res.status(500).json({ error: error.message });
        }
    }
});

// Handle OPTIONS requests
app.options('/api/check-urls', (req, res) => {
    res.sendStatus(200);
});

// Serve results files
app.get('/results/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'results', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Handle server startup errors
app.listen(port, (err) => {
    if (err) {
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use. Please try these steps:`);
            console.error('1. Kill any existing Node.js processes: pkill -f node');
            console.error('2. Wait a few seconds');
            console.error('3. Try starting the server again');
        } else {
            console.error('Error starting server:', err);
        }
        process.exit(1);
    }
    console.log(`Server running on port ${port}`);
});

// Handle process termination
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Cleaning up...');
    // Clean up any temporary files
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
        fs.readdirSync(tempDir).forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error(`Error deleting ${filePath}:`, err);
            }
        });
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Cleaning up...');
    // Clean up any temporary files
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
        fs.readdirSync(tempDir).forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error(`Error deleting ${filePath}:`, err);
            }
        });
    }
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Clean up any temporary files
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
        fs.readdirSync(tempDir).forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error(`Error deleting ${filePath}:`, err);
            }
        });
    }
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Clean up any temporary files
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
        fs.readdirSync(tempDir).forEach(file => {
            const filePath = path.join(tempDir, file);
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error(`Error deleting ${filePath}:`, err);
            }
        });
    }
    process.exit(1);
}); 