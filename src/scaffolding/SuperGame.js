import Phaser from 'phaser';
import BootScene from './boot-scene';
import prop, {commands} from '../props';
import {updatePropsFromStep} from './lib/manage-gui';
import {name as project} from '../../package.json';
import analytics from './lib/analytics';
import CommandManager from './CommandManager';

const baseConfig = {
  type: Phaser.AUTO,
  parent: 'engine',
  width: 800,
  height: 600,
};

export default class SuperGame extends Phaser.Game {
  constructor(subConfig, preloadScenes) {
    const config = {
      ...baseConfig,
      ...subConfig,
    };

    super(config);

    this.debug = config.debug;

    this.scene.add('BootScene', BootScene, true, {seed: Date.now()});

    this.preloadScenes = preloadScenes;

    // hack to stop phaser from rejecting our fullscreen
    // eslint-disable-next-line no-proto
    this.scale.__proto__.onFullScreenChange = function() {};

    this.prop = prop;

    this._replayPreflight = 0;

    this._onDisableDebugUI = [];

    this.command = new CommandManager(commands);

    this._sceneConstructors = {};
    [
      BootScene,
      ...preloadScenes,
    ].forEach((sceneClass) => {
      this._sceneConstructors[sceneClass.name] = sceneClass;
    });

    if (config.debug) {
      const game = this;
      window.scene = new Proxy({}, {
        get(target, key) {
          return game.topScene()[key];
        },
      });
    }

    this.events.on('step', () => {
      const topScene = this.topScene();

      this.readRawInput();

      if (config.debug) {
        if (this._replayPreflight > 0) {
          return;
        }

        if (!this.disableDebug && (!topScene._replay || !topScene._replay.timeSight)) {
          updatePropsFromStep();
        }

        if (prop('engine.throttle')) {
          const begin = new Date().getTime();
          // eslint-disable-next-line no-empty
          while ((new Date()).getTime() - begin < 50) {
          }
        }
      }
    });
  }

  changeVolume(newVolume) {
    this.volume = newVolume;

    if (this.currentMusicPlayer) {
      this.currentMusicPlayer.setVolume(newVolume);
    }

    this.scene.scenes.forEach((scene) => {
      scene.changeVolume(newVolume);
    });
  }

  topScene() {
    const {scenes} = this.scene;
    return scenes[scenes.length - 1];
  }

  preloadComplete() {
    const spinner = document.getElementById('spinner');
    if (spinner && spinner.parentNode) {
      spinner.parentNode.removeChild(spinner);
    }

    this._preloadedAssets = true;
    this.tryLaunch();
  }

  activateGame(callback) {
    if (!this._activatedGame) {
      this._activatedGame = [];
    }

    if (callback) {
      this._activatedGame.push(callback);
    }

    this.tryLaunch();
  }

  tryLaunch() {
    if (!this._preloadedAssets || !this._activatedGame) {
      return;
    }

    if (this._launchedGame) {
      if (this._activatedGame) {
        this._activatedGame.forEach((callback) => {
          callback();
        });
        delete this._activatedGame;
      }
      return;
    }

    if (this._launchingGame) {
      return;
    }

    this._launchingGame = true;

    analytics('00 started game');

    // eslint-disable-next-line no-console
    console.warn(`Welcome to ${project}!`);

    // if clicking comes first, removing the scene immediately after
    // preloading finishes causes a crash
    setTimeout(() => {
      if (this.renderer.type === Phaser.CANVAS) {
        // eslint-disable-next-line no-alert
        alert('It looks like this browser will offer a degraded experience. For best results, please use Chrome!');
      }

      const cover = document.getElementById('cover');
      if (cover && cover.parentNode) {
        cover.parentNode.removeChild(cover);
      }

      this.scene.remove(BootScene.key());
      this.launch();

      this._activatedGame.forEach((callback) => {
        callback();
      });
      delete this._activatedGame;
      this._launchedGame = true;
    });
  }

  onDisableDebugUI(callback) {
    if (this.disableDebug) {
      callback();
    } else {
      this._onDisableDebugUI.push(callback);
    }
  }

