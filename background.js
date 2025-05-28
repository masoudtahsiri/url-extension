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

function normalizeUrlForFetch(url) {
  // Only add https:// if missing
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  return url;
}

function normalizeUrlForComparison(url) {
  // Remove protocol, www, and trailing slash, convert to lowercase
  return url.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');  // Remove trailing slash
}

function getPath(url) {
  // Get just the path part after the domain
  const urlObj = new URL(url);
  return urlObj.pathname.replace(/\/$/, ''); // Remove trailing slash
}

async function checkUrl(url) {
  try {
    // Store original URL for display
    const originalUrl = url;
    
    // Only add https:// if missing for the fetch
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    // Get the actual paths for comparison
    const inputPath = getPath(url);
    const finalPath = getPath(response.url);
    
    console.log('Input URL:', url);
    console.log('Response URL:', response.url);
    console.log('Input Path:', inputPath);
    console.log('Final Path:', finalPath);
    
    // Consider it a redirect if the paths are different
    const hasRedirect = inputPath !== finalPath;

    return {
      url: originalUrl,
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