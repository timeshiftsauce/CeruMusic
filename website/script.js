// Smooth scrolling functions
function scrollToDownload() {
  document.getElementById('download').scrollIntoView({
    behavior: 'smooth'
  })
}

function scrollToFeatures() {
  document.getElementById('features').scrollIntoView({
    behavior: 'smooth'
  })
}

// Alist API configuration
const ALIST_BASE_URL = 'https://alist.shiqianjiang.cn'
const ALIST_USERNAME = 'ceruupdate'
const ALIST_PASSWORD = '123456'

// GitHub repository configuration (for fallback)
const GITHUB_REPO = 'timeshiftsauce/CeruMusic'
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

// Cache for release data
let releaseData = null
let releaseDataTimestamp = null
let alistToken = null
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Alist authentication
async function getAlistToken() {
  if (alistToken) {
    return alistToken
  }

  try {
    const response = await fetch(`${ALIST_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: ALIST_USERNAME,
        password: ALIST_PASSWORD
      })
    })

    const data = await response.json()

    if (data.code === 200) {
      alistToken = data.data.token
      return alistToken
    } else {
      throw new Error(`Alist authentication failed: ${data.message}`)
    }
  } catch (error) {
    console.error('Alist authentication error:', error)
    throw error
  }
}

// Get available versions from Alist
async function getAlistVersions() {
  try {
    const token = await getAlistToken()

    const response = await fetch(`${ALIST_BASE_URL}/api/fs/list`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: '/',
        password: '',
        page: 1,
        per_page: 100,
        refresh: false
      })
    })

    const data = await response.json()

    if (data.code === 200) {
      // Filter directories that look like version numbers
      const versions = data.data.content
        .filter((item) => item.is_dir && /^v?\d+\.\d+\.\d+/.test(item.name))
        .sort((a, b) => b.name.localeCompare(a.name)) // Sort by version desc

      return versions
    } else {
      throw new Error(`Failed to get versions: ${data.message}`)
    }
  } catch (error) {
    console.error('Failed to get Alist versions:', error)
    return []
  }
}

// Get files in a specific version directory
async function getAlistVersionFiles(version) {
  try {
    const token = await getAlistToken()

    const response = await fetch(`${ALIST_BASE_URL}/api/fs/list`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: `/${version}`,
        password: '',
        page: 1,
        per_page: 100,
        refresh: false
      })
    })

    const data = await response.json()

    if (data.code === 200) {
      return data.data.content.filter((item) => !item.is_dir)
    } else {
      throw new Error(`Failed to get version files: ${data.message}`)
    }
  } catch (error) {
    console.error('Failed to get version files:', error)
    return []
  }
}

// Get direct download URL from Alist
async function getAlistDownloadUrl(version, fileName) {
  try {
    const token = await getAlistToken()
    const filePath = `/${version}/${fileName}`

    const response = await fetch(`${ALIST_BASE_URL}/api/fs/get`, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: filePath
      })
    })

    const data = await response.json()

    if (data.code === 200) {
      const fileInfo = data.data

      // Try different URL formats
      if (fileInfo.raw_url) {
        return fileInfo.raw_url
      } else if (fileInfo.sign) {
        return `${ALIST_BASE_URL}/d${filePath}?sign=${fileInfo.sign}`
      } else {
        return `${ALIST_BASE_URL}/d${filePath}`
      }
    } else {
      throw new Error(`Failed to get download URL: ${data.message}`)
    }
  } catch (error) {
    console.error('Failed to get Alist download URL:', error)
    throw error
  }
}

// Download functionality
async function downloadApp(platform) {
  const button = event.target
  const originalText = button.innerHTML

  // Show loading state
  button.innerHTML = `
        <svg class="btn-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        获取下载链接...
    `
  button.disabled = true

  try {
    // Detect user's architecture for better matching
    const userArch = detectArchitecture()

    // Try Alist first
    const versions = await getAlistVersions()

    if (versions.length > 0) {
      const latestVersion = versions[0]
      const files = await getAlistVersionFiles(latestVersion.name)

      // Find the appropriate file for the platform and architecture
      const fileName = findFileForPlatform(files, platform, userArch)

      if (fileName) {
        const downloadUrl = await getAlistDownloadUrl(latestVersion.name, fileName)

        // Show success notification with architecture info
        const archInfo = getArchitectureInfo(fileName)
        showNotification(
          `正在下载 ${getPlatformName(platform)} ${archInfo} 版本 ${latestVersion.name}...`,
          'success'
        )

        // Start download
        window.open(downloadUrl, '_blank')

        // Track download
        trackDownload(platform, latestVersion.name, fileName)

        return // Success, exit function
      }
    }

    // Fallback to GitHub if Alist fails
    await downloadFromGitHub(platform)
  } catch (error) {
    console.error('Download error:', error)

    // Try GitHub fallback
    try {
      await downloadFromGitHub(platform)
    } catch (fallbackError) {
      console.error('GitHub fallback also failed:', fallbackError)
      showNotification(`下载失败: ${error.message}`, 'error')

      // Final fallback to GitHub releases page
      setTimeout(() => {
        showNotification('正在跳转到GitHub下载页面...', 'info')
        window.open(`https://github.com/${GITHUB_REPO}/releases/latest`, '_blank')
      }, 2000)
    }
  } finally {
    // Restore button state
    setTimeout(() => {
      button.innerHTML = originalText
      button.disabled = false
    }, 1500)
  }
}

