// Smooth scrolling functions
function scrollToDownload() {
    document.getElementById('download').scrollIntoView({
        behavior: 'smooth'
    });
}

function scrollToFeatures() {
    document.getElementById('features').scrollIntoView({
        behavior: 'smooth'
    });
}

// GitHub repository configuration
const GITHUB_REPO = 'timeshiftsauce/CeruMusic';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// Cache for release data
let releaseData = null;
let releaseDataTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Download functionality
async function downloadApp(platform) {
    const button = event.target;
    const originalText = button.innerHTML;
    
    // Show loading state
    button.innerHTML = `
        <svg class="btn-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        获取下载链接...
    `;
    button.disabled = true;
    
    try {
        // Get latest release data
        const release = await getLatestRelease();
        
        if (!release) {
            throw new Error('无法获取最新版本信息');
        }
        
        // Find the appropriate download asset
        const downloadUrl = findDownloadAsset(release.assets, platform);
        
        if (!downloadUrl) {
            throw new Error(`暂无 ${getPlatformName(platform)} 版本下载`);
        }
        
        // Show success notification
        showNotification(`正在下载 ${getPlatformName(platform)} 版本 v${release.tag_name}...`, 'success');
        
        // Start download
        window.open(downloadUrl, '_blank');
        
        // Track download
        trackDownload(platform, release.tag_name);
        
    } catch (error) {
        console.error('Download error:', error);
        showNotification(`下载失败: ${error.message}`, 'error');
        
        // Fallback to GitHub releases page
        setTimeout(() => {
            showNotification('正在跳转到GitHub下载页面...', 'info');
            window.open(`https://gh.bugdey.us.kg/https://github.com/${GITHUB_REPO}/releases/latest`, '_blank');
        }, 2000);
    } finally {
        // Restore button state
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 1500);
    }
}

// Get latest release from GitHub API
async function getLatestRelease() {
    // Check cache first
    const now = Date.now();
    if (releaseData && releaseDataTimestamp && (now - releaseDataTimestamp) < CACHE_DURATION) {
        return releaseData;
    }
    
    try {
        const response = await fetch(GITHUB_API_URL);
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Cache the data
        releaseData = data;
        releaseDataTimestamp = now;
        
        return data;
    } catch (error) {
        console.error('Failed to fetch release data:', error);
        return null;
    }
}

// Find appropriate download asset based on platform
function findDownloadAsset(assets, platform) {
    if (!assets || !Array.isArray(assets)) {
        return null;
    }
    
    // Define file patterns for each platform
    const patterns = {
        windows: [
            /\.exe$/i,
            /windows.*\.zip$/i,
            /win32.*\.zip$/i,
            /win.*x64.*\.zip$/i
        ],
        macos: [
            /\.dmg$/i,
            /darwin.*\.zip$/i,
            /macos.*\.zip$/i,
            /mac.*\.zip$/i,
            /osx.*\.zip$/i
        ],
        linux: [
            /\.AppImage$/i,
            /linux.*\.zip$/i,
            /linux.*\.tar\.gz$/i,
            /\.deb$/i,
            /\.rpm$/i
        ]
    };
    
    const platformPatterns = patterns[platform] || [];
    
    // Try to find exact match
    for (const pattern of platformPatterns) {
        const asset = assets.find(asset => pattern.test(asset.name));
        if (asset) {
            return asset.browser_download_url;
        }
    }
    
    // Fallback: look for any asset that might match the platform
    const fallbackPatterns = {
        windows: /win|exe/i,
        macos: /mac|darwin|dmg/i,
        linux: /linux|appimage|deb|rpm/i
    };
    
    const fallbackPattern = fallbackPatterns[platform];
    if (fallbackPattern) {
        const asset = assets.find(asset => fallbackPattern.test(asset.name));
        if (asset) {
            return asset.browser_download_url;
        }
    }
    
    return null;
}

