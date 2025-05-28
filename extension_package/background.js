// Background script for URL Checker Extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('URL Checker Extension installed');
});

// Store for tracking redirects
const redirectTracking = new Map();

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkUrl') {
    checkUrlWithRedirectChain(request.url)
      .then(result => {
        sendResponse({ status: 'success', data: result });
      })
      .catch(error => {
        console.error('Error checking URL:', error);
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // Required for async sendResponse
  }
});

// Track redirects using webRequest API
chrome.webRequest.onBeforeRedirect.addListener(
  function(details) {
    const trackingId = details.url;
    if (!redirectTracking.has(trackingId)) {
      redirectTracking.set(trackingId, {
        chain: [],
        initialUrl: details.url
      });
    }
    
    const tracking = redirectTracking.get(trackingId);
    tracking.chain.push({
      url: details.url,
      status: details.statusCode,
      redirectUrl: details.redirectUrl
    });
    
    // Update tracking key to follow the redirect
    redirectTracking.set(details.redirectUrl, tracking);
    redirectTracking.delete(trackingId);
  },
  { urls: ["<all_urls>"] }
);

// Track completed requests
chrome.webRequest.onCompleted.addListener(
  function(details) {
    if (redirectTracking.has(details.url)) {
      const tracking = redirectTracking.get(details.url);
      tracking.finalStatus = details.statusCode;
      tracking.finalUrl = details.url;
    }
  },
  { urls: ["<all_urls>"] }
);

// Track error responses
chrome.webRequest.onErrorOccurred.addListener(
  function(details) {
    if (redirectTracking.has(details.url)) {
      const tracking = redirectTracking.get(details.url);
      tracking.error = details.error;
    }
  },
  { urls: ["<all_urls>"] }
);

async function checkUrlWithRedirectChain(url) {
  try {
    // Normalize URL
    const originalUrl = url;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    // Clear any existing tracking for this URL
    redirectTracking.delete(url);
    
    // Create a unique tab to make the request
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url: url, active: false }, (tab) => {
        const tabId = tab.id;
        const startTime = Date.now();
        const timeout = 30000; // 30 second timeout
        
        // Poll for completion
        const checkInterval = setInterval(() => {
          // Check timeout
          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            chrome.tabs.remove(tabId);
            reject(new Error('Request timeout'));
            return;
          }
          
          chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
              clearInterval(checkInterval);
              reject(new Error('Tab closed unexpectedly'));
              return;
            }
            
            if (tab.status === 'complete') {
              clearInterval(checkInterval);
              
              // Get the final URL from the tab
              const finalUrl = tab.url;
              
              // Look for tracking data
              let trackingData = null;
              for (const [key, value] of redirectTracking) {
                if (value.initialUrl === url || key === finalUrl) {
                  trackingData = value;
                  break;
                }
              }
              
              // Build the result
              const result = {
                url: originalUrl,
                source_url: url,
                target_url: finalUrl,
                hasRedirect: url !== finalUrl
              };
              
              if (trackingData && trackingData.chain && trackingData.chain.length > 0) {
                // Build redirect chain in the format expected by frontend
                result.redirect_chain = trackingData.chain.map((item, index) => {
                  const chainItem = {
                    status: item.status,
                    url: item.redirectUrl || item.url
                  };
                  
                  // Add final status to last item
                  if (index === trackingData.chain.length - 1 && trackingData.finalStatus) {
                    chainItem.final_status = trackingData.finalStatus;
                  }
                  
                  return chainItem;
                });
                
                result.status = trackingData.chain[0].status;
                result.hasRedirect = true;
              } else {
                // No redirects, just get the status from a direct fetch
                fetch(finalUrl, { method: 'HEAD' })
                  .then(response => {
                    result.status = response.status;
                    result.isSafe = response.status >= 200 && response.status < 400;
                    
                    // Clean up
                    chrome.tabs.remove(tabId);
                    for (const [key, value] of redirectTracking) {
                      if (value.initialUrl === url) {
                        redirectTracking.delete(key);
                      }
                    }
                    
                    resolve(result);
                  })
                  .catch(error => {
                    result.status = 0;
                    result.error = error.message;
                    result.isSafe = false;
                    
                    // Clean up
                    chrome.tabs.remove(tabId);
                    resolve(result);
                  });
                return;
              }
              
              // Clean up
              chrome.tabs.remove(tabId);
              for (const [key, value] of redirectTracking) {
                if (value.initialUrl === url) {
                  redirectTracking.delete(key);
                }
              }
              
              resolve(result);
            }
          });
        }, 500); // Check every 500ms
      });
    });
  } catch (error) {
    console.error('Error checking URL:', error);
    return {
      url: url,
      source_url: url,
      target_url: url,
      status: 0,
      isSafe: false,
      hasRedirect: false,
      error: error.message
    };
  }
} 