// GitHub fallback function
async function downloadFromGitHub(platform) {
  const release = await getLatestRelease()

  if (!release) {
    throw new Error('无法获取最新版本信息')
  }

  const userArch = detectArchitecture()
  const downloadUrl = findDownloadAsset(release.assets, platform, userArch)

  if (!downloadUrl) {
    throw new Error(`暂无 ${getPlatformName(platform)} 版本下载`)
  }

  // Find the asset to get architecture info
  const asset = release.assets.find((a) => a.browser_download_url === downloadUrl)
  const archInfo = asset ? getArchitectureInfo(asset.name) : ''

  // Show success notification
  showNotification(
    `正在下载 ${getPlatformName(platform)} ${archInfo} 版本 v${release.tag_name}...`,
    'success'
  )

  // Start download
  window.open(downloadUrl, '_blank')

  // Track download
  trackDownload(platform, release.tag_name, asset ? asset.name : '')
}

// Get latest release from GitHub API
async function getLatestRelease() {
  // Check cache first
  const now = Date.now()
  if (releaseData && releaseDataTimestamp && now - releaseDataTimestamp < CACHE_DURATION) {
    return releaseData
  }

  try {
    const response = await fetch(GITHUB_API_URL)

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const data = await response.json()

    // Cache the data
    releaseData = data
    releaseDataTimestamp = now

    return data
  } catch (error) {
    console.error('Failed to fetch release data:', error)
    return null
  }
}

