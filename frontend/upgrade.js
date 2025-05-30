document.addEventListener('DOMContentLoaded', function() {
    // Check if already pro
    chrome.storage.sync.get(['isPro'], function(result) {
        if (result.isPro) {
            window.location.href = chrome.runtime.getURL('frontend/settings.html');
            return;
        }
    });

    // Add event listener for upgrade button
    document.getElementById('upgradeBtn').addEventListener('click', async function() {
        // For now, simulate the purchase for testing
        // In production, this would trigger Chrome Web Store purchase flow
        
        const btn = this;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Processing...';
        
        // Simulate purchase delay
        setTimeout(() => {
            if (confirm('Simulate successful purchase for testing?')) {
                // Mark as Pro
                chrome.storage.sync.set({ isPro: true }, function() {
                    // Initialize stats
                    chrome.storage.local.set({ 
                        totalChecks: 0,
                        sheetsExports: 0
                    }, function() {
                        // Redirect to settings
                        window.location.href = chrome.runtime.getURL('frontend/settings.html');
                    });
                });
            } else {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-crown me-2"></i>Upgrade Now';
            }
        }, 1000);
    });
}); 