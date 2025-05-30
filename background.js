// background.js - HTTP Status Peek Extension
// Organized into clear sections for better maintainability

// =================================================================
// INITIALIZATION
// =================================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('HTTP Status Peek Extension installed');
});

// =================================================================
// REQUEST TRACKING
// =================================================================

// Store for tracking requests by tabId
const requestTracking = new Map();

// Enhanced logging function
function logRequest(type, details, extra = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${type}:`, {
    url: details.url,
    tabId: details.tabId,
    requestId: details.requestId,
    statusCode: details.statusCode,
    type: details.type,
    frameId: details.frameId,
    ...extra
  });
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
    console.log('=== STARTING URL CHECK ===');
    console.log('Target URL:', request.url);
    checkUrl(request.url)
      .then(result => {
        console.log('=== FINAL RESULT ===');
        console.log(JSON.stringify(result, null, 2));
        sendResponse({ status: 'success', data: result });
      })
      .catch(error => {
        console.error('Error checking URL:', error);
        sendResponse({ status: 'error', message: error.message });
      });
    return true; // Keep message channel open for async response
  }
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
      
      // Log the complete sequence for this tab
      console.log('=== REQUEST SEQUENCE FOR TAB', details.tabId, '===');
      tracking.requestSequence.forEach((seq, index) => {
        console.log(`${index + 1}. [${seq.event}] ${seq.url || seq.fromUrl} (${seq.status || 'N/A'})`);
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

  console.log('Normalized URL:', url);

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
          console.error(`Tab creation attempt ${retryCount + 1} failed:`, chrome.runtime.lastError.message);
          
          // If we have retries left, try again
          if (retryCount < maxRetries - 1) {
            console.log(`Retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => {
              attemptTabCreation(retryCount + 1);
            }, retryDelay);
            return;
          }
          
          // All retries exhausted
          console.error('All retry attempts failed');
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
          console.error(`Tab creation attempt ${retryCount + 1} failed - no tab object returned`);
          
          // If we have retries left, try again
          if (retryCount < maxRetries - 1) {
            console.log(`Retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => {
              attemptTabCreation(retryCount + 1);
            }, retryDelay);
            return;
          }
          
          // All retries exhausted
          console.error('All retry attempts failed');
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
        if (retryCount > 0) {
          console.log(`Tab created successfully on attempt ${retryCount + 1}`);
        }
        
        tabId = tab.id;
        console.log('Created tab with ID:', tabId);
        
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
          console.log('TIMEOUT: Request took too long');
          cleanup();
          const tracking = requestTracking.get(tabId) || {};
          console.log('Tracking data at timeout:', tracking);
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
              console.log('Tab error or not found');
              clearInterval(checkInterval);
              cleanup();
              const tracking = requestTracking.get(tabId) || {};
              const result = buildResult(originalUrl, url, tracking);
              resolve(result);
              return;
            }

            const tracking = requestTracking.get(tabId);
            
            console.log(`Check #${checkCount} - Tab status: ${tab.status}, URL: ${tab.url}, Tracking completed: ${tracking?.completed}`);
            
            // Wait for tab to complete loading and we have tracking data
            if (tab.status === 'complete' && tracking && tracking.completed) {
              // Add a check for minimum elapsed time
              const elapsedTime = Date.now() - startTime;
              if (elapsedTime < 500) {
                // Don't consider it done too quickly
                console.log(`Not done yet - only ${elapsedTime}ms elapsed`);
                return;
              }

              console.log('Tab loading complete with tracking data');
              clearInterval(checkInterval);
              
              // Wait a bit for any final webRequest events
              setTimeout(() => {
                tracking.finalUrl = tracking.finalUrl || tab.url;
                
                console.log('=== FINAL TRACKING DATA ===');
                console.log('Requests:', tracking.requests);
                console.log('Redirects:', tracking.redirects);
                console.log('All Responses:', tracking.allResponses);
                console.log('Final URL:', tracking.finalUrl);
                console.log('Final Status:', tracking.finalStatus);
                
                cleanup();
                const result = buildResult(originalUrl, url, tracking);
                resolve(result);
              }, 2000); // Increased wait time to 2000ms
            }
          });
        }, 500); // Check every 500ms
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
  console.log('=== BUILDING RESULT ===');
  console.log('Original URL:', originalUrl);
  console.log('Start URL:', startUrl);
  console.log('Tracking:', tracking);
  
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
    
    console.log('Built redirect chain:', chain);
    
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

  console.log('Built result:', result);
  return result;
}

// Build a proper redirect chain from requests and redirects data
function buildRedirectChain(tracking) {
  console.log('=== BUILDING REDIRECT CHAIN ===');
  const chain = [];
  const { allResponses, redirects } = tracking;
  
  console.log('All responses:', allResponses);
  console.log('All redirects with details:', JSON.stringify(redirects, null, 2));
  
  // If we have explicit redirect data, use it
  if (redirects && redirects.length > 0) {
    // Sort redirects by timestamp
    const sortedRedirects = [...redirects].sort((a, b) => a.timestamp - b.timestamp);
    
    for (let i = 0; i < sortedRedirects.length; i++) {
      const redirect = sortedRedirects[i];
      console.log(`Processing redirect ${i + 1}:`, {
        from: redirect.fromUrl,
        to: redirect.toUrl,
        status: redirect.status
      });
      
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