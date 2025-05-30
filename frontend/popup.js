// frontend/popup.js - Updated with URL limits for free version

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('urlForm');
    const submitBtn = document.getElementById('submitBtn');
    const urlCount = document.getElementById('urlCount');
    const urlsTextarea = document.getElementById('urls');
    const csvFileInput = document.getElementById('csvFile');
    
    let isPro = false;
    const URL_LIMIT = 100; // Free version limit

    // Check if user is pro
    chrome.storage.sync.get(['isPro'], function(result) {
        isPro = result.isPro || false;
        updateUI();
    });

    function updateUI() {
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            if (isPro) {
                settingsBtn.innerHTML = '<i class="fas fa-cog"></i> <span class="badge bg-warning text-dark" style="font-size: 0.6rem;">PRO</span>';
            } else {
                settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
            }
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
        // Store URLs and pro status in chrome.storage
        chrome.storage.local.set({ 
            urlsToCheck: urls,
            isPro: isPro
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
});

async function handleSettingsClick() {
    // Check if user has Pro
    const { isPro } = await chrome.storage.sync.get('isPro');
    
    if (isPro) {
        // Open settings page
        chrome.tabs.create({ 
            url: chrome.runtime.getURL('frontend/settings.html') 
        });
    } else {
        // Open upgrade page
        chrome.tabs.create({ 
            url: chrome.runtime.getURL('frontend/upgrade.html') 
        });
    }
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