let mediaData;

console.log("Popup script loaded");

document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM content loaded");
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    console.log("Active tab:", tabs[0].url);
    if (tabs[0].url.includes('amazon.com')) {
      console.log("Amazon page detected, injecting content script");
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error injecting script: ", chrome.runtime.lastError);
          displayError("Failed to inject content script. Please refresh and try again.");
        } else {
          console.log("Content script injection initiated");
          
          // Set up listener for media loaded message
          chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
            console.log("Message received in popup:", message);
            if (message.action === "mediaLoaded") {
              console.log("Media data received:", message.data);
              mediaData = message.data;
              displayMedia(mediaData);
              document.getElementById('loadingIndicator').style.display = 'none';
            }
          });

          // Request media data
          chrome.tabs.sendMessage(tabs[0].id, {action: "getMedia"}, function(response) {
            console.log("Initial response received:", response);
            if (chrome.runtime.lastError) {
              console.error("Runtime error:", chrome.runtime.lastError.message);
              displayError("Unable to connect to the page. Please refresh and try again.");
            } else if (response) {
              document.getElementById('loadingIndicator').style.display = 'block';
            } else {
              displayError("No response from the content script.");
            }
          });
        }
      });
    } else {
      displayError("This extension only works on Amazon product pages.");
    }
  });

  document.getElementById('downloadAll').addEventListener('click', downloadAll);
  document.getElementById('exportCSV').addEventListener('click', exportToCSV);
});

function displayError(message) {
  console.error("Displaying error:", message);
  const container = document.getElementById('mediaContainer');
  container.innerHTML = `<p style="color: red;">${message}</p>`;
  document.getElementById('downloadAll').disabled = true;
  document.getElementById('exportCSV').disabled = true;
}

function displayMedia(media) {
  console.log("Displaying media:", media);
  const container = document.getElementById('mediaContainer');
  container.innerHTML = ''; // Clear existing content

  function createMediaElement(item) {
    const div = document.createElement('div');
    div.className = 'media-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    div.appendChild(checkbox);

    if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = item.url;
      video.width = 100;
      video.controls = true;
      div.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = item.url;
      img.width = 100;
      img.alt = item.alt;
      div.appendChild(img);
    }

    console.log(`Created media element: ${item.type} - ${item.url}`);
    return div;
  }

  const allMedia = [...media.images, ...media.videos, ...media.variantImages];
  allMedia.forEach(item => {
    if (item.url && !item.url.includes('x-spritesheet')) {
      container.appendChild(createMediaElement(item));
    }
  });

  if (container.children.length === 0) {
    displayError("No valid media found on this page.");
  } else {
    console.log(`Total media elements displayed: ${container.children.length}`);
  }
}

async function downloadAll() {
  const selectedItems = Array.from(document.querySelectorAll('.media-item input:checked'))
    .map(checkbox => {
      const mediaElement = checkbox.parentElement.querySelector('img, video');
      return {
        url: mediaElement.src,
        type: mediaElement.tagName.toLowerCase()
      };
    });

  if (selectedItems.length === 0) {
    alert('Please select at least one item to download.');
    return;
  }

  const zip = new JSZip();
  const fetchPromises = selectedItems.map((item, index) => {
    const extension = item.type === 'video' ? 'mp4' : 'jpg';
    const filename = `amazon_media_${index + 1}.${extension}`;
    return fetch(item.url)
      .then(response => response.blob())
      .then(blob => {
        zip.file(filename, blob);
      });
  });

  try {
    await Promise.all(fetchPromises);
    const content = await zip.generateAsync({type: "blob"});
    const url = URL.createObjectURL(content);
    chrome.downloads.download({
      url: url,
      filename: "amazon_media.zip",
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        alert('Error downloading files. Please try again.');
      } else {
        console.log(`Zip file downloaded with ID: ${downloadId}`);
      }
      URL.revokeObjectURL(url);
    });
  } catch (error) {
    console.error('Error creating zip file:', error);
    alert('Error creating zip file. Please try again.');
  }
}

function exportToCSV() {
  const selectedItems = Array.from(document.querySelectorAll('.media-item input:checked'))
    .map(checkbox => {
      const mediaElement = checkbox.parentElement.querySelector('img, video');
      return {
        url: mediaElement.src,
        type: mediaElement.tagName.toLowerCase(),
        alt: mediaElement.alt || ''
      };
    });

  if (selectedItems.length === 0) {
    alert('Please select at least one item to export.');
    return;
  }

  const csvContent = "data:text/csv;charset=utf-8," 
    + "URL,Type,Alt Text\n"
    + selectedItems.map(item => `"${item.url}","${item.type}","${item.alt}"`).join("\n");

  const encodedUri = encodeURI(csvContent);
  chrome.downloads.download({
    url: encodedUri,
    filename: "amazon_media_links.csv"
  });
}