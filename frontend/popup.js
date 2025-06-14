// frontend/popup.js - Secure version with license validation

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('urlForm');
    const submitBtn = document.getElementById('submitBtn');
    const urlCount = document.getElementById('urlCount');
    const urlsTextarea = document.getElementById('urls');
    const csvFileInput = document.getElementById('csvFile');
    
    let isPro = false;
    const URL_LIMIT = 100; // Free version limit

    // Check license status via background script
    async function checkProStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ 
                action: 'validateLicense' 
            });
            isPro = response.isPro === true;
            updateUI();
        } catch (error) {
            console.error('License validation error:', error);
            isPro = false;
            updateUI();
        }
    }

    // Initial license check
    checkProStatus();

    // Re-check when window gains focus
    window.addEventListener('focus', checkProStatus);

    function updateUI() {
        const settingsBtn = document.getElementById('settingsBtn');
        const upgradeBtn = document.getElementById('upgradeBtn');
        
        if (settingsBtn) {
            // Keep settings button clean
            settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
        }
        
        // Handle upgrade button / PRO badge
        if (upgradeBtn) {
            if (isPro) {
                // Replace upgrade button with PRO badge
                upgradeBtn.className = 'btn btn-warning';
                upgradeBtn.innerHTML = '<i class="fas fa-crown me-1"></i>PRO';
                upgradeBtn.disabled = true;
                upgradeBtn.style.cursor = 'default';
                upgradeBtn.style.display = 'block';
                upgradeBtn.removeEventListener('click', handleUpgradeClick);
            } else {
                // Show upgrade button for non-pro users
                upgradeBtn.style.display = 'block';
                upgradeBtn.innerHTML = '<i class="fas fa-crown me-2"></i>Upgrade to Pro';
                upgradeBtn.disabled = false;
                upgradeBtn.style.cursor = 'pointer';
                upgradeBtn.removeEventListener('click', handleUpgradeClick); // Remove old listener
                upgradeBtn.addEventListener('click', handleUpgradeClick); // Add new listener
            }
        }
        
        // Update URL count if textarea has content
        if (urlsTextarea && urlCount) {
            const count = countUrls(urlsTextarea.value);
            updateUrlCount(count);
        }
    }

    function countUrls(text) {
        return text.split('\n').filter(url => url.trim()).length;
    }

    if (urlsTextarea && urlCount) {
        urlsTextarea.addEventListener('input', function(e) {
            const count = countUrls(e.target.value);
            updateUrlCount(count);
        });
    }

    function updateUrlCount(count) {
        if (!urlCount) return;
        
        // Show the element only if there are URLs
        urlCount.style.display = count > 0 ? 'block' : 'none';
        
        if (isPro) {
            urlCount.textContent = `You have entered ${count} URLs.`;
            urlCount.className = 'form-text text-primary';
        } else {
            if (count > URL_LIMIT) {
                urlCount.innerHTML = `You have entered ${count} URLs. <span class="text-warning">Only the first ${URL_LIMIT} will be checked in free version.</span>`;
                urlCount.className = 'form-text text-warning';
            } else {
                urlCount.textContent = `You have entered ${count} URLs (${URL_LIMIT - count} remaining).`;
                urlCount.className = 'form-text text-primary';
            }
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        
        // Re-validate license before processing
        await checkProStatus();
        
        const fileInput = document.getElementById('csvFile');
        const urlsText = urlsTextarea ? urlsTextarea.value.trim() : '';
        let urls = [];

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                const content = e.target.result;
                const lines = content.split('\n');
                // Clean each URL by trimming whitespace and carriage returns
                urls = lines.slice(1)
                    .map(url => url.trim())
                    .filter(url => {
                        // Remove empty lines and invalid URLs
                        if (!url || url.length === 0) return false;
                        
                        // Basic URL validation
                        try {
                            // Add https:// if no protocol is specified
                            if (!/^https?:\/\//i.test(url)) {
                                url = 'https://' + url;
                            }
                            new URL(url);
                            return true;
                        } catch (e) {
                            console.warn(`Invalid URL skipped: ${url}`);
                            return false;
                        }
                    });
                
                if (urls.length === 0) {
                    showAlert('No valid URLs found in the CSV file', 'warning');
                    return;
                }

                // Apply URL limit for free users
                if (!isPro && urls.length > URL_LIMIT) {
                    const limitedUrls = urls.slice(0, URL_LIMIT);
                    const skipped = urls.length - URL_LIMIT;
                    
                    const confirmed = confirm(
                        `You have ${urls.length} URLs but the free version is limited to ${URL_LIMIT} URLs.\n\n` +
                        `Only the first ${URL_LIMIT} URLs will be checked. ${skipped} URLs will be skipped.\n\n` +
                        `Upgrade to Pro for unlimited URL checks.\n\n` +
                        `Continue with ${URL_LIMIT} URLs?`
                    );
                    
                    if (!confirmed) {
                        return;
                    }
                    
                    urls = limitedUrls;
                }

                console.log(`Processing ${urls.length} URLs`);
                openResultsTab(urls);
            };

            reader.onerror = function() {
                showAlert('Error reading the CSV file', 'danger');
            };

            reader.readAsText(file);
            return;
        }
        
        if (urlsText) {
            urls = urlsText.split('\n').filter(url => url.trim());
        }

        if (urls.length === 0) {
            showAlert('Please provide at least one URL to check', 'warning');
            return;
        }

        // Apply URL limit for free users
        if (!isPro && urls.length > URL_LIMIT) {
            const limitedUrls = urls.slice(0, URL_LIMIT);
            const skipped = urls.length - URL_LIMIT;
            
            const confirmed = confirm(
                `You have ${urls.length} URLs but the free version is limited to ${URL_LIMIT} URLs.\n\n` +
                `Only the first ${URL_LIMIT} URLs will be checked. ${skipped} URLs will be skipped.\n\n` +
                `Upgrade to Pro for unlimited URL checks.\n\n` +
                `Continue with ${URL_LIMIT} URLs?`
            );
            
            if (!confirmed) {
                return;
            }
            
            urls = limitedUrls;
        }

        openResultsTab(urls);
    }

    function openResultsTab(urls) {
        // Store URLs in chrome.storage
        chrome.storage.local.set({ 
            urlsToCheck: urls
        }, function() {
            // Get the extension's URL
            const resultsUrl = chrome.runtime.getURL('frontend/results.html');
            // Open results page in a new tab
            chrome.tabs.create({ url: resultsUrl });
        });
    }

    if (form) {
        form.addEventListener('submit', handleSubmit);
    }

    // Add settings button handler
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', handleSettingsClick);
    }

    // Add upgrade button handler
    const upgradeBtn = document.getElementById('upgradeBtn');
    if (upgradeBtn && !isPro) {
        upgradeBtn.addEventListener('click', handleUpgradeClick);
    }
});

async function handleSettingsClick() {
    // Always open settings page
    chrome.tabs.create({ 
        url: chrome.runtime.getURL('frontend/settings.html') 
    });
}

function handleUpgradeClick() {
    // Open upgrade page
    chrome.tabs.create({ 
        url: chrome.runtime.getURL('frontend/upgrade.html') 
    });
}

function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const container = document.querySelector('.card-body');
    container.insertBefore(alertDiv, container.firstChild);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
} 