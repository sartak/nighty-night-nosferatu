import Phaser from 'phaser';
import BootScene from './boot-scene';
import prop, {commands, shaderCoordFragments, shaderColorFragments} from '../props';
import {updatePropsFromStep} from './lib/manage-gui';
import {shaderTypeMeta} from './lib/props';
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

    this._shaderSource = {};
    this._shaderCoordFragments = shaderCoordFragments;
    this._shaderColorFragments = shaderColorFragments;
    this.shaderFragments = [...(shaderCoordFragments || []), ...(shaderColorFragments || [])];

    this.focused = true;

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
      window.prop = prop;
    }

    this.events.on('step', () => {
      const topScene = this.topScene();

      this.readRawInput();

      if (config.debug) {
        if (this._replayPreflight > 0) {
          return;
        }

        if (!this.disableDebug && (!topScene._replay || !topScene._replay.timeSight)) {
          updatePropsFromStep(false);
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
      this.currentMusicPlayer.setVolume(newVolume * prop('scene.musicVolume'));
    }

    this.scene.scenes.forEach((scene) => {
      scene.changeVolume(newVolume);
    });
  }

  setFocused(isFocused) {
    if (this.focused === isFocused) {
      return;
    }

    this.focused = isFocused;
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
      music.setVolume(this.volume * prop('scene.musicVolume'));
      this.currentMusicPlayer = music;
    }
  }

  readRawInput() {
    const scenes = this.scene.scenes.filter((scene) => scene.input.gamepad);
    if (scenes) {
      this.command.readRawGamepad(scenes);
    }
  }

  cutoffTimeSightEnter() {
    this.topScene().cutoffTimeSightEnter();
  }

  cutoffTimeSightChanged(start, end) {
    this.topScene().cutoffTimeSightChanged(start, end);
  }

  cutoffTimeSightLeave() {
    this.topScene().cutoffTimeSightLeave();
  }

  shaderInstance(shaderName = 'main') {
    if (this.renderer.type !== Phaser.WEBGL) {
      return null;
    }

    return this.renderer.getPipeline(shaderName);
  }

  initializeShader(shaderName = 'main', replace) {
    if (this.renderer.type !== Phaser.WEBGL) {
      return;
    }

    if (!replace && this.renderer.hasPipeline(shaderName)) {
      return;
    }

    const source = this.fullShaderSource();

    if (source) {
      const shaderClass = this.shaderInstantiation(source);
      const shader = new shaderClass(this);

      // undefined `active` indicates the shader didn't completely load,
      // probably due to a compile error
      if (!shader || shader.active === undefined) {
        return;
      }

      if (replace) {
        this.renderer.removePipeline(shaderName);
      }

      this.renderer.addPipeline(shaderName, shader);

      shader.setFloat2('resolution', this.config.width, this.config.height);
    } else {
      this.renderer.removePipeline(shaderName);
    }

    this._shaderSource[shaderName] = source;
  }

  updateShaderFragments(nextCoord, nextColor) {
    this._shaderCoordFragments = nextCoord;
    this._shaderColorFragments = nextColor;
    this.shaderFragments = [...(nextCoord || []), ...(nextColor || [])];

    this.recompileShader();
  }

  shaderMainFull() {
    const [shaderCoordSource, shaderColorSource] = [this._shaderCoordFragments, this._shaderColorFragments].map((fragments) => {
      if (!fragments) {
        return '';
      }

      return fragments.filter(([name]) => prop(`shader.${name}.enabled`)).map(([, , source]) => source).join('\n');
    });

    if (!shaderCoordSource && !shaderColorSource) {
      return;
    }

    return `
      void main( void ) {
        vec2 uv = outTexCoord;

        ${shaderCoordSource}

        vec4 c = texture2D(u_texture, uv);

        ${shaderColorSource}

        c.r *= c.a;
        c.g *= c.a;
        c.b *= c.a;

        gl_FragColor = vec4(c.r, c.g, c.b, 1.0);
      }
    `;
  }

  fullShaderSource() {
    const builtinDeclarations = `
      precision mediump float;
    `;

    const builtinUniforms = `
      uniform sampler2D u_texture;
      varying vec2      outTexCoord;

      uniform vec2 resolution;
      uniform vec2 camera_scroll;
    `;

    const uniformNames = [];
    const uniformDeclarations = [];

    this.shaderFragments.forEach(([fragmentName, uniforms]) => {
      if (!prop(`shader.${fragmentName}.enabled`)) {
        return;
      }

      Object.entries(uniforms).forEach(([uniformName, [type]]) => {
        const name = `${fragmentName}_${uniformName}`;
        uniformNames.push(name);
        const [, uniformType] = shaderTypeMeta[type];
        uniformDeclarations.push(`uniform ${uniformType} ${name};\n`);
      });
    });

    const userShaderMain = this.shaderMainFull();
    if (!userShaderMain) {
      return userShaderMain;
    }

    uniformNames.forEach((name) => {
      const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

      if (!userShaderMain.match(regex)) {
        // eslint-disable-next-line no-console
        console.error(`Shader program doesn't appear use uniform '${name}'. (If this is a false positive, try adding this to your program: // ${name}`);
      }
    });

    return `
      ${builtinDeclarations}
      ${builtinUniforms}
      ${uniformDeclarations.join('')}
      ${userShaderMain}
    `;
  }

  recompileShader(shaderName = 'main') {
    if (this.renderer.type !== Phaser.WEBGL) {
      return;
    }

    const oldSource = this._shaderSource[shaderName];
    const newSource = this.fullShaderSource();

    if (oldSource === newSource) {
      return;
    }

    // eslint-disable-next-line no-console
    console.info(`Hot-loading shader ${shaderName}`);

    this._shaderSource[shaderName] = newSource;

    if (newSource) {
      this.initializeShader(shaderName, true);
    }
    else {
      this.renderer.removePipeline(shaderName);
    }

    const shader = this.shaderInstance();

    this.scene.scenes.forEach((scene) => {
      scene.shader = shader;
      if (newSource) {
        scene._shaderInitialize();
        scene._shaderUpdate();
        scene.cameras.main.setPipeline(shader);
      } else {
        scene.cameras.main.clearRenderToTexture();
      }
    });
  }

  disableShader(shaderName = 'main') {
    if (this.renderer.type !== Phaser.WEBGL) {
      return;
    }

    this._shaderSource[shaderName] = null;

    this.renderer.removePipeline(shaderName);

    const shader = this.shaderInstance(shaderName);

    this.scene.scenes.forEach((scene) => {
      scene.shader = shader;
      scene.cameras.main.clearRenderToTexture();
    });
  }

  shaderInstantiation(fragShader) {
    try {
      return new Phaser.Class({
        Extends: Phaser.Renderer.WebGL.Pipelines.TextureTintPipeline,
        initialize: function Shader(game) {
          try {
            Phaser.Renderer.WebGL.Pipelines.TextureTintPipeline.call(this, {
              game,
              renderer: game.renderer,
              fragShader,
            });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
          }
        },
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }
}
