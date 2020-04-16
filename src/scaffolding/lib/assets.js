const loaderMethod = {
  imageAssets: 'image',
  spriteAssets: 'spritesheet',
  musicAssets: 'audio',
  soundAssets: 'audio',
};

function massageInput(type, game, input) {
  if (type === 'spriteAssets') {
    if (typeof input === 'string') {
      const {spriteWidth, spriteHeight} = game.config;
      if (spriteWidth && spriteHeight) {
        return [input, {frameWidth: spriteWidth, frameHeight: spriteHeight}];
      }

      const {tileWidth, tileHeight} = game.config;
      return [input, {frameWidth: tileWidth, frameHeight: tileHeight}];
    } else {
      const {file} = input;
      return [file, input];
    }
  }

  return [input];
}

export function loadAsset(scene, type, key, input) {
  const {game} = scene;
  const method = loaderMethod[type];

  const params = massageInput(type, game, input);

  scene.load[method](key, ...params);
}

export function preloadAssets(scene, game, assets) {
  Object.entries(assets).forEach(([type, entries]) => {
    Object.entries(entries).forEach(([key, input]) => {
      loadAsset(scene, type, key, input);
    });
  });
}
