# PRODUCTION DEPLOYMENT GUIDE

## YouTube Buddy - Complete End-to-End Implementation

This guide covers deploying the YouTube Buddy application (backend + frontend) to WordPress as a plugin/integration.

---

## 1. PREREQUISITES

### Required Software
- **Python 3.12+** - Backend runtime
- **Node.js 20+** - Frontend build
- **PostgreSQL 14+** - Production database (SQLite only for dev)
- **Redis 6+** - Caching and Celery broker
- **FFmpeg 4.4+** - Video processing
- **FFprobe** - Video metadata extraction

### Required API Keys
- **OpenAI API** (`sk-...`) - Image & text generation, transcription
- **Firebase Project** (OAuth) - Google login authentication
- **Hugging Face** (Optional) - Alternative AI models
- **WordPress Site** - For plugin deployment

### System Requirements
- **CPU**: 4+ cores (for video processing)
- **RAM**: 8+ GB (for concurrent video rendering)
- **Storage**: 500+ GB (for video uploads/renders)
- **Bandwidth**: Sufficient for video streaming

---

## 2. BACKEND SETUP

### 2.1 Environment Configuration

```bash
cd backend

# Generate environment template
python -m tests.production_validator env-template > .env.production

# Edit .env.production with your values
nano .env.production
```

**Key production settings to configure:**
```env
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/youtube_buddy
REDIS_URL=redis://host:6379/0
OPENAI_API_KEY=sk-xxxx
UPLOAD_DIR=/var/youtube_buddy/uploads
RENDER_DIR=/var/youtube_buddy/rendered
JWT_SECRET_KEY=generate-secure-random-string
```

### 2.2 Database Setup

```bash
# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE youtube_buddy;"
psql -U postgres -c "CREATE USER youtube_buddy WITH PASSWORD 'secure_password';"
psql -U postgres -d youtube_buddy -c "GRANT ALL PRIVILEGES ON DATABASE youtube_buddy TO youtube_buddy;"

# Run migrations (after setting DATABASE_URL)
cd backend
python -m alembic upgrade head

# Verify setup
python -c "from app.models import *; print('Models loaded successfully')"
```

### 2.3 Install Dependencies

```bash
cd backend

# Install production dependencies
pip install -r requirements.txt

# Additional production packages
pip install gunicorn uvicorn python-dotenv psycopg[binary]
```

### 2.4 Validate Production Setup

```bash
# Run validation script
python -m tests.production_validator validate

# Expected output: ✓ READY FOR PRODUCTION
```

### 2.5 Run Integration Tests

```bash
# Test API endpoints with real database
python -m pytest tests/test_integration.py -v --tb=short

# Test image generation (requires OPENAI_API_KEY)
python -m pytest tests/test_integration.py::TestImageGeneration -v

# Test video rendering (requires ffmpeg)
python -m pytest tests/test_integration.py::TestVideoRendering -v

# Test transcription (requires OPENAI_API_KEY)
python -m pytest tests/test_integration.py::TestAudioTranscription -v

# Test end-to-end workflow
python -m pytest tests/test_integration.py::TestEndToEndWorkflow -v
```

### 2.6 Start Backend Services

**Option A: Using Gunicorn (Production)**

```bash
cd backend

# Start API server
gunicorn \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile - \
  app.main:app

# Start Celery worker (in separate terminal)
celery -A app.core.celery_app worker --loglevel=info

# Start Celery beat (for scheduled tasks)
celery -A app.core.celery_app beat --loglevel=info
```

**Option B: Using systemd Services (Recommended for Linux)**

Create `/etc/systemd/system/youtube-buddy-api.service`:

```ini
[Unit]
Description=YouTube Buddy API Server
After=network.target

[Service]
Type=notify
User=www-data
WorkingDirectory=/opt/youtube_buddy/backend
EnvironmentFile=/opt/youtube_buddy/backend/.env.production
ExecStart=/opt/youtube_buddy/backend/.venv/bin/gunicorn \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind unix:/run/youtube_buddy_api.sock \
  app.main:app

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/youtube-buddy-celery.service`:

