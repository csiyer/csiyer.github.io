// stimuli.js — MM.stimuli: helpers over the shared stimuli metadata
// (window.STIMULI_METADATA, loaded via a plain <script> tag in index.html from
// ../stimuli/stimuli_metadata.js) and image-path/preload helpers.
window.MM = window.MM || {};
MM.stimuli = {};

(function () {
  function imageUrl(entry) {
    return MM.config.stimuli_dir + '/' + entry.image_path;
  }

  function instructionImageUrl(filename) {
    return MM.config.stimuli_dir + '/images_for_instructions/' + filename;
  }

  // All candidates in a given memorability bin ('high' | 'low' | 'mid').
  function binPool(bin) {
    return window.STIMULI_METADATA.filter(function (e) { return e.memorability_bin === bin; });
  }

  // Full list of image URLs to preload for a given participant design: the sampled
  // landmark images plus the two fixed instruction-example images.
  function buildPreloadList(landmarkImages) {
    const urls = landmarkImages.map(imageUrl);
    urls.push(instructionImageUrl('banana_13s.jpg'));
    urls.push(instructionImageUrl('car_01b.jpg'));
    return urls;
  }

  MM.stimuli = {
    imageUrl: imageUrl,
    instructionImageUrl: instructionImageUrl,
    binPool: binPool,
    buildPreloadList: buildPreloadList
  };
})();
