console.log("Content script starting to load");

chrome.runtime.sendMessage({action: "contentScriptLoaded"}, function(response) {
  console.log("Content script loaded message sent");
});

function getProductMedia() {
  console.log("getProductMedia function called");
  const mediaData = extractMediaData();
  console.log("Extracted media data:", mediaData);
  const { mainImages, variantImages } = getImages(mediaData);
  const videos = getVideos(mediaData);

  return { mainImages, variantImages, videos };
}

function extractMediaData() {
  console.log("extractMediaData function called");
  let mediaData = { colorImages: {}, videos: [] };

  const scripts = document.querySelectorAll('script');
  
  // Extract colorImages data
  const colorImagesScript = Array.from(scripts).find(script => script.textContent.includes('var obj = jQuery.parseJSON'));
  if (colorImagesScript) {
    const scriptContent = colorImagesScript.textContent;
    const match = scriptContent.match(/var obj = jQuery\.parseJSON\('(.+?)'\);/);
    if (match) {
      try {
        const jsonStr = match[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
        const parsedData = JSON.parse(jsonStr);
        mediaData.colorImages = parsedData.colorImages || {};
      } catch (e) {
        console.error('Error parsing colorImages:', e);
      }
    }
  }

  // Extract videos data
  const videosScript = Array.from(scripts).find(script => script.textContent.includes('"videos":'));
  if (videosScript) {
    const scriptContent = videosScript.textContent;
    const match = scriptContent.match(/"videos":\s*(\[.+?\])/);
    if (match) {
      try {
        mediaData.videos = JSON.parse(match[1].replace(/\\"/g, '"').replace(/\\'/g, "'"));
      } catch (e) {
        console.error('Error parsing videos:', e);
      }
    }
  }

  console.log("Extracted mediaData:", mediaData);
  return mediaData;
}

function getImages(mediaData) {
  console.log("getImages function called");
  const mainImages = new Set();
  const variantImages = new Set();

  if (mediaData && mediaData.colorImages) {
    Object.entries(mediaData.colorImages).forEach(([variant, images]) => {
      if (Array.isArray(images)) {
        images.forEach(image => {
          const imageUrl = image.hiRes || image.large;
          if (imageUrl) {
            if (variant === 'initial') {
              mainImages.add(imageUrl);
            } else {
              variantImages.add(imageUrl);
            }
          }
        });
      }
    });
  }

  console.log("Main images found:", mainImages.size);
  console.log("Variant images found:", variantImages.size);

  return {
    mainImages: Array.from(mainImages).map(url => ({
      url: url,
      alt: 'Main Product Image',
      type: 'main'
    })),
    variantImages: Array.from(variantImages).map(url => ({
      url: url,
      alt: 'Variant Image',
      type: 'variant'
    }))
  };
}

function getVideos(mediaData) {
  console.log("getVideos function called");
  const videos = new Set();

  if (mediaData && mediaData.videos) {
    mediaData.videos.forEach(video => {
      if (video.url) {
        videos.add({
          url: video.url,
          thumbnailUrl: video.thumbUrl || video.slateUrl || '',
          type: 'video'
        });
      }
    });
  }

  console.log("Videos found:", videos.size);
  return Array.from(videos);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in content script:", request);
  if (request.action === 'getMedia') {
    console.log("Getting media data");
    const mediaData = getProductMedia();
    console.log("Media data to be sent:", mediaData);
    chrome.runtime.sendMessage({
      action: "mediaLoaded",
      data: mediaData
    });
    sendResponse({status: "Media loading initiated"});
  }
  return true;  // Indicates that the response is sent asynchronously
});

chrome.runtime.sendMessage({action: "contentScriptFullyLoaded"});

console.log("Content script fully loaded");