```ini
[Unit]
Description=YouTube Buddy Celery Worker
After=network.target redis-server.service

[Service]
Type=forking
User=www-data
WorkingDirectory=/opt/youtube_buddy/backend
EnvironmentFile=/opt/youtube_buddy/backend/.env.production
ExecStart=/opt/youtube_buddy/backend/.venv/bin/celery \
  -A app.core.celery_app \
  worker \
  --loglevel=info \
  --logfile=/var/log/youtube_buddy/celery.log

[Install]
WantedBy=multi-user.target
```

Enable services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable youtube-buddy-api youtube-buddy-celery
sudo systemctl start youtube-buddy-api youtube-buddy-celery
```

---

## 3. FRONTEND SETUP

### 3.1 Build Next.js Application

```bash
cd FRONTEND

# Install dependencies
npm install

# Build for production
npm run build

# Test build
npm run start

# Export static site (optional - for WordPress embedding)
npm run export
```

### 3.2 Configure Frontend Environment

Create `FRONTEND/.env.production`:

```
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
NEXT_PUBLIC_FIREBASE_CONFIG={"projectId":"...","apiKey":"..."}
```

### 3.3 Deploy Frontend

**Option A: Separate Next.js Server**

```bash
# Using PM2 (process manager)
npm install -g pm2

pm2 start npm --name "youtube-buddy-frontend" -- start
pm2 save
pm2 startup
```

**Option B: Static Export for WordPress**

```bash
cd FRONTEND

# Generate static files
npm run export

# Copy to WordPress plugin directory
cp -r out/* /var/www/html/wp-content/plugins/youtube-buddy/public/
```

---

## 4. WORDPRESS PLUGIN INTEGRATION

### 4.1 Create WordPress Plugin Structure

```bash
mkdir -p /var/www/html/wp-content/plugins/youtube-buddy
cd /var/www/html/wp-content/plugins/youtube-buddy

# Plugin main file
cat > youtube-buddy.php << 'EOF'
<?php
/*
Plugin Name: YouTube Buddy
Description: AI-powered YouTube content creation and automation
Version: 1.0.0
Author: Your Name
*/

defined('ABSPATH') || exit;

// Register REST API endpoints
add_action('rest_api_init', function() {
    register_rest_route('youtube-buddy/v1', '/status', array(
        'methods' => 'GET',
        'callback' => function() {
            $api_url = defined('YOUTUBE_BUDDY_API_URL') 
                ? YOUTUBE_BUDDY_API_URL 
                : 'http://localhost:8000';
            
            $response = wp_remote_get($api_url . '/api/v1/health');
            
            if (is_wp_error($response)) {
                return new WP_Error('api_unavailable', 'API server unavailable');
            }
            
            return json_decode(wp_remote_retrieve_body($response));
        },
        'permission_callback' => '__return_true'
    ));
});

// Add admin menu
add_action('admin_menu', function() {
    add_menu_page(
        'YouTube Buddy',
        'YouTube Buddy',
        'manage_options',
        'youtube-buddy',
        function() {
            echo '<div id="youtube-buddy-admin"></div>';
            wp_enqueue_script(
                'youtube-buddy-admin',
                plugins_url('js/admin.js', __FILE__),
                ['wp-element', 'wp-api-fetch'],
                '1.0.0',
                true
            );
        }
    );
});

// Add shortcode for embedding tools
add_shortcode('youtube-buddy', function($atts) {
    $tool = isset($atts['tool']) ? sanitize_text_field($atts['tool']) : 'studio';
    
    wp_enqueue_script(
        'youtube-buddy-embed',
        plugins_url('js/embed.js', __FILE__),
        [],
        '1.0.0',
        true
    );
    
    return '<div id="youtube-buddy-' . esc_attr($tool) . '"></div>';
});

