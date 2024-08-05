console.log("Content script starting to load");

chrome.runtime.sendMessage({action: "contentScriptLoaded"}, function(response) {
  console.log("Content script loaded message sent");
});

async function getProductMedia() {
  try {
    await loadAllVariantImagesAndVideos();
    const images = getHighQualityImages();
    const videos = getVideos();
    const variantImages = getVariantImages();

    chrome.runtime.sendMessage({
      action: "mediaLoaded",
      data: { images, videos, variantImages }
    });
  } catch (error) {
    console.error('Error getting product media:', error);
    chrome.runtime.sendMessage({
      action: "mediaLoaded",
      data: { images: [], videos: [], variantImages: [] }
    });
  }
}

async function loadAllVariantImagesAndVideos() {
  const variantThumbs = document.querySelectorAll('.imageThumbnail, .videoThumbnail');
  for (let thumb of variantThumbs) {
    await new Promise(resolve => {
      thumb.click();
      setTimeout(resolve, 500); // Reduced wait time to 500ms
    });
  }
}

function getHighQualityImages() {
  const imageUrls = new Set();
  
  function getHighResUrl(img) {
    if (img.dataset.oldHires) return img.dataset.oldHires;
    if (img.dataset.aPlus) return img.dataset.aPlus;
    
    if (img.dataset.aLargeImage) {
      try {
        const largeImage = JSON.parse(img.dataset.aLargeImage);
        if (largeImage.url) return largeImage.url;
      } catch (e) {
        console.error('Error parsing a-large-image:', e);
      }
    }
    
    if (img.srcset) {
      const srcset = img.srcset.split(',').map(src => {
        const [url, width] = src.trim().split(' ');
        return { url, width: parseInt(width) };
      });
      const highestRes = srcset.reduce((prev, current) => 
        (current.width > prev.width) ? current : prev
      );
      return highestRes.url;
    }
    
    return img.src;
  }

  document.querySelectorAll('#altImages img, #main-image-container img, #imageBlock img').forEach(img => {
    const highResUrl = getHighResUrl(img);
    if (highResUrl && !highResUrl.includes('x-spritesheet') && isHighQualityImage(highResUrl)) {
      imageUrls.add(highResUrl);
    }
  });

  return Array.from(imageUrls).map(url => ({
    url: url,
    alt: 'Product Image',
    type: 'image'
  }));
}

function getVariantImages() {
  const variantImages = new Set();
  
  function getHighResUrl(img) {
    if (img.dataset.oldHires) return img.dataset.oldHires;
    if (img.dataset.aPlus) return img.dataset.aPlus;
    
    if (img.dataset.aLargeImage) {
      try {
        const largeImage = JSON.parse(img.dataset.aLargeImage);
        if (largeImage.url) return largeImage.url;
      } catch (e) {
        console.error('Error parsing a-large-image:', e);
      }
    }
    
    if (img.srcset) {
      const srcset = img.srcset.split(',').map(src => {
        const [url, width] = src.trim().split(' ');
        return { url, width: parseInt(width) };
      });
      const highestRes = srcset.reduce((prev, current) => 
        (current.width > prev.width) ? current : prev
      );
      return highestRes.url;
    }
    
    return img.src;
  }

  document.querySelectorAll('.twisterImageDiv img, #variation_color_name img').forEach(img => {
    const highResUrl = getHighResUrl(img);
    if (highResUrl && !highResUrl.includes('x-spritesheet') && isHighQualityImage(highResUrl)) {
      variantImages.add(highResUrl);
    }
  });

  return Array.from(variantImages).map(url => ({
    url: url,
    alt: 'Variant Image',
    type: 'variant'
  }));
}

function isHighQualityImage(url) {
  // Check if the URL contains indicators of high quality
  const highQualityIndicators = ['_AC_SL1500_', '_AC_SX679_', '_AC_UL1500_'];
  return highQualityIndicators.some(indicator => url.includes(indicator));
}

function getVideos() {
  const videos = [];
  
  // Check for video in the main media container
  const mainVideoElement = document.querySelector('#main-video-container video');
  if (mainVideoElement && mainVideoElement.src) {
    const thumbnailUrl = mainVideoElement.poster || getVideoThumbnail(mainVideoElement);
    videos.push({
      url: mainVideoElement.src,
      thumbnailUrl: thumbnailUrl,
      type: 'video'
    });
  }
  
  // Check for videos in the variant selector
  const videoElements = document.querySelectorAll('.videoThumbnail');
  videoElements.forEach(element => {
    const dataUrl = element.getAttribute('data-url');
    const thumbnailUrl = element.querySelector('img')?.src || '';
    if (dataUrl) {
      videos.push({
        url: dataUrl,
        thumbnailUrl: thumbnailUrl,
        type: 'video'
      });
    }
  });

  // Check for videos in script tags
  const scriptElements = document.querySelectorAll('script[type="text/template"]');
  scriptElements.forEach(script => {
    try {
      const content = JSON.parse(script.textContent);
      if (content.videos && Array.isArray(content.videos)) {
        content.videos.forEach(video => {
          if (video.url) {
            videos.push({
              url: video.url,
              thumbnailUrl: video.thumbnailUrl || '',
              type: 'video'
            });
          }
        });
      }
    } catch (e) {
      console.error('Error parsing video script:', e);
    }
  });

  return videos;
}

function getVideoThumbnail(videoElement) {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  canvas.getContext('2d').drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in content script:", request);
  if (request.action === 'getMedia') {
    console.log("Getting media data");
    getProductMedia();
    sendResponse({status: "Media loading initiated"});
  }
  return true;  // Indicates that the response is sent asynchronously
});

chrome.runtime.sendMessage({action: "contentScriptFullyLoaded"});

console.log("Content script fully loaded");