console.log("Background script loaded");

chrome.action.onClicked.addListener((tab) => {
  if (tab.url.includes("amazon.com")) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error injecting script: ", chrome.runtime.lastError);
      } else {
        console.log("Content script injected successfully");
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in background script:", request);
  if (request.action === 'contentScriptLoaded') {
    console.log("Content script loaded message received");
    sendResponse({received: true});
  } else if (request.action === 'download') {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({success: false, error: chrome.runtime.lastError});
      } else {
        sendResponse({success: true, downloadId: downloadId});
      }
    });
    return true;  // Indicates that the response is sent asynchronously
  }
});