  disableDebugUI() {
    if (this.disableDebug) {
      return;
    }

    this.disableDebug = true;

    this._onDisableDebugUI.forEach((callback) => callback());

    const manage = document.querySelector('.development .Manage');
    if (manage) {
      manage.remove();
    }

    const replay = document.querySelector('.development .Replay');
    if (replay) {
      replay.remove();
    }

    const log = document.querySelector('.development .Logging');
    if (log) {
      log.remove();
    }
  }

  forceQuit() {
    this.stopRecording();
    this.stopReplay();

    this.destroy();

    const engine = document.querySelector('#engine-container');
    if (engine) {
      engine.remove();
    }

    this.disableDebugUI();

    const isInFullScreen = document.fullscreenElement
      || document.webkitFullscreenElement
      || document.mozFullScreenElement
      || document.msFullscreenElement;

    if (isInFullScreen) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  zeroPrefix(number, zeros) {
    let n = number;
    let o = '';
    for (let i = 1; i < zeros; i += 1) {
      if (n < 10) {
        o += '0';
      } else {
        n /= 10;
      }
    }

    return `${o}${number}`;
  }

  renderDateTime(date) {
    const zero = (n) => this.zeroPrefix(n, 2);
    return [
      [date.getFullYear(), zero(date.getMonth() + 1), zero(date.getDate())].join('-'),
      [date.getHours(), zero(date.getMinutes()), zero(date.getSeconds())].join(':'),
    ].join(' ');
  }

  renderMillisecondDuration(duration) {
    const m = Math.floor(duration / 1000 / 60);
    if (m > 99) return '99:99.99+';
    const s = duration / 1000 - m * 60;
    return `${m}:${this.zeroPrefix(s.toFixed(3), 2)}`;
  }

  beginRecording(options = {}) {
    const scene = this.topScene();

    const now = new Date();

    this._recording = {
      timestamp: now.getTime(),
      initData: scene.scene.settings.data,
      sceneName: scene.constructor.name,
      name: this.renderDateTime(now),
      ...options,
    };

    scene.beginRecording(this._recording);

    if (this._recording.snapshot) {
      this.stopRecording();
    } else if (this.onRecordBegin) {
      this.onRecordBegin(this._recording);
    }
  }

  stopRecording() {
    const recording = this._recording;
    if (!recording) {
      return;
    }

    this.topScene().stopRecording();
    delete this._recording;

    if (this.onRecordStop) {
      this.onRecordStop(recording);
    }

    return recording;
  }

  beginReplay(replay) {
    this._replay = replay;

    const save = JSON.parse(JSON.stringify(replay.sceneSaveState));

    const newScene = this.topScene().replaceWithSceneNamed(replay.sceneName, replay.initData.seed, {...replay.initData, save});
    if (!newScene) {
      // eslint-disable-next-line no-console
      console.warn(`No scene returned from replaceWithSceneNamed,
so we are probably about to crash. Perhaps you need to schedule the event
handler to fire outside the game loop with a setTimeout or something?`);
    }

    this.topScene().beginReplay(replay, {
      onEnd: () => {
        this.endedReplay();
      },
      onStop: () => {
        this.stopReplay(true);
      },
    });

    if (this.onReplayBegin) {
      this.onReplayBegin(replay);
    }
  }

  endedReplay() {
    if (!this._replay) {
      return;
    }

    const replay = this._replay;
    delete this._replay;

    if (this.onReplayEnd) {
      this.onReplayEnd(replay);
    }
  }

  stopReplay(skipDownward) {
    if (!this._replay) {
      return;
    }

    const replay = this._replay;
    delete this._replay;

    if (!skipDownward) {
      this.topScene().stopReplay();
    }

    if (this.onReplayStop) {
      this.onReplayStop(replay);
    }
  }

  playMusic(name, forceRestart) {
    if (forceRestart || this.currentMusicName !== name) {
      this.currentMusicName = name;
      if (this.currentMusicPlayer) {
        this.currentMusicPlayer.destroy();
      }

      const music = this.sound.add(name);
      music.play('', {loop: true});
      music.setVolume(this.volume);
      this.currentMusicPlayer = music;
    }
  }

  readRawInput() {
    const scenes = this.scene.scenes.filter((scene) => scene.input.gamepad);
    if (scenes) {
      this.command.readRawGamepad(scenes);
    }
  }
}