// Find appropriate file for platform from Alist files
function findFileForPlatform(files, platform, userArch = null) {
  if (!files || !Array.isArray(files)) {
    return null
  }

  // Filter out unwanted files (yml, yaml, txt, md, etc.)
  const filteredFiles = files.filter((file) => {
    const name = file.name.toLowerCase()
    return (
      !name.endsWith('.yml') &&
      !name.endsWith('.yaml') &&
      !name.endsWith('.txt') &&
      !name.endsWith('.md') &&
      !name.endsWith('.json') &&
      !name.includes('latest') &&
      !name.includes('blockmap')
    )
  })

  // If no user architecture provided, detect it
  if (!userArch) {
    userArch = detectArchitecture()
  }

  // Define architecture-specific patterns for each platform
  const archPatterns = {
    windows: {
      x64: [
        /ceru-music.*x64.*setup\.exe$/i,
        /ceru-music.*win.*x64.*setup\.exe$/i,
        /ceru-music.*x64.*\.zip$/i,
        /ceru-music.*win.*x64.*\.zip$/i
      ],
      ia32: [
        /ceru-music.*ia32.*setup\.exe$/i,
        /ceru-music.*win.*ia32.*setup\.exe$/i,
        /ceru-music.*ia32.*\.zip$/i,
        /ceru-music.*win.*ia32.*\.zip$/i
      ],
      fallback: [/ceru-music.*setup\.exe$/i, /\.exe$/i, /windows.*\.zip$/i, /win.*\.zip$/i]
    },
    macos: {
      universal: [/ceru-music.*universal\\.dmg$/i, /ceru-music.*universal\\.zip$/i],
      arm64: [
        /ceru-music.*arm64\\.dmg$/i,
        /ceru-music.*arm64\\.zip$/i,
        /ceru-music.*universal\\.dmg$/i,
        /ceru-music.*universal\\.zip$/i
      ],
      x64: [
        /ceru-music.*x64\\.dmg$/i,
        /ceru-music.*x64\\.zip$/i,
        /ceru-music.*universal\\.dmg$/i,
        /ceru-music.*universal\\.zip$/i
      ],
      fallback: [
        /ceru-music.*\\.dmg$/i,
        /\\.dmg$/i,
        /darwin.*\\.zip$/i,
        /macos.*\\.zip$/i,
        /mac.*\\.zip$/i
      ]
    },
    linux: {
      x64: [
        /ceru-music.*linux.*x64\\.AppImage$/i,
        /ceru-music.*linux.*x64\\.deb$/i,
        /ceru-music.*x64\\.AppImage$/i,
        /ceru-music.*x64\\.deb$/i
      ],
      fallback: [
        /ceru-music.*\\.AppImage$/i,
        /ceru-music.*\\.deb$/i,
        /\\.AppImage$/i,
        /\\.deb$/i,
        /linux.*\\.zip$/i
      ]
    }
  }

  const platformArchPatterns = archPatterns[platform]
  if (!platformArchPatterns) {
    return null
  }

  // Try architecture-specific patterns first
  const archSpecificPatterns = platformArchPatterns[userArch] || []

  for (const pattern of archSpecificPatterns) {
    const file = filteredFiles.find((file) => pattern.test(file.name))
    if (file) {
      return file.name
    }
  }

  // Try fallback patterns
  const fallbackPatterns = platformArchPatterns.fallback || []

  for (const pattern of fallbackPatterns) {
    const file = filteredFiles.find((file) => pattern.test(file.name))
    if (file) {
      return file.name
    }
  }

  // Final fallback: look for any file that might match the platform
  const finalFallbackPatterns = {
    windows: /win|exe/i,
    macos: /mac|darwin|dmg/i,
    linux: /linux|appimage|deb|rpm/i
  }

  const finalPattern = finalFallbackPatterns[platform]
  if (finalPattern) {
    const file = filteredFiles.find((file) => finalPattern.test(file.name))
    if (file) {
      return file.name
    }
  }

  return null
}

