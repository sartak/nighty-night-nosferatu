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

  game.assets[type][key] = input;
}

export function preloadAssets(scene, assets) {
  const {game} = scene;

  Object.entries(assets).forEach(([type, entries]) => {
    if (!loaderMethod[type]) {
      // eslint-disable-next-line no-console
      console.error(`No loader for assets of type ${type}`);
      return;
    }

    if (!game.assets[type]) {
      game.assets[type] = {};
    }

    Object.entries(entries).forEach(([key, input]) => {
      loadAsset(scene, type, key, input);
    });
  });
}
