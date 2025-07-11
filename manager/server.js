const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_PATH = process.env.DATABASE_PATH || './data/signage.db';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

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
            console.log('Connected to SQLite database');
            
            const schemaPath = path.join(__dirname, 'shared', 'database.sql');
            if (fs.existsSync(schemaPath)) {
                const schema = fs.readFileSync(schemaPath, 'utf8');
                db.exec(schema, (err) => {
                    if (err) {
                        console.error('Error executing schema:', err);
                    } else {
                        console.log('Database schema initialized');
                    }
                });
            } else {
                createTables();
            }
        }
    });
}

function createTables() {
    const tables = [
        `CREATE TABLE IF NOT EXISTS signage_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            display_mode TEXT NOT NULL CHECK (display_mode IN ('single', 'split-horizontal', 'split-vertical')),
            primary_url TEXT NOT NULL,
            secondary_url TEXT,
            refresh_interval INTEGER DEFAULT 300,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS auth_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            config_id INTEGER NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            days_of_week TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (config_id) REFERENCES signage_configs(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    tables.forEach(table => {
        db.run(table, (err) => {
            if (err) console.error('Error creating table:', err);
        });
    });

    db.run(`INSERT OR IGNORE INTO signage_configs (name, display_mode, primary_url) 
             VALUES ('Default', 'single', 'https://www.google.com')`, (err) => {
        if (err) console.error('Error inserting default config:', err);
    });

    db.run(`INSERT OR IGNORE INTO system_settings (key, value) VALUES ('current_config_id', '1')`, (err) => {
        if (err) console.error('Error inserting system setting:', err);
    });
}

// API Routes
app.get('/api/configs', (req, res) => {
    db.all('SELECT * FROM signage_configs ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.post('/api/configs', (req, res) => {
    const { name, display_mode, primary_url, secondary_url, refresh_interval } = req.body;
    
    if (!name || !display_mode || !primary_url) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = `INSERT INTO signage_configs (name, display_mode, primary_url, secondary_url, refresh_interval, updated_at) 
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
    
    db.run(sql, [name, display_mode, primary_url, secondary_url, refresh_interval || 300], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID, message: 'Configuration created successfully' });
        }
    });
});

app.put('/api/configs/:id', (req, res) => {
    const { id } = req.params;
    const { name, display_mode, primary_url, secondary_url, refresh_interval } = req.body;
    
    const sql = `UPDATE signage_configs 
                 SET name = ?, display_mode = ?, primary_url = ?, secondary_url = ?, refresh_interval = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`;
    
    db.run(sql, [name, display_mode, primary_url, secondary_url, refresh_interval, id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ message: 'Configuration updated successfully' });
        }
    });
});

app.delete('/api/configs/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM signage_configs WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ message: 'Configuration deleted successfully' });
        }
    });
});

app.get('/api/current-config', (req, res) => {
    db.get('SELECT value FROM system_settings WHERE key = "current_config_id"', [], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            const configId = row ? row.value : 1;
            db.get('SELECT * FROM signage_configs WHERE id = ?', [configId], (err, config) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                } else {
                    res.json(config || {});
                }
            });
        }
    });
});

app.post('/api/set-current-config', (req, res) => {
    const { config_id } = req.body;
    
    db.run('UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = "current_config_id"', 
           [config_id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ message: 'Current configuration updated successfully' });
        }
    });
});

app.get('/api/auth-credentials', (req, res) => {
    db.all('SELECT id, domain, username FROM auth_credentials ORDER BY domain', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.post('/api/auth-credentials', (req, res) => {
    const { domain, username, password } = req.body;
    
    if (!domain || !username || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = `INSERT OR REPLACE INTO auth_credentials (domain, username, password, updated_at) 
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)`;
    
    db.run(sql, [domain, username, password], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ message: 'Credentials saved successfully' });
        }
    });
});

app.delete('/api/auth-credentials/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM auth_credentials WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ message: 'Credentials deleted successfully' });
        }
    });
});

app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'running', 
        timestamp: new Date().toISOString(),
        database: DATABASE_PATH 
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initializeDatabase();

app.listen(PORT, () => {
    console.log(`Signage Manager running on port ${PORT}`);
});