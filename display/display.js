const { exec, spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const DATABASE_PATH = process.env.DATABASE_PATH || './data/signage.db';

let firefoxProcess;
let currentConfig = null;
let db;

function initializeDatabase() {
    const dbDir = path.dirname(DATABASE_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new sqlite3.Database(DATABASE_PATH, (err) => {
        if (err) {
            console.error('Error opening database:', err);
        } else {
            console.log('Display system connected to database');
        }
    });
}

function startFirefox(url) {
    try {
        console.log('Starting Firefox with URL:', url);
        
        if (firefoxProcess) {
            firefoxProcess.kill();
        }
        
        firefoxProcess = spawn('firefox-esr', [
            '--display=:99',
            '--kiosk',
            '--private-window',
            '--no-remote',
            '--new-instance',
            url
        ]);

        firefoxProcess.on('error', (error) => {
            console.error('Firefox process error:', error);
        });

        console.log('Firefox started successfully');
        return true;
    } catch (error) {
        console.error('Failed to start Firefox:', error);
        return false;
    }
}

async function getCurrentConfig() {
    return new Promise((resolve, reject) => {
        db.get('SELECT value FROM system_settings WHERE key = "current_config_id"', [], (err, row) => {
            if (err) {
                reject(err);
            } else {
                const configId = row ? row.value : 1;
                db.get('SELECT * FROM signage_configs WHERE id = ?', [configId], (err, config) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(config);
                    }
                });
            }
        });
    });
}


function displaySinglePage(config) {
    try {
        console.log(`Displaying single page: ${config.primary_url}`);
        startFirefox(config.primary_url);
        console.log('Single page display completed');
    } catch (error) {
        console.error('Error displaying single page:', error);
    }
}

function displaySplitScreen(config) {
    try {
        console.log(`Displaying split screen: ${config.display_mode}`);
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { height: 100vh; overflow: hidden; }
                .container { 
                    width: 100%; 
                    height: 100%; 
                    display: flex; 
                    ${config.display_mode === 'split-horizontal' ? 'flex-direction: row;' : 'flex-direction: column;'}
                }
                .frame { 
                    flex: 1; 
                    border: none; 
                    outline: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <iframe class="frame" src="${config.primary_url}"></iframe>
                <iframe class="frame" src="${config.secondary_url}"></iframe>
            </div>
        </body>
        </html>
        `;

        fs.writeFileSync('/tmp/split.html', html);
        startFirefox(`file:///tmp/split.html`);
        console.log('Split screen display completed');
    } catch (error) {
        console.error('Error displaying split screen:', error);
    }
}

async function updateDisplay() {
    try {
        const config = await getCurrentConfig();
        if (!config) {
            console.log('No configuration found');
            return;
        }

        if (JSON.stringify(config) === JSON.stringify(currentConfig)) {
            console.log('Configuration unchanged, skipping update');
            return;
        }

        console.log('Updating display with new configuration:', config);
        currentConfig = config;

        if (config.display_mode === 'single') {
            displaySinglePage(config);
        } else if (config.display_mode.includes('split')) {
            displaySplitScreen(config);
        }

        console.log('Display update completed');
    } catch (error) {
        console.error('Error updating display:', error);
    }
}

async function startDisplaySystem() {
    console.log('Starting display system...');
    
    initializeDatabase();
    
    await updateDisplay();

    cron.schedule('*/30 * * * * *', async () => {
        await updateDisplay();
    });

    console.log('Display system started successfully');
}

app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'running', 
        timestamp: new Date().toISOString(),
        currentConfig: currentConfig 
    });
});

app.get('/api/reload', async (req, res) => {
    try {
        await updateDisplay();
        res.json({ message: 'Display reloaded successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Display system API running on port ${PORT}`);
});

process.on('SIGINT', async () => {
    console.log('Shutting down display system...');
    if (firefoxProcess) {
        firefoxProcess.kill();
    }
    if (db) {
        db.close();
    }
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

startDisplaySystem();