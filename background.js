// background.js - HTTP Status Peek Extension with Secure License Management
// Organized into clear sections for better maintainability

// =================================================================
// INITIALIZATION
// =================================================================

// Import license manager
importScripts('license-manager.js');

chrome.runtime.onInstalled.addListener(() => {
  // Initial license check
  licenseManager.checkLicense().then(isPro => {
    // Silent check - no logging
  });
});

// Periodic license validation (every 30 minutes)
setInterval(() => {
  licenseManager.checkLicense();
}, 30 * 60 * 1000);

// =================================================================
// REQUEST TRACKING
// =================================================================

// Store for tracking requests by tabId
const requestTracking = new Map();

// Enhanced logging function (now silent)
function logRequest(type, details, extra = {}) {
  // All logging disabled for production
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

// =================================================================
// MESSAGE HANDLING
// =================================================================

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkUrl') {
    checkUrl(request.url)
      .then(result => {
        sendResponse({ status: 'success', data: result });
      })
      .catch(error => {
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'validateLicense') {
    licenseManager.checkLicense().then(isPro => {
      sendResponse({ isPro: isPro });
    });
    return true; // Keep message channel open for async response
  }
  
  return false;
});

// =================================================================
// WEB REQUEST HANDLERS
// =================================================================

// Track when requests start
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.type !== 'main_frame') return;
    
    logRequest('BEFORE_REQUEST', details);
    
    if (!requestTracking.has(details.tabId)) {
      requestTracking.set(details.tabId, {
        requests: [],
        redirects: [],
        initialUrl: details.url,
        requestSequence: [],
        allResponses: []
      });
    }
    
    const tracking = requestTracking.get(details.tabId);
    tracking.requestSequence.push({
      event: 'onBeforeRequest',
      url: details.url,
      requestId: details.requestId,
      timestamp: Date.now()
    });
  },
  { urls: ["<all_urls>"] }
);

