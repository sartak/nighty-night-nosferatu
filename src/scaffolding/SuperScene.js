import Phaser from 'phaser';
import deepEqual from 'deep-equal';
import prop, {propsWithPrefix, manageableProps, propSpecs} from '../props';
import {updatePropsFromStep, overrideProps, refreshUI} from './lib/manage-gui';
import massageParticleProps, {injectEmitterOpSeededRandom, injectParticleEmitterManagerPreUpdate, particlePropFromProp} from './lib/particles';
import massageTransitionProps, {baseTransitionProps, applyPause} from './lib/transitions';
import {injectAddSpriteTimeScale} from './lib/sprites';
import {injectAnimationUpdate} from './lib/anims';
import {injectCameraShake} from './lib/camera';
import massageTweenProps, {injectTweenManagerAdd} from './lib/tweens';
import {shaderTypeMeta, propNamesForUniform} from './lib/shaders';
import {saveField, loadField} from './lib/store';

import {parseMaps, parseLevelLines} from './lib/level-parser';
import mapsFile from '../assets/maps.txt';
import * as assets from '../assets/index';
import {preloadAssets, reloadAssets} from './lib/assets';

const baseConfig = {
};

export default class SuperScene extends Phaser.Scene {
  constructor(subconfig) {
    const config = {
      ...baseConfig,
      ...subconfig,
    };
    super(config);

    this.rnd = {};
    this.timeScale = 1;
    this.sounds = [];
    this.timers = [];
    this.performanceFrames = 0;
    this.performanceAcceptable = true;
    this.scene_time = 0;
    this.shockwave_time = 0;
    this._trauma = 0;
    this._traumaShake = 0;
    this._paused = {
      physics: false,
      particles: false,
      timers: false,
      tweens: false,
      anims: false,
    };
  }

  init(config) {
    if (!config.seed) {
      throw new Error(`You must provide a "seed" (e.g. Date.now()) to ${this.constructor.name}`);
    }

    if (!config.sceneId) {
      throw new Error(`You must provide a "sceneId" (e.g. Date.now()) to ${this.constructor.name}`);
    }

    this.sceneId = config.sceneId;

    this.command = this.game.command;
    this.command.attachScene(this, config._timeSightTarget);

    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(0);
    injectCameraShake(this.camera);

    if (config.save) {
      this.save = config.save;
    } else if (!this.save && this.saveStateFieldName()) {
      this.save = loadField(this.saveStateFieldName(), () => {
        const save = this.initialSaveState();
        save.version = this.saveStateVersion();
        return save;
      });
    }

    if (this.save) {
      this.save = this.migrateSaveState(this.save);
    }

    if (!this.save) {
      this.save = {};
    }

    this._initialSave = JSON.parse(JSON.stringify(this.save));

    if (this.physics && this.physics.world) {
      injectAddSpriteTimeScale(this);
      injectTweenManagerAdd(this.tweens);

      if (prop('scene.debugDraw')) {
        this.physics.world.createDebugGraphic();
      }

      // there's no event for physics step, so interject one {
      if (this.fixedUpdate) {
        // make tweens use a fixed update
        const {tweens} = this.scene.systems;
        const eventEmitter = tweens.systems.events;
        eventEmitter.off('update', tweens.update, tweens);

        const {physics} = this;
        const {world} = physics;
        const originalStep = world.step;
        let time = 0;
        physics.time = physics.dt = 0;
        world.step = (originalDelta) => {
          const delta = originalDelta * world.timeScale * world.timeScale;

          const dt = delta * 1000;
          time += dt;
          physics.dt = dt;
          physics.time = time;
          this.scene_time = time;

          if (this.game._stepExceptions > 100) {
            return;
          }

          try {
            const isTopScene = this.isTopScene();

            if (this.timeSightFrozen) {
              if (isTopScene) {
                this.command.processInput(this, time, dt, true);
              }
              this.updateTweens(time, dt);
              this.timeSightMouseDrag();
              return;
            }

            if (!this._paused.physics) {
              originalStep.call(world, delta);
            }

            if (isTopScene) {
              this.command.processInput(this, time, dt);
            }

            if (this.game.updateReplayCursor) {
              this.game.updateReplayCursor(this.command.replayTicks, this._replay);
            }

            if (!this._paused.physics) {
              this.fixedUpdate(time, dt);
            }

            this.updateTimers(time, dt);

            if (this.performanceProps && this.performanceProps.length) {
              this.recoverPerformance();
            }

            this.updateTweens(time, dt);

            this.game._stepExceptions = 0;
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);

            this.game._stepExceptions = (this.game._stepExceptions || 0) + 1;
            if (this.game._stepExceptions > 100) {
              // eslint-disable-next-line no-console
              console.error('Too many errors; pausing update cycle until hot reload');
            }
          }
        };
      }
      // }
    }

    this.sound.pauseOnBlur = false;

    this.particleSystems = [];

    this.sys.events.on('destroy', this.destroy, this);

    ['_recording', '_replay', '_replayOptions'].forEach((key) => {
      this[key] = config[key];
      delete config[key];
    });

    if (this._recording) {
      this._recording.sceneTransitions.push({
        tickCount: this._recording.tickCount,
        timestamp: Date.now(),
        seed: config.seed,
        sceneName: this.constructor.name,
        initData: this.scene.settings.data,
        sceneSaveState: JSON.parse(JSON.stringify(this._initialSave)),
        parentSceneId: config.parentSceneId,
        sceneId: this.sceneId,
        commandState: this.command.freezeCommandState(),
      });
    }

    if (this._replay) {
      const {sceneTransitions} = this._replay;
      const {replayTicks} = this.command;
      for (let i = 0; i < sceneTransitions.length; i += 1) {
        if (sceneTransitions[i].tickCount <= replayTicks) {
          this._replayLatestTransition = sceneTransitions[i];
        } else {
          break;
        }
      }
    }

    const {
      width, height, tileWidth, tileHeight,
    } = this.game.config;
    const mapWidth = Math.floor(width / (tileWidth + 2));
    const mapHeight = Math.floor(height / (tileHeight + 3));

    this.xBorder = (width - (mapWidth * tileWidth)) / 2;
    this.yBorder = (height - (mapHeight * tileHeight)) / 2;