// Find appropriate download asset based on platform
function findDownloadAsset(assets, platform) {
  if (!assets || !Array.isArray(assets)) {
    return null
  }

  // Filter out unwanted files (yml, yaml, txt, md, etc.)
  const filteredAssets = assets.filter((asset) => {
    const name = asset.name.toLowerCase()
    return (
      !name.endsWith('.yml') &&
      !name.endsWith('.yaml') &&
      !name.endsWith('.txt') &&
      !name.endsWith('.md') &&
      !name.endsWith('.json') &&
      !name.includes('latest') &&
      !name.includes('blockmap')
    )
  })

  // Define file patterns for each platform (ordered by priority)
  const patterns = {
    windows: [
      /ceru-music.*win.*x64.*setup\.exe$/i,
      /ceru-music.*win.*ia32.*setup\.exe$/i,
      /ceru-music.*setup\.exe$/i,
      /\.exe$/i,
      /ceru-music.*win.*x64.*\.zip$/i,
      /ceru-music.*win.*ia32.*\.zip$/i,
      /windows.*\.zip$/i,
      /win32.*\.zip$/i,
      /win.*x64.*\.zip$/i
    ],
    macos: [
      /ceru-music.*universal\.dmg$/i,
      /ceru-music.*arm64\.dmg$/i,
      /ceru-music.*x64\.dmg$/i,
      /ceru-music.*\.dmg$/i,
      /\.dmg$/i,
      /ceru-music.*universal\.zip$/i,
      /ceru-music.*arm64\.zip$/i,
      /ceru-music.*x64\.zip$/i,
      /darwin.*\.zip$/i,
      /macos.*\.zip$/i,
      /mac.*\.zip$/i,
      /osx.*\.zip$/i
    ],
    linux: [
      /ceru-music.*linux.*x64\.deb$/i,
      /ceru-music.*linux.*x64\.AppImage$/i,
      /ceru-music.*amd64\.deb$/i,
      /\.deb$/i,
      /\.AppImage$/i,
      /linux.*\.zip$/i,
      /linux.*\.tar\.gz$/i,
      /\.rpm$/i
    ]
  }

  const platformPatterns = patterns[platform] || []

  // Try to find exact match
  for (const pattern of platformPatterns) {
    const asset = filteredAssets.find((asset) => pattern.test(asset.name))
    if (asset) {
      return asset.browser_download_url
    }
  }

  // Fallback: look for any asset that might match the platform
  const fallbackPatterns = {
    windows: /win|exe/i,
    macos: /mac|darwin|dmg/i,
    linux: /linux|appimage|deb|rpm/i
  }

  const fallbackPattern = fallbackPatterns[platform]
  if (fallbackPattern) {
    const asset = filteredAssets.find((asset) => fallbackPattern.test(asset.name))
    if (asset) {
      return asset.browser_download_url
    }
  }

  return null
}

function getPlatformName(platform) {
  const names = {
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux'
  }
  return names[platform] || platform
}

// Notification system
function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll('.notification')
  existingNotifications.forEach((notification) => notification.remove())

  // Create notification element
  const notification = document.createElement('div')
  notification.className = `notification notification-${type}`
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
    `

  // Add notification styles if not already added
  if (!document.querySelector('#notification-styles')) {
    const styles = document.createElement('style')
    styles.id = 'notification-styles'
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
        `
    document.head.appendChild(styles)
  }

  // Add to page
  document.body.appendChild(notification)

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'slideInRight 0.3s ease-out reverse'
      setTimeout(() => notification.remove(), 300)
    }
  }, 5000)
}

// Navbar scroll effect
function handleNavbarScroll() {
  const navbar = document.querySelector('.navbar')
  if (window.scrollY > 50) {
    navbar.style.background = 'rgba(255, 255, 255, 0.98)'
    navbar.style.boxShadow = 'var(--shadow)'
  } else {
    navbar.style.background = 'rgba(255, 255, 255, 0.95)'
    navbar.style.boxShadow = 'none'
  }
}

// Intersection Observer for animations
function setupAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.animation = 'fadeInUp 0.6s ease-out forwards'
      }
    })
  }, observerOptions)

  // Observe feature cards and download cards
  document.querySelectorAll('.feature-card, .download-card').forEach((card) => {
    card.style.opacity = '0'
    card.style.transform = 'translateY(30px)'
    observer.observe(card)
  })
}

// Auto-detect user's operating system and architecture
function detectOS() {
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.includes('win')) return 'windows'
  if (userAgent.includes('mac')) return 'macos'
  if (userAgent.includes('linux')) return 'linux'
  return 'windows' // default
}

// Detect user's architecture
function detectArchitecture() {
  const userAgent = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  // For macOS, detect Apple Silicon vs Intel
  if (userAgent.includes('mac')) {
    // Check for Apple Silicon indicators
    if (userAgent.includes('arm') || platform.includes('arm')) {
      return 'arm64'
    }
    // Default to universal for macOS (works on both Intel and Apple Silicon)
    return 'universal'
  }

  // For Windows, detect 32-bit vs 64-bit
  if (userAgent.includes('win')) {
    if (userAgent.includes('wow64') || userAgent.includes('win64') || userAgent.includes('x64')) {
      return 'x64'
    }
    return 'ia32'
  }

  // For Linux, assume 64-bit
  if (userAgent.includes('linux')) {
    return 'x64'
  }

  return 'x64' // default
}

