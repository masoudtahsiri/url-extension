// frontend/shared-utils.js
// Shared utilities used by both popup.js and results.js

function normalizeUrl(url) {
    try {
        // Only add https:// if missing, don't normalize anything else
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }
        return url;
    } catch (e) {
        return url; // fallback if URL parsing fails
    }
}

function escapeCSV(value) {
    if (typeof value !== 'string') value = String(value ?? '');
    if (value.includes('"')) value = value.replace(/"/g, '""');
    if (/[",\n]/.test(value)) value = `"${value}"`;
    return value;
}

function extractStatusCodes(result) {
    const statusCodes = [];
    
    // If there's a redirect chain, use it for all status codes
    if (result.redirect_chain && result.redirect_chain.length > 0) {
        // Add initial status first
        if (result.status) {
            statusCodes.push(result.status);
        }
        
        // Add final status from the last redirect
        const lastRedirect = result.redirect_chain[result.redirect_chain.length - 1];
        if (lastRedirect.final_status) {
            statusCodes.push(lastRedirect.final_status);
        }
    } else {
        // No redirects - just add the status
        if (result.status) {
            statusCodes.push(result.status);
        }
    }
    
    return statusCodes;
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