const loaderMethod = {
  imageAssets: 'image',
  spriteAssets: 'spritesheet',
  musicAssets: 'audio',
  soundAssets: 'audio',
};

const unloadFunction = {
  imageAssets: (scene, key) => {
    scene.load.textureManager.remove(key);
  },
  musicAssets: (scene, key) => {
    scene.cache.audio.remove(key);
  },
};

unloadFunction.spriteAssets = unloadFunction.imageAssets;
unloadFunction.soundAssets = unloadFunction.musicAssets;

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

let isLoading = false;
export function assetReloader(scene) {
  const {game} = scene;

  if (isLoading) {
    throw new Error('assetReloader does not yet support concurrency');
  }
  isLoading = true;

  const assets = {
  };

  const typeForKey = {
  };

  // eslint-disable-next-line no-proto
  const proto = scene.load.__proto__;

  const origKeyExists = proto.keyExists;
  proto.keyExists = () => false;

  const origFileProcessComplete = proto.fileProcessComplete;
  proto.fileProcessComplete = (file) => {
    const type = typeForKey[file.key];
    unloadFunction[type](scene, file.key);
    return origFileProcessComplete.call(scene.load, file);
  };

  const reload = (type, key, value, isNew) => {
    if (!assets[type]) {
      assets[type] = {};
    }

    typeForKey[key] = type;
    assets[type][key] = undefined;
    loadAsset(scene, type, key, value);
  };

  const remove = (type, key) => {
    if (!assets[type]) {
      assets[type] = {};
    }

    typeForKey[key] = type;
    assets[type][key] = null;
    unloadFunction[type](scene, key);
    delete game.assets[type][key];
  };

  const done = (...args) => {
    scene.load.on('filecomplete', (key, _, object) => {
      const type = typeForKey[key];

      if (!assets[type]) {
        assets[type] = {};
      }

      assets[type][key] = object;
    });

    let completeResolve;
    scene.load.on('complete', () => {
      if (completeResolve) {
        completeResolve();
      }
    });

    const promise = new Promise((resolve, reject) => {
      completeResolve = () => {
        completeResolve = null;

        proto.keyExists = origKeyExists;
        proto.fileProcessComplete = origFileProcessComplete;

        isLoading = false;

        resolve([assets, ...args]);
      };
    });

    scene.load.start();

    // we didn't load anything
    if (scene.load.isReady()) {
      if (completeResolve) {
        completeResolve();
      }
    }

    return promise;
  };

  return [reload, remove, done];
}

export function reloadAssets(scene, assets) {
  const {game} = scene;
  const [reloadAsset, removeAsset, startReload] = assetReloader(scene);
  const changesByType = {};

  ['imageAssets', 'spriteAssets', 'musicAssets', 'soundAssets'].forEach((type) => {
    const gameAssets = game.assets[type];
    const leftover = {...gameAssets};
    const changes = changesByType[type] = [];

    Object.entries(assets[type]).forEach(([key, value]) => {
      if (!gameAssets[key]) {
        changes.push(`+${key}`);
        reloadAsset(type, key, value, true);
      } else {
        delete leftover[key];

        if (JSON.stringify(gameAssets[key]) === JSON.stringify(value)) {
          return;
        }

        changes.push(`Δ${key}`);
        reloadAsset(type, key, value, false);
      }
    });

    Object.entries(leftover).forEach(([key, value]) => {
      changes.push(`-${key}`);
      removeAsset(type, key);
    });
  });

  return startReload(changesByType);
}
