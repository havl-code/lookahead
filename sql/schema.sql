-- Speedcube Training Explorer Database Schema
-- SQLite Database for WCA data and personal training data

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================
-- CUBE INVENTORY
-- ============================================

-- Cubes table (NEW!)
CREATE TABLE IF NOT EXISTS cubes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    purchase_date DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PERSONAL TRAINING TABLES
-- ============================================

-- Training sessions
CREATE TABLE IF NOT EXISTS training_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    event_id TEXT NOT NULL,
    cube_id INTEGER,  -- NEW! Links to cubes table
    solve_count INTEGER DEFAULT 0,
    best_single INTEGER,
    worst_single INTEGER,
    session_mean INTEGER,
    session_average INTEGER,
    ao5 INTEGER,
    ao12 INTEGER,
    ao50 INTEGER,
    ao100 INTEGER,
    notes TEXT,
    location TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cube_id) REFERENCES cubes(id)
);

-- Individual solves (detailed training data)
CREATE TABLE IF NOT EXISTS personal_solves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    solve_number INTEGER,
    time_ms INTEGER NOT NULL,
    scramble TEXT,
    penalty TEXT,
    dnf BOOLEAN DEFAULT 0,
    plus_two BOOLEAN DEFAULT 0,
    notes TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
);

-- Training goals
CREATE TABLE IF NOT EXISTS training_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    goal_type TEXT CHECK(goal_type IN ('single', 'average', 'ao5', 'ao12')),
    target_time INTEGER NOT NULL,
    deadline DATE,
    achieved BOOLEAN DEFAULT 0,
    achieved_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User profile/settings
CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    wca_id TEXT,
    name TEXT,
    country_id TEXT,
    main_event TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Personal training indexes
CREATE INDEX IF NOT EXISTS idx_training_date ON training_sessions(date);
CREATE INDEX IF NOT EXISTS idx_training_event ON training_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_training_cube ON training_sessions(cube_id);
CREATE INDEX IF NOT EXISTS idx_solves_session ON personal_solves(session_id);
CREATE INDEX IF NOT EXISTS idx_solves_time ON personal_solves(time_ms);
CREATE INDEX IF NOT EXISTS idx_solves_timestamp ON personal_solves(timestamp);
CREATE INDEX IF NOT EXISTS idx_goals_event ON training_goals(event_id);
CREATE INDEX IF NOT EXISTS idx_goals_achieved ON training_goals(achieved);
CREATE INDEX IF NOT EXISTS idx_cubes_active ON cubes(is_active);

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View: Personal best times
CREATE VIEW IF NOT EXISTS view_personal_bests AS
SELECT 
    event_id,
    MIN(CASE WHEN dnf = 0 THEN time_ms END) as best_single,
    COUNT(*) as total_solves
FROM personal_solves
GROUP BY event_id;

-- View: Session statistics
CREATE VIEW IF NOT EXISTS view_session_stats AS
SELECT 
    ts.id as session_id,
    ts.date,
    ts.event_id,
    c.name as cube_name,
    c.brand as cube_brand,
    ts.solve_count,
    ts.best_single,
    ts.session_average,
    COUNT(ps.id) as actual_solve_count,
    MIN(CASE WHEN ps.dnf = 0 THEN ps.time_ms END) as calculated_best,
    AVG(CASE WHEN ps.dnf = 0 THEN ps.time_ms END) as calculated_mean
FROM training_sessions ts
LEFT JOIN personal_solves ps ON ts.id = ps.session_id
LEFT JOIN cubes c ON ts.cube_id = c.id
GROUP BY ts.id;

-- View: Progress over time
CREATE VIEW IF NOT EXISTS view_progress_timeline AS
SELECT 
    date,
    event_id,
    cube_id,
    best_single,
    session_average,
    ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY date) as session_number
FROM training_sessions
ORDER BY date;

-- View: Cube performance comparison
CREATE VIEW IF NOT EXISTS view_cube_comparison AS
SELECT 
    c.id as cube_id,
    c.name as cube_name,
    c.brand,
    c.model,
    COUNT(ts.id) as total_sessions,
    SUM(ts.solve_count) as total_solves,
    MIN(ts.best_single) as best_single,
    AVG(ts.session_mean) as avg_mean,
    AVG(ts.ao5) as avg_ao5
FROM cubes c
LEFT JOIN training_sessions ts ON c.id = ts.cube_id
WHERE c.is_active = 1
GROUP BY c.id;