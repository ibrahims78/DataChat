-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  is_active BOOLEAN DEFAULT true,
  onboarding_done BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  original_name VARCHAR(500) NOT NULL,
  stored_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  rating SMALLINT CHECK (rating IN (-1, 0, 1)),
  rating_comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Generated files table
CREATE TABLE IF NOT EXISTS generated_files (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  original_name VARCHAR(500) NOT NULL,
  stored_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Invite tokens
CREATE TABLE IF NOT EXISTS invite_tokens (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_by INTEGER REFERENCES users(id),
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Folders table (must be before files.folder_id FK)
CREATE TABLE IF NOT EXISTS folders (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI settings
CREATE TABLE IF NOT EXISTS ai_settings (
  id SERIAL PRIMARY KEY,
  system_prompt TEXT DEFAULT 'أنت مساعد ذكي متخصص في تحليل البيانات. تحلّل الملفات وتجيب على الأسئلة بدقة باللغة التي يستخدمها المستخدم.',
  temperature DECIMAL(3,2) DEFAULT 0.70,
  model VARCHAR(100) DEFAULT 'gemini-2.5-flash',
  api_key TEXT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS api_key TEXT DEFAULT NULL;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'gemini';
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS proxy_url TEXT DEFAULT NULL;

-- File management columns
ALTER TABLE files ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS display_name VARCHAR(500);
ALTER TABLE files ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;

ALTER TABLE generated_files ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE generated_files ADD COLUMN IF NOT EXISTS display_name VARCHAR(500);

INSERT INTO ai_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Email settings
CREATE TABLE IF NOT EXISTS email_settings (
  id SERIAL PRIMARY KEY,
  smtp_user VARCHAR(255) DEFAULT NULL,
  smtp_pass TEXT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO email_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Add last_seen_at to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT NULL;

-- Google Drive Settings (admin-configured OAuth credentials)
CREATE TABLE IF NOT EXISTS google_drive_settings (
  id SERIAL PRIMARY KEY,
  client_id TEXT DEFAULT NULL,
  client_secret TEXT DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO google_drive_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Google OAuth tokens per user
CREATE TABLE IF NOT EXISTS google_oauth (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMP,
  google_email VARCHAR(255),
  google_name VARCHAR(255),
  connected_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Project Drive Links (Drive files linked for AI direct access)
CREATE TABLE IF NOT EXISTS project_drive_links (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  drive_file_id VARCHAR(255) NOT NULL,
  drive_file_name VARCHAR(500) NOT NULL,
  drive_mime_type VARCHAR(200),
  linked_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, drive_file_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_drive_links_project_id ON project_drive_links(project_id);
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_files_project_id ON generated_files(project_id);
CREATE INDEX IF NOT EXISTS idx_folders_project_id ON folders(project_id);
CREATE INDEX IF NOT EXISTS idx_google_oauth_user_id ON google_oauth(user_id);
