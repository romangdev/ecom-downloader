let mediaData;

document.addEventListener('DOMContentLoaded', function() {
  setupTabNavigation();
  initializeExtension();
  setupSelectionButtons();
});

function setupTabNavigation() {
  const tabs = document.querySelectorAll('.tabButton');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tabContent').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`${tab.id.replace('Tab', 'Content')}`).classList.add('active');
    });
  });
}

function initializeExtension() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0].url.includes('amazon.com')) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      }, () => {
        if (chrome.runtime.lastError) {
          displayError("Failed to inject content script. Please refresh and try again.");
        } else {
          chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
            if (message.action === "mediaLoaded") {
              mediaData = message.data;
              displayMedia(mediaData);
              document.getElementById('loadingIndicator').style.display = 'none';
            }
          });

          chrome.tabs.sendMessage(tabs[0].id, {action: "getMedia"}, function(response) {
            if (chrome.runtime.lastError) {
              displayError("Unable to connect to the page. Please refresh and try again.");
            } else if (!response) {
              displayError("No response from the content script.");
            }
          });
        }
      });
    } else {
      displayError("This extension only works on Amazon product pages.");
    }
  });

  // Move these listeners here to ensure the elements exist
  document.getElementById('downloadSelected').addEventListener('click', downloadSelected);
  document.getElementById('exportCSV').addEventListener('click', exportToCSV);
}

function setupSelectionButtons() {
  const selectAllMedia = document.getElementById('selectAllMedia');
  const selectAllImages = document.getElementById('selectAllImages');
  const selectAllVideos = document.getElementById('selectAllVideos');

  if (selectAllMedia) selectAllMedia.addEventListener('click', () => toggleSelection('all'));
  if (selectAllImages) selectAllImages.addEventListener('click', () => toggleSelection('images'));
  if (selectAllVideos) selectAllVideos.addEventListener('click', () => toggleSelection('videos'));
}

function toggleSelection(type) {
  const imagesChecked = areAllSelected('#imagesContent .mediaItem input');
  const videosChecked = areAllSelected('#videosContent .mediaItem input');
  
  let selector;
  switch(type) {
    case 'all':
      selector = '.mediaItem input';
      break;
    case 'images':
      selector = '#imagesContent .mediaItem input';
      break;
    case 'videos':
      selector = '#videosContent .mediaItem input';
      break;
  }
  
  const shouldCheck = type === 'all' ? !(imagesChecked && videosChecked) :
                      type === 'images' ? !imagesChecked : !videosChecked;
  
  document.querySelectorAll(selector).forEach(checkbox => {
    checkbox.checked = shouldCheck;
  });
  
  updateSelectionCount();
}

function areAllSelected(selector) {
  const checkboxes = document.querySelectorAll(selector);
  return checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
}

function updateSelectionCount() {
  const count = document.querySelectorAll('.mediaItem input:checked').length;
  const selectionCountElement = document.getElementById('selectionCount');
  if (selectionCountElement) {
    selectionCountElement.textContent = `${count} selected`;
  }
}

function displayImages(media) {
  const container = document.getElementById('imageVariations');
  container.innerHTML = '';

  if (!media || (!media.mainImages && !media.variantImages)) {
    container.innerHTML = '<p>No images found.</p>';
    return;
  }

  function createImageGroup(variantName, images, isDefault = false) {
    const group = document.createElement('div');
    group.className = 'variationGroup';
    
    const titleElem = document.createElement('div');
    titleElem.className = 'variationTitle';
    titleElem.innerHTML = `
      ${variantName}
      ${isDefault ? '<span class="defaultVariation"> (Default)</span>' : ''}
      <button class="selectAllVariant" data-variant="${variantName}">Select All</button>
    `;
    
    group.appendChild(titleElem);

    const mediaContainer = document.createElement('div');
    mediaContainer.className = 'mediaContainer';

    images.forEach(image => {
      const imageUrl = image.url;
      if (imageUrl && typeof imageUrl === 'string' && !imageUrl.includes('x-spritesheet')) {
        mediaContainer.appendChild(createMediaElement(imageUrl, 'image', variantName));
      }
    });

    group.appendChild(mediaContainer);

    const selectAllBtn = group.querySelector('.selectAllVariant');
    selectAllBtn.addEventListener('click', () => toggleVariantSelection(variantName, group));

    return group;
  }

  // Display main images (default variant)
  if (media.mainImages && media.mainImages.length > 0) {
    container.appendChild(createImageGroup(media.defaultVariant, media.mainImages, true));
  }

  // Display other variants
  if (media.variantImages && media.variantImages.length > 0) {
    const variantGroups = {};
    
    media.variantImages.forEach(image => {
      if (!variantGroups[image.variant]) {
        variantGroups[image.variant] = [];
      }
      variantGroups[image.variant].push(image);
    });

    Object.entries(variantGroups).forEach(([variantName, images]) => {
      if (variantName !== media.defaultVariant) {
        container.appendChild(createImageGroup(variantName, images));
      }
    });
  }

  if (container.children.length === 0) {
    container.innerHTML = '<p>No valid images found.</p>';
  }

  updateSelectionCount();
}

function toggleVariantSelection(variantName, groupElement) {
  const checkboxes = groupElement.querySelectorAll('.mediaItem input');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  
  checkboxes.forEach(cb => cb.checked = !allChecked);
  updateSelectionCount();
}

