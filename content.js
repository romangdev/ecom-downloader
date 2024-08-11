console.log("Content script starting to load");

chrome.runtime.sendMessage({action: "contentScriptLoaded"}, function(response) {
  console.log("Content script loaded message sent");
});

function getProductMedia() {
  console.log("getProductMedia function called");
  const mediaData = extractMediaData();
  console.log("Extracted media data:", mediaData);
  const { mainImages, variantImages, variants, defaultVariant } = getImages(mediaData);
  const videos = getVideos(mediaData);

  return { mainImages, variantImages, videos, variants, defaultVariant };
}

function extractMediaData() {
  console.log("extractMediaData function called");
  let mediaData = { colorImages: {}, videos: [], landingAsinColor: '', colorToAsin: {} };

  const scripts = document.querySelectorAll('script');
  
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
        mediaData.colorToAsin = parsedData.colorToAsin || {};
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
  const mainImages = [];
  const variantImages = [];
  let variants = {};
  const defaultVariant = mediaData.landingAsinColor || Object.keys(mediaData.colorImages)[0];

  if (mediaData && mediaData.colorImages) {
    console.log("Default color (landingAsinColor):", defaultVariant);
    console.log("Color variants:", Object.keys(mediaData.colorImages));

    Object.keys(mediaData.colorImages).forEach(variant => {
      const asin = mediaData.colorToAsin && mediaData.colorToAsin[variant] ? mediaData.colorToAsin[variant].asin : 'N/A';
      variants[variant] = { name: variant, isDefault: variant === defaultVariant, asin: asin };
      
      const images = mediaData.colorImages[variant];
      if (Array.isArray(images)) {
        images.forEach(image => {
          const imageUrl = image.hiRes || image.large;
          if (imageUrl) {
            const imageObj = {
              url: imageUrl,
              alt: `${variant} Image`,
              type: variant === defaultVariant ? 'main' : 'variant',
              variant: variant
            };
            if (variant === defaultVariant) {
              mainImages.push(imageObj);
            } else {
              variantImages.push(imageObj);
            }
          }
        });
      }
    });
  }

  console.log("Main images found:", mainImages.length);
  console.log("Variant images found:", variantImages.length);
  console.log("Variants:", variants);

  return { mainImages, variantImages, variants, defaultVariant };
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
        isHLS: isHLS,
        title: video.title || 'Untitled',
        duration: formatDuration(video.durationSeconds || 0)
      });

      console.log(`Video added: ${videoUrl}`);
      console.log(`Is HLS: ${isHLS}`);
      console.log(`Thumbnail used: ${thumbnailUrl}`);
      console.log(`Title: ${video.title || 'Untitled'}`);
      console.log(`Duration: ${formatDuration(video.durationSeconds || 0)}`);
    });
  }

  console.log("Videos found:", videos.size);
  return Array.from(videos);
}

function formatDuration(seconds) {
  if (seconds === 0) return 'Unknown';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
  return true;
});

chrome.runtime.sendMessage({action: "contentScriptFullyLoaded"});

console.log("Content script fully loaded");