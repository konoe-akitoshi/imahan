const puppeteer = require('puppeteer');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const DATABASE_PATH = process.env.DATABASE_PATH || './data/signage.db';

let browser;
let page;
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

async function initializeBrowser() {
    try {
        console.log('Initializing browser...');
        browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-features=TranslateUI',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--start-fullscreen',
                '--kiosk',
                '--window-size=1920,1080',
                '--display=:0'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        console.log('Browser initialized successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize browser:', error);
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

async function getAuthCredentials(domain) {
    return new Promise((resolve, reject) => {
        db.get('SELECT username, password FROM auth_credentials WHERE domain = ?', [domain], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

async function performLogin(url, credentials) {
    try {
        console.log(`Attempting login for domain: ${credentials.domain}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        const usernameSelectors = [
            'input[name="username"]',
            'input[name="user"]',
            'input[name="login"]',
            'input[name="email"]',
            'input[type="email"]',
            'input[id*="username"]',
            'input[id*="user"]',
            'input[id*="email"]'
        ];

        const passwordSelectors = [
            'input[name="password"]',
            'input[name="pass"]',
            'input[type="password"]',
            'input[id*="password"]',
            'input[id*="pass"]'
        ];

        let usernameField, passwordField;

        for (const selector of usernameSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 2000 });
                usernameField = selector;
                break;
            } catch (e) {
                continue;
            }
        }

        for (const selector of passwordSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 2000 });
                passwordField = selector;
                break;
            } catch (e) {
                continue;
            }
        }

        if (usernameField && passwordField) {
            await page.type(usernameField, credentials.username);
            await page.type(passwordField, credentials.password);

            const submitSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button[name="submit"]',
                'button[id*="login"]',
                'button[id*="submit"]'
            ];

            for (const selector of submitSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 2000 });
                    await page.click(selector);
                    break;
                } catch (e) {
                    continue;
                }
            }

            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
            console.log('Login successful');
        } else {
            console.log('Login form not found, proceeding without login');
        }
    } catch (error) {
        console.error('Login failed:', error);
    }
}

async function displaySinglePage(config) {
    try {
        console.log(`Displaying single page: ${config.primary_url}`);
        
        const url = new URL(config.primary_url);
        const credentials = await getAuthCredentials(url.hostname);
        
        if (credentials) {
            await performLogin(config.primary_url, { ...credentials, domain: url.hostname });
        } else {
            await page.goto(config.primary_url, { waitUntil: 'networkidle2' });
        }

        await page.evaluate(() => {
            document.body.style.margin = '0';
            document.body.style.padding = '0';
            document.body.style.overflow = 'hidden';
        });

        console.log('Single page display completed');
    } catch (error) {
        console.error('Error displaying single page:', error);
    }
}

async function displaySplitScreen(config) {
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

        await page.setContent(html);
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
            await displaySinglePage(config);
        } else if (config.display_mode.includes('split')) {
            await displaySplitScreen(config);
        }

        console.log('Display update completed');
    } catch (error) {
        console.error('Error updating display:', error);
    }
}

async function startDisplaySystem() {
    console.log('Starting display system...');
    
    initializeDatabase();
    
    const browserReady = await initializeBrowser();
    if (!browserReady) {
        console.error('Failed to initialize browser. Exiting...');
        process.exit(1);
    }

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
    if (browser) {
        await browser.close();
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