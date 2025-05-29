document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('urlForm');
    const submitBtn = document.getElementById('submitBtn');
    const urlCount = document.getElementById('urlCount');
    const urlsTextarea = document.getElementById('urls');
    const csvFileInput = document.getElementById('csvFile');

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

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const content = e.target.result;
                const lines = content.split('\n');
                // Clean each URL by trimming whitespace and carriage returns
                urls = lines.slice(1)
                    .map(url => url.trim())
                    .filter(url => {
                        // Remove empty lines and invalid URLs
                        if (!url || url.length === 0) return false;
                        
                        // Basic URL validation
                        try {
                            // Add https:// if no protocol is specified
                            if (!/^https?:\/\//i.test(url)) {
                                url = 'https://' + url;
                            }
                            new URL(url);
                            return true;
                        } catch (e) {
                            console.warn(`Invalid URL skipped: ${url}`);
                            return false;
                        }
                    });
                
                if (urls.length === 0) {
                    showAlert('No valid URLs found in the CSV file', 'warning');
                    return;
                }

                console.log(`Found ${urls.length} valid URLs in CSV file`);
                openResultsTab(urls);
            };

            reader.onerror = function() {
                showAlert('Error reading the CSV file', 'danger');
            };

            reader.readAsText(file);
            return;
        }
        
        if (urlsText) {
            urls = urlsText.split('\n').filter(url => url.trim());
        }

        if (urls.length === 0) {
            showAlert('Please provide at least one URL to check', 'warning');
            return;
        }

        openResultsTab(urls);
    }

    function openResultsTab(urls) {
        // Store URLs in chrome.storage
        chrome.storage.local.set({ urlsToCheck: urls }, function() {
            // Get the extension's URL
            const resultsUrl = chrome.runtime.getURL('frontend/results.html');
            // Open results page in a new tab
            chrome.tabs.create({ url: resultsUrl });
        });
    }

    if (form) {
        form.addEventListener('submit', handleSubmit);
    }
}); 