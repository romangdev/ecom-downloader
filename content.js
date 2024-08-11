console.log("Content script starting to load");

chrome.runtime.sendMessage({action: "contentScriptLoaded"}, function(response) {
  console.log("Content script loaded message sent");
});

// content.js

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
  let mediaData = { colorImages: {}, videos: [], landingAsinColor: '' };

  const scripts = document.querySelectorAll('script');
  
  // Extract colorImages and video data
  const dataScript = Array.from(scripts).find(script => script.textContent.includes('var obj = jQuery.parseJSON'));
  if (dataScript) {
    const scriptContent = dataScript.textContent;
    const match = scriptContent.match(/var obj = jQuery\.parseJSON\('(.+?)'\);/);
    if (match) {
      try {
        const jsonStr = match[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
        const parsedData = JSON.parse(jsonStr);
        mediaData.colorImages = parsedData.colorImages || {};
        mediaData.landingAsinColor = parsedData.landingAsinColor || '';
        mediaData.videos = parsedData.videos || [];
      } catch (e) {
        console.error('Error parsing JSON data:', e);
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
    const defaultColor = mediaData.landingAsinColor || Object.keys(mediaData.colorImages)[0];
    
    console.log("Default color (landingAsinColor):", defaultColor);
    console.log("Color variants:", Object.keys(mediaData.colorImages));

    Object.entries(mediaData.colorImages).forEach(([variant, images]) => {
      console.log(`Processing variant: ${variant}`);
      if (Array.isArray(images)) {
        images.forEach(image => {
          const imageUrl = image.hiRes || image.large;
          if (imageUrl) {
            if (variant === defaultColor) {
              console.log(`Adding main image: ${imageUrl}`);
              mainImages.add(imageUrl);
            } else {
              console.log(`Adding variant image: ${imageUrl}`);
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
      console.log("Processing video:", video);

      const videoUrl = video.url;
      const isHLS = videoUrl.includes('.m3u8');

      const thumbnailUrl = video.slateUrl || 
                           (video.thumb && video.thumb.large) ||
                           (video.thumb && video.thumb.thumb) ||
                           video.thumbUrl ||
                           '';

      videos.add({
        url: videoUrl,
        thumbnailUrl: thumbnailUrl,
        type: 'video',
        isHLS: isHLS
      });

      console.log(`Video added: ${videoUrl}`);
      console.log(`Is HLS: ${isHLS}`);
      console.log(`Thumbnail used: ${thumbnailUrl}`);
    });
  }

  console.log("Videos found:", videos.size);
  return Array.from(videos);
}

// Helper function to check if a URL exists
function urlExists(url) {
  return new Promise((resolve) => {
    fetch(url, { method: 'HEAD' })
      .then(response => resolve(response.ok))
      .catch(() => resolve(false));
  });
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