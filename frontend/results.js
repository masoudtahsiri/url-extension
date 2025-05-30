// frontend/results.js - Updated for Pro features

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
    let proSettings = null;
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
        updateStatusFilter(results); // Update filter options based on results
        updateTableHeaders(); // Update table headers for pro features
        filterResults(); // Apply initial filter
        resultsSection.style.display = 'block';
    }

    function updateTableHeaders() {
        if (!isPro) return;
        
        const thead = resultsTable.querySelector('thead tr');
        
        // Check if we need to add canonical column
        const hasCanonical = allResults.some(r => r.canonical_url);
        if (hasCanonical && !document.getElementById('canonicalHeader')) {
            const canonicalTh = document.createElement('th');
            canonicalTh.id = 'canonicalHeader';
            canonicalTh.textContent = 'Canonical URL';
            
            // Insert before the last column (Has Redirect)
            const lastTh = thead.lastElementChild;
            thead.insertBefore(canonicalTh, lastTh);
        }
        
        // Check if we need to add user agent column
        const hasUserAgent = allResults.some(r => r.user_agent && r.user_agent !== 'default');
        if (hasUserAgent && !document.getElementById('userAgentHeader')) {
            const uaTh = document.createElement('th');
            uaTh.id = 'userAgentHeader';
            uaTh.textContent = 'User Agent';
            
            // Insert before the last column
            const lastTh = thead.lastElementChild;
            thead.insertBefore(uaTh, lastTh);
        }
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
    }

    function filterResults() {
        const searchTerm = urlSearch.value.toLowerCase();
        const tbody = resultsTable.querySelector('tbody');
        tbody.innerHTML = '';
        const filteredResults = allResults.filter(result => {
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
        
        const hasCanonical = allResults.some(r => r.canonical_url);
        const hasUserAgent = allResults.some(r => r.user_agent && r.user_agent !== 'default');
        
        filteredResults.forEach(result => {
            const row = tbody.insertRow();
            const statusCodes = extractStatusCodes(result); // Using shared function
            
            const cells = [
                normalizeUrl(result.source_url || result.url || ''), // Using shared function
                normalizeUrl(result.target_url || result.final_url || ''), // Using shared function
                statusCodes.join(' → ')
            ];
            
            // Add canonical URL if pro and available
            if (isPro && hasCanonical) {
                if (result.canonical_url) {
                    const canonicalCell = result.canonical_url;
                    const matches = result.canonical_matches ? ' ✓' : ' ✗';
                    cells.push(canonicalCell + matches);
                } else {
                    cells.push('-');
                }
            }
            
            // Add user agent if pro and available
            if (isPro && hasUserAgent) {
                cells.push(result.user_agent || 'default');
            }
            
            // Add has redirect
            cells.push(result.hasRedirect ? 'yes' : 'no');
            
            cells.forEach((cellData, index) => {
                const cell = row.insertCell();
                if (isPro && hasCanonical && index === 3) {
                    // Canonical URL cell - add color coding
                    cell.innerHTML = cellData;
                    if (cellData.includes('✓')) {
                        cell.style.color = '#00A878';
                    } else if (cellData.includes('✗')) {
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

    // Get URLs and settings from chrome.storage
    chrome.storage.local.get(['urlsToCheck', 'proSettingsToUse'], function(result) {
        if (result.urlsToCheck && result.urlsToCheck.length > 0) {
            const urls = result.urlsToCheck;
            proSettings = result.proSettingsToUse || {};
            
            // Check if user is pro
            chrome.storage.sync.get(['isPro'], function(syncResult) {
                isPro = syncResult.isPro || false;
                
                // Show pro indicator if applicable
                if (isPro) {
                    const header = document.querySelector('.card-header h2');
                    if (header) {
                        header.innerHTML += ' <span class="badge bg-warning text-dark ms-2" style="font-size: 0.7rem;">PRO</span>';
                    }
                }
                
                processUrls(urls);
            });
        } else {
            showAlert('No URLs to check', 'warning');
        }
    });

    async function processUrls(urls) {
        // Deduplicate normalized URLs
        const seen = new Set();
        const uniqueUrls = urls.filter(url => {
            const norm = normalizeUrl(url);
            if (seen.has(norm)) return false;
            seen.add(norm);
            return true;
        });
        updateProgress(0, uniqueUrls.length);
        
        try {
            // Process URLs one by one
            const results = [];
            for (let i = 0; i < uniqueUrls.length; i++) {
                const url = uniqueUrls[i];
                try {
                    const response = await chrome.runtime.sendMessage({
                        action: 'checkUrl',
                        url: url,
                        proSettings: proSettings
                    });
                    if (response && response.status === 'success') {
                        results.push(response.data);
                    }
                } catch (error) {
                    console.error(`Error checking URL ${url}:`, error);
                }
                
                updateProgress(i + 1, uniqueUrls.length);
            }

            displayResults(results);
            createDownloadLink(results);
            showAlert(`${uniqueUrls.length} URLs processed successfully!`, 'success');
        } catch (error) {
            console.error('Error:', error);
            showAlert('An error occurred while processing URLs', 'danger');
        }
    }

    function createDownloadLink(results) {
        // Create CSV content with pro features
        const headers = ['Original URL', 'Final URL', 'Status Codes'];
        
        if (isPro && results.some(r => r.canonical_url)) {
            headers.push('Canonical URL', 'Canonical Matches');
        }
        
        if (isPro && results.some(r => r.user_agent && r.user_agent !== 'default')) {
            headers.push('User Agent');
        }
        
        headers.push('Has Redirect');
        
        const csvContent = [
            headers.join(','),
            ...results.map(result => {
                const statusCodes = extractStatusCodes(result);
                const row = [
                    escapeCSV(normalizeUrl(result.source_url || result.url || '')),
                    escapeCSV(normalizeUrl(result.target_url || result.final_url || '')),
                    escapeCSV(statusCodes.join(' → '))
                ];
                
                if (isPro && results.some(r => r.canonical_url)) {
                    row.push(
                        escapeCSV(result.canonical_url || ''),
                        escapeCSV(result.canonical_matches ? 'yes' : 'no')
                    );
                }
                
                if (isPro && results.some(r => r.user_agent && r.user_agent !== 'default')) {
                    row.push(escapeCSV(result.user_agent || 'default'));
                }
                
                row.push(escapeCSV(result.hasRedirect ? 'yes' : 'no'));
                
                return row.join(',');
            })
        ].join('\n');

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        downloadButton.href = url;
        downloadButton.download = `url-check-results-${new Date().toISOString().slice(0, 10)}.csv`;
        downloadButton.style.display = 'block';
    }

    // Excel-style dropdown logic
    if (statusFilterIcon && statusFilterDropdown) {
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
            // Dynamically expand table height if needed
            setTimeout(() => {
                if (tableContainer) {
                    // Save original minHeight
                    if (originalTableMinHeight === null) {
                        originalTableMinHeight = tableContainer.style.minHeight;
                    }
                    // Calculate space below icon to bottom of table container
                    const iconRect = statusFilterIcon.getBoundingClientRect();
                    const tableRect = tableContainer.getBoundingClientRect();
                    const dropdownHeight = statusFilterDropdown.offsetHeight;
                    const spaceBelowIcon = tableRect.bottom - iconRect.bottom;
                    if (dropdownHeight > spaceBelowIcon) {
                        // Increase table minHeight so dropdown fits
                        const needed = dropdownHeight - spaceBelowIcon + tableContainer.offsetHeight;
                        tableContainer.style.minHeight = needed + 'px';
                    }
                }
            }, 0);
        });
        // Handle selection
        statusFilterDropdown.addEventListener('click', function(e) {
            const item = e.target.closest('.dropdown-item');
            if (item) {
                selectedStatus = item.getAttribute('data-value');
                statusFilterDropdown.style.display = 'none';
                updateStatusFilter(allResults); // update highlight
                filterResults();
                // Reset table min-height
                if (tableContainer && originalTableMinHeight !== null) tableContainer.style.minHeight = originalTableMinHeight;
            }
        });
        // Hide dropdown on outside click
        document.addEventListener('click', function(e) {
            if (!statusFilterDropdown.contains(e.target) && e.target !== statusFilterIcon) {
                statusFilterDropdown.style.display = 'none';
                // Reset table min-height
                if (tableContainer && originalTableMinHeight !== null) tableContainer.style.minHeight = originalTableMinHeight;
            }
        });
    }

    if (urlSearch) {
        urlSearch.addEventListener('input', filterResults);
    }
});

/* Add this CSS at the end of the file for highlight */
const style = document.createElement('style');
style.innerHTML = `.selected-filter { background: #e6f7ec !important; font-weight: bold; color: #046A38; }`;
document.head.appendChild(style); 