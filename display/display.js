const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const DATABASE_PATH = process.env.DATABASE_PATH || './data/signage.db';

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

function generateDisplayHTML(config) {
    if (config.display_mode === 'single') {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Digital Signage</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { height: 100vh; overflow: hidden; background: #000; }
        iframe { 
            width: 100%; 
            height: 100%; 
            border: none; 
            display: block;
        }
    </style>
</head>
<body>
    <iframe src="${config.primary_url}" frameborder="0" allowfullscreen></iframe>
    <script>
        setTimeout(() => location.reload(), ${(config.refresh_interval || 300) * 1000});
    </script>
</body>
</html>`;
    } else if (config.display_mode.includes('split')) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Digital Signage - Split Screen</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { height: 100vh; overflow: hidden; background: #000; }
        .container { 
            width: 100%; 
            height: 100%; 
            display: flex; 
            ${config.display_mode === 'split-horizontal' ? 'flex-direction: row;' : 'flex-direction: column;'}
        }
        .frame { 
            flex: 1; 
            border: none; 
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        <iframe class="frame" src="${config.primary_url}" frameborder="0" allowfullscreen></iframe>
        <iframe class="frame" src="${config.secondary_url}" frameborder="0" allowfullscreen></iframe>
    </div>
    <script>
        setTimeout(() => location.reload(), ${(config.refresh_interval || 300) * 1000});
    </script>
</body>
</html>`;
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

// Display endpoint - main signage page
app.get('/', async (req, res) => {
    try {
        const config = await getCurrentConfig();
        if (!config) {
            return res.send('<h1>No configuration found</h1>');
        }
        
        const html = generateDisplayHTML(config);
        res.send(html);
    } catch (error) {
        res.status(500).send('<h1>Error loading configuration</h1>');
    }
});

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