function getPlatformName(platform) {
    const names = {
        windows: 'Windows',
        macos: 'macOS',
        linux: 'Linux'
    };
    return names[platform] || platform;
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `;
    
    // Add notification styles if not already added
    if (!document.querySelector('#notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 90px;
                right: 20px;
                background: white;
                border: 1px solid var(--border);
                border-radius: var(--border-radius);
                box-shadow: var(--shadow-lg);
                z-index: 1001;
                min-width: 300px;
                animation: slideInRight 0.3s ease-out;
            }
            
            .notification-info {
                border-left: 4px solid var(--primary-color);
            }
            
            .notification-success {
                border-left: 4px solid #10b981;
            }
            
            .notification-error {
                border-left: 4px solid #ef4444;
            }
            
            .notification-content {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 1rem;
            }
            
            .notification-message {
                color: var(--text-primary);
                font-weight: 500;
            }
            
            .notification-close {
                background: none;
                border: none;
                cursor: pointer;
                color: var(--text-muted);
                padding: 0.25rem;
                border-radius: 4px;
                transition: var(--transition);
            }
            
            .notification-close:hover {
                background: var(--surface);
                color: var(--text-primary);
            }
            
            .notification-close svg {
                width: 16px;
                height: 16px;
            }
            
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @media (max-width: 480px) {
                .notification {
                    right: 10px;
                    left: 10px;
                    min-width: auto;
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideInRight 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Navbar scroll effect
function handleNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(255, 255, 255, 0.98)';
        navbar.style.boxShadow = 'var(--shadow)';
    } else {
        navbar.style.background = 'rgba(255, 255, 255, 0.95)';
        navbar.style.boxShadow = 'none';
    }
}

// Intersection Observer for animations
function setupAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = 'fadeInUp 0.6s ease-out forwards';
            }
        });
    }, observerOptions);
    
    // Observe feature cards and download cards
    document.querySelectorAll('.feature-card, .download-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        observer.observe(card);
    });
}

// Auto-detect user's operating system
function detectOS() {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('win')) return 'windows';
    if (userAgent.includes('mac')) return 'macos';
    if (userAgent.includes('linux')) return 'linux';
    return 'windows'; // default
}

// Highlight user's OS download option
function highlightUserOS() {
    const userOS = detectOS();
    const downloadCards = document.querySelectorAll('.download-card');
    
    downloadCards.forEach((card, index) => {
        const platforms = ['windows', 'macos', 'linux'];
        if (platforms[index] === userOS) {
            card.style.border = '2px solid var(--primary-color)';
            card.style.transform = 'scale(1.02)';
            
            // Add "推荐" badge
            const badge = document.createElement('div');
            badge.className = 'recommended-badge';
            badge.textContent = '推荐';
            badge.style.cssText = `
                position: absolute;
                top: -10px;
                right: 20px;
                background: var(--primary-color);
                color: white;
                padding: 0.25rem 0.75rem;
                border-radius: 12px;
                font-size: 0.75rem;
                font-weight: 600;
            `;
            card.style.position = 'relative';
            card.appendChild(badge);
        }
    });
}

// Keyboard navigation
function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Close notifications
            document.querySelectorAll('.notification').forEach(notification => {
                notification.remove();
            });
        }
        
        if (e.key === 'Enter' && e.target.classList.contains('btn')) {
            e.target.click();
        }
    });
}

// Performance optimization: Lazy load images
function setupLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                imageObserver.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Setup scroll effects
    window.addEventListener('scroll', handleNavbarScroll);
    
    // Setup animations
    setupAnimations();
    
    // Highlight user's OS
    highlightUserOS();
    
    // Setup keyboard navigation
    setupKeyboardNavigation();
    
    // Setup lazy loading
    setupLazyLoading();
    
    // Add GitHub links
    addGitHubLinks();
    
    // Update version information from GitHub
    await updateVersionInfo();
    
    // Add smooth scrolling to all anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Remove the old download button click handlers since downloadApp now handles everything
    // The downloadApp function is called directly from the HTML onclick attributes
});

// Add spinning animation for loading state
const spinningStyles = document.createElement('style');
spinningStyles.textContent = `
    .spinning {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(spinningStyles);

// Error handling for failed downloads
window.addEventListener('error', (e) => {
    console.error('页面错误:', e.error);
});

// Update version information on page
async function updateVersionInfo() {
    try {
        const release = await getLatestRelease();
        if (release) {
            const versionElement = document.querySelector('.version');
            const versionInfoElement = document.querySelector('.version-info p');
            
            if (versionElement) {
                versionElement.textContent = release.tag_name;
            }
            
            if (versionInfoElement) {
                const publishDate = new Date(release.published_at);
                const formattedDate = publishDate.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long'
                });
                versionInfoElement.innerHTML = `当前版本: <span class="version">${release.tag_name}</span> | 更新时间: ${formattedDate}`;
            }
            
            // Update download button text with file sizes if available
            updateDownloadButtonsWithAssets(release.assets);
        }
    } catch (error) {
        console.error('Failed to update version info:', error);
    }
}

