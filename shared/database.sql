-- Signage configuration database schema

CREATE TABLE IF NOT EXISTS signage_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_mode TEXT NOT NULL CHECK (display_mode IN ('single', 'split-horizontal', 'split-vertical')),
    primary_url TEXT NOT NULL,
    secondary_url TEXT,
    refresh_interval INTEGER DEFAULT 300,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    days_of_week TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (config_id) REFERENCES signage_configs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration
INSERT OR IGNORE INTO signage_configs (name, display_mode, primary_url) 
VALUES ('Default', 'single', 'https://www.google.com');

-- Insert default system settings
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('current_config_id', '1');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('admin_password', '$2b$10$default.hash.here');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_schedules_config_id ON schedules(config_id);
CREATE INDEX IF NOT EXISTS idx_schedules_time ON schedules(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_auth_domain ON auth_credentials(domain);