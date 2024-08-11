let mediaData;

console.log("Popup script loaded");

function logError(error) {
  console.error('Error:', error);
  if (error instanceof Error) {
    console.error('Stack:', error.stack);
  }
}

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
    div.style.position = 'relative';
    div.style.display = 'inline-block';
    div.style.marginRight = '10px';
    div.style.marginBottom = '10px';
  
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    div.appendChild(checkbox);
  
    const img = document.createElement('img');
    img.src = item.type === 'video' ? item.thumbnailUrl : item.url;
    img.width = 100;
    img.height = 100;
    img.style.objectFit = 'cover';
    img.alt = item.type === 'video' ? 'Video thumbnail' : (item.alt || 'Product image');
    div.appendChild(img);
  
    if (item.type === 'video') {
      const playIcon = document.createElement('div');
      playIcon.style.position = 'absolute';
      playIcon.style.top = '50%';
      playIcon.style.left = '50%';
      playIcon.style.transform = 'translate(-50%, -50%)';
      playIcon.style.width = '30px';
      playIcon.style.height = '30px';
      playIcon.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      playIcon.style.borderRadius = '50%';
      playIcon.style.display = 'flex';
      playIcon.style.alignItems = 'center';
      playIcon.style.justifyContent = 'center';
  
      const triangleIcon = document.createElement('div');
      triangleIcon.style.width = '0';
      triangleIcon.style.height = '0';
      triangleIcon.style.borderTop = '7px solid transparent';
      triangleIcon.style.borderBottom = '7px solid transparent';
      triangleIcon.style.borderLeft = '12px solid white';
      triangleIcon.style.marginLeft = '3px';
  
      playIcon.appendChild(triangleIcon);
      div.appendChild(playIcon);
  
      // Store both video URL and thumbnail URL as data attributes
      div.dataset.videoUrl = item.url;
      div.dataset.thumbnailUrl = item.thumbnailUrl;
      div.dataset.isHls = item.isHLS;
    }
  
    return div;
  }

  const allMedia = [...media.mainImages, ...media.variantImages, ...media.videos];
  allMedia.forEach(item => {
    if (item.url && !item.url.includes('x-spritesheet')) {
      container.appendChild(createMediaElement(item));
    }
  });

  if (container.children.length === 0) {
    displayError("No valid media found on this page.");
  } else {
    console.log(`Total media elements displayed: ${container.children.length}`);
    console.log(`Main images: ${media.mainImages.length}`);
    console.log(`Variant images: ${media.variantImages.length}`);
    console.log(`Videos: ${media.videos.length}`);
  }
}


async function downloadAll() {
  const selectedItems = Array.from(document.querySelectorAll('.media-item input:checked'))
    .map(checkbox => {
      const mediaItem = checkbox.parentElement;
      const isVideo = mediaItem.querySelector('[style*="border-left: 12px solid white"]') !== null;
      return {
        url: isVideo ? mediaItem.dataset.videoUrl : mediaItem.querySelector('img').src,
        type: isVideo ? 'video' : 'image',
        isHLS: mediaItem.dataset.isHls === 'true'
      };
    });

  if (selectedItems.length === 0) {
    alert('Please select at least one item to download.');
    return;
  }

  const zip = new JSZip();
  const fetchPromises = selectedItems.map((item, index) => {
    if (item.type === 'image') {
      return fetch(item.url)
        .then(response => response.blob())
        .then(blob => {
          zip.file(`amazon_image_${index + 1}.jpg`, blob);
        });
    } else if (item.type === 'video') {
      if (item.isHLS) {
        return fetch(item.url)
          .then(response => response.text())
          .then(content => {
            zip.file(`amazon_video_${index + 1}.m3u8`, content);
            // Add a README file with instructions
            zip.file('README.txt', 'To play .m3u8 files, use VLC Media Player or ffmpeg to convert to MP4.');
          });
      } else {
        return fetch(item.url)
          .then(response => response.blob())
          .then(blob => {
            zip.file(`amazon_video_${index + 1}.mp4`, blob);
          });
      }
    }
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
        alert('Error downloading files. Please check the console for details.');
      } else {
        console.log(`Zip file downloaded with ID: ${downloadId}`);
      }
      URL.revokeObjectURL(url);
    });
  } catch (error) {
    console.error('Error creating zip file:', error);
    alert('Error creating zip file. Please check the console for details.');
  }
}

function exportToCSV() {
  const selectedItems = Array.from(document.querySelectorAll('.media-item input:checked'))
    .map(checkbox => {
      const mediaItem = checkbox.parentElement;
      const isVideo = mediaItem.querySelector('[style*="border-left: 12px solid white"]') !== null;
      return {
        url: isVideo ? mediaItem.dataset.videoUrl : mediaItem.querySelector('img').src,
        type: isVideo ? 'video' : 'image',
        alt: mediaItem.querySelector('img').alt || ''
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
    filename: "amazon_media_links.csv",
    saveAs: true
  });
}