import SuperScene from './SuperScene.js';

export default class BootScene extends SuperScene {
  static key() {
    return 'BootScene';
  }

  constructor() {
    super({key: BootScene.key()});
  }

  preload() {
    super.preload();

    this.game.preloadScenes.forEach((sceneClass) => {
      if (sceneClass.name === this.name) {
        return;
      }

      const scene = new sceneClass();
      scene.preload.call(this);
    });
  }

  create() {
    super.create();

    this.game.initializeShaders();

    setTimeout(() => {
      this.game.preloadComplete();
    });
  }

  saveStateFieldName() {
    return null;
  }
}
