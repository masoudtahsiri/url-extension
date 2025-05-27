// Background script for URL Checker Extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('URL Checker Extension installed');
});

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
    return true; // Required for async sendResponse
  }
});

async function checkUrl(url) {
  try {
    // Normalize the input URL
    const normalizedInputUrl = url.toLowerCase().trim();
    
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    // Normalize the final URL
    const normalizedFinalUrl = response.url.toLowerCase().trim();
    
    // Compare normalized URLs
    const hasRedirect = normalizedInputUrl !== normalizedFinalUrl;

    return {
      url: url,
      source_url: url,
      target_url: response.url,
      status: response.status,
      isSafe: response.status >= 200 && response.status < 400,
      hasRedirect: hasRedirect
    };
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