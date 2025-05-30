// frontend/results.js - Updated with Pro features (filtering, Google Sheets export)

document.addEventListener('DOMContentLoaded', function() {
    const progressSection = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const resultsSection = document.getElementById('resultsSection');
    const processedUrls = document.getElementById('processedUrls');
    const totalUrls = document.getElementById('totalUrls');
    const downloadButton = document.getElementById('downloadButton');
    const resultsTable = document.getElementById('resultsTable');
    const statusFilterIcon = document.getElementById('statusFilterIcon');
    const statusFilterDropdown = document.getElementById('statusFilterDropdown');
    const urlSearch = document.getElementById('urlSearch');
    let allResults = []; // Store all results for filtering
    let selectedStatus = 'all';
    let isPro = false;
    const tableContainer = document.querySelector('.table-responsive');
    let originalTableMinHeight = null;

    // Listen for progress updates from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'progressUpdate') {
            updateProgress(request.processed, request.total);
        }
    });

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

    function updateProgress(current, total) {
        const percentage = (current / total) * 100;
        progressBar.style.width = `${percentage}%`;
        processedUrls.textContent = current;
        totalUrls.textContent = total;
    }

    function displayResults(results) {
        allResults = results; // Store all results
        
        // Only show filtering for Pro users
        if (isPro) {
            // Show search box
            const searchContainer = document.querySelector('.col-md-4');
            if (searchContainer) searchContainer.style.display = 'block';
            
            // Show status filter
            if (statusFilterIcon) statusFilterIcon.style.display = 'inline';
            
            updateStatusFilter(results); // Update filter options based on results
        } else {
            // Hide filtering for free users
            const searchContainer = document.querySelector('.col-md-4');
            if (searchContainer) searchContainer.style.display = 'none';
            
            // Hide status filter icon
            if (statusFilterIcon) statusFilterIcon.style.display = 'none';
        }
        
        filterResults(); // Apply initial filter (or show all for free)
        resultsSection.style.display = 'block';
        
        // Add export buttons
        addExportButtons();
    }

    function addExportButtons() {
        const existingContainer = document.getElementById('exportButtonsContainer');
        if (existingContainer) existingContainer.remove();
        
        const container = document.createElement('div');
        container.id = 'exportButtonsContainer';
        container.style.marginTop = '1rem';
        container.style.textAlign = 'center';
        
        // CSV button for all users
        const csvBtn = document.createElement('a');
        csvBtn.href = '#';
        csvBtn.className = 'btn btn-primary me-2';
        csvBtn.id = 'downloadButton';
        csvBtn.innerHTML = '<i class="fas fa-download me-2"></i>Download CSV';
        csvBtn.addEventListener('click', downloadCSV);
        container.appendChild(csvBtn);
        
        // Google Sheets button for Pro users only
        if (isPro) {
            const sheetsBtn = document.createElement('button');
            sheetsBtn.className = 'btn btn-success';
            sheetsBtn.style.minWidth = '200px'; // Add minimum width to prevent layout shift
            sheetsBtn.innerHTML = '<i class="fas fa-table me-2"></i>Export to Google Sheets';
            sheetsBtn.addEventListener('click', exportToGoogleSheets);
            container.appendChild(sheetsBtn);
        }
        
        resultsSection.appendChild(container);
    }

    function updateStatusFilter(results) {
        // Get unique status codes from results
        const statusCodes = new Set();
        results.forEach(result => {
            if (result.status) {
                statusCodes.add(result.status);
            }
            if (result.redirect_chain) {
                result.redirect_chain.forEach(redirect => {
                    if (redirect.status) {
                        statusCodes.add(redirect.status);
                    }
                });
            }
        });
        
        // Sort status codes
        const sortedCodes = Array.from(statusCodes).sort((a, b) => a - b);
        
        // Build dropdown HTML
        let html = '';
        html += `<div class='dropdown-item${selectedStatus==='all' ? ' selected-filter' : ''}' data-value='all' style='cursor:pointer; padding: 0.25rem 1rem; margin: 0;'>All Status Codes</div>`;
        sortedCodes.forEach(code => {
            html += `<div class='dropdown-item${selectedStatus==code ? ' selected-filter' : ''}' data-value='${code}' style='cursor:pointer; padding: 0.25rem 1rem; margin: 0;'>${code}</div>`;
        });
        statusFilterDropdown.innerHTML = html;
        
        // Update filter badge
        updateFilterBadge();
    }

    function updateFilterBadge() {
        // Remove existing badge if any
        const existingBadge = document.getElementById('filterBadge');
        if (existingBadge) {
            existingBadge.remove();
        }
        
        // Add badge if filter is active
        if (selectedStatus !== 'all') {
            const th = statusFilterIcon.closest('th');
            const badge = document.createElement('span');
            badge.id = 'filterBadge';
            badge.style.cssText = `
                display: inline-block;
                margin-left: 8px;
                padding: 2px 8px;
                background: #00A878;
                color: white;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
            `;
            badge.textContent = selectedStatus;
            th.appendChild(badge);
        }
    }

    function filterResults() {
        const searchTerm = isPro && urlSearch ? urlSearch.value.toLowerCase() : '';
        const tbody = resultsTable.querySelector('tbody');
        tbody.innerHTML = '';
        
        let filteredResults = allResults;
        
        // Only apply filters for Pro users
        if (isPro) {
            filteredResults = allResults.filter(result => {
                // Status code filter
                let statusMatch = true;
                if (selectedStatus !== 'all') {
                    statusMatch = false;
                    if (result.status === parseInt(selectedStatus)) {
                        statusMatch = true;
                    }
                    if (result.redirect_chain) {
                        statusMatch = result.redirect_chain.some(redirect => 
                            redirect.status === parseInt(selectedStatus)
                        );
                    }
                }
                // URL search filter
                const urlMatch = searchTerm === '' || 
                    (result.source_url && result.source_url.toLowerCase().includes(searchTerm)) ||
                    (result.target_url && result.target_url.toLowerCase().includes(searchTerm));
                return statusMatch && urlMatch;
            });
        }
        
        filteredResults.forEach(result => {
            const row = tbody.insertRow();
            const statusCodes = extractStatusCodes(result);
            
            const cells = [
                normalizeUrl(result.source_url || result.url || ''),
                normalizeUrl(result.target_url || result.final_url || ''),
                statusCodes.join(' → '),
                result.hasRedirect ? 'yes' : 'no'
            ];
            
            cells.forEach((cellData, index) => {
                const cell = row.insertCell();
                if (isPro && index === 3) {
                    // Has Redirect cell - add color coding
                    cell.textContent = cellData;
                    if (cellData === 'yes') {
                        cell.style.color = '#00A878';
                    } else {
                        cell.style.color = '#EF4444';
                    }
                } else {
                    cell.textContent = cellData;
                }
            });
        });
    }

    function escapeCSV(value) {
        if (typeof value !== 'string') value = String(value ?? '');
        if (value.includes('"')) value = value.replace(/"/g, '""');
        if (/[",\n]/.test(value)) value = `"${value}"`;
        return value;
    }

    function showToast(message, type = 'success') {
        // Remove any existing toast
        const existingToast = document.getElementById('customToast');
        if (existingToast) {
            existingToast.remove();
        }
        
        // Create toast element
        const toast = document.createElement('div');
        toast.id = 'customToast';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#00A878' : '#EF4444'};
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: center;
            gap: 12px;
            max-width: 400px;
            z-index: 9999;
            animation: slideInFromTop 0.3s ease-out;
        `;
        
        // Add icon
        const icon = document.createElement('i');
        icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        icon.style.fontSize = '20px';
        
        // Add message
        const text = document.createElement('span');
        text.textContent = message;
        text.style.fontSize = '14px';
        text.style.fontWeight = '500';
        
        toast.appendChild(icon);
        toast.appendChild(text);
        document.body.appendChild(toast);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOutToTop 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Add CSS animation (updated for top position)
    const style = document.createElement('style');
    style.innerHTML += `
        @keyframes slideInFromTop {
            from {
                transform: translateY(-100%);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
        @keyframes slideOutToTop {
            from {
                transform: translateY(0);
                opacity: 1;
            }
            to {
                transform: translateY(-100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    function downloadCSV(e) {
        e.preventDefault();
        
        const headers = ['Original URL', 'Final URL', 'Status Codes', 'Has Redirect'];
        
        const csvContent = [
            headers.join(','),
            ...allResults.map(result => {
                const statusCodes = extractStatusCodes(result);
                const row = [
                    escapeCSV(normalizeUrl(result.source_url || result.url || '')),
                    escapeCSV(normalizeUrl(result.target_url || result.final_url || '')),
                    escapeCSV(statusCodes.join(' → ')),
                    escapeCSV(result.hasRedirect ? 'yes' : 'no')
                ];
                return row.join(',');
            })
        ].join('\n');

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = `httpscanr-results-${new Date().toISOString().slice(0, 10)}.csv`;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        // Show toast notification
        showToast(`CSV file downloaded successfully!`, 'success');
    }

    async function exportToGoogleSheets(event) {
        // Get the button and store original content
        const sheetsBtn = event.target.closest('button');
        const originalContent = sheetsBtn.innerHTML;
        const originalDisabled = sheetsBtn.disabled;
        
        // Set loading state
        sheetsBtn.disabled = true;
        sheetsBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Exporting...';
        
        try {
            // Get Google auth token
            const token = await getGoogleAuthToken();
            if (!token) {
                showAlert('Please authenticate with Google to export to Sheets', 'warning');
                return;
            }
            
            // Update button text as we progress
            sheetsBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Creating spreadsheet...';
            
            // Create spreadsheet
            const spreadsheetId = await createSpreadsheet(token);
            
            // Update button text
            sheetsBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Adding data...';
            
            // Prepare data
            const values = [
                ['Original URL', 'Final URL', 'Status Codes', 'Has Redirect'],
                ...allResults.map(result => {
                    const statusCodes = extractStatusCodes(result);
                    return [
                        normalizeUrl(result.source_url || result.url || ''),
                        normalizeUrl(result.target_url || result.final_url || ''),
                        statusCodes.join(' → '),
                        result.hasRedirect ? 'yes' : 'no'
                    ];
                })
            ];
            
            // Update spreadsheet
            await updateSpreadsheet(token, spreadsheetId, values);
            
            // Update button text
            sheetsBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Opening spreadsheet...';
            
            // Open spreadsheet
            const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
            chrome.tabs.create({ url: spreadsheetUrl });
            
            // Update export count
            chrome.storage.local.get(['sheetsExports'], function(result) {
                const newTotal = (result.sheetsExports || 0) + 1;
                chrome.storage.local.set({ sheetsExports: newTotal });
            });
            
            showAlert('Successfully exported to Google Sheets!', 'success');
            
            // Brief success state before restoring
            sheetsBtn.innerHTML = '<i class="fas fa-check me-2"></i>Exported!';
            setTimeout(() => {
                sheetsBtn.innerHTML = originalContent;
                sheetsBtn.disabled = originalDisabled;
            }, 2000);
            
        } catch (error) {
            console.error('Error exporting to Google Sheets:', error);
            showAlert('Failed to export to Google Sheets. Please try again.', 'danger');
            
            // Restore original state on error
            sheetsBtn.innerHTML = originalContent;
            sheetsBtn.disabled = originalDisabled;
        }
    }

    async function getGoogleAuthToken() {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    resolve(null);
                } else {
                    resolve(token);
                }
            });
        });
    }

    async function createSpreadsheet(token) {
        const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: {
                    title: `HTTP Status Check - ${new Date().toLocaleDateString()}`
                },
                sheets: [{
                    properties: {
                        title: 'Results'
                    }
                }]
            })
        });
        
        const data = await response.json();
        return data.spreadsheetId;
    }

    async function updateSpreadsheet(token, spreadsheetId, values) {
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:D${values.length}?valueInputOption=RAW`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    values: values
                })
            }
        );
        
        return response.json();
    }

    // Add this function after your other functions
    function setupFilterEventListeners() {
        // Excel-style dropdown logic (Pro only)
        if (isPro && statusFilterIcon && statusFilterDropdown) {
            statusFilterIcon.addEventListener('click', function(e) {
                e.stopPropagation();
                // Position dropdown below the icon, relative to the parent th
                const th = statusFilterIcon.closest('th');
                th.style.position = 'relative'; // Ensure parent th is positioned
                statusFilterDropdown.style.display = 'block';
                statusFilterDropdown.style.position = 'absolute';
                statusFilterDropdown.style.left = statusFilterIcon.offsetLeft + 'px';
                statusFilterDropdown.style.top = (statusFilterIcon.offsetTop + statusFilterIcon.offsetHeight + 2) + 'px';
                statusFilterDropdown.style.minWidth = '140px';
                // Rebuild dropdown to ensure highlight is correct
                updateStatusFilter(allResults);
            });
            
            // Handle selection
            statusFilterDropdown.addEventListener('click', function(e) {
                const item = e.target.closest('.dropdown-item');
                if (item) {
                    selectedStatus = item.getAttribute('data-value');
                    statusFilterDropdown.style.display = 'none';
                    updateStatusFilter(allResults); // update highlight
                    filterResults();
                }
            });
            
            // Hide dropdown on outside click
            document.addEventListener('click', function(e) {
                if (!statusFilterDropdown.contains(e.target) && e.target !== statusFilterIcon) {
                    statusFilterDropdown.style.display = 'none';
                }
            });
        }

        if (isPro && urlSearch) {
            urlSearch.addEventListener('input', filterResults);
        }
    }

    // Then update your chrome.storage.local.get callback:
    chrome.storage.local.get(['urlsToCheck', 'isPro'], function(result) {
        if (result.urlsToCheck && result.urlsToCheck.length > 0) {
            const urls = result.urlsToCheck;
            isPro = result.isPro || false;
            
            // Show pro indicator if applicable
            if (isPro) {
                const header = document.querySelector('.card-header h2');
                if (header) {
                    header.innerHTML += ' <span class="badge bg-warning text-dark ms-2" style="font-size: 0.7rem;">PRO</span>';
                }
            }
            
            // Setup filter event listeners AFTER isPro is determined
            setupFilterEventListeners();
            
            processUrls(urls);
        } else {
            showAlert('No URLs to check', 'warning');
        }
    });

    async function processUrls(urls) {
        updateProgress(0, urls.length);
        
        try {
            const results = [];
            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];
                try {
                    const response = await chrome.runtime.sendMessage({
                        action: 'checkUrl',
                        url: url
                    });
                    if (response && response.status === 'success') {
                        results.push(response.data);
                    }
                } catch (error) {
                    console.error(`Error checking URL ${url}:`, error);
                }
                
                updateProgress(i + 1, urls.length);
            }

            displayResults(results);
            showAlert(`${urls.length} URLs processed successfully!`, 'success');
            
            // Update statistics for Pro users
            if (isPro) {
                chrome.storage.local.get(['totalChecks'], function(result) {
                    const newTotal = (result.totalChecks || 0) + urls.length;
                    chrome.storage.local.set({ totalChecks: newTotal });
                });
            }
        } catch (error) {
            console.error('Error:', error);
            showAlert('An error occurred while processing URLs', 'danger');
        }
    }
});

/* Add this CSS at the end of the file for highlight */
const style = document.createElement('style');
style.innerHTML = `.selected-filter { background: #e6f7ec !important; font-weight: bold; color: #046A38; }`;
document.head.appendChild(style); 