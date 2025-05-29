document.getElementById('purchaseBtn').addEventListener('click', async function() {
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
                // Redirect to settings
                window.location.href = chrome.runtime.getURL('frontend/settings.html');
            });
        } else {
            btn.disabled = false;
            btn.innerHTML = 'Purchase via Chrome Web Store';
        }
    }, 1000);
}); 