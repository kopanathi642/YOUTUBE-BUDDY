# WORDPRESS PLUGIN INTEGRATION GUIDE

## Complete Integration for YouTube Buddy

This guide walks through embedding YouTube Buddy (API + Frontend) as a WordPress plugin.

---

## 1. PLUGIN STRUCTURE

```
wp-content/plugins/youtube-buddy/
├── youtube-buddy.php              # Main plugin file
├── includes/
│   ├── class-api-client.php       # WordPress-to-API bridge
│   ├── class-settings.php         # Plugin settings page
│   └── class-shortcodes.php       # Shortcode handlers
├── assets/
│   ├── js/
│   │   ├── admin.js              # Admin interface
│   │   └── embed.js              # Shortcode embedding
│   └── css/
│       └── style.css             # Plugin styling
├── templates/
│   ├── studio.php                # Studio tool template
│   ├── shorts.php                # Shorts generator template
│   └── captions.php              # Caption tool template
└── readme.txt                    # Plugin description
```

---

## 2. MAIN PLUGIN FILE

Create `youtube-buddy.php`:

```php
<?php
/**
 * Plugin Name: YouTube Buddy
 * Plugin URI: https://yourdomain.com/youtube-buddy
 * Description: AI-powered YouTube content creation and automation
 * Version: 1.0.0
 * Author: Your Company
 * Author URI: https://yourdomain.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: youtube-buddy
 * Domain Path: /languages
 */

defined('ABSPATH') || exit;

// Define plugin constants
define('YOUTUBE_BUDDY_VERSION', '1.0.0');
define('YOUTUBE_BUDDY_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('YOUTUBE_BUDDY_PLUGIN_URL', plugin_dir_url(__FILE__));
define('YOUTUBE_BUDDY_API_URL', get_option('youtube_buddy_api_url', 'http://localhost:8000'));

// Load plugin files
require_once YOUTUBE_BUDDY_PLUGIN_DIR . 'includes/class-api-client.php';
require_once YOUTUBE_BUDDY_PLUGIN_DIR . 'includes/class-settings.php';
require_once YOUTUBE_BUDDY_PLUGIN_DIR . 'includes/class-shortcodes.php';

// Initialize plugin
add_action('plugins_loaded', function() {
    do_action('youtube_buddy_loaded');
});

// Register activation hook
register_activation_hook(__FILE__, function() {
    // Create required options
    add_option('youtube_buddy_api_url', 'http://localhost:8000');
    add_option('youtube_buddy_api_token', '');
    add_option('youtube_buddy_enable_cache', true);
    
    // Flush rewrite rules
    flush_rewrite_rules();
});

// Register deactivation hook
register_deactivation_hook(__FILE__, function() {
    flush_rewrite_rules();
});

// Add settings page to admin menu
add_action('admin_menu', function() {
    add_menu_page(
        __('YouTube Buddy', 'youtube-buddy'),
        __('YouTube Buddy', 'youtube-buddy'),
        'manage_options',
        'youtube-buddy',
        function() {
            YouTube_Buddy\Settings::render_page();
        },
        'dashicons-video-alt3',
        20
    );
});

// Enqueue admin scripts
add_action('admin_enqueue_scripts', function($hook) {
    if (strpos($hook, 'youtube-buddy') !== false) {
        wp_enqueue_style(
            'youtube-buddy-admin',
            YOUTUBE_BUDDY_PLUGIN_URL . 'assets/css/style.css',
            [],
            YOUTUBE_BUDDY_VERSION
        );
        
        wp_enqueue_script(
            'youtube-buddy-admin',
            YOUTUBE_BUDDY_PLUGIN_URL . 'assets/js/admin.js',
            ['wp-element', 'wp-api-fetch'],
            YOUTUBE_BUDDY_VERSION,
            true
        );
        
        // Localize script with API data
        wp_localize_script('youtube-buddy-admin', 'youtubeBuddyAdmin', [
            'apiUrl' => YOUTUBE_BUDDY_API_URL,
            'apiToken' => get_option('youtube_buddy_api_token'),
            'enableCache' => get_option('youtube_buddy_enable_cache'),
            'nonce' => wp_create_nonce('youtube_buddy_api'),
        ]);
    }
});

// Register shortcodes
add_action('init', function() {
    YouTube_Buddy\Shortcodes::register();
});

// Initialize REST API routes
add_action('rest_api_init', function() {
    register_rest_route('youtube-buddy/v1', '/status', [
        'methods' => 'GET',
        'callback' => function() {
            return YouTube_Buddy\API_Client::get_status();
        },
        'permission_callback' => '__return_true',
    ]);
    
    register_rest_route('youtube-buddy/v1', '/process', [
        'methods' => 'POST',
        'callback' => function($request) {
            return YouTube_Buddy\API_Client::process_request($request);
        },
        'permission_callback' => function($request) {
            return current_user_can('edit_posts');
        },
    ]);
});

// AJAX handlers
add_action('wp_ajax_youtube_buddy_api', function() {
    YouTube_Buddy\API_Client::handle_ajax();
});

add_action('wp_ajax_nopriv_youtube_buddy_api', function() {
    YouTube_Buddy\API_Client::handle_ajax();
});
```