// Track ALL responses including redirects using onHeadersReceived
chrome.webRequest.onHeadersReceived.addListener(
  function(details) {
    if (details.type !== 'main_frame') return;
    
    logRequest('HEADERS_RECEIVED', details, {
      statusLine: details.statusLine
    });
    
    if (!requestTracking.has(details.tabId)) {
      requestTracking.set(details.tabId, {
        requests: [],
        redirects: [],
        initialUrl: details.url,
        requestSequence: [],
        allResponses: []
      });
    }
    
    const tracking = requestTracking.get(details.tabId);
    
    // Store ALL responses with their status codes
    tracking.allResponses.push({
      url: details.url,
      status: details.statusCode,
      requestId: details.requestId,
      statusLine: details.statusLine,
      timestamp: Date.now()
    });
    
    tracking.requestSequence.push({
      event: 'onHeadersReceived',
      url: details.url,
      status: details.statusCode,
      statusLine: details.statusLine,
      requestId: details.requestId,
      timestamp: Date.now()
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Keep onResponseStarted for logging and tracking final responses
chrome.webRequest.onResponseStarted.addListener(
  function(details) {
    if (details.type !== 'main_frame') return;
    
    logRequest('RESPONSE_STARTED', details);
    
    if (requestTracking.has(details.tabId)) {
      const tracking = requestTracking.get(details.tabId);
      
      // This is the final successful response
      tracking.requests.push({
        url: details.url,
        status: details.statusCode,
        requestId: details.requestId,
        timestamp: Date.now()
      });
      
      tracking.requestSequence.push({
        event: 'onResponseStarted',
        url: details.url,
        status: details.statusCode,
        requestId: details.requestId,
        timestamp: Date.now()
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// Track redirects
chrome.webRequest.onBeforeRedirect.addListener(
  function(details) {
    // Only track main frame requests
    if (details.type !== 'main_frame') return;
    
    logRequest('BEFORE_REDIRECT', details, {
      redirectUrl: details.redirectUrl
    });
    
    if (!requestTracking.has(details.tabId)) {
      requestTracking.set(details.tabId, {
        requests: [],
        redirects: [],
        initialUrl: details.url,
        requestSequence: [],
        allResponses: []
      });
    }
    
    const tracking = requestTracking.get(details.tabId);
    
    // Store redirect information - use the actual redirectUrl from the event
    tracking.redirects.push({
      fromUrl: details.url,
      toUrl: details.redirectUrl, // This should already have the correct protocol
      status: details.statusCode,
      requestId: details.requestId,
      timestamp: Date.now()
    });
    
    tracking.requestSequence.push({
      event: 'onBeforeRedirect',
      fromUrl: details.url,
      toUrl: details.redirectUrl,
      status: details.statusCode,
      requestId: details.requestId,
      timestamp: Date.now()
    });
  },
  { urls: ["<all_urls>"] }
);

// Track completed requests
chrome.webRequest.onCompleted.addListener(
  function(details) {
    // Only track main frame requests
    if (details.type !== 'main_frame') return;
    
    logRequest('COMPLETED', details, {
      fromCache: details.fromCache
    });
    
    if (requestTracking.has(details.tabId)) {
      const tracking = requestTracking.get(details.tabId);
      tracking.finalUrl = details.url;
      tracking.finalStatus = details.statusCode;
      tracking.completed = true;
      
      tracking.requestSequence.push({
        event: 'onCompleted',
        url: details.url,
        status: details.statusCode,
        requestId: details.requestId,
        timestamp: Date.now()
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// Track error responses
chrome.webRequest.onErrorOccurred.addListener(
  function(details) {
    // Only track main frame requests
    if (details.type !== 'main_frame') return;
    
    logRequest('ERROR_OCCURRED', details, {
      error: details.error
    });
    
    if (requestTracking.has(details.tabId)) {
      const tracking = requestTracking.get(details.tabId);
      tracking.error = details.error;
      tracking.finalStatus = 0;
      
      tracking.requestSequence.push({
        event: 'onErrorOccurred',
        url: details.url,
        error: details.error,
        requestId: details.requestId,
        timestamp: Date.now()
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// =================================================================
// URL CHECKING LOGIC
// =================================================================

// Main function to check URL
async function checkUrl(url) {
  // Clean any whitespace/newline characters
  url = url.trim();
  const originalUrl = url;
  
  // Normalize URL
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  return new Promise((resolve, reject) => {
    let tabId = null;
    let isComplete = false;
    const startTime = Date.now();
    
    // Retry configuration
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second between retries
    
    const attemptTabCreation = (retryCount = 0) => {
      // Create a background tab
      chrome.tabs.create({ 
        url: url, 
        active: false,
        pinned: true
      }, (tab) => {
        // Check for errors first
        if (chrome.runtime.lastError) {
          // If we have retries left, try again
          if (retryCount < maxRetries - 1) {
            setTimeout(() => {
              attemptTabCreation(retryCount + 1);
            }, retryDelay);
            return;
          }
          
          // All retries exhausted
          resolve({
            url: originalUrl,
            source_url: url,
            target_url: url,
            hasRedirect: false,
            status: 0,
            error: `Failed after ${maxRetries} attempts: ${chrome.runtime.lastError.message}`,
            isSafe: false
          });
          return;
        }
        
        // Check if tab was created successfully
        if (!tab) {
          // If we have retries left, try again
          if (retryCount < maxRetries - 1) {
            setTimeout(() => {
              attemptTabCreation(retryCount + 1);
            }, retryDelay);
            return;
          }
          
          // All retries exhausted
          resolve({
            url: originalUrl,
            source_url: url,
            target_url: url,
            hasRedirect: false,
            status: 0,
            error: `Failed after ${maxRetries} attempts: Tab creation returned null`,
            isSafe: false
          });
          return;
        }

        // Success!
        tabId = tab.id;
        
        // Initialize tracking for this tab
        requestTracking.delete(tabId); // Clear any old data first
        requestTracking.set(tabId, {
          requests: [],
          redirects: [],
          initialUrl: url,
          requestSequence: [],
          allResponses: []
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
            }, 2000); // 2 second wait time
          }
        };

        // Check tab status periodically
        let checkCount = 0;
        const checkInterval = setInterval(() => {
          checkCount++;
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
              // Add a check for minimum elapsed time
              const elapsedTime = Date.now() - startTime;
              if (elapsedTime < 500) {
                // Don't consider it done too quickly
                return;
              }

              clearInterval(checkInterval);
              
              // Wait a bit for any final webRequest events
              setTimeout(() => {
                tracking.finalUrl = tracking.finalUrl || tab.url;
                
                cleanup();
                const result = buildResult(originalUrl, url, tracking);
                resolve(result);
              }, 800); // Change from 2000ms to 800ms
            }
          });
        }, 250); // Change from 500ms to 250ms
      });
    };
    
    // Start the first attempt
    attemptTabCreation(0);
  });
}

// =================================================================
// RESULT BUILDING
// =================================================================

// Build the result from tracking data
function buildResult(originalUrl, startUrl, tracking) {
  const finalUrl = tracking.finalUrl || startUrl;
  
  // Clean URLs for comparison
  const cleanStartUrl = startUrl.trim();
  const cleanFinalUrl = finalUrl.trim();
  
  // Check if there's a redirect based on status codes
  let hasRedirect = false;

  // Check if initial status is a redirect code (3xx)
  if (tracking.allResponses && tracking.allResponses.length > 0) {
    const initialStatus = tracking.allResponses[0].status;
    hasRedirect = initialStatus >= 300 && initialStatus < 400;
  }

  // Also check if we have explicit redirect data
  if (!hasRedirect && tracking.redirects && tracking.redirects.length > 0) {
    hasRedirect = true;
  }
  
  const result = {
    url: originalUrl,
    source_url: startUrl,
    target_url: finalUrl,
    hasRedirect: hasRedirect
  };

  // Build the status code chain
  if (hasRedirect) {
    const chain = buildRedirectChain(tracking);
    
    if (chain.length > 0) {
      result.redirect_chain = chain;
    }
    
    // Use the first response's status for the initial status
    if (tracking.allResponses && tracking.allResponses.length > 0) {
      result.status = tracking.allResponses[0].status;
    } else {
      result.status = tracking.requests[0]?.status || 301;
    }
  } else {
    // No redirects - use final status
    result.status = tracking.finalStatus || 200;
  }

  // Handle error cases
  if (tracking.error) {
    result.error = tracking.error;
    result.status = 0;
    result.isSafe = false;
  } else {
    // Determine if URL is safe based on final status
    const finalStatus = tracking.finalStatus || result.status;
    result.isSafe = finalStatus >= 200 && finalStatus < 400;
  }

  return result;
}

// Build a proper redirect chain from requests and redirects data
function buildRedirectChain(tracking) {
  const chain = [];
  const { allResponses, redirects } = tracking;
  
  // If we have explicit redirect data, use it
  if (redirects && redirects.length > 0) {
    // Sort redirects by timestamp
    const sortedRedirects = [...redirects].sort((a, b) => a.timestamp - b.timestamp);
    
    for (let i = 0; i < sortedRedirects.length; i++) {
      const redirect = sortedRedirects[i];
      
      const chainItem = {
        status: redirect.status,
        url: redirect.toUrl
      };
      
      // Add final status to last redirect
      if (i === sortedRedirects.length - 1 && tracking.finalStatus) {
        chainItem.final_status = tracking.finalStatus;
      }
      
      chain.push(chainItem);
    }
  } else if (allResponses && allResponses.length > 1) {
    // Build chain from multiple responses
    const sortedResponses = [...allResponses].sort((a, b) => a.timestamp - b.timestamp);
    
    // Create chain from all but the first response
    for (let i = 1; i < sortedResponses.length; i++) {
      const previousResponse = sortedResponses[i - 1];
      const currentResponse = sortedResponses[i];
      
      const chainItem = {
        status: previousResponse.status,
        url: currentResponse.url
      };
      
      // Add final status for the last item
      if (i === sortedResponses.length - 1) {
        chainItem.final_status = currentResponse.status;
      }
      
      chain.push(chainItem);
    }
  }
  
  return chain;
}