// Update download buttons with asset information
function updateDownloadButtonsWithAssets(assets) {
    if (!assets || !Array.isArray(assets)) return;
    
    const downloadCards = document.querySelectorAll('.download-card');
    const platforms = ['windows', 'macos', 'linux'];
    
    downloadCards.forEach((card, index) => {
        const platform = platforms[index];
        const asset = findAssetForPlatform(assets, platform);
        
        if (asset) {
            const button = card.querySelector('.btn-download');
            const sizeText = formatFileSize(asset.size);
            const originalText = button.innerHTML;
            
            // Add file size info
            button.innerHTML = originalText.replace(/下载 \.(.*?)$/, `下载 .${getFileExtension(asset.name)} (${sizeText})`);
        }
    });
}

// Helper function to find asset for platform
function findAssetForPlatform(assets, platform) {
    const patterns = {
        windows: [/\.exe$/i, /windows.*\.zip$/i, /win32.*\.zip$/i],
        macos: [/\.dmg$/i, /darwin.*\.zip$/i, /macos.*\.zip$/i],
        linux: [/\.AppImage$/i, /linux.*\.zip$/i, /\.deb$/i]
    };
    
    const platformPatterns = patterns[platform] || [];
    
    for (const pattern of platformPatterns) {
        const asset = assets.find(asset => pattern.test(asset.name));
        if (asset) return asset;
    }
    
    return null;
}

// Helper function to get file extension
function getFileExtension(filename) {
    return filename.split('.').pop();
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Analytics tracking (placeholder)
function trackDownload(platform, version) {
    // Add your analytics tracking code here
    console.log(`Download tracked: ${platform} v${version}`);
    
    // Example: Google Analytics
    // gtag('event', 'download', {
    //     'event_category': 'software',
    //     'event_label': platform,
    //     'value': version
    // });
}

// Add GitHub link functionality
function addGitHubLinks() {
    // Add GitHub link to footer if not exists
    const footerSection = document.querySelector('.footer-section:nth-child(3) ul');
    if (footerSection) {
        const githubLink = document.createElement('li');
        githubLink.innerHTML = `<a href="https://github.com/${GITHUB_REPO}" target="_blank">GitHub 仓库</a>`;
        footerSection.appendChild(githubLink);
    }
    
    // Add "查看所有版本" link to download section
    const versionInfo = document.querySelector('.version-info');
    if (versionInfo) {
        const allVersionsLink = document.createElement('p');
        allVersionsLink.innerHTML = `<a href="https://github.com/${GITHUB_REPO}/releases" target="_blank" style="color: var(--primary-color); text-decoration: none;">查看所有版本 →</a>`;
        allVersionsLink.style.marginTop = '1rem';
        versionInfo.appendChild(allVersionsLink);
    }
}