// Get architecture display name
function getArchitectureName(arch) {
  const names = {
    x64: '64位',
    ia32: '32位',
    arm64: 'Apple Silicon',
    universal: 'Universal (Intel + Apple Silicon)'
  }
  return names[arch] || arch
}

// Highlight user's OS download option
function highlightUserOS() {
  const userOS = detectOS()
  const userArch = detectArchitecture()
  const downloadCards = document.querySelectorAll('.download-card')

  downloadCards.forEach((card, index) => {
    const platforms = ['windows', 'macos', 'linux']
    if (platforms[index] === userOS) {
      card.style.border = '2px solid var(--primary-color)'
      card.style.transform = 'scale(1.02)'

      // Add "推荐" badge with architecture info
      const badge = document.createElement('div')
      badge.className = 'recommended-badge'
      const archName = getArchitectureName(userArch)
      badge.textContent = `推荐 (${archName})`
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
                white-space: nowrap;
            `
      card.style.position = 'relative'
      card.appendChild(badge)

      // Add architecture info to the card description
      const description = card.querySelector('p')
      if (description && userOS === 'macos') {
        if (userArch === 'arm64') {
          description.innerHTML +=
            '<br><small style="color: var(--text-muted);">检测到 Apple Silicon Mac，推荐 Universal 版本</small>'
        } else if (userArch === 'universal') {
          description.innerHTML +=
            '<br><small style="color: var(--text-muted);">Universal 版本兼容 Intel 和 Apple Silicon Mac</small>'
        }
      }
    }
  })
}

// Keyboard navigation
function setupKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close notifications
      document.querySelectorAll('.notification').forEach((notification) => {
        notification.remove()
      })
    }

    if (e.key === 'Enter' && e.target.classList.contains('btn')) {
      e.target.click()
    }
  })
}

// Performance optimization: Lazy load images
function setupLazyLoading() {
  const images = document.querySelectorAll('img[data-src]')
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target
        img.src = img.dataset.src
        img.removeAttribute('data-src')
        imageObserver.unobserve(img)
      }
    })
  })

  images.forEach((img) => imageObserver.observe(img))
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  // Setup scroll effects
  window.addEventListener('scroll', handleNavbarScroll)

  // Setup animations
  setupAnimations()

  // Highlight user's OS
  highlightUserOS()

  // Setup keyboard navigation
  setupKeyboardNavigation()

  // Setup lazy loading
  setupLazyLoading()

  // Add GitHub links
  addGitHubLinks()

  // Update version information from GitHub
  await updateVersionInfo()

  // Add smooth scrolling to all anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault()
      const target = document.querySelector(this.getAttribute('href'))
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      }
    })
  })

  // Remove the old download button click handlers since downloadApp now handles everything
  // The downloadApp function is called directly from the HTML onclick attributes
})

// Add spinning animation for loading state
const spinningStyles = document.createElement('style')
spinningStyles.textContent = `
    .spinning {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`
document.head.appendChild(spinningStyles)

// Error handling for failed downloads
window.addEventListener('error', (e) => {
  console.error('页面错误:', e.error)
})

// Update version information on page
async function updateVersionInfo() {
  try {
    // Try to get version info from Alist first
    const versions = await getAlistVersions()

    if (versions.length > 0) {
      const latestVersion = versions[0]
      const versionElement = document.querySelector('.version')
      const versionInfoElement = document.querySelector('.version-info p')

      if (versionElement) {
        versionElement.textContent = latestVersion.name
      }

      if (versionInfoElement) {
        const modifyDate = new Date(latestVersion.modified)
        const formattedDate = modifyDate.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
        const formattedTime = modifyDate.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        })
        versionInfoElement.innerHTML = `当前版本: <span class="version">${latestVersion.name}</span> | 更新时间: ${formattedDate} ${formattedTime}`
      }

      // Update download button text with file info from Alist
      const files = await getAlistVersionFiles(latestVersion.name)
      updateDownloadButtonsWithAlistFiles(files)

      return // Success, exit function
    }

    // Fallback to GitHub if Alist fails
    const release = await getLatestRelease()
    if (release) {
      const versionElement = document.querySelector('.version')
      const versionInfoElement = document.querySelector('.version-info p')

      if (versionElement) {
        versionElement.textContent = release.tag_name
      }

      if (versionInfoElement) {
        const publishDate = new Date(release.published_at)
        const formattedDate = publishDate.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
        const formattedTime = publishDate.toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        })
        versionInfoElement.innerHTML = `当前版本: <span class="version">${release.tag_name}</span> | 更新时间: ${formattedDate} ${formattedTime}`
      }

      // Update download button text with file sizes if available
      updateDownloadButtonsWithAssets(release.assets)
    }
  } catch (error) {
    console.error('Failed to update version info:', error)
  }
}

// Update download buttons with Alist file information
function updateDownloadButtonsWithAlistFiles(files) {
  if (!files || !Array.isArray(files)) return

  const downloadCards = document.querySelectorAll('.download-card')
  const platforms = ['windows', 'macos', 'linux']

  downloadCards.forEach((card, index) => {
    const platform = platforms[index]
    const fileName = findFileForPlatform(files, platform)

    if (fileName) {
      const file = files.find((f) => f.name === fileName)
      const button = card.querySelector('.btn-download')
      const sizeText = formatFileSize(file.size)
      const originalText = button.innerHTML

      // Add file size info
      button.innerHTML = originalText.replace(
        /下载 \..*?$/,
        `下载 .${getFileExtension(fileName)} (${sizeText})`
      )
    }
  })
}

// Update download buttons with asset information
function updateDownloadButtonsWithAssets(assets) {
  if (!assets || !Array.isArray(assets)) return

  const downloadCards = document.querySelectorAll('.download-card')
  const platforms = ['windows', 'macos', 'linux']

  downloadCards.forEach((card, index) => {
    const platform = platforms[index]
    const asset = findAssetForPlatform(assets, platform)

    if (asset) {
      const button = card.querySelector('.btn-download')
      const sizeText = formatFileSize(asset.size)
      const originalText = button.innerHTML

      // Add file size info
      button.innerHTML = originalText.replace(
        /下载 \.(.*?)$/,
        `下载 .${getFileExtension(asset.name)} (${sizeText})`
      )
    }
  })
}

// Updated function name to match usage
function findDownloadAsset(assets, platform, userArch = null) {
  if (!userArch) {
    userArch = detectArchitecture()
  }

  // Filter out unwanted files
  const filteredAssets = assets.filter((asset) => {
    const name = asset.name.toLowerCase()
    return (
      !name.endsWith('.yml') &&
      !name.endsWith('.yaml') &&
      !name.endsWith('.txt') &&
      !name.endsWith('.md') &&
      !name.endsWith('.json') &&
      !name.includes('latest') &&
      !name.includes('blockmap')
    )
  })

  // Define architecture-specific patterns for each platform
  const archPatterns = {
    windows: {
      x64: [
        /ceru-music.*x64.*setup\.exe$/i,
        /ceru-music.*win.*x64.*setup\.exe$/i,
        /ceru-music.*x64.*\.zip$/i,
        /ceru-music.*win.*x64.*\.zip$/i
      ],
      ia32: [
        /ceru-music.*ia32.*setup\.exe$/i,
        /ceru-music.*win.*ia32.*setup\.exe$/i,
        /ceru-music.*ia32.*\.zip$/i,
        /ceru-music.*win.*ia32.*\.zip$/i
      ],
      fallback: [/ceru-music.*setup\.exe$/i, /\.exe$/i, /windows.*\.zip$/i, /win.*\.zip$/i]
    },
    macos: {
      universal: [/ceru-music.*universal\.dmg$/i, /ceru-music.*universal\.zip$/i],
      arm64: [
        /ceru-music.*arm64\.dmg$/i,
        /ceru-music.*arm64\.zip$/i,
        /ceru-music.*universal\.dmg$/i,
        /ceru-music.*universal\.zip$/i
      ],
      x64: [
        /ceru-music.*x64\.dmg$/i,
        /ceru-music.*x64\.zip$/i,
        /ceru-music.*universal\.dmg$/i,
        /ceru-music.*universal\.zip$/i
      ],
      fallback: [
        /ceru-music.*\.dmg$/i,
        /\.dmg$/i,
        /darwin.*\.zip$/i,
        /macos.*\.zip$/i,
        /mac.*\.zip$/i
      ]
    },
    linux: {
      x64: [
        /ceru-music.*linux.*x64\.AppImage$/i,
        /ceru-music.*linux.*x64\.deb$/i,
        /ceru-music.*x64\.AppImage$/i,
        /ceru-music.*x64\.deb$/i
      ],
      fallback: [
        /ceru-music.*\.AppImage$/i,
        /ceru-music.*\.deb$/i,
        /\.AppImage$/i,
        /\.deb$/i,
        /linux.*\.zip$/i
      ]
    }
  }

  const platformArchPatterns = archPatterns[platform]
  if (!platformArchPatterns) {
    return null
  }

  // Try architecture-specific patterns first
  const archSpecificPatterns = platformArchPatterns[userArch] || []
  for (const pattern of archSpecificPatterns) {
    const asset = filteredAssets.find((asset) => pattern.test(asset.name))
    if (asset) return asset
  }

  // Try fallback patterns
  const fallbackPatterns = platformArchPatterns.fallback || []
  for (const pattern of fallbackPatterns) {
    const asset = filteredAssets.find((asset) => pattern.test(asset.name))
    if (asset) return asset
  }

  return null
}

// Helper function to get file extension
function getFileExtension(filename) {
  return filename.split('.').pop()
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Get architecture information from filename
function getArchitectureInfo(filename) {
  if (!filename) return ''

  const name = filename.toLowerCase()

  if (name.includes('universal')) return '(Universal)'
  if (name.includes('arm64')) return '(Apple Silicon)'
  if (name.includes('x64')) return '(64位)'
  if (name.includes('ia32')) return '(32位)'
  if (name.includes('win') && name.includes('x64')) return '(64位)'
  if (name.includes('win') && name.includes('ia32')) return '(32位)'
  if (name.includes('linux') && name.includes('x64')) return '(64位)'

  return ''
}

// Analytics tracking (placeholder)
function trackDownload(platform, version, filename = '') {
  // Add your analytics tracking code here
  const archInfo = getArchitectureInfo(filename)

  // Example: Google Analytics
  // gtag('event', 'download', {
  //     'event_category': 'software',
  //     'event_label': `${platform}_${archInfo}`,
  //     'value': version
  // });
}

// Add GitHub link functionality
function addGitHubLinks() {
  // Add GitHub link to footer if not exists
  const footerSection = document.querySelector('.footer-section:nth-child(3) ul')
  if (footerSection) {
    const githubLink = document.createElement('li')
    githubLink.innerHTML = `<a href="https://github.com/${GITHUB_REPO}" target="_blank">GitHub 仓库</a>`
    footerSection.appendChild(githubLink)
  }

  // Add "查看所有版本" link to download section
  const versionInfo = document.querySelector('.version-info')
  if (versionInfo) {
    const allVersionsLink = document.createElement('p')
    allVersionsLink.innerHTML = `<a href="https://github.com/${GITHUB_REPO}/releases" target="_blank" style="color: var(--primary-color); text-decoration: none;">查看所有版本 →</a>`
    allVersionsLink.style.marginTop = '1rem'
    versionInfo.appendChild(allVersionsLink)
  }
}