---

## 3. API CLIENT CLASS

Create `includes/class-api-client.php`:

```php
<?php
namespace YouTube_Buddy;

defined('ABSPATH') || exit;

class API_Client {
    
    /**
     * Get API server status.
     */
    public static function get_status() {
        $response = wp_remote_get(
            YOUTUBE_BUDDY_API_URL . '/api/v1/health',
            [
                'timeout' => 5,
                'headers' => [
                    'Authorization' => 'Bearer ' . get_option('youtube_buddy_api_token'),
                ]
            ]
        );
        
        if (is_wp_error($response)) {
            return new \WP_Error(
                'api_unavailable',
                'YouTube Buddy API server is not available',
                ['status' => 503]
            );
        }
        
        $body = wp_remote_retrieve_body($response);
        return json_decode($body, true);
    }
    
    /**
     * Send request to YouTube Buddy API.
     */
    public static function send_request($endpoint, $method = 'GET', $data = []) {
        $args = [
            'method' => $method,
            'timeout' => 30,
            'headers' => [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . get_option('youtube_buddy_api_token'),
            ]
        ];
        
        if (!empty($data)) {
            $args['body'] = wp_json_encode($data);
        }
        
        $response = wp_remote_request(
            YOUTUBE_BUDDY_API_URL . '/api/v1' . $endpoint,
            $args
        );
        
        if (is_wp_error($response)) {
            return new \WP_Error(
                'api_error',
                'API request failed: ' . $response->get_error_message()
            );
        }
        
        $body = wp_remote_retrieve_body($response);
        return json_decode($body, true);
    }
    
    /**
     * Handle AJAX requests from frontend.
     */
    public static function handle_ajax() {
        check_ajax_referer('youtube_buddy_api', 'nonce');
        
        $endpoint = isset($_POST['endpoint']) ? sanitize_text_field($_POST['endpoint']) : '';
        $method = isset($_POST['method']) ? strtoupper(sanitize_text_field($_POST['method'])) : 'GET';
        $data = isset($_POST['data']) ? json_decode(stripslashes($_POST['data']), true) : [];
        
        if (empty($endpoint)) {
            wp_send_json_error(['message' => 'Missing endpoint']);
        }
        
        $result = self::send_request($endpoint, $method, $data);
        
        if (is_wp_error($result)) {
            wp_send_json_error($result->get_error_data());
        }
        
        wp_send_json_success($result);
    }
    
    /**
     * Process REST API request.
     */
    public static function process_request($request) {
        $endpoint = $request->get_param('endpoint');
        $method = $request->get_method();
        $data = $request->get_json_params();
        
        return self::send_request($endpoint, $method, $data);
    }
}
```

---

## 4. SHORTCODE HANDLERS

