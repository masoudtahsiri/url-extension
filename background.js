// Background script for URL Checker Extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('HTTP Status Peek Extension installed');
});

// Store for tracking requests by tabId
const requestTracking = new Map();

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkUrl') {
    checkUrl(request.url)
      .then(result => {
        sendResponse({ status: 'success', data: result });
      })
      .catch(error => {
        console.error('Error checking URL:', error);
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // Keep message channel open for async response
  }
});

// Track all main frame requests
chrome.webRequest.onResponseStarted.addListener(
  function(details) {
    // Only track main frame requests
    if (details.type !== 'main_frame') return;
    
    if (!requestTracking.has(details.tabId)) {
      requestTracking.set(details.tabId, {
        requests: [],
        redirects: [],
        initialUrl: details.url
      });
    }
    
    const tracking = requestTracking.get(details.tabId);
    
    // Store all requests with their status codes
    tracking.requests.push({
      url: details.url,
      status: details.statusCode,
      timestamp: Date.now()
    });
    
    console.log(`Request: ${details.url} -> ${details.statusCode}`);
  },
  { urls: ["<all_urls>"] }
);

// Track redirects
chrome.webRequest.onBeforeRedirect.addListener(
  function(details) {
    // Only track main frame requests
    if (details.type !== 'main_frame') return;
    
    if (!requestTracking.has(details.tabId)) {
      requestTracking.set(details.tabId, {
        requests: [],
        redirects: [],
        initialUrl: details.url
      });
    }
    
    const tracking = requestTracking.get(details.tabId);
    
    // Store redirect information
    tracking.redirects.push({
      fromUrl: details.url,
      toUrl: details.redirectUrl,
      status: details.statusCode,
      timestamp: Date.now()
    });
    
    console.log(`Redirect: ${details.url} -> ${details.redirectUrl} (${details.statusCode})`);
  },
  { urls: ["<all_urls>"] }
);

// Track completed requests
chrome.webRequest.onCompleted.addListener(
  function(details) {
    // Only track main frame requests
    if (details.type !== 'main_frame') return;
    
    if (requestTracking.has(details.tabId)) {
      const tracking = requestTracking.get(details.tabId);
      tracking.finalUrl = details.url;
      tracking.finalStatus = details.statusCode;
      tracking.completed = true;
      
      console.log(`Completed: ${details.url} (${details.statusCode})`);
    }
  },
  { urls: ["<all_urls>"] }
);

// Track error responses
chrome.webRequest.onErrorOccurred.addListener(
  function(details) {
    // Only track main frame requests
    if (details.type !== 'main_frame') return;
    
    if (requestTracking.has(details.tabId)) {
      const tracking = requestTracking.get(details.tabId);
      tracking.error = details.error;
      tracking.finalStatus = 0;
      
      console.log(`Error: ${details.url} - ${details.error}`);
    }
  },
  { urls: ["<all_urls>"] }
);

// Main function to check URL
async function checkUrl(url) {
  const originalUrl = url;
  
  // Normalize URL
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  return new Promise((resolve, reject) => {
    let tabId = null;
    let isComplete = false;

    // Create a background tab
    chrome.tabs.create({ 
      url: url, 
      active: false,
      pinned: true
    }, (tab) => {
      tabId = tab.id;
      
      // Initialize tracking for this tab
      requestTracking.set(tabId, {
        requests: [],
        redirects: [],
        initialUrl: url
      });

      // Set a timeout
      const timeout = setTimeout(() => {
        cleanup();
        const tracking = requestTracking.get(tabId) || {};
        const result = buildResult(originalUrl, url, tracking);
        resolve(result);
      }, 15000); // 15 second timeout

      const cleanup = () => {
        isComplete = true;
        clearTimeout(timeout);
        if (tabId) {
          chrome.tabs.remove(tabId).catch(() => {});
          // Clean up tracking after a delay
          setTimeout(() => {
            requestTracking.delete(tabId);
          }, 1000);
        }
      };

      // Check tab status periodically
      const checkInterval = setInterval(() => {
        if (isComplete) {
          clearInterval(checkInterval);
          return;
        }

        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            clearInterval(checkInterval);
            cleanup();
            const tracking = requestTracking.get(tabId) || {};
            const result = buildResult(originalUrl, url, tracking);
            resolve(result);
            return;
          }

          const tracking = requestTracking.get(tabId);
          
          // Wait for tab to complete loading and we have tracking data
          if (tab.status === 'complete' && tracking && tracking.completed) {
            clearInterval(checkInterval);
            
            // Wait a bit for any final webRequest events
            setTimeout(() => {
              tracking.finalUrl = tracking.finalUrl || tab.url;
              
              cleanup();
              const result = buildResult(originalUrl, url, tracking);
              resolve(result);
            }, 500); // Short wait for final events
          }
        });
      }, 500); // Check every 500ms
    });
  });
}