// AJAX endpoint for API calls
add_action('wp_ajax_youtube_buddy_api', function() {
    $endpoint = isset($_POST['endpoint']) ? sanitize_text_field($_POST['endpoint']) : '';
    $method = isset($_POST['method']) ? strtoupper(sanitize_text_field($_POST['method'])) : 'GET';
    $data = isset($_POST['data']) ? json_decode(stripslashes($_POST['data']), true) : [];
    
    $api_url = defined('YOUTUBE_BUDDY_API_URL') 
        ? YOUTUBE_BUDDY_API_URL 
        : 'http://localhost:8000';
    
    $response = wp_remote_request($api_url . '/api/v1' . $endpoint, [
        'method' => $method,
        'headers' => [
            'Content-Type' => 'application/json',
            'Authorization' => 'Bearer ' . get_option('youtube_buddy_api_token')
        ],
        'body' => json_encode($data)
    ]);
    
    if (is_wp_error($response)) {
        wp_send_json_error(['message' => $response->get_error_message()]);
    }
    
    wp_send_json_success(json_decode(wp_remote_retrieve_body($response)));
});

add_action('wp_ajax_nopriv_youtube_buddy_api', 'wp_ajax_youtube_buddy_api');
EOF
```

### 4.2 Configure WordPress Plugin Settings

Add to `wp-config.php`:

```php
// YouTube Buddy Configuration
define('YOUTUBE_BUDDY_API_URL', 'https://api.yourdomain.com');
define('YOUTUBE_BUDDY_API_TOKEN', 'your-jwt-token-here');
define('YOUTUBE_BUDDY_ENABLE_CACHING', true);
define('YOUTUBE_BUDDY_CACHE_TTL', 3600);
```

### 4.3 Test WordPress Integration

```bash
# From WordPress admin, navigate to:
# Plugins > YouTube Buddy > Activate

# Test API connection:
curl -X GET http://your-wordpress/wp-admin/admin-ajax.php?action=youtube_buddy_api&endpoint=/health

# Test shortcode on a page:
# [youtube-buddy tool="studio"]
```

---

## 5. DEPLOYMENT CHECKLIST

- [ ] **Backend**
  - [ ] PostgreSQL database created and migrated
  - [ ] All environment variables configured
  - [ ] API tests passing
  - [ ] Image generation tested (OpenAI)
  - [ ] Video rendering tested (ffmpeg)
  - [ ] Audio transcription tested (Whisper)
  - [ ] Celery workers running
  - [ ] Redis cache working
  - [ ] Production validation passing

- [ ] **Frontend**
  - [ ] Next.js build successful
  - [ ] Environment variables configured
  - [ ] API endpoints responding
  - [ ] Images optimized with next/image
  - [ ] ESLint checks passing
  - [ ] TypeScript compilation passing

- [ ] **WordPress**
  - [ ] Plugin files in correct location
  - [ ] Plugin activated
  - [ ] API endpoints accessible
  - [ ] Shortcodes rendering
  - [ ] AJAX calls working
  - [ ] Permissions configured

- [ ] **Security**
  - [ ] HTTPS enabled
  - [ ] JWT secrets rotated
  - [ ] API keys secured
  - [ ] Database backups enabled
  - [ ] File permissions locked down

---

## 6. MONITORING & MAINTENANCE

### 6.1 Monitor API Health

```bash
# Check API status
curl https://api.yourdomain.com/api/v1/health

# Monitor logs
tail -f /var/log/youtube_buddy/api.log
tail -f /var/log/youtube_buddy/celery.log
```

### 6.2 Database Backups

```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/backup/youtube_buddy"
mkdir -p $BACKUP_DIR
pg_dump youtube_buddy | gzip > $BACKUP_DIR/backup_$(date +%Y%m%d).sql.gz

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

### 6.3 Performance Optimization

```bash
# Increase Gunicorn workers based on CPU cores
gunicorn -w $((2 * $(nproc) + 1)) ...

# Optimize PostgreSQL
# In postgresql.conf:
# shared_buffers = 256MB (25% of RAM)
# work_mem = 10MB
# maintenance_work_mem = 64MB

# Monitor Redis
redis-cli info stats
```

---

## 7. TROUBLESHOOTING

### Issue: API Returns 502 Bad Gateway