Create `includes/class-shortcodes.php`:

```php
<?php
namespace YouTube_Buddy;

defined('ABSPATH') || exit;

class Shortcodes {
    
    /**
     * Register all shortcodes.
     */
    public static function register() {
        add_shortcode('youtube-buddy-studio', [__CLASS__, 'render_studio']);
        add_shortcode('youtube-buddy-shorts', [__CLASS__, 'render_shorts']);
        add_shortcode('youtube-buddy-captions', [__CLASS__, 'render_captions']);
    }
    
    /**
     * Render studio tool.
     */
    public static function render_studio($atts) {
        $atts = shortcode_atts(['width' => '100%', 'height' => '600px'], $atts);
        
        wp_enqueue_script(
            'youtube-buddy-studio',
            YOUTUBE_BUDDY_PLUGIN_URL . 'assets/js/embed.js',
            [],
            YOUTUBE_BUDDY_VERSION,
            true
        );
        
        wp_localize_script('youtube-buddy-studio', 'youtubeBuddyEmbed', [
            'tool' => 'studio',
            'apiUrl' => YOUTUBE_BUDDY_API_URL,
            'nonce' => wp_create_nonce('youtube_buddy_api'),
        ]);
        
        ob_start();
        ?>
        <div class="youtube-buddy-embed" 
             id="youtube-buddy-studio"
             style="width: <?php echo esc_attr($atts['width']); ?>; 
                    height: <?php echo esc_attr($atts['height']); ?>;
                    border: 1px solid #ddd; 
                    border-radius: 8px;
                    overflow: hidden;">
            <div style="padding: 20px; text-align: center; color: #666;">
                Loading YouTube Buddy Studio...
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
    
    /**
     * Render shorts generator.
     */
    public static function render_shorts($atts) {
        $atts = shortcode_atts(['width' => '100%'], $atts);
        
        wp_enqueue_script(
            'youtube-buddy-shorts',
            YOUTUBE_BUDDY_PLUGIN_URL . 'assets/js/embed.js',
            [],
            YOUTUBE_BUDDY_VERSION,
            true
        );
        
        wp_localize_script('youtube-buddy-shorts', 'youtubeBuddyEmbed', [
            'tool' => 'shorts',
            'apiUrl' => YOUTUBE_BUDDY_API_URL,
            'nonce' => wp_create_nonce('youtube_buddy_api'),
        ]);
        
        ob_start();
        ?>
        <div class="youtube-buddy-embed youtube-buddy-shorts" 
             id="youtube-buddy-shorts"
             style="width: <?php echo esc_attr($atts['width']); ?>;">
            <div style="text-align: center; color: #666; padding: 20px;">
                Loading YouTube Buddy Shorts Generator...
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
    
    /**
     * Render caption generator.
     */
    public static function render_captions($atts) {
        $atts = shortcode_atts(['width' => '100%'], $atts);
        
        wp_enqueue_script(
            'youtube-buddy-captions',
            YOUTUBE_BUDDY_PLUGIN_URL . 'assets/js/embed.js',
            [],
            YOUTUBE_BUDDY_VERSION,
            true
        );
        
        wp_localize_script('youtube-buddy-captions', 'youtubeBuddyEmbed', [
            'tool' => 'captions',
            'apiUrl' => YOUTUBE_BUDDY_API_URL,
            'nonce' => wp_create_nonce('youtube_buddy_api'),
        ]);
        
        ob_start();
        ?>
        <div class="youtube-buddy-embed youtube-buddy-captions" 
             id="youtube-buddy-captions"
             style="width: <?php echo esc_attr($atts['width']); ?>;">
            <div style="text-align: center; color: #666; padding: 20px;">
                Loading YouTube Buddy Caption Generator...
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
}
```

---

## 5. PLUGIN SETTINGS PAGE

Create `includes/class-settings.php`:

