// Background script for URL Checker Extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('URL Checker Extension installed');
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkUrl') {
    // Try fast method first
    checkUrlFast(request.url)
      .then(result => {
        // Check if we hit CORS or other issues
        if (result.needsFallback) {
          console.log('Fast method incomplete, using tab method for full chain...');
          return checkUrlWithTab(request.url);
        }
        return result;
      })
      .then(result => {
        sendResponse({ status: 'success', data: result });
      })
      .catch(error => {
        console.error('Error:', error);
        sendResponse({ status: 'error', message: error.message });
      });
    return true;
  }
});

// FAST METHOD: Manual redirect following
async function checkUrlFast(url) {
  const originalUrl = url;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  const redirectChain = [];
  let currentUrl = url;
  let redirectCount = 0;
  const maxRedirects = 10;
  let initialStatus = null;
  let corsBlocked = false;

  try {
    while (redirectCount < maxRedirects) {
      let response;
      try {
        response = await fetch(currentUrl, {
          method: 'HEAD',
          redirect: 'manual',
          credentials: 'omit',
          mode: 'cors',
          cache: 'no-cache'
        });
      } catch (fetchError) {
        // CORS or network error
        console.log('Fetch error (likely CORS):', fetchError.message);
        corsBlocked = true;
        break;
      }

      // Store the first status we encounter
      if (initialStatus === null) {
        initialStatus = response.status;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const nextUrl = new URL(location, currentUrl).href;
          redirectChain.push({
            status: response.status,
            url: nextUrl
          });
          currentUrl = nextUrl;
          redirectCount++;
        } else {
          break;
        }
      } else {
        // Final destination reached
        if (redirectChain.length > 0) {
          redirectChain[redirectChain.length - 1].final_status = response.status;
        }
        break;
      }
    }

    // If we hit CORS or didn't get complete data, signal need for fallback
    if (corsBlocked || (redirectChain.length > 0 && !redirectChain[redirectChain.length - 1].final_status)) {
      return {
        url: originalUrl,
        source_url: url,
        target_url: currentUrl,
        status: initialStatus || 0,
        redirect_chain: redirectChain.length > 0 ? redirectChain : undefined,
        hasRedirect: redirectChain.length > 0,
        needsFallback: true  // Signal that we need to use tab method
      };
    }

    return {
      url: originalUrl,
      source_url: url,
      target_url: currentUrl,
      status: initialStatus || 200,
      redirect_chain: redirectChain.length > 0 ? redirectChain : undefined,
      hasRedirect: redirectChain.length > 0,
      isSafe: (redirectChain.length > 0 
        ? redirectChain[redirectChain.length - 1].final_status 
        : initialStatus) >= 200 && 
        (redirectChain.length > 0 
          ? redirectChain[redirectChain.length - 1].final_status 
          : initialStatus) < 400
    };

  } catch (error) {
    console.log('CheckUrlFast error:', error);
    // Return partial data with fallback flag
    return {
      url: originalUrl,
      source_url: url,
      target_url: currentUrl,
      status: initialStatus || 0,
      redirect_chain: redirectChain.length > 0 ? redirectChain : undefined,
      hasRedirect: redirectChain.length > 0,
      needsFallback: true
    };
  }
}

// TAB METHOD: For complete redirect chain
const redirectsByTab = new Map();

// Track redirects using webRequest API
chrome.webRequest.onBeforeRedirect.addListener(
  function(details) {
    if (!redirectsByTab.has(details.tabId)) {
      redirectsByTab.set(details.tabId, {
        chain: [],
        initialUrl: null
      });
    }
    
    const data = redirectsByTab.get(details.tabId);
    if (!data.initialUrl) {
      data.initialUrl = details.url;
    }
    
    data.chain.push({
      url: details.url,
      status: details.statusCode,
      redirectUrl: details.redirectUrl
    });
  },
  { urls: ["<all_urls>"] }
);

// Track completed requests
chrome.webRequest.onCompleted.addListener(
  function(details) {
    if (redirectsByTab.has(details.tabId)) {
      const data = redirectsByTab.get(details.tabId);
      data.finalStatus = details.statusCode;
      data.finalUrl = details.url;
    }
  },
  { urls: ["<all_urls>"] }
);

async function checkUrlWithTab(url) {
  const originalUrl = url;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  return new Promise((resolve, reject) => {
    // Create tab in background
    chrome.tabs.create({ 
      url: url, 
      active: false,
      pinned: true
    }, (tab) => {
      const tabId = tab.id;
      
      // Initialize redirect tracking
      redirectsByTab.set(tabId, {
        chain: [],
        initialUrl: url
      });
      
      const timeout = setTimeout(() => {
        chrome.tabs.remove(tabId);
        redirectsByTab.delete(tabId);
        reject(new Error('Request timeout'));
      }, 15000); // 15 second timeout

      // Listen for tab completion
      const checkCompletion = setInterval(() => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            clearInterval(checkCompletion);
            clearTimeout(timeout);
            return;
          }
          
          if (tab.status === 'complete') {
            clearInterval(checkCompletion);
            clearTimeout(timeout);
            
            // Wait a bit more for any final redirects to be captured
            setTimeout(() => {
              const data = redirectsByTab.get(tabId) || { chain: [] };
              
              const result = {
                url: originalUrl,
                source_url: url,
                target_url: tab.url,
                hasRedirect: url !== tab.url
              };

              // Format redirect chain
              if (data.chain.length > 0) {
                const formattedChain = [];
                
                for (const item of data.chain) {
                  if (item.redirectUrl) {
                    formattedChain.push({
                      status: item.status,
                      url: item.redirectUrl
                    });
                  }
                }
                
                // Add final status
                if (formattedChain.length > 0 && data.finalStatus) {
                  formattedChain[formattedChain.length - 1].final_status = data.finalStatus;
                } else if (formattedChain.length === 0 && data.chain.length > 0) {
                  // No redirects captured but we have initial request
                  result.status = data.chain[0].status || data.finalStatus || 200;
                }
                
                if (formattedChain.length > 0) {
                  result.redirect_chain = formattedChain;
                  result.status = data.chain[0].status;
                  result.hasRedirect = true;
                } else {
                  result.status = data.finalStatus || 200;
                }
              } else {
                // No chain captured, use final status
                result.status = data.finalStatus || 200;
              }
              
              result.isSafe = (result.status >= 200 && result.status < 400) || 
                              (data.finalStatus >= 200 && data.finalStatus < 400);

              // Clean up
              chrome.tabs.remove(tabId);
              redirectsByTab.delete(tabId);
              resolve(result);
            }, 1000); // Wait 1 second for webRequest events
          }
        });
      }, 500); // Check every 500ms
    });
  });
}

// Clean up tracking when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  redirectsByTab.delete(tabId);
}); 