    this.game.sceneDidInit(this);
  }

  saveStateFieldName() {
    return `game_${this.constructor.name}`;
  }

  saveStateVersion() {
    return 0;
  }

  migrateSaveState(originalSave) {
    const target = this.saveStateVersion();
    if (originalSave.version === target) {
      return originalSave;
    }

    const save = JSON.parse(JSON.stringify(originalSave));
    if (!save.version) {
      save.version = 0;
    }

    while (save.version < target) {
      const method = `migrateSaveStateVersion${save.version}`;
      // eslint-disable-next-line no-console
      console.debug(method);
      if (!this[method]) {
        throw new Error(`Missing migration method ${method}`);
      }
      this[method](save);
      save.version += 1;
    }

    return save;
  }

  initialSaveState() {
    return {};
  }

  saveState() {
    saveField(this.saveStateFieldName(), this.save);
  }

  isTopScene() {
    return this.game.topScene() === this;
  }

  vendRNG(name) {
    if (!name) {
      throw new Error('You must provide a name for each RNG sequence');
    }

    if (!this.rnd[name]) {
      const {seed} = this.scene.settings.data;
      this.rnd[name] = new Phaser.Math.RandomDataGenerator([seed, name]);
    }

    return this.rnd[name];
  }

  randFloat(name) {
    return this.vendRNG(name).frac();
  }

  randBetween(name, min, max) {
    return this.randFloat(name) * (max - min) + min;
  }

  randElement(name, list) {
    return list[Math.floor(this.randBetween(name, 0, list.length))];
  }

  create() {
    this.command.attachInputs(this);

    this.startedAt = new Date();

    if (this.setupAnimations) {
      this.setupAnimations();
    }

    const {transition} = this.scene.settings.data;
    if (!transition || !transition.delayNewSceneShader) {
      this._setupShader();
    }
  }

  _setupShader() {
    if (!('shaderName' in this)) {
      this.shaderName = 'main';
    }

    if (this.shaderName) {
      this.game.initializeShader(this.shaderName);
      this.shader = this.game.shaderInstance(this.shaderName);
      if (this.shader) {
        this._shaderInitialize(true);
        this._shaderUpdate();
        this.camera.setRenderToTexture(this.shader);
      }
    }
  }

  preload() {
    this.load.text('_mapsFile', mapsFile);

    preloadAssets(this, assets);
  }

  levelIds() {
    if (!this.game._ldMapFiles) {
      this.game._ldMapFiles = parseMaps(this.cache.text.get('_mapsFile'));
    }

    return this.game._ldMapFiles.map(([, config]) => config.id);
  }

  loadLevel(id) {
    if (!this.game._ldMapFiles) {
      this.game._ldMapFiles = parseMaps(this.cache.text.get('_mapsFile'));
    }
    const mapFiles = this.game._ldMapFiles;

    let index;
    let spec = mapFiles[id];
    if (spec) {
      index = id;
    } else {
      index = mapFiles.findIndex((m) => m[1].id === id);
      spec = mapFiles[index];
    }

    if (!spec) {
      throw new Error(`Cannot find level with id ${id}`);
    }

    const [lines, config] = spec;
    const {map, mapText, lookups} = parseLevelLines(lines, this.mapsAreRectangular);

    const {tileWidth, tileHeight} = this.game.config;
    const heightInTiles = map.length;
    const height = tileHeight * heightInTiles;
    const widthInTiles = Math.max(...map.map((a) => a.length));
    const width = tileWidth * widthInTiles;

    const level = {
      ...config,
      heightInTiles,
      widthInTiles,
      height,
      width,
      map,
      mapText,
      mapLookups: lookups,
      index,
    };

    if (level.background) {
      level.background = this.add.sprite(0, 0, level.background);
      level.background.setPosition(level.background.width * 0.5, level.background.height * 0.5);
    }

    return level;
  }

  setCameraBounds() {
    const {level} = this;

    if (!prop('scene.camera.hasBounds')) {
      this.camera.removeBounds();
      return;
    }

    if (level && level.width && level.height) {
      const boundsX = 0;
      const boundsY = 0;
      let boundsWidth = level.width;
      let boundsHeight = level.height;

      if (this.xBorder) {
        boundsWidth += this.xBorder * 2;
      }

      if (this.yBorder) {
        boundsHeight += this.yBorder * 2;
      }

      this.camera.setBounds(boundsX, boundsY, boundsWidth, boundsHeight);
    }
  }

  setCameraDeadzone() {
    this.camera.setDeadzone(
      prop('scene.camera.deadzoneX'),
      prop('scene.camera.deadzoneY'),
    );
  }

  setCameraLerp() {
    this.camera.setLerp(prop('scene.camera.lerp'));
  }

  firstUpdate(time, dt) {
    this.setCameraBounds();
    this.setCameraDeadzone();
    this.setCameraLerp();
  }

  update(time, dt) {
    if (!this._firstUpdated) {
      this.firstUpdate(time, dt);
      this._firstUpdated = true;
    }

    if (this.physics && this.physics.world.isPaused && !this.timeSightFrozen && this.isTopScene()) {
      this.command.processInput(this, time, dt, true);
    }

    if (this.renderUpdate) {
      this.renderUpdate(time, dt);
    }
    if (this.shader) {
      this._shaderUpdate();
    }

    this.positionBackground();
  }

  positionBackground() {
    const {
      level, game, xBorder, yBorder, camera,
    } = this;
    if (!level) {
      return;
    }

    const {background, width: levelWidth, height: levelHeight} = level;
    if (!background) {
      return;
    }

    const {width: gameWidth, height: gameHeight} = game.config;
    const {width: backgroundWidth, height: backgroundHeight} = background;
    const {scrollX, scrollY} = camera;

    const xDivisor = levelWidth - gameWidth + xBorder * 2;
    if (xDivisor === 0) {
      background.x = backgroundWidth * 0.5;
    } else {
      const xFactor = scrollX / xDivisor;
      background.x = xBorder + backgroundWidth * 0.5 + xFactor * (levelWidth - backgroundWidth);
    }

    const yDivisor = levelHeight - gameHeight + yBorder * 2;
    if (yDivisor === 0) {
      background.y = backgroundHeight * 0.5;
    } else {
      const yFactor = scrollY / yDivisor;
      background.y = yBorder + backgroundHeight * 0.5 + yFactor * (levelHeight - backgroundHeight);
    }
  }

  _shaderInitialize(initializeListeners) {
    this.game.shaderFragments.forEach(([fragmentName, uniforms]) => {
      Object.entries(uniforms).forEach(([uniformName, spec]) => {
        const name = `${fragmentName}_${uniformName}`;
        const [type, listenerInitial, listenerIfNull] = spec;
        if (listenerIfNull === null) {
          if (initializeListeners || !(name in this)) {
            this[name] = listenerInitial;
          }
        } else {
          const [, , setter] = shaderTypeMeta[type];

          const propNames = propNamesForUniform(fragmentName, uniformName, spec);
          let initialValue;

          if (propNames.length === 1) {
            initialValue = prop(propNames[0]);
          } else {
            initialValue = [];
            propNames.forEach((n) => {
              const v = prop(n);
              if (Array.isArray(v)) {
                initialValue.push(...v);
              } else {
                initialValue.push(v);
              }
            });
          }

          if (type === 'rgb' || type === 'rgba') {
            initialValue = initialValue.map((c, i) => (i < 3 ? c / 255.0 : c));
          }

          this.shader[setter](name, initialValue);
        }
      });
    });

    // generate this._shaderUpdate based on what's being used

    // eslint-disable-next-line no-unused-vars
    const {shader, camera} = this;

    if (!shader) {
      this._shaderUpdate = function() {};
    }

    const shaderUpdate = [
      '(function () {',
      `  shader.setFloat2('camera_scroll', camera.scrollX / ${this.game.config.width}, camera.scrollY / ${this.game.config.height});`,
      '  shader.setFloat1(\'scene_time\', this.scene_time);',
    ];

    this.game.shaderFragments.forEach(([fragmentName, uniforms]) => {
      if (!prop(`shader.${fragmentName}.enabled`)) {
        return;
      }

      Object.entries(uniforms).forEach(([uniformName, [type, , listenerIfNull]]) => {
        const name = `${fragmentName}_${uniformName}`;
        if (listenerIfNull !== null) {
          return;
        }

        const [, , setter] = shaderTypeMeta[type];

        if (type === 'bool') {
          shaderUpdate.push(`  shader.${setter}('${name}', this['${name}'] ? 1.0 : 0.0);`);
        } else {
          shaderUpdate.push(`  shader.${setter}('${name}', this['${name}']);`);
        }
      });
    });

    shaderUpdate.push('})');

    // eslint-disable-next-line no-eval
    this._shaderUpdate = eval(shaderUpdate.join('\n'));
  }

  replaceWithSceneNamed(name, reseed, config = {}, originalTransition = null) {
    const {game} = this;

    if (!this.scene.settings) {
      // this can happen when HMR happens during timeSight; SuperScene's
      // builtinHot causes the top scene to get replaced out of the scene
      // graph, but proxy.js still calls _hot on it
      return;
    }

    if (this.scene.settings.data._timeSightTarget) {
      this.endedReplay();
      return;
    }

    let {seed} = this.scene.settings.data;
    if (reseed === true) {
      seed = this.randFloat('replaceWithSceneNamed');
    } else if (reseed) {
      seed = reseed;
    }

    let sceneId;

    if (this._replay) {
      (this._replay.sceneTransitions || []).forEach((t) => {
        if (t.parentSceneId === this.sceneId) {
          // eslint-disable-next-line prefer-destructuring
          sceneId = t.sceneId;
        }
      });
    }

    if (!sceneId) {
      sceneId = String(this.randFloat('sceneId'));
    }

    const target = `scene-${this.randFloat('sceneId') * Date.now()}`;

    if (this._isTransitioning) {
      // eslint-disable-next-line no-console
      console.error('replaceWithSceneName called again even though this scene is already transitioning. Ignoring.');
      return;
    }

    this._isTransitioning = true;

    const oldScene = this;
    const {_replay, _replayOptions, _recording} = this;

    const transition = this._transitionProps(originalTransition);

    const returnPromise = new Promise((resolve, reject) => {
      this.game.onSceneInit(target, (newScene) => {
        this.willTransitionTo(newScene, transition);
        newScene.willTransitionFrom(oldScene, transition);
        this._sceneTransition(oldScene, newScene, transition);
        resolve(newScene, transition);
      });
    });

    this.scene.add(
      target,
      game._sceneConstructors[name],
      true,
      {
        ...this.scene.settings.data,
        ...{
          _replay,
          _replayOptions,
          _recording,
          sceneId,
          parentSceneId: this.sceneId,
        },
        ...config,
        transition,
        seed,
      },
    );

    return returnPromise;
  }

  replaceWithSelf(reseed, config = {}, transition = null) {
    return this.replaceWithSceneNamed(this.constructor.name, reseed, config, transition);
  }

  _sceneTransition(oldScene, newScene, transition) {
    const {
      animation, ease, duration, onUpdate, oldPauseTime, newUnpauseTime,
    } = transition || {};

    let newUnpauseFn = () => {
      // eslint-disable-next-line no-console
      console.error('Transition did not instantiate newUnpauseFn');
    };

    let swapScenes = true;

    let _hasCutover = false;
    const cutoverPrimary = (overrideSwapScenes) => {
      if (_hasCutover) {
        return;
      }
      _hasCutover = true;

      if (overrideSwapScenes !== undefined) {
        swapScenes = overrideSwapScenes;
      }

      if (transition && transition.onCutover) {
        transition.onCutover(oldScene, newScene, transition);
      }

      if (oldPauseTime === 'cutover') {
        applyPause(oldScene, transition, transition.oldPause);
      }

      if (newUnpauseTime === 'cutover') {
        newUnpauseFn();
      }

      newScene.playMusicIfSet();

      if (swapScenes) {
        newScene.game.scene.bringToTop(newScene.scene.key);
      }
    };

    let _hasCompleted = false;
    const completeTransition = () => {
      if (_hasCompleted) {
        return;
      }

      if (!_hasCutover) {
        // eslint-disable-next-line no-console
        console.error('completeTransition called, but cutoverPrimary hasn\'t been yet');
        cutoverPrimary();
      }

      if (transition && transition.onComplete) {
        transition.onComplete(oldScene, newScene, transition);
      }

      if (oldPauseTime === 'complete') {
        applyPause(oldScene, transition, transition.oldPause);
      }

      if (newUnpauseTime === 'complete') {
        newUnpauseFn();
      }

      _hasCompleted = true;

      newScene.timer(() => {
        oldScene.didTransitionTo(newScene, transition);
        newScene.didTransitionFrom(oldScene, transition);
        oldScene.scene.remove();
      }).ignoresScenePause = true;

      if (transition) {
        const waitTimer = newScene.timer(() => {
          if (transition && transition.onWaitEnd) {
            transition.onWaitEnd(oldScene, newScene, transition);
          }

          if (newUnpauseTime === 'waitEnd') {
            newUnpauseFn();
          }
        }, transition.wait);
        waitTimer.ignoresScenePause = true;
      }
    };

    if (transition) {
      if (transition.removeOldSceneShader) {
        oldScene.shader = null;
        oldScene.camera.clearRenderToTexture();
      }

      let animate;

      if (typeof animation === 'function') {
        animate = () => animation(oldScene, newScene, cutoverPrimary, completeTransition, transition);
      } else if (animation === 'fadeInOut') {
        swapScenes = true;

        newScene.camera.alpha = 0;
        oldScene.camera.alpha = 1;

        animate = () => {
          const tween = this.tweenInOut(
            duration / 2,
            duration / 2,
            (factor, firstHalf) => {
              if (firstHalf) {
                oldScene.camera.alpha = 1 - factor;
              } else {
                newScene.camera.alpha = 1 - factor;
              }

              if (onUpdate) {
                const percent = firstHalf ? factor / 2 : 1 - factor / 2;
                onUpdate(percent, oldScene, newScene, transition);
              }
            },
            (followupTween) => {
              followupTween.ignoresScenePause = true;
              cutoverPrimary();
            },
            () => {
              newScene.camera.alpha = 1;
              oldScene.camera.alpha = 0;
              completeTransition();
            },
            0,
            ease,
          );
          tween.ignoresScenePause = true;
        };
      } else if (animation === 'crossFade') {
        // crossfade doesn't really care about scene order, so help the
        // shader out if we can
        if (!oldScene.shader && newScene.shader) {
          oldScene.game.scene.bringToTop(oldScene.scene.key);
          swapScenes = false;
        } else if (oldScene.shader && !newScene.shader) {
          newScene.game.scene.bringToTop(newScene.scene.key);
          swapScenes = false;
        } else {
          swapScenes = true;
        }

        newScene.camera.alpha = 0;
        oldScene.camera.alpha = 1;

        animate = () => {
          const tween = this.tweenPercent(
            duration,
            (factor) => {
              newScene.camera.alpha = factor;
              oldScene.camera.alpha = 1 - factor;
              if (factor >= 0.5) {
                cutoverPrimary();
              }

              if (onUpdate) {
                onUpdate(factor, oldScene, newScene, transition);
              }
            },
            () => {
              newScene.camera.alpha = 1;
              oldScene.camera.alpha = 0;

              if (!transition.suppressShaderCheck && !transition.delayNewSceneShader && oldScene.shader && newScene.shader) {
                // eslint-disable-next-line no-console, max-len
                console.error('crossFade transitions do not render correctly if the both scenes have a shader; provide delayNewSceneShader, removeOldSceneShader, or suppressShaderCheck to the transition, or use fadeInOut animation');
              }

              completeTransition();
            },
            0,
            ease,
          );
          tween.ignoresScenePause = true;
        };
      } else if (animation === 'pushRight' || animation === 'pushLeft' || animation === 'pushUp' || animation === 'pushDown') {
        const {height, width} = this.game.config;

        swapScenes = true;

        oldScene.camera.x = 0;
        oldScene.camera.y = 0;

        let dx = 0;
        let dy = 0;

        if (animation === 'pushRight') {
          newScene.camera.x = -width;
          dx = 1;
        } else if (animation === 'pushLeft') {
          newScene.camera.x = width;
          dx = -1;
        } else if (animation === 'pushUp') {
          newScene.camera.y = -height;
          dy = -1;
        } else if (animation === 'pushDown') {
          newScene.camera.y = height;
          dy = 1;
        }

        animate = () => {
          const tween = this.tweenPercent(
            duration,
            (factor) => {
              newScene.camera.x = dx * (factor - 1) * width;
              oldScene.camera.x = dx * factor * width;
              newScene.camera.y = dy * (factor - 1) * height;
              oldScene.camera.y = dy * factor * height;

              if (factor >= 0.5) {
                cutoverPrimary();
              }

              if (onUpdate) {
                onUpdate(factor, oldScene, newScene, transition);
              }
            },
            () => {
              newScene.camera.x = 0;
              newScene.camera.y = 0;
              completeTransition();
            },
            0,
            ease,
          );
          tween.ignoresScenePause = true;
        };
      } else if (animation === 'wipeRight' || animation === 'wipeLeft' || animation === 'wipeUp' || animation === 'wipeDown') {
        const {height, width} = this.game.config;

        swapScenes = false;

        let newCamera;
        let oldCamera;

        // we cannot wipe with the builtin camera
        if (animation === 'wipeRight' || animation === 'wipeDown') {
          newScene.camera.alpha = 0;

          newCamera = newScene.cameras.add(0, 0, width, height);
          newCamera.setBackgroundColor(0);
          newCamera.scrollX = newScene.camera.scrollX;
          newCamera.scrollY = newScene.camera.scrollY;

          if (animation === 'wipeRight') {
            newCamera.width = 1;
          } else {
            newCamera.height = 1;
          }
        } else {
          oldScene.game.scene.bringToTop(oldScene.scene.key);
          oldScene.camera.alpha = 0;

          oldCamera = oldScene.cameras.add(0, 0, width, height);
          oldCamera.setBackgroundColor(0);
          oldCamera.scrollX = oldScene.camera.scrollX;
          oldCamera.scrollY = oldScene.camera.scrollY;

          if (oldScene.shader) {
            oldCamera.setRenderToTexture(oldScene.shader);
          }
        }

        let firstCall = true;

        animate = () => {
          const tween = this.tweenPercent(
            duration,
            (factor) => {
              if (newCamera && firstCall) {
                if (newScene.shader) {
                  newCamera.setRenderToTexture(newScene.shader);
                }
                firstCall = false;
              }

              if (animation === 'wipeRight') {
                newCamera.setSize(Math.max(1, factor * width), height);
              } else if (animation === 'wipeLeft') {
                oldCamera.setSize(Math.max(1, (1 - factor) * width), height);
              } else if (animation === 'wipeUp') {
                oldCamera.setSize(width, Math.max(1, (1 - factor) * height));
              } else if (animation === 'wipeDown') {
                newCamera.setSize(width, Math.max(1, factor * height));
              }

              if (factor >= 0.5) {
                cutoverPrimary();
              }

              if (onUpdate) {
                onUpdate(factor, oldScene, newScene, transition);
              }
            },
            () => {
              if (newCamera) {
                newScene.cameras.main.alpha = 1;
                newScene.camera.scrollX = newCamera.scrollX;
                newScene.camera.scrollY = newCamera.scrollY;
                newScene.cameras.remove(newCamera);
              }

              if (!transition.suppressShaderCheck) {
                if (!transition.delayNewSceneShader && newScene.shader && newCamera) {
                  // eslint-disable-next-line no-console, max-len
                  console.error(`${animation} transitions do not render correctly if the new scene has a shader; provide delayNewSceneShader or suppressShaderCheck to the transition, or use a different animation`);
                }
                if (oldScene.shader && oldCamera) {
                  // eslint-disable-next-line no-console, max-len
                  console.error(`${animation} transitions do not render correctly if the old scene has a shader; provide removeOldSceneShader or suppressShaderCheck to the transition, or use a different animation`);
                }
              }

              completeTransition();
            },
            0,
            ease,
          );
          tween.ignoresScenePause = true;
        };
      } else {
        // eslint-disable-next-line no-console
        console.error(`Invalid transition animation '${animation}'`);
        cutoverPrimary();
        completeTransition();
        return;
      }

      if (swapScenes) {
        oldScene.game.scene.bringToTop(oldScene.scene.key);
      }

      if (oldPauseTime === 'begin') {
        applyPause(oldScene, transition, transition.oldPause);
      }

      if (newUnpauseTime !== 'begin') {
        newUnpauseFn = applyPause(newScene, transition, transition.newPause);
      }

      const oldAnimate = animate;
      animate = () => {
        if (transition && transition.onDelayEnd) {
          transition.onDelayEnd(oldScene, newScene, transition);
        }

        if (oldPauseTime === 'delayEnd') {
          applyPause(oldScene, transition, transition.oldPause);
        }

        if (newUnpauseTime === 'delayEnd') {
          newUnpauseFn();
        }

        oldAnimate();
      };

      if (transition.delay) {
        const delayTimer = this.timer(animate, transition.delay);
        delayTimer.ignoresScenePause = true;
      } else {
        animate();
      }
    } else {
      cutoverPrimary();
      completeTransition();
    }
  }

  preemitEmitter(emitter) {
    const maxLifespan = emitter.lifespan.staticValueEmit();
    const quantity = emitter.quantity.staticValueEmit();
    const {frequency} = emitter;
    for (let i = maxLifespan; i > 0; i -= frequency) {
      for (let j = 0; j < quantity; j += 1) {
        const particle = emitter.emitParticle(1);
        particle.update(i, i / 1000, []);
      }
    }
  }

  beginReplay(replay, replayOptions) {
    const {command, game} = this;
    const {loop} = game;

    this._replay = replay;
    this._replayOptions = replayOptions;
    this._replayLatestTransition = replayOptions.startFromTransition;
    const startTick = replayOptions.startTick || (this._replayLatestTransition ? (this._replayLatestTransition.tickCount || 0) : 0);

    command.beginReplay(replay, {
      ...replayOptions,
      startTick,
      onEnd: () => {
        this.game.topScene().endedReplay();
      },
      onStop: () => {
        this.game.topScene().stopReplay(true);
      },
    });

    let time = window.performance.now();
    const dt = 1000 / this.physics.world.fps;

    game._replayPreflight += 1;

    const manager = this.command.getManager(this);

    loop.sleep();
    this.scene.setVisible(false);
    while (command.hasPreflight()) {
      if (replay.timeSightFrameCallback) {
        replay.timeSightFrameCallback(this, time, dt, manager, true, false, false);
      }

      time += dt;
      loop.step(time);

      if (game._stepExceptions > 100) {
        // eslint-disable-next-line no-console
        console.error('Too many errors in preflight; bailing out…');
        return;
      }
    }
    loop.resetDelta();

    game._replayPreflight -= 1;

    // now that preflight is done, beware that if it had a scene transition,
    // then `this` may have been removed from the scene graph and instead
    // should use topScene
    const topScene = game.topScene();

    if (replay.timeSight) {
      topScene.calculateTimeSight();
    } else if (replay.timeSightFrameCallback) {
      game._replayPreflight += 1;
      topScene._timeSightTargetEnded = () => {
        replay.timeSightFrameCallback(topScene, time, dt, manager, false, true, true);
      };

      let postflightCutoff;
      if ('postflightCutoff' in replay) {
        postflightCutoff = replay.postflightCutoff;
        delete replay.postflightCutoff;
      }

      while (!topScene._timeSightTargetDone) {
        const isPostflight = postflightCutoff !== undefined && this.command.replayTicks >= postflightCutoff;
        replay.timeSightFrameCallback(topScene, time, dt, manager, false, isPostflight, false);
        time += dt;
        loop.step(time);

        if (game._stepExceptions > 100) {
          // eslint-disable-next-line no-console
          console.error('Too many errors in timeSight; bailing out…');
          return;
        }
      }
      topScene.scene.remove();
      game._replayPreflight -= 1;
    } else {
      topScene.scene.setVisible(true);
      loop.wake();
    }
  }

  calculateTimeSight() {
    // eslint-disable-next-line no-console
    console.info('Calculating timeSight');

    this._timeSightFrames = [];

    this.scene.setActive(false);
    this.scene.setVisible(false);

    this.launchTimeSight();

    const target = `scene-${Math.random() * Date.now()}`;
    const targetScene = this.game.scene.add(target, this.constructor, true, {...this.scene.settings.data, _timeSightTarget: true});
    this.game.scene.bringToTop(target);

    let objectDt = 0;

    targetScene.beginReplay(
      {
        ...this._replay,
        timeSight: false,
        startTick: (this._replayLatestTransition ? this._replayLatestTransition.tickCount : 0) || 0,
        timeSightFrameCallback: (scene, frameTime, frameDt, manager, isPreflight, isPostflight, isLast) => {
          objectDt += frameDt;

          const frame = this.timeSightTargetStep(scene, objectDt, frameTime, frameDt, manager, isPreflight, isPostflight, isLast);
          if (frame) {
            objectDt = 0;
          }
        },
      },
      {
        onEnd: () => {
          targetScene._timeSightTargetDone = true;

          this.scene.setVisible(true);
          this.scene.setActive(true);

          this.game.loop.wake();

          this.beginTimeSightAlphaAnimation();
        },
      },
    );
  }

  timeSightTargetStep(scene, objectDt, frameTime, frameDt, manager, isPreflight, isPostflight, isLast) {
    const objects = scene.renderTimeSightFrameInto(this, objectDt, frameTime, frameDt, isLast);
    if (!objects || !objects.length) {
      return;
    }

    updatePropsFromStep(true);

    const frame = {
      objects,
      props: {...manageableProps},
      commands: [...manager.commands],
      tickCount: manager.tickCount,
      isPreflight,
      isPostflight,
    };

    objects.forEach((object) => {
      if (object.scene !== this) {
        // eslint-disable-next-line no-console
        console.error(`renderTimeSightFrameInto rendered this object into the wrong scene: ${JSON.stringify(object)}`);
      }

      object._timeSightAlpha = object.alpha;
      object._timeSightFrame = frame;

      if (isPreflight || isPostflight) {
        object.alpha = 0;
      }
    });

    this._timeSightFrames.push(frame);
    return frame;
  }

  beginTimeSightAlphaAnimation() {
    const frames = this._timeSightFrames;
    const activeFrames = frames.filter((frame) => !frame.isPreflight && !frame.isPostflight);

    if (!activeFrames.length) {
      return;
    }

    overrideProps(activeFrames[0].props);

    if (this.game.updateReplayCursor) {
      this.game.updateReplayCursor();
    }

    let loopAlpha;
    // eslint-disable-next-line prefer-const
    loopAlpha = (frame, n) => {
      const {objects, props} = frame;

      overrideProps(props);

      objects.forEach((object, i) => {
        object._timeSightAlphaTween = this.tweens.add({
          targets: object,
          alpha: 0.7,
          duration: 200,
          onComplete: () => {
            object._timeSightAlphaTween = this.tweens.add({
              targets: object,
              alpha: object._timeSightAlpha,
              duration: 200,
              onComplete: () => {
                if (i === 0) {
                  frame.timer = this.time.addEvent({
                    delay: 100 * activeFrames.length + 1000,
                    callback: () => loopAlpha(frame, n),
                  });
                }
              },
            });
          },
        });
      });
    };

    activeFrames.forEach((frame, n) => {
      frame.timer = this.time.addEvent({
        delay: 100 * n + 1000,
        callback: () => {
          loopAlpha(frame, n);
        },
      });
    });

    if (this._timeSightMouseInput) {
      activeFrames.forEach((frame) => {
        frame.objects.forEach((object) => {
          object.alpha = object._timeSightAlpha;
        });
      });

      return;
    }

    this._timeSightMouseInput = true;

    this.input.topOnly = true;

    activeFrames.forEach((frame) => {
      frame.objects.forEach((object) => {
        object.setInteractive();
      });
    });

    this.input.on('gameobjectover', (pointer, activeObject) => {
      if (this._timeSightRemoveFocusTimer) {
        this._timeSightRemoveFocusTimer.destroy();
      }

      this.game.canvas.style.cursor = 'pointer';

      let matchedFrame;
      activeFrames.forEach((frame) => {
        if (frame.timer) {
          frame.timer.destroy();
        }

        frame.objects.forEach((object) => {
          if (object._timeSightAlphaTween) {
            object._timeSightAlphaTween.stop();
          }

          object.alpha = object._timeSightAlpha;

          if (object === activeObject) {
            matchedFrame = frame;
            object.alpha = 1;
          }
        });
      });

      if (matchedFrame) {
        overrideProps(matchedFrame.props);

        if (this.game.updateReplayCursor) {
          this.game.updateReplayCursor(matchedFrame.tickCount, this._replay);
        }
      }
    });

    this.input.on('gameobjectout', (pointer, activeObject) => {
      if (this._timeSightRemoveFocusTimer) {
        this._timeSightRemoveFocusTimer.destroy();
      }

      this._timeSightRemoveFocusTimer = this.time.addEvent({
        delay: 100,
        callback: () => {
          this.game.canvas.style.cursor = '';
          this.beginTimeSightAlphaAnimation();
        },
      });
    });

    this.input.on('gameobjectdown', (pointer, activeObject) => {
      if (this._timeSightRemoveFocusTimer) {
        this._timeSightRemoveFocusTimer.destroy();
      }

      this.game.canvas.style.cursor = '';

      const replay = this._replay;

      const {commands} = activeObject._timeSightFrame;
      const preflightCutoff = commands.reduce((cutoff, frame) => cutoff + (frame._repeat || 1), 0);

      this.game.stopReplay();
      this.game.beginReplay({
        ...replay,
        ...(this._replayLatestTransition || {}),
        timeSight: false,
        snapshot: true,
        commands,
        preflightCutoff,
      }, {
        startFromTransition: this._replayLatestTransition,
        startTick: -1, // TODO
      });
    });
  }

  endedReplay() {
    if (!this._replay) {
      return;
    }

    const {onEnd} = this._replayOptions;
    const replay = this._replay;

    delete this._replay;
    delete this._replayOptions;

    if (replay.timeSight) {
      this.replaceWithSelf(false);
      return;
    }

    if (this._timeSightTargetEnded) {
      this._timeSightTargetEnded();
    }

    if (onEnd) {
      onEnd();
    }
  }

  stopReplay(skipDownward) {
    if (!this._replay) {
      return;
    }

    const {onStop} = this._replayOptions;
    const replay = this._replay;

    delete this._replay;
    delete this._replayOptions;

    if (replay.timeSight) {
      this.replaceWithSelf(false);
      return;
    }

    if (!skipDownward) {
      this.command.stopReplay();
    }

    if (onStop) {
      onStop();
    }
  }

  launchTimeSight() {
    this.timeSightFrozen = true;

    [...this.tweens._active, ...this.tweens._add].forEach((tween) => tween._skipFreezeTimeSight || tween.stop());
    this.add.displayList.list.filter((node) => node.type === 'Sprite').map((node) => node._skipFreezeTimeSight || node.anims.stop());

    // this intentionally uses the base Phaser timer so existing particles get
    // paused after only a frame of rendering, but any particles that
    // renderTimeSightFrameInto creates are unaffected
    const particles = this.add.displayList.list.filter((node) => node.type === 'ParticleEmitterManager');
    this.time.addEvent({
      callback: () => {
        particles.forEach((node) => {
          if (!node._skipFreezeTimeSight) {
            node.pause();
          }
        });
      },
    });
  }

  cutoffTimeSightEnter() {
    const frames = this._timeSightFrames;

    if (!frames) {
      return;
    }

    if (this._timeSightRemoveFocusTimer) {
      this._timeSightRemoveFocusTimer.destroy();
    }

    frames.forEach((frame) => {
      if (frame.timer) {
        frame.timer.destroy();
      }

      frame.objects.forEach((object) => {
        if (object._timeSightAlphaTween) {
          object._timeSightAlphaTween.stop();
        }

        object.alpha = object._timeSightAlpha;
      });
    });

    this.cutoffTimeSightChanged(this._replay.preflightCutoff, this._replay.postflightCutoff);
  }

  cutoffTimeSightChanged(start, end) {
    const frames = this._timeSightFrames;
    if (!frames) {
      return;
    }

    // ordinarily to be avoided, but we don't want to start a new replay
    // to take the update from Replay.jsx
    this._replay.preflightCutoff = start;
    this._replay.postflightCutoff = end;

    frames.forEach((frame, f) => {
      const tick = frame.tickCount + ((this._replayLatestTransition ? this._replayLatestTransition.tickCount : 0) || 0);
      frame.isPreflight = tick < start;
      frame.isPostflight = tick > end;

      frame.objects.forEach((object) => {
        object.alpha = (frame.isPreflight || frame.isPostflight) ? object._timeSightAlpha : 1;
      });
    });
  }

  cutoffTimeSightLeave() {
    const frames = this._timeSightFrames;
    if (!frames) {
      return;
    }

    frames.forEach((frame) => {
      frame.objects.forEach((object) => {
        object.alpha = (frame.isPreflight || frame.isPostflight) ? 0 : object._timeSightAlpha;
      });
    });

    this.beginTimeSightAlphaAnimation();
  }

  propDidChange(key, value) {
    this.replayParticleSystems(key);
  }

  propDidFinishChange(key, value) {
    if (this._replay && this._replay.timeSight) {
      const replay = this._replay;
      this.game.stopReplay();
      this.game.beginReplay(replay, {
        startFromTransition: this._replayLatestTransition,
      });
    }
  }

  beginRecording(recording) {
    this._recording = recording;
    recording.sceneSaveState = JSON.parse(JSON.stringify(this._initialSave));
    recording.sceneTransitions = [];
    recording.sceneId = this.sceneId;

    this.command.beginRecording(this, recording);
  }

  stopRecording() {
    const recording = this._recording;
    delete this._recording;
    this.command.stopRecording();
    return recording;
  }

  replayParticleSystems(changedKey) {
    const {particleSystems} = this;
    this.particleSystems = [];

    particleSystems.forEach((config) => {
      const {
        particles, emitter, name, options,
      } = config;

      if (!particles.active || particles.moribund) {
        return;
      }

      // keep other systems as-is
      if (changedKey && !changedKey.startsWith(name)) {
        this.particleSystems.push(config);
        return;
      }

      const {seed} = emitter;
      emitter.killAll();
      emitter.stop();
      particles.destroy();

      this.particleSystem(name, options, seed);
    });
  }

  _builtinHot() {
    // eslint-disable-next-line no-console
    console.info(`Hot-loading ${this.constructor.name}`);

    if (this.game._stepExceptions > 100) {
      // eslint-disable-next-line no-console
      console.info('Resetting after recovering from errors');
      this.game._stepExceptions = 0;
      return;
    }

    if (this._replay && this._replay.timeSight) {
      const replay = this._replay;
      this.game.stopReplay();
      this.game.beginReplay(replay, {
        startFromTransition: this._replayLatestTransition,
      });
    } else {
      this.replayParticleSystems();
    }

    if (this.setupAnimations) {
      this.reloadAnimations();
    } else {
      this.removeAnimations();
    }

    this.game.recompileMainShaders();

    this.playMusic();
  }

  _hotReloadCurrentLevel(...args) {
    return this.replaceWithSelf(false, ...args);
  }

  removeAnimations() {
    if (this.physics && this.physics.world && this.physics.world.bodies && this.physics.world.bodies.entries) {
      this.physics.world.bodies.entries.forEach((body) => {
        if (body.gameObject && body.gameObject.anims) {
          body.gameObject.anims.pause();
          body.gameObject.anims.stop();
          body.gameObject.anims.remove();
        }
      });
    }

    Object.keys(this.anims.anims.entries).forEach((key) => {
      this.anims.remove(key);
    });
  }

  reloadAnimations() {
    Object.keys(this.anims.anims.entries).forEach((key) => {
      this.anims.remove(key);
    });

    this.setupAnimations();

    if (this.physics && this.physics.world && this.physics.world.bodies && this.physics.world.bodies.entries) {
      this.physics.world.bodies.entries.forEach((body) => {
        if (body.gameObject && body.gameObject.anims && body.gameObject.anims.currentAnim) {
          const {key} = body.gameObject.anims.currentAnim;
          body.gameObject.anims.stop();
          body.gameObject.anims.currentAnim = null;
          this.timer(() => body.gameObject.anims.play(key)).ignoresScenePause = true;
        }
      });
    }
  }

  particleSystem(name, options = {}, reloadSeed) {
    // throws error if invalid
    prop(`${name}.image`);

    const props = {
      ...propsWithPrefix(`${name}.`),
      ...options,
    };

    const {onAdd, image} = props;

    const particles = this.add.particles(image);

    const emitterProps = massageParticleProps(props);
    const emitter = particles.createEmitter(emitterProps);

    particles.timeScale = this.timeScale;

    injectEmitterOpSeededRandom(emitter, reloadSeed || this.randFloat('particles'));

    if (onAdd) {
      onAdd(particles, emitter);
    }

    if (props.preemit || (reloadSeed && props.preemitOnReload)) {
      this.preemitEmitter(emitter);
    }

    emitter.ignoresScenePause = emitterProps.ignoresScenePause;
    emitter.updatesOnceOnPause = emitterProps.updatesOnceOnPause;

    this.particleSystems.push({
      particles, emitter, name, options,
    });
  }

  tween(name, target, options = {}) {
    if (name !== null) {
      // throws error if invalid
      prop(`${name}.duration`);
    }

    const props = name === null ? {...options} : {
      ...propsWithPrefix(`${name}.`),
      ...options,
    };

    const params = massageTweenProps(target, props, options);

    return this.tweens.add(params);
  }

  _transitionProps(input) {
    if (!input) {
      return input;
    }

    const prefix = typeof input === 'object' ? input.name : input;
    const options = typeof input === 'object' ? input : {};

    let props;

    if (prefix) {
      // throws error if invalid
      prop(`${prefix}.animation`);

      props = {
        ...propsWithPrefix(`${prefix}.`),
        ...options,
      };
    } else {
      props = {
        ...baseTransitionProps,
        ...options,
      };
    }

    return massageTransitionProps(props, options);
  }

  tweenPercent(duration, update, onComplete, startPoint = 0, ease = 'Linear') {
    const tween = this.tweens.addCounter({
      from: startPoint,
      to: 100,
      ease,
      duration,
      onUpdate: () => {
        const factor = tween.getValue() / 100.0;
        update(factor);
      },
      onComplete,
    });

    return tween;
  }

  tweenPercentExclusive(fieldName, duration, update, onComplete, ease = 'Linear') {
    let startPoint = 0;
    if (this[fieldName]) {
      startPoint = this[fieldName].getValue();
      this[fieldName].stop();
    }

    this[fieldName] = this.tweenPercent(
      duration * (1 - startPoint / 100.0),
      update,
      (...args) => {
        if (onComplete) {
          onComplete(...args);
        }
        delete this[fieldName];
      },
      startPoint,
      ease,
    );

    return this[fieldName];
  }

  tweenInOut(inDuration, outDuration, update, onMidpoint, onComplete, startPoint = 0, inEase = 'Linear', outEase = inEase) {
    let tween;

    tween = this.tweens.addCounter({
      from: startPoint,
      to: 100,
      ease: inEase,
      duration: inDuration,
      onUpdate: () => {
        const factor = tween.getValue() / 100.0;
        update(factor, true);
      },
      onComplete: () => {
        tween = this.tweens.addCounter({
          from: 100,
          to: 0,
          ease: outEase,
          duration: outDuration,
          onUpdate: () => {
            const factor = tween.getValue() / 100.0;
            update(factor, false);
          },
          onComplete,
        });

        if (onMidpoint) {
          onMidpoint(tween);
        }
      },
    });

    return tween;
  }

  tweenInOutExclusive(fieldName, inDuration, outDuration, update, onMidpoint, onComplete, inEase = 'Linear', outEase = inEase) {
    let startPoint = 0;
    if (this[fieldName]) {
      startPoint = this[fieldName].getValue();
      this[fieldName].stop();
    }

    this[fieldName] = this.tweenInOut(
      inDuration * (1 - startPoint / 100.0),
      outDuration,
      update,
      (tween, ...args) => {
        if (onMidpoint) {
          onMidpoint(tween, ...args);
        }

        this[fieldName] = tween;
      },
      (...args) => {
        if (onComplete) {
          onComplete(...args);
        }
        delete this[fieldName];
      },
      startPoint,
      inEase,
      outEase,
    );

    return this[fieldName];
  }

  trauma(amount) {
    if (amount && !this._trauma) {
      this._traumaStart = this.time.now;
    }

    const newTrauma = Math.min(Math.max(this._trauma + amount, 0), 1);
    const shake = newTrauma ** prop('scene.trauma.exponent');
    this._trauma = newTrauma;
    this._traumaShake = shake;

    if (shake && prop('scene.trauma.legacy')) {
      const {width, height} = this.game.config;
      const duration = 100;
      const intensity = new Phaser.Math.Vector2(
        shake * prop('scene.trauma.dx') / width,
        shake * prop('scene.trauma.dy') / height,
      );
      this.camera.shake(duration, intensity);
    }
  }

  playSound(baseName, variants, volume = 1.0) {
    // preflight etc
    if (!this.scene.isVisible() || this.game._replayPreflight) {
      return;
    }

    let name = baseName;
    if (variants) {
      name += 1 + Math.floor(this.randBetween(`sound/${name}`, 0, variants));
    }

    const sound = this.sound.add(name);

    if (!sound || !sound.key) {
      // eslint-disable-next-line no-console
      console.warn(`Could not load sound ${name}`);
      return;
    }

    this.sounds.push(sound);

    sound.on('complete', () => {
      this.sounds = this.sounds.filter((s) => s !== sound);
    });

    try {
      sound.requestedVolume = volume;
      sound.setVolume(volume * this.game.volume * prop('scene.soundVolume'));
      sound.play();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`Could not play sound ${name}: ${e}`);
    }
  }

  changeVolume(newVolume) {
    const {sounds} = this;

    const multiplier = newVolume * prop('scene.soundVolume');

    sounds.forEach((sound) => sound.setVolume(sound.requestedVolume * multiplier));
  }

  playMusic(name = this.musicName(), forceRestart = false) {
    this.game.playMusic(name, forceRestart);
  }

  playMusicIfSet(name = this.musicName(), forceRestart = false) {
    if (name) {
      return this.playMusic(name, forceRestart);
    }
  }

  musicName() {
    return null;
  }

  timer(callback, time) {
    const timer = {callback, time};
    this.timers.push(timer);
    return timer;
  }

  updateTimers(time, dt) {
    const {timers} = this;
    const newTimers = this.timers = [];
    const isPaused = this._paused.timers;

    if (!isPaused && this._trauma) {
      this.trauma(prop('scene.trauma.decay') * dt * -1);
    }

    timers.forEach((timer) => {
      if (isPaused && !timer.ignoresScenePause) {
        newTimers.push(timer);
        return;
      }

      if (timer.time) {
        timer.time -= dt;
        if (timer.time > 0) {
          newTimers.push(timer);
          return;
        }
      }

      timer.callback();
    });
  }

  updateTweens(time, origDt) {
    const {tweens} = this.scene.systems;
    const isPaused = this._paused.tweens;

    // taken from Phaser TweenManager.update
    const dt = origDt * tweens.timeScale;

    tweens._active.forEach((tween) => {
      if (isPaused && !tween.ignoresScenePause) {
        return;
      }

      if (tween.update(time, dt)) {
        tweens._destroy.push(tween);
        tweens._toProcess += 1;
      }
    });
  }

  recoverPerformance() {
    this.performanceFrames += 1;

    if (!this.performanceAcceptable) {
      this.performanceAcceptable = this.game.loop.actualFps > 50;
    }

    if (this.performanceFrames < 300) {
      return;
    }

    this.performanceFrames = 0;

    if (this.performanceAcceptable) {
      this.performanceAcceptable = false;
      return;
    }

    if (this.performanceProps.length) {
      let changes = this.performanceProps.shift();
      if (!Array.isArray(changes)) {
        changes = [changes];
      }

      const applyPropChanges = (props) => {
        if (props.length) {
          if (this.game.debug) {
            refreshUI();
          }

          props.forEach((propName) => {
            const particleProp = particlePropFromProp(propName);
            if (particleProp) {
              propsWithPrefix(`${particleProp}.`, true);

              this.replayParticleSystems(particleProp);
            }
          });
        }
      };

      let batch = true;
      const changedProps = [];
      const setProp = (key, value) => {
        changedProps.push(key);
        const spec = propSpecs[key];

        if (this.game.debug) {
          manageableProps[key] = value;
        } else {
          propSpecs[key][0] = value;
        }

        if (spec.length > 1 && spec[1] !== null) {
          if (typeof spec[spec.length - 1] === 'function') {
            const changeCallback = spec[spec.length - 1];
            changeCallback(value, this, this.game);
          }
        }

        if (!batch) {
          applyPropChanges([key]);
        }
      };

      changes.forEach((change) => {
        if (typeof change === 'string') {
          if (change === 'disableMainShaders') {
            this.game.disableMainShaders();
          } else {
            setProp(change, !prop(change));
          }
        } else if (typeof change === 'function') {
          change(setProp);
        }
      });

      batch = false;

      // eslint-disable-next-line no-console
      console.log(`Performance seems iffy; applying ${changes.join(', ')}`);

      applyPropChanges(changedProps);
    }
  }

  handlePointerEvent(event) {
    const camelName = event.name.charAt(0).toUpperCase() + event.name.slice(1);
    const method = `handle${camelName}`;
    if (this[method]) {
      this[method](event);
    } else if (prop('config.debug')) {
      const debugMethod = `debugHandle${camelName}`;
      if (this[debugMethod]) {
        this[debugMethod](event);
      }
    }
  }

  cameraFollow(object, offsetX = 0, offsetY = 0) {
    if (object) {
      const lerp = prop('scene.camera.lerp');
      // true is roundPixels to avoid subpixel rendering
      this.camera.startFollow(object, true, lerp, lerp, offsetX, offsetY);
    } else {
      this.camera.stopFollow();
    }
  }

  get timeScale() {
    return this._timeScale;
  }

  set timeScale(scale) {
    this._timeScale = scale;

    if (this.particleSystems) {
      this.particleSystems.forEach((p) => {
        p.particles.timeScale = scale;
      });
    }

    if (this.physics) {
      this.physics.world.timeScale = scale;
      this.physics.world.bodies.entries.forEach((body) => {
        if (body.gameObject && body.gameObject.anims) {
          body.gameObject.anims.setTimeScale(scale);
        }
      });
    }

    // None of these are necessary thanks to us rewiring the event loop:
    /*
    this.tweens.timeScale = scale;
    this.time.timeScale = scale;
    this.anims.globalTimeScale = scale;
    */
  }

  shockwave(x, y) {
    this.shockwave_time = this.scene_time;
    this.shockwave_center = [x / this.game.config.width, y / this.game.config.height];
  }

  positionToScreenCoordinate(x, y) {
    const {tileWidth, tileHeight} = this.game.config;
    return [x * tileWidth + this.xBorder, y * tileHeight + this.yBorder];
  }

  timeSightMouseDrag() {
    const {activePointer} = this.game.input;
    if (activePointer.isDown) {
      this.cameraFollow();

      if (this._timeSightMouseDragX) {
        this.camera.scrollX += this._timeSightMouseDragX - activePointer.position.x;
      }

      if (this._timeSightMouseDragY) {
        this.camera.scrollY += this._timeSightMouseDragY - activePointer.position.y;
      }

      this._timeSightMouseDragX = activePointer.position.x;
      this._timeSightMouseDragY = activePointer.position.y;
    } else {
      delete this._timeSightMouseDragX;
      delete this._timeSightMouseDragY;
    }
  }

  willTransitionTo(newScene, transition) {
  }

  willTransitionFrom(oldScene, transition) {
  }

  didTransitionTo(newScene, transition) {
  }

  didTransitionFrom(oldScene, transition) {
    if (transition && transition.delayNewSceneShader) {
      this._setupShader();
    }

    this.playMusic();
  }

  pauseInputForTransition(transition) {
    this.command.ignoreAll('_transition', true);
  }

  unpauseInputForTransition(transition) {
    this.command.ignoreAll('_transition', false);
  }

  pausePhysicsForTransition(transition) {
    this.pauseInputForTransition(transition);

    this._paused.physics = true;

    this.pauseAllAnimations();
  }

  unpausePhysicsForTransition(transition) {
    this.unpauseInputForTransition(transition);

    this._paused.physics = false;

    this.resumeAllAnimations();
  }

  pauseEverythingForTransition(transition) {
    this.pausePhysicsForTransition(transition);

    this._paused.timers = true;
    this.pauseAllParticleSystems();
    this.pauseAllTweens();
  }

  unpauseEverythingForTransition(transition) {
    this.unpausePhysicsForTransition(transition);

    this._paused.timers = false;
    this.resumeAllParticleSystems();
    this.resumeAllTweens();
  }

  pauseAllParticleSystems() {
    this._paused.particles = true;

    if (this.particleSystems.length) {
      injectParticleEmitterManagerPreUpdate(this.particleSystems[0].particles);
    }
  }

  pauseAllTweens() {
    this._paused.tweens = true;
  }

  pauseAllAnimations() {
    this._paused.anims = true;

    if (this._injectedAnimsUpdate) {
      return;
    }

    if (this.physics && this.physics.world && this.physics.world.bodies && this.physics.world.bodies.entries) {
      this.physics.world.bodies.entries.forEach((body) => {
        if (body.gameObject && body.gameObject.anims) {
          if (injectAnimationUpdate(body.gameObject.anims)) {
            this._injectedAnimsUpdate = true;
          }
        }
      });
    }
  }

  resumeAllParticleSystems() {
    this._paused.particles = false;

    this.particleSystems.forEach((p) => {
      p.particles.resume();
    });
  }

  resumeAllTweens() {
    this._paused.tweens = false;
  }

  resumeAllAnimations() {
    this._paused.anims = false;
  }

  destroy() {
    this.command.detachScene(this);
  }
}

