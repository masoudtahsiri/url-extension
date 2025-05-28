document.addEventListener('DOMContentLoaded', function() {
    const progressSection = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const resultsSection = document.getElementById('resultsSection');
    const processedUrls = document.getElementById('processedUrls');
    const totalUrls = document.getElementById('totalUrls');
    const downloadButton = document.getElementById('downloadButton');
    const resultsTable = document.getElementById('resultsTable');
    const statusFilter = document.getElementById('statusFilter');
    let allResults = []; // Store all results for filtering

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
        filterResults(); // Apply initial filter
        resultsSection.style.display = 'block';
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

        // Update filter options
        statusFilter.innerHTML = `
            <option value="all">All Status Codes</option>
            ${sortedCodes.map(code => `<option value="${code}">${code}</option>`).join('')}
        `;
    }

    function filterResults() {
        const selectedFilter = statusFilter.value;
        const tbody = resultsTable.querySelector('tbody');
        tbody.innerHTML = '';
        
        const filteredResults = allResults.filter(result => {
            if (selectedFilter === 'all') return true;
            
            // Check initial status
            if (result.status === parseInt(selectedFilter)) return true;
            
            // Check redirect chain statuses
            if (result.redirect_chain) {
                return result.redirect_chain.some(redirect => 
                    redirect.status === parseInt(selectedFilter)
                );
            }
            
            return false;
        });
        
        filteredResults.forEach(result => {
            const row = tbody.insertRow();
            let statusCodes = [];
            
            if (result.status) {
                statusCodes.push(result.status);
            }
            if (result.redirect_chain && result.redirect_chain.length > 0) {
                result.redirect_chain.forEach((redirect, index) => {
                    if (redirect.status) {
                        statusCodes.push(redirect.status);
                    }
                    if (redirect.final_status && index === result.redirect_chain.length - 1) {
                        statusCodes.push(redirect.final_status);
                    }
                });
            } else if (result.final_status && result.final_status !== result.status) {
                statusCodes.push(result.final_status);
            }
            
            const cells = [
                normalizeUrl(result.source_url || result.url || ''),
                normalizeUrl(result.target_url || result.final_url || ''),
                statusCodes.join(' → '),
                result.hasRedirect ? 'yes' : 'no'
            ];
            
            cells.forEach(cellData => {
                const cell = row.insertCell();
                cell.textContent = cellData;
            });
        });
    }

    function escapeCSV(value) {
        if (typeof value !== 'string') value = String(value ?? '');
        if (value.includes('"')) value = value.replace(/"/g, '""');
        if (/[",\n]/.test(value)) value = `"${value}"`;
        return value;
    }

    function normalizeUrl(url) {
        try {
            // Add https:// if missing
            if (!/^https?:\/\//i.test(url)) {
                url = 'https://' + url;
            }
            const u = new URL(url);
            // Remove www. from hostname
            let host = u.hostname.replace(/^www\./, '');
            // Remove trailing slash from pathname
            let path = u.pathname.replace(/\/$/, '');
            // Keep query string, ignore fragment
            let query = u.search;
            return `${host}${path}${query}`;
        } catch (e) {
            return url; // fallback if URL parsing fails
        }
    }

    // Get URLs from chrome.storage
    chrome.storage.local.get(['urlsToCheck'], function(result) {
        if (result.urlsToCheck && result.urlsToCheck.length > 0) {
            const urls = result.urlsToCheck;
            processUrls(urls);
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
            const results = [];
            for (let i = 0; i < uniqueUrls.length; i++) {
                const url = uniqueUrls[i];
                try {
                    const response = await chrome.runtime.sendMessage({
                        action: 'checkUrl',
                        url: url
                    });
                    if (response && response.status === 'success') {
                        // Attach normalized URL for display/export
                        response.data.normalized_url = normalizeUrl(url);
                        results.push(response.data);
                    }
                } catch (error) {
                    console.error(`Error checking URL ${url}:`, error);
                }
                
                updateProgress(i + 1, uniqueUrls.length);
            }

            displayResults(results);
            
            // Create CSV content
            const csvContent = [
                'Original URL,Final URL,Status Codes,Has Redirect',
                ...results.map(result => {
                    let statusCodes = [];
                    if (result.status) {
                        statusCodes.push(result.status);
                    }
                    if (result.redirect_chain && result.redirect_chain.length > 0) {
                        result.redirect_chain.forEach((redirect, index) => {
                            if (redirect.status) {
                                statusCodes.push(redirect.status);
                            }
                            if (redirect.final_status && index === result.redirect_chain.length - 1) {
                                statusCodes.push(redirect.final_status);
                            }
                        });
                    } else if (result.final_status && result.final_status !== result.status) {
                        statusCodes.push(result.final_status);
                    }
                    return [
                        escapeCSV(normalizeUrl(result.source_url || result.url || '')),
                        escapeCSV(normalizeUrl(result.target_url || result.final_url || '')),
                        escapeCSV(statusCodes.join(' → ')),
                        escapeCSV(result.hasRedirect ? 'yes' : 'no')
                    ].join(',');
                })
            ].join('\n');

            // Create download link
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            downloadButton.href = url;
            downloadButton.download = 'url-check-results.csv';
            downloadButton.style.display = 'block';

            showAlert(`${urls.length} URLs processed successfully!`, 'success');
        } catch (error) {
            console.error('Error:', error);
            showAlert('An error occurred while processing URLs', 'danger');
        }
    }

    // Add event listener for status filter
    if (statusFilter) {
        statusFilter.addEventListener('change', filterResults);
    }
}); 