```php
<?php
namespace YouTube_Buddy;

defined('ABSPATH') || exit;

class Settings {
    
    /**
     * Render settings page.
     */
    public static function render_page() {
        if (!current_user_can('manage_options')) {
            wp_die(__('Unauthorized', 'youtube-buddy'));
        }
        
        // Handle form submission
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['youtube_buddy_settings'])) {
            check_admin_referer('youtube_buddy_settings', 'youtube_buddy_nonce');
            
            update_option('youtube_buddy_api_url', sanitize_text_field($_POST['youtube_buddy_api_url']));
            update_option('youtube_buddy_api_token', sanitize_text_field($_POST['youtube_buddy_api_token']));
            update_option('youtube_buddy_enable_cache', isset($_POST['youtube_buddy_enable_cache']));
            
            echo '<div class="notice notice-success"><p>Settings saved!</p></div>';
        }
        
        $api_url = get_option('youtube_buddy_api_url', 'http://localhost:8000');
        $api_token = get_option('youtube_buddy_api_token', '');
        $enable_cache = get_option('youtube_buddy_enable_cache', true);
        
        // Test API connection
        $api_status = API_Client::get_status();
        $status_class = is_wp_error($api_status) ? 'error' : 'success';
        $status_text = is_wp_error($api_status) ? 'API Offline' : 'API Online';
        
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
            
            <div id="youtube-buddy-status" class="notice notice-<?php echo esc_attr($status_class); ?>">
                <p>
                    <strong>API Status:</strong> 
                    <span id="api-status-text"><?php echo esc_html($status_text); ?></span>
                </p>
            </div>
            
            <form method="post" action="">
                <?php wp_nonce_field('youtube_buddy_settings', 'youtube_buddy_nonce'); ?>
                
                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="youtube_buddy_api_url">API Server URL</label>
                        </th>
                        <td>
                            <input 
                                type="text" 
                                id="youtube_buddy_api_url" 
                                name="youtube_buddy_api_url" 
                                value="<?php echo esc_attr($api_url); ?>"
                                placeholder="http://localhost:8000"
                                style="width: 100%; max-width: 400px;"
                            />
                            <p class="description">The URL of your YouTube Buddy backend server</p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row">
                            <label for="youtube_buddy_api_token">API Token</label>
                        </th>
                        <td>
                            <input 
                                type="password" 
                                id="youtube_buddy_api_token" 
                                name="youtube_buddy_api_token" 
                                value="<?php echo esc_attr($api_token); ?>"
                                style="width: 100%; max-width: 400px;"
                            />
                            <p class="description">JWT token for API authentication</p>
                        </td>
                    </tr>
                    
                    <tr>
                        <th scope="row">
                            <label for="youtube_buddy_enable_cache">Enable Caching</label>
                        </th>
                        <td>
                            <input 
                                type="checkbox" 
                                id="youtube_buddy_enable_cache" 
                                name="youtube_buddy_enable_cache"
                                <?php checked($enable_cache); ?>
                            />
                            <p class="description">Cache API responses for improved performance</p>
                        </td>
                    </tr>
                </table>
                
                <?php submit_button(); ?>
            </form>
            
            <h2>Available Shortcodes</h2>
            <table class="wp-list-table fixed">
                <thead>
                    <tr>
                        <th>Shortcode</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>[youtube-buddy-studio]</code></td>
                        <td>Full video editing and studio interface</td>
                    </tr>
                    <tr>
                        <td><code>[youtube-buddy-shorts]</code></td>
                        <td>Shorts generator tool</td>
                    </tr>
                    <tr>
                        <td><code>[youtube-buddy-captions]</code></td>
                        <td>Caption generation tool</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <?php
    }
}
```

---

## 6. FRONTEND EMBED SCRIPT

Create `assets/js/embed.js`:

