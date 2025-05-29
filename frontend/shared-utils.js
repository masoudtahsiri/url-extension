// frontend/shared-utils.js
// Shared utilities used by both popup.js and results.js

function normalizeUrl(url) {
    try {
        // Just add http:// if missing, don't do any other normalization
        if (!/^https?:\/\//i.test(url)) {
            url = 'http://' + url;
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
    
    // Always add the initial status
    if (result.status) {
        statusCodes.push(result.status);
    }
    
    // Add all redirect statuses
    if (result.redirect_chain && result.redirect_chain.length > 0) {
        result.redirect_chain.forEach((redirect, index) => {
            if (redirect.status) {
                statusCodes.push(redirect.status);
            }
            // Only add final_status for the last redirect
            if (redirect.final_status && index === result.redirect_chain.length - 1) {
                statusCodes.push(redirect.final_status);
            }
        });
    } else if (result.final_status && result.final_status !== result.status) {
        // If no redirect chain but a different final_status, add it
        statusCodes.push(result.final_status);
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