// frontend/upgrade.js - Gumroad version

const isDevelopment = false; // Developer mode disabled for production

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
        btn.innerHTML = '<i class="fas fa-external-link-alt me-2"></i>Opening Gumroad...';
        
        // Your Gumroad checkout link
        const gumroadUrl = 'https://refactco.gumroad.com/l/zcmcp?wanted=true';
        
        // Open Gumroad in new tab
        chrome.tabs.create({ url: gumroadUrl });
        
        // Reset button after a delay
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }, 2000);
        
        // Listen for when window regains focus to check if they activated a license
        let checkingLicense = false;
        const checkLicense = async () => {
            if (checkingLicense) return;
            
            checkingLicense = true;
            
            try {
                const response = await chrome.runtime.sendMessage({ 
                    action: 'validateLicense' 
                });
                
                if (response.isPro === true) {
                    // License activated!
                    btn.innerHTML = '<i class="fas fa-check me-2"></i>License Activated!';
                    
                    setTimeout(() => {
                        window.location.href = chrome.runtime.getURL('frontend/settings.html');
                    }, 1500);
                    
                    // Remove listener
                    window.removeEventListener('focus', checkLicense);
                }
            } catch (error) {
                console.error('License check error:', error);
            } finally {
                checkingLicense = false;
            }
        };
        
        // Check when window regains focus
        window.addEventListener('focus', checkLicense);
    });
}); 