```javascript
// YouTube Buddy Embed Script
(function() {
    const apiUrl = window.youtubeBuddyEmbed?.apiUrl || 'http://localhost:8000';
    const nonce = window.youtubeBuddyEmbed?.nonce || '';
    const tool = window.youtubeBuddyEmbed?.tool || 'studio';
    
    // Load tool iframe
    window.addEventListener('load', function() {
        const container = document.getElementById(`youtube-buddy-${tool}`);
        if (!container) return;
        
        const toolUrl = `${apiUrl}/studio?tool=${tool}&nonce=${nonce}`;
        
        const iframe = document.createElement('iframe');
        iframe.src = toolUrl;
        iframe.width = '100%';
        iframe.height = '600';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        
        container.innerHTML = '';
        container.appendChild(iframe);
        
        // Listen for messages from iframe
        window.addEventListener('message', (event) => {
            if (event.origin !== new URL(apiUrl).origin) return;
            
            if (event.data.type === 'youtube_buddy_action') {
                handleToolAction(event.data);
            }
        });
    });
    
    function handleToolAction(data) {
        // Send AJAX request to WordPress backend
        fetch(ajaxurl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                action: 'youtube_buddy_api',
                nonce: nonce,
                endpoint: data.endpoint,
                method: data.method,
                data: JSON.stringify(data.payload)
            })
        })
        .then(r => r.json())
        .then(result => {
            // Send result back to iframe
            document.querySelector('iframe')?.contentWindow.postMessage({
                type: 'youtube_buddy_response',
                success: result.success,
                data: result.data
            }, '*');
        })
        .catch(error => {
            console.error('YouTube Buddy API error:', error);
        });
    }
})();
```

---

## 7. INSTALLATION & ACTIVATION

### For Users

1. Download plugin files
2. Place in `wp-content/plugins/youtube-buddy/`
3. Go to WordPress admin → Plugins
4. Find "YouTube Buddy" and click "Activate"
5. Go to YouTube Buddy settings
6. Configure API URL and token
7. Test API connection

### For Developers

```bash
# Clone into WordPress plugins
git clone https://github.com/yourname/youtube-buddy.git \
  /path/to/wordpress/wp-content/plugins/youtube-buddy

# Activate plugin
wp plugin activate youtube-buddy

# Verify
wp plugin list
```

---

## 8. USAGE IN WORDPRESS

### Add to Posts/Pages

```html
<!-- Full Studio Interface -->
[youtube-buddy-studio width="100%" height="800px"]

<!-- Shorts Generator -->
[youtube-buddy-shorts]

<!-- Caption Generator -->
[youtube-buddy-captions]
```

### In Themes/Plugins

```php
<?php
do_shortcode('[youtube-buddy-studio]');
?>
```

---

## 9. TROUBLESHOOTING

### API Connection Failed

```php
// Check settings
wp option get youtube_buddy_api_url
wp option get youtube_buddy_api_token

// Test connection
wp eval 'echo json_encode(\YouTube_Buddy\API_Client::get_status());'
```

### Shortcode Not Working

1. Verify plugin is activated
2. Check that API URL is correct
3. Review browser console for JavaScript errors
4. Check WordPress debug log: `wp-content/debug.log`

### Performance Issues

```php
// Enable caching
wp option update youtube_buddy_enable_cache 1

// Clear cache
wp transient delete-all
```

---

## 10. SECURITY CONSIDERATIONS

- Store JWT token in WordPress options (not hardcoded)
- Use HTTPS for all API communication
- Sanitize all user input via `sanitize_text_field()`
- Check user capabilities with `current_user_can()`
- Verify nonces on AJAX requests

---

## DEPLOYMENT CHECKLIST

- [ ] Backend API running and accessible
- [ ] PostgreSQL database configured
- [ ] FFmpeg installed on server
- [ ] OpenAI API key configured
- [ ] WordPress plugin files in place
- [ ] Plugin activated in WordPress admin
- [ ] API URL configured in plugin settings
- [ ] Test API connection shows "Online"
- [ ] Test shortcodes on a page
- [ ] User authentication working
- [ ] File uploads functional
- [ ] Video rendering working
- [ ] HTTPS enabled

---

**For production deployment questions, see DEPLOYMENT_GUIDE.md**
