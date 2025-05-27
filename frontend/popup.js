document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('urlForm');
    const submitBtn = document.getElementById('submitBtn');
    const progressSection = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const resultsSection = document.getElementById('resultsSection');
    const processedUrls = document.getElementById('processedUrls');
    const totalUrls = document.getElementById('totalUrls');
    const downloadButton = document.getElementById('downloadButton');
    const urlCount = document.getElementById('urlCount');
    const resultsTable = document.getElementById('resultsTable');
    const urlsTextarea = document.getElementById('urls');
    const csvFileInput = document.getElementById('csvFile');

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
        const tbody = resultsTable.querySelector('tbody');
        tbody.innerHTML = '';
        
        results.forEach(result => {
            console.log('Result object:', result); // DEBUG LOG
            const row = tbody.insertRow();
            let statusCodes = [];
            
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
            
            const cells = [
                result.source_url || result.url || '',
                result.target_url || result.final_url || '',
                statusCodes.join(' → '),
                result.hasRedirect ? 'yes' : 'no'
            ];
            
            cells.forEach(cellData => {
                const cell = row.insertCell();
                cell.textContent = cellData;
            });
        });
        
        resultsSection.style.display = 'block';
    }

    function countUrls(text) {
        return text.split('\n').filter(url => url.trim()).length;
    }

    if (urlsTextarea && urlCount) {
        urlsTextarea.addEventListener('input', function(e) {
            const count = countUrls(e.target.value);
            urlCount.textContent = `You have entered ${count} URLs.`;
            urlCount.className = 'form-text text-primary';
        });
    }

    async function handleSubmit(event) {
        event.preventDefault();
        
        const fileInput = document.getElementById('csvFile');
        const urlsText = urlsTextarea ? urlsTextarea.value.trim() : '';
        let urls = [];

        showAlert('Processing URLs...', 'info');
        if (progressSection) progressSection.style.display = 'block';
        if (resultsSection) resultsSection.style.display = 'none';
        if (submitBtn) submitBtn.disabled = true;
        if (downloadButton) downloadButton.style.display = 'none';

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                const content = e.target.result;
                const lines = content.split('\n');
                urls = lines.slice(1).filter(url => url.trim());
                
                if (urls.length === 0) {
                    showAlert('No valid URLs found in the CSV file', 'warning');
                    if (submitBtn) submitBtn.disabled = false;
                    if (progressSection) progressSection.style.display = 'none';
                    return;
                }

                await processUrls(urls);
            };

            reader.onerror = function() {
                showAlert('Error reading the CSV file', 'danger');
                if (submitBtn) submitBtn.disabled = false;
                if (progressSection) progressSection.style.display = 'none';
            };

            reader.readAsText(file);
            return;
        }
        
        if (urlsText) {
            urls = urlsText.split('\n').filter(url => url.trim());
        }

        if (urls.length === 0) {
            showAlert('Please provide at least one URL to check', 'warning');
            if (submitBtn) submitBtn.disabled = false;
            if (progressSection) progressSection.style.display = 'none';
            return;
        }

        await processUrls(urls);
    }

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
            
            // Create CSV content
            const csvContent = [
                'Original URL,Final URL,Status Codes,Redirect Count',
                ...results.map(result => {
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
                    return [
                        result.source_url || result.url || '',
                        result.target_url || result.final_url || '',
                        statusCodes.join(' → '),
                        result.redirect_chain ? result.redirect_chain.length : 0
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
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    if (form) {
        form.addEventListener('submit', handleSubmit);
    }
}); 