function createMediaElement(url, type, variant, thumbnailUrl, isHLS) {
  const div = document.createElement('div');
  div.className = 'mediaItem';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = false; // Initially unchecked
  checkbox.addEventListener('change', updateSelectionCount);
  div.appendChild(checkbox);

  const img = document.createElement('img');
  img.src = type === 'video' ? thumbnailUrl : url;
  img.alt = type === 'video' ? 'Video thumbnail' : `${variant} image`;
  div.appendChild(img);

  if (type === 'video') {
    const playIcon = document.createElement('div');
    playIcon.className = 'playIcon';
    playIcon.textContent = '▶';
    div.appendChild(playIcon);

    div.dataset.videoUrl = url;
    div.dataset.thumbnailUrl = thumbnailUrl;
    div.dataset.isHls = isHLS;
  }

  return div;
}

function downloadSelected() {
  const selectedItems = document.querySelectorAll('.mediaItem input:checked');

  if (selectedItems.length === 0) {
    alert('Please select at least one item to download.');
    return;
  }

  const zip = new JSZip();
  const fetchPromises = Array.from(selectedItems).map((checkbox, index) => {
    const item = checkbox.closest('.mediaItem');
    const isVideo = item.dataset.videoUrl !== undefined;
    const url = isVideo ? item.dataset.videoUrl : item.querySelector('img').src;
    const isHLS = isVideo && item.dataset.isHls === 'true';

    if (isVideo && isHLS) {
      return fetch(url)
        .then(response => response.text())
        .then(content => {
          zip.file(`amazon_video_${index + 1}.m3u8`, content);
          zip.file('README.txt', 'To play .m3u8 files, use VLC Media Player or ffmpeg to convert to MP4.');
        });
    } else {
      return fetch(url)
        .then(response => response.blob())
        .then(blob => {
          const extension = isVideo ? 'mp4' : 'jpg';
          zip.file(`amazon_${isVideo ? 'video' : 'image'}_${index + 1}.${extension}`, blob);
        });
    }
  });

  Promise.all(fetchPromises)
    .then(() => zip.generateAsync({type: "blob"}))
    .then(content => {
      const url = URL.createObjectURL(content);
      chrome.downloads.download({
        url: url,
        filename: "amazon_media.zip",
        saveAs: true
      }, () => URL.revokeObjectURL(url));
    })
    .catch(error => {
      console.error('Error creating zip file:', error);
      alert('Error creating zip file. Please check the console for details.');
    });
}

function exportToCSV() {
  const selectedItems = document.querySelectorAll('.mediaItem input:checked');

  if (selectedItems.length === 0) {
    alert('Please select at least one item to export.');
    return;
  }

  const csvContent = "data:text/csv;charset=utf-8," 
    + "URL,Type,Variant\n"
    + Array.from(selectedItems).map(checkbox => {
      const item = checkbox.closest('.mediaItem');
      const isVideo = item.dataset.videoUrl !== undefined;
      const url = isVideo ? item.dataset.videoUrl : item.querySelector('img').src;
      const type = isVideo ? 'video' : 'image';
      const variant = isVideo ? 'N/A' : item.closest('.variationGroup').querySelector('.variationTitle').textContent.replace(' (Default)', '');
      return `"${url}","${type}","${variant}"`;
    }).join("\n");

  const encodedUri = encodeURI(csvContent);
  chrome.downloads.download({
    url: encodedUri,
    filename: "amazon_media_links.csv",
    saveAs: true
  });
}

function displayError(message) {
  console.error("Displaying error:", message);
  document.getElementById('loadingIndicator').style.display = 'none';
  const container = document.getElementById('contentContainer');
  container.innerHTML = `<p style="color: red;">${message}</p>`;
  document.getElementById('downloadSelected').disabled = true;
  document.getElementById('exportCSV').disabled = true;
}

// Additional function to display videos (if not already implemented)
function displayVideos(media) {
  const container = document.getElementById('videoList');
  container.innerHTML = '';

  if (media.videos && media.videos.length > 0) {
    media.videos.forEach(video => {
      container.appendChild(createMediaElement(video.url, 'video', null, video.thumbnailUrl, video.isHLS));
    });
  } else {
    container.innerHTML = '<p>No videos found.</p>';
  }
}

// Function to display all media
function displayMedia(media) {
  try {
    console.log('Received media data:', JSON.stringify(media, null, 2));
    if (!media || typeof media !== 'object') {
      throw new Error('Invalid media data received');
    }
    displayImages(media);
    displayVideos(media);
    updateMediaCounts(media);
  } catch (error) {
    console.error('Error displaying media:', error);
    document.getElementById('imageVariations').innerHTML = '<p>Error loading images. Please try again.</p>';
    document.getElementById('videoList').innerHTML = '<p>Error loading videos. Please try again.</p>';
    document.getElementById('imageCount').textContent = '0';
    document.getElementById('videoCount').textContent = '0';
  }
}

function updateMediaCounts(media) {
  let imageCount = 0;
  if (media.mainImages && Array.isArray(media.mainImages)) {
    imageCount += media.mainImages.length;
  }
  if (media.variantImages && Array.isArray(media.variantImages)) {
    imageCount += media.variantImages.length;
  }
  
  document.getElementById('imageCount').textContent = imageCount;
  
  let videoCount = 0;
  if (media.videos && Array.isArray(media.videos)) {
    videoCount = media.videos.length;
  }
  document.getElementById('videoCount').textContent = videoCount;
}