```bash
# Check if API is running
curl http://localhost:8000/api/v1/health

# Check Gunicorn logs
journalctl -u youtube-buddy-api -n 50

# Check firewall
sudo ufw allow 8000
```

### Issue: Video Processing Fails

```bash
# Verify ffmpeg installation
ffmpeg -version

# Check file permissions
ls -la /var/youtube_buddy/uploads
ls -la /var/youtube_buddy/rendered

# Test video processing
python -m pytest tests/test_integration.py::TestVideoRendering -v
```

### Issue: Image Generation Returns Quota Error

```bash
# Check OpenAI API key
echo $OPENAI_API_KEY

# Check API rate limits
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Test with smaller requests first
```

### Issue: Database Connection Failed

```bash
# Check PostgreSQL is running
pg_isready -h localhost -U youtube_buddy -d youtube_buddy

# Verify connection string
# Format: postgresql+asyncpg://user:password@host:5432/database

# Test connection
psql "postgresql://youtube_buddy:password@localhost:5432/youtube_buddy"
```

---

## 8. PRODUCTION PROMPTS

### Image Generation Prompts

```javascript
// Professional YouTube Thumbnail
"Create a professional YouTube thumbnail for a tutorial video about {topic}. "
"Include bold text overlay, high contrast colors (red, yellow, blue), "
"arrow pointing to key element, and 4K quality suitable for YouTube."

// AI-Generated Content Preview
"Generate a cinematic preview image for an AI-powered {tool_name} tool. "
"Show modern UI, glowing effects, professional lighting, tech aesthetic."

// Brand-Aligned Graphics
"Create marketing graphics aligned with brand: {brand_guidelines}. "
"Suitable for social media, YouTube, and web promotion. "
"Maintain aspect ratio 16:9 for video content."
```

### Video Generation Prompts

```javascript
// Cinematic Scene
"Create production brief for cinematic scene:\n" +
"Title: {title}\n" +
"Duration: {duration}s\n" +
"Camera movement: {camera_type}\n" +
"Return as JSON with: logline, shot_list, camera_plan, lighting, sound, edit_notes"

// Tutorial Script
"Generate tutorial script for YouTube Shorts ({topic}):\n" +
"Format as JSON with: title, script, timing_points, visual_cues, effects"
```

### Caption Generation Prompts

```python
# Automatic Caption Enhancement
"Improve these captions for better engagement:\n"
"{original_captions}\n"
"Return JSON with enhanced_captions, timestamps, keywords"
```

---

## 9. PRODUCTION TESTING RESULTS

Run final integration tests:

```bash
# Full test suite
python -m pytest tests/ -v --tb=short

# Coverage report
python -m pytest tests/ --cov=app --cov-report=html

# Integration-only tests
python -m pytest tests/test_integration.py -v

# Expected results:
# - 31/31 unit tests passing
# - 8+ integration tests passing
# - Image generation: ✓
# - Video rendering: ✓
# - Audio transcription: ✓
# - Caption generation: ✓
# - Database operations: ✓
```

---

## 10. DEPLOYMENT COMMANDS SUMMARY

```bash
# Complete deployment workflow
cd /opt/youtube_buddy

# Backend setup
cd backend
cp .env.production .env
python -m pip install -r requirements.txt
python -m tests.production_validator validate
python -m pytest tests/test_integration.py -v

# Frontend setup
cd ../FRONTEND
npm install
npm run build

# Start services
cd ../backend
gunicorn -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 app.main:app
celery -A app.core.celery_app worker --loglevel=info

# WordPress plugin
# Install at: wp-content/plugins/youtube-buddy/
# Activate in WordPress admin
```

---

## SUPPORT & MONITORING

- **API Status**: `https://api.yourdomain.com/api/v1/health`
- **Logs**: `/var/log/youtube_buddy/`
- **Database**: PostgreSQL at configured host
- **Cache**: Redis at configured host
- **Storage**: `/var/youtube_buddy/uploads` and `/var/youtube_buddy/rendered`

**For production issues, check:**
1. Logs in `/var/log/youtube_buddy/`
2. Database connectivity
3. API key validity
4. FFmpeg availability
5. Disk space availability
