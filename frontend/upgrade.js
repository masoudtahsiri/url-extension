// frontend/upgrade.js - Production version

document.addEventListener('DOMContentLoaded', async function() {
    // Check if already pro
    try {
        const response = await chrome.runtime.sendMessage({ 
            action: 'validateLicense' 
        });
        
        if (response.isPro === true) {
            // Already Pro, redirect to settings
            window.location.href = chrome.runtime.getURL('frontend/settings.html');
            return;
        }
    } catch (error) {
        console.error('License check error:', error);
    }

    // Add event listener for upgrade button
    document.getElementById('upgradeBtn').addEventListener('click', async function() {
        const btn = this;
        const originalContent = btn.innerHTML;
        
        // Disable button and show loading
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-external-link-alt me-2"></i>Opening Chrome Web Store...';
        
        // IMPORTANT: Before publishing, this will open the Chrome Web Store page
        // For development/testing, you can use the test mode
        const isDevelopment = true; // Developer mode enabled
        
        if (isDevelopment) {
            // Development mode - simulate purchase
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Processing...';
            
            setTimeout(() => {
                if (confirm('Simulate successful purchase for testing?')) {
                    // This won't actually grant a license in production
                    // It's just for UI testing
                    btn.innerHTML = '<i class="fas fa-check me-2"></i>Test Purchase Complete!';
                    
                    setTimeout(() => {
                        window.location.href = chrome.runtime.getURL('frontend/settings.html');
                    }, 1500);
                } else {
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                }
            }, 1000);
        } else {
            // Production mode - open Chrome Web Store
            const extensionId = chrome.runtime.id;
            const webStoreUrl = `https://chrome.google.com/webstore/detail/${extensionId}`;
            
            // Open Chrome Web Store in new tab
            chrome.tabs.create({ url: webStoreUrl });
            
            // Reset button after a delay
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalContent;
            }, 2000);
            
            // Listen for when window regains focus to check if purchased
            let checkingPurchase = false;
            const checkPurchase = async () => {
                if (checkingPurchase) return;
                
                checkingPurchase = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Checking license...';
                
                try {
                    const response = await chrome.runtime.sendMessage({ 
                        action: 'validateLicense' 
                    });
                    
                    if (response.isPro === true) {
                        // Purchase successful!
                        btn.innerHTML = '<i class="fas fa-check me-2"></i>Purchase Successful!';
                        
                        // Initialize stats
                        chrome.storage.local.set({ 
                            _tc: btoa('0'), // Encrypted total checks
                            _se: btoa('0')  // Encrypted sheets exports
                        });
                        
                        setTimeout(() => {
                            window.location.href = chrome.runtime.getURL('frontend/settings.html');
                        }, 1500);
                        
                        // Remove listener
                        window.removeEventListener('focus', checkPurchase);
                    } else {
                        btn.disabled = false;
                        btn.innerHTML = originalContent;
                    }
                } catch (error) {
                    console.error('License check error:', error);
                    btn.disabled = false;
                    btn.innerHTML = originalContent;
                } finally {
                    checkingPurchase = false;
                }
            };
            
            // Check when window regains focus
            window.addEventListener('focus', checkPurchase);
        }
    });
}); 