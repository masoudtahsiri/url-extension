// frontend/settings.js - Secure version with license validation

// User agent strings
const USER_AGENTS = {
    default: '',
    googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'googlebot-mobile': 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    facebookbot: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    twitterbot: 'Twitterbot/1.0',
    linkedinbot: 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    android: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
    custom: ''
};

document.addEventListener('DOMContentLoaded', async function() {
    let isPro = false;
    
    // Check license status via background script
    async function checkProStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ 
                action: 'validateLicense' 
            });
            isPro = response.isPro === true;
            return isPro;
        } catch (error) {
            console.error('License validation error:', error);
            isPro = false;
            return false;
        }
    }
    
    // Initial license check
    isPro = await checkProStatus();
    
    // Update UI based on pro status
    const versionBadge = document.querySelector('.settings-header .badge');
    if (versionBadge) {
        if (isPro) {
            versionBadge.textContent = 'PRO VERSION';
            versionBadge.style.background = 'rgba(255, 255, 255, 0.2)';
        } else {
            versionBadge.textContent = 'FREE VERSION';
            versionBadge.style.background = 'rgba(255, 255, 255, 0.15)';
        }
    }
    
    if (!isPro) {
        // Show overlay for non-pro users
        document.getElementById('googleSheetsCard').classList.add('locked');
    } else {
        // Load Google status for Pro users
        loadGoogleStatus();
    }
    
    // Always load stats
    loadStats();

    // Re-check when window gains focus
    window.addEventListener('focus', async () => {
        const newProStatus = await checkProStatus();
        if (newProStatus !== isPro) {
            // Status changed, reload page
            window.location.reload();
        }
    });

    // Event listeners
    document.getElementById('connectGoogleBtn').addEventListener('click', connectGoogle);
    document.getElementById('disconnectGoogleBtn').addEventListener('click', disconnectGoogle);
    document.getElementById('disconnectGoogleBtn').addEventListener('mouseenter', function() {
        this.textContent = 'Disconnect';
    });
    document.getElementById('disconnectGoogleBtn').addEventListener('mouseleave', function() {
        this.textContent = 'Connected';
    });
    
    // Upgrade button in overlay
    const upgradeOverlayBtn = document.getElementById('upgradeOverlayBtn');
    if (upgradeOverlayBtn) {
        upgradeOverlayBtn.addEventListener('click', function() {
            // Open upgrade page
            chrome.tabs.create({ 
                url: chrome.runtime.getURL('frontend/upgrade.html') 
            });
        });
    }

    // Add click handler for statUpgradeLink
    const statUpgradeLink = document.getElementById('statUpgradeLink');
    if (statUpgradeLink) {
        statUpgradeLink.addEventListener('click', function(e) {
            e.preventDefault();
            chrome.tabs.create({
                url: chrome.runtime.getURL('frontend/upgrade.html')
            });
        });
    }
});

function loadGoogleStatus() {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
            // Get user info
            fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(response => response.json())
            .then(data => {
                updateGoogleStatus(true, data.email);
            })
            .catch(() => {
                updateGoogleStatus(false);
            });
        } else {
            updateGoogleStatus(false);
        }
    });
}

function updateGoogleStatus(connected, email = null) {
    const statusDiv = document.getElementById('googleStatus');
    const emailSpan = document.getElementById('googleEmail');
    const connectBtn = document.getElementById('connectGoogleBtn');
    const disconnectBtn = document.getElementById('disconnectGoogleBtn');
    
    if (connected) {
        statusDiv.classList.remove('disconnected');
        statusDiv.classList.add('connected');
        emailSpan.textContent = email || 'Connected';
        emailSpan.style.color = '#00A878';
        emailSpan.style.fontWeight = '500';
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-block';
    } else {
        statusDiv.classList.remove('connected');
        statusDiv.classList.add('disconnected');
        emailSpan.textContent = 'Not connected';
        emailSpan.style.color = '#64748B';
        emailSpan.style.fontWeight = '400';
        connectBtn.style.display = 'inline-block';
        disconnectBtn.style.display = 'none';
    }
}

async function connectGoogle() {
    // Re-validate Pro status before allowing connection
    const response = await chrome.runtime.sendMessage({ 
        action: 'validateLicense' 
    });
    
    if (!response.isPro) {
        showAlert('Google Sheets integration requires a Pro license', 'warning');
        return;
    }

    const connectBtn = document.getElementById('connectGoogleBtn');
    const originalText = connectBtn.textContent;
    
    // Add loading state
    connectBtn.classList.add('loading');
    connectBtn.disabled = true;
    
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
        // Remove loading state
        connectBtn.classList.remove('loading');
        connectBtn.disabled = false;
        connectBtn.textContent = originalText;
        
        if (chrome.runtime.lastError) {
            showAlert('Failed to connect Google account', 'danger');
            return;
        }
        
        if (token) {
            showAlert('Successfully connected Google account!', 'success');
            loadGoogleStatus();
        }
    });
}

function disconnectGoogle() {
    const disconnectBtn = document.getElementById('disconnectGoogleBtn');
    
    // Add loading state
    disconnectBtn.classList.add('loading');
    disconnectBtn.disabled = true;
    
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
            chrome.identity.removeCachedAuthToken({ token: token }, () => {
                fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
                    .then(() => {
                        // Remove loading state
                        disconnectBtn.classList.remove('loading');
                        disconnectBtn.disabled = false;
                        disconnectBtn.textContent = 'Connected';
                        
                        updateGoogleStatus(false);
                        showAlert('Google account disconnected', 'info');
                    })
                    .catch(() => {
                        // Remove loading state on error
                        disconnectBtn.classList.remove('loading');
                        disconnectBtn.disabled = false;
                        disconnectBtn.textContent = 'Connected';
                        showAlert('Error disconnecting account', 'danger');
                    });
            });
        }
    });
}

function loadStats() {
    // Load encrypted stats
    chrome.storage.local.get(['_tc', '_se'], function(result) {
        // Decrypt stats
        const totalChecks = parseInt(atob(result._tc || 'MA==')) || 0;
        const sheetsExports = parseInt(atob(result._se || 'MA==')) || 0;
        
        document.getElementById('totalChecks').textContent = totalChecks;
        document.getElementById('sheetsExports').textContent = sheetsExports;
    });
    
    // Check pro status for URL limit display
    chrome.runtime.sendMessage({ action: 'validateLicense' }, function(response) {
        const urlLimitElement = document.getElementById('urlLimit');
        const upgradeMsg = document.querySelector('.stat-card .text-muted');
        if (urlLimitElement) {
            if (response.isPro) {
                urlLimitElement.textContent = '∞';
                if (upgradeMsg) upgradeMsg.style.display = 'none';
            } else {
                urlLimitElement.textContent = '100';
                if (upgradeMsg) upgradeMsg.style.display = 'block';
            }
        }
    });
}

function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 3000);
}

function loadSettings() {
    chrome.storage.sync.get(['proSettings'], function(result) {
        const settings = result.proSettings || getDefaultSettings();
        
        // User Agent
        document.getElementById('userAgent').value = settings.userAgent || 'default';
        if (settings.userAgent === 'custom' && settings.customUserAgent) {
            document.getElementById('customUserAgent').value = settings.customUserAgent;
            document.getElementById('customUserAgentGroup').style.display = 'block';
        }
        
        // Custom Headers
        if (settings.customHeaders && settings.customHeaders.length > 0) {
            settings.customHeaders.forEach(header => {
                addHeaderRow(header.name, header.value);
            });
        }
        
        // Basic Auth
        if (settings.basicAuth) {
            document.getElementById('basicAuthEnabled').checked = settings.basicAuth.enabled;
            if (settings.basicAuth.enabled) {
                document.getElementById('basicAuthFields').style.display = 'block';
                document.getElementById('basicAuthUsername').value = settings.basicAuth.username || '';
                document.getElementById('basicAuthPassword').value = settings.basicAuth.password || '';
            }
        }
        
        // Additional Features
        document.getElementById('checkCanonical').checked = settings.checkCanonical || false;
        document.getElementById('followRedirects').checked = settings.followRedirects !== false;
        document.getElementById('ignoreSSL').checked = settings.ignoreSSL || false;
    });
}

function getDefaultSettings() {
    return {
        userAgent: 'default',
        customUserAgent: '',
        customHeaders: [],
        basicAuth: {
            enabled: false,
            username: '',
            password: ''
        },
        checkCanonical: false,
        followRedirects: true,
        ignoreSSL: false
    };
}

function handleUserAgentChange(e) {
    const value = e.target.value;
    const customGroup = document.getElementById('customUserAgentGroup');
    
    if (value === 'custom') {
        customGroup.style.display = 'block';
    } else {
        customGroup.style.display = 'none';
    }
}

function addHeaderRow(name = '', value = '') {
    const container = document.getElementById('customHeaders');
    const headerDiv = document.createElement('div');
    headerDiv.className = 'custom-header-item';
    
    headerDiv.innerHTML = `
        <input type="text" class="form-control header-name" placeholder="Header Name" value="${escapeHtml(name)}">
        <input type="text" class="form-control header-value" placeholder="Header Value" value="${escapeHtml(value)}">
        <button type="button" class="btn btn-sm btn-danger btn-icon remove-header">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    headerDiv.querySelector('.remove-header').addEventListener('click', function() {
        headerDiv.remove();
    });
    
    container.appendChild(headerDiv);
}

function handleBasicAuthToggle(e) {
    const fields = document.getElementById('basicAuthFields');
    fields.style.display = e.target.checked ? 'block' : 'none';
}

function saveSettings() {
    const settings = {
        userAgent: document.getElementById('userAgent').value,
        customUserAgent: document.getElementById('customUserAgent').value,
        customHeaders: [],
        basicAuth: {
            enabled: document.getElementById('basicAuthEnabled').checked,
            username: document.getElementById('basicAuthUsername').value,
            password: document.getElementById('basicAuthPassword').value
        },
        checkCanonical: document.getElementById('checkCanonical').checked,
        followRedirects: document.getElementById('followRedirects').checked,
        ignoreSSL: document.getElementById('ignoreSSL').checked
    };
    
    // Collect custom headers
    const headerItems = document.querySelectorAll('.custom-header-item');
    headerItems.forEach(item => {
        const name = item.querySelector('.header-name').value.trim();
        const value = item.querySelector('.header-value').value.trim();
        if (name && value) {
            settings.customHeaders.push({ name, value });
        }
    });
    
    // Save to storage
    chrome.storage.sync.set({ proSettings: settings }, function() {
        showAlert('Settings saved successfully!', 'success');
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
} 