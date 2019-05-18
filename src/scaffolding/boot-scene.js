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

    this.load.on('complete', () => {
      this.game.preloadComplete();
    });

    this.game.preloadScenes.forEach((sceneClass) => {
      if (sceneClass.name === this.name) {
        return;
      }

      const scene = new sceneClass();
      scene.preload.call(this);
    });

    if (!this.load.list.size) {
      this.game.preloadComplete();
    }
  }

  saveStateFieldName() {
    return null;
  }
}