if (module.hot) {
  module.hot.accept('../assets/maps.txt', () => {
    try {
      const next = require('../assets/maps.txt');

      fetch(next).then((res) => {
        res.text().then((text) => {
          try {
            const {game} = window;

            const previous = game._ldMapFiles;
            const nextMaps = parseMaps(text);

            if (!previous || !nextMaps) {
              return;
            }

            game._ldMapFiles = nextMaps;

            let reloadCurrent = true;

            const scene = game.topScene();
            const activeId = scene.level && scene.level.id;

            const prevById = {};
            previous.forEach((spec) => { prevById[spec[1].id] = spec; });
            const nextById = {};
            nextMaps.forEach((spec) => { nextById[spec[1].id] = spec; });

            const changes = [];

            const leftover = {...prevById};

            Object.entries(nextById).forEach(([id, nextSpec]) => {
              if (!prevById[id]) {
                if (id !== activeId) {
                  changes.push(`+${id}`);
                }
              } else {
                const previousSpec = prevById[id];
                delete leftover[id];

                if (!deepEqual(previousSpec, nextSpec)) {
                  if (id !== activeId) {
                    changes.push(`Δ${id}`);
                  }
                }
              }
            });

            changes.push(...Object.keys(leftover).filter((id) => id !== activeId).map((id) => `-${id}`));

            if (!deepEqual(previous.map((spec) => spec[1].id), nextMaps.map((spec) => spec[1].id))) {
              changes.push('(order)');
            }

            if (activeId) {
              const p = prevById[activeId];
              const n = nextById[activeId];

              if (deepEqual(p, n)) {
                reloadCurrent = false;
              } else {
                changes.unshift(`active level ${activeId}`);
              }
            }

            // eslint-disable-next-line no-console
            console.info(`Hot-loading levels: ${changes.join(', ')}`);

            if (!reloadCurrent) {
              return;
            }

            if (scene._builtinHot) {
              scene._builtinHot();
            }
            if (scene._hot) {
              scene._hot();
            }

            scene._hotReloadCurrentLevel();
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
          }
        });
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });

  module.hot.accept('../assets/index', () => {
    try {
      const next = require('../assets/index');
      const {game} = window;

      reloadAssets(game.topScene(), next).then(([changedAssets, changesByType]) => {
        const scene = game.topScene();
        let sawChanges = false;

        Object.entries(changedAssets).forEach(([type, changed]) => {
          if (changesByType[type] && changesByType[type].length) {
            sawChanges = true;
            // eslint-disable-next-line no-console
            console.info(`Hot-loading ${type}: ${changesByType[type].join(', ')}`);
          }

          if (type === 'musicAssets') {
            const {currentMusicName} = game;
            if (changed[currentMusicName]) {
              game.playMusic(currentMusicName, true);
            }
          } else if (type === 'imageAssets' || type === 'spriteAssets') {
            Object.entries(changed).forEach(([key, texture]) => {
              scene.add.displayList.list.forEach((object) => {
                if (object.texture && object.texture.key === key) {
                  if (object.setTexture) {
                    object.setTexture(key);
                  } else {
                    object.texture = texture;
                  }
                }
              });
            });
          }
        });

        if (!sawChanges) {
          return;
        }

        if (scene._builtinHot) {
          scene._builtinHot();
        }
        if (scene._hot) {
          scene._hot();
        }
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });
}