// Build the result from tracking data
function buildResult(originalUrl, startUrl, tracking) {
  const finalUrl = tracking.finalUrl || startUrl;
  const hasRedirect = startUrl !== finalUrl || (tracking.redirects && tracking.redirects.length > 0);
  
  const result = {
    url: originalUrl,
    source_url: startUrl,
    target_url: finalUrl,
    hasRedirect: hasRedirect
  };

  // Build the redirect chain from both requests and redirects data
  if (hasRedirect && tracking.requests && tracking.requests.length > 0) {
    const chain = buildRedirectChain(tracking);
    
    if (chain.length > 0) {
      result.redirect_chain = chain;
      result.status = tracking.requests[0]?.status || 301;
    } else {
      // Fallback if we couldn't build a proper chain
      result.status = tracking.requests[0]?.status || 301;
    }
  } else {
    // No redirects
    result.status = tracking.finalStatus || 200;
  }

  // Handle error cases
  if (tracking.error) {
    result.error = tracking.error;
    result.status = 0;
    result.isSafe = false;
  } else {
    // Determine if URL is safe
    const finalStatus = tracking.finalStatus || result.status;
    result.isSafe = finalStatus >= 200 && finalStatus < 400;
  }

  return result;
}

// Build a proper redirect chain from requests and redirects data
function buildRedirectChain(tracking) {
  const chain = [];
  const { requests, redirects } = tracking;
  
  // Sort requests by timestamp
  const sortedRequests = [...requests].sort((a, b) => a.timestamp - b.timestamp);
  
  // Build the chain
  for (let i = 0; i < sortedRequests.length - 1; i++) {
    const currentRequest = sortedRequests[i];
    const nextRequest = sortedRequests[i + 1];
    
    // Check if this was a redirect
    const redirect = redirects.find(r => 
      r.fromUrl === currentRequest.url && 
      r.toUrl === nextRequest.url
    );
    
    if (redirect) {
      const chainItem = {
        status: currentRequest.status,
        url: nextRequest.url
      };
      
      // Add final status for the last redirect
      if (i === sortedRequests.length - 2) {
        chainItem.final_status = nextRequest.status;
      }
      
      chain.push(chainItem);
    }
  }
  
  // If we couldn't match redirects properly, build from redirect data alone
  if (chain.length === 0 && redirects.length > 0) {
    for (let i = 0; i < redirects.length; i++) {
      const redirect = redirects[i];
      const chainItem = {
        status: redirect.status,
        url: redirect.toUrl
      };
      
      // Add final status to last redirect
      if (i === redirects.length - 1 && tracking.finalStatus) {
        chainItem.final_status = tracking.finalStatus;
      }
      
      chain.push(chainItem);
    }
  }
  
  return chain;
}

// Clean up old tracking data periodically
setInterval(() => {
  const now = Date.now();
  for (const [tabId, data] of requestTracking.entries()) {
    // Remove tracking data older than 5 minutes
    if (data.timestamp && now - data.timestamp > 300000) {
      requestTracking.delete(tabId);
    }
  }
}, 60000); // Run every minute