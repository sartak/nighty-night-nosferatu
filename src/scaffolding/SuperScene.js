import Phaser from 'phaser';
import deepEqual from 'deep-equal';
import prop, {propsWithPrefix, manageableProps} from '../props';
import {updatePropsFromStep, overrideProps, refreshUI} from './lib/manage-gui';
import massageParticleProps, {injectEmitterOpSeededRandom, isParticleProp} from './lib/particles';
import massageTweenProps from './lib/tweens';
import {saveField, loadField} from './lib/store';

import {parseMaps, parseLevelLines} from './lib/level-parser';
import mapsFile from '../assets/maps.txt';

const baseConfig = {
};

export default class SuperScene extends Phaser.Scene {
  constructor(subconfig) {
    const config = {
      ...baseConfig,
      ...subconfig,
    };
    super(config);

    this.sounds = [];
    this.timers = [];
    this.performanceFrames = 0;
    this.performanceAcceptable = true;
  }

  init(config) {
    if (!config.seed) {
      throw new Error(`You must provide a "seed" (e.g. Date.now()) to ${this.constructor.name}`);
    }

    this.command = this.game.command;
    this.command.attachScene(this, config._timeSightTarget);

    this.rnd = {};

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
        world.step = (delta) => {
          const dt = delta * 1000;
          time += dt;
          physics.dt = dt;
          physics.time = time;

          if (this.game._stepExceptions > 100) {
            return;
          }

          try {
            if (this.timeSightFrozen) {
              this.command.processInput(this, time, dt, true);
              tweens.update(time, dt);
              return;
            }

            originalStep.call(world, delta);
            this.command.processInput(this, time, dt);
            this.fixedUpdate(time, dt);
            this.updateTimers(time, dt);

            if (this.performanceProps && this.performanceProps.length) {
              this.recoverPerformance();
            }

            tweens.update(time, dt);

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

  shaderInstantiation(source) {
    return new Phaser.Class({
      Extends: Phaser.Renderer.WebGL.Pipelines.TextureTintPipeline,
      initialize: function Shader(scene) {
        Phaser.Renderer.WebGL.Pipelines.TextureTintPipeline.call(this, {
          game: scene.game,
          renderer: scene.game.renderer,
          fragShader: `
            precision mediump float;
            uniform vec2      resolution;
            uniform sampler2D u_texture;
            varying vec2      outTexCoord;

            ${source}
            `,
        });
      },
    });
  }

  create() {
    this.command.attachInputs(this);

    this.startedAt = new Date();

    if (this.game.renderer.type === Phaser.WEBGL && this.constructor.shaderSource) {
      const shaderName = this.constructor.name;

      if (!this.game.renderer.hasPipeline(shaderName)) {
        const shaderClass = this.shaderInstantiation(this.constructor.shaderSource());
        this.game.renderer.addPipeline(shaderName, new shaderClass(this));
      }

      this.shader = this.game.renderer.getPipeline(shaderName);

      if (this.shaderInitialization) {
        this.shader.setFloat2('resolution', this.game.config.width, this.game.config.height);
        this.shaderInitialization();
      }
      this.cameras.main.setRenderToTexture(this.shader);
    }
  }

  preload() {
    this.load.text('_mapsFile', mapsFile);
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

    const level = {
      ...config,
      map,
      mapText,
      mapLookups: lookups,
      index,
    };

    return level;
  }

  firstUpdate(time, dt) {
  }

  update(time, dt) {
    if (!this._firstUpdated) {
      this.firstUpdate(time, dt);
      this._firstUpdated = true;
    }

    if (this.physics && this.physics.world.isPaused && !this.timeSightFrozen) {
      this.command.processInput(this, time, dt, true);
    }

    if (this.renderUpdate) {
      this.renderUpdate(time, dt);
    }
    if (this.shader && this.shaderUpdate) {
      this.shaderUpdate(time, dt);
    }
  }

  replaceWithSceneNamed(name, reseed, config = {}) {
    let {seed} = this.scene.settings.data;
    if (reseed === true) {
      seed = Math.random() * Date.now();
    } else if (reseed) {
      seed = reseed;
    }

    const id = this.randFloat('sceneId') * Date.now();
    const target = `scene-${id}`;

    if (this.scene.settings.data._timeSightTarget) {
      return;
    }

    if (this._recording) {
      this.game.stopRecording();
      return;
    }

    if (this._replay) {
      this.endedReplay();
      return;
    }

    const oldScene = this.scene;

    const newScene = this.game.scene.add(
      target,
      this.game._sceneConstructors[name],
      true,
      {
        ...this.scene.settings.data,
        ...config,
        seed,
      },
    );

    oldScene.remove();

    return newScene;
  }

  replaceWithSelf(reseed, config = {}) {
    return this.replaceWithSceneNamed(this.constructor.name, reseed, config);
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
    const {command} = this;
    const {loop} = this.game;

    this._replay = replay;
    this._replayOptions = replayOptions;

    command.beginReplay(this, replay, {
      onEnd: () => {
        this.endedReplay();
      },
      onStop: () => {
        this.stopReplay(true);
      },
    });

    let time = window.performance.now();
    const dt = 1000 / this.physics.world.fps;

    this.game._replayPreflight += 1;

    const manager = this.command.getManager(this);

    loop.sleep();
    this.scene.setVisible(false);
    while (command.hasPreflight(this)) {
      if (replay.timeSightFrameCallback) {
        replay.timeSightFrameCallback(this, time, dt, manager, true, false, false);
      }

      time += dt;
      loop.step(time);

      if (this.game._stepExceptions > 100) {
        // eslint-disable-next-line no-console
        console.error('Too many errors in preflight; bailing out…');
        return;
      }
    }
    loop.resetDelta();

    this.game._replayPreflight -= 1;

    if (replay.timeSight) {
      this.calculateTimeSight();
    } else if (replay.timeSightFrameCallback) {
      this.game._replayPreflight += 1;
      this._timeSightTargetEnded = () => {
        replay.timeSightFrameCallback(this, time, dt, manager, false, true, true);
      };

      let postflightCutoff;
      if ('postflightCutoff' in replay) {
        postflightCutoff = replay.postflightCutoff;
        delete replay.postflightCutoff;
      }

      while (!this._timeSightTargetDone) {
        const isPostflight = postflightCutoff !== undefined && manager.tickCount >= postflightCutoff;
        replay.timeSightFrameCallback(this, time, dt, manager, false, isPostflight, false);
        time += dt;
        loop.step(time);

        if (this.game._stepExceptions > 100) {
          // eslint-disable-next-line no-console
          console.error('Too many errors in timeSight; bailing out…');
          return;
        }
      }
      this.scene.remove();
      this.game._replayPreflight -= 1;
    } else {
      this.scene.setVisible(true);
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

      this.game.stopReplay();
      this.game.beginReplay({
        ...replay,
        timeSight: false,
        snapshot: true,
        commands: activeObject._timeSightFrame.commands,
        preflightCutoff: activeObject._timeSightFrame.commands.reduce((cutoff, frame) => cutoff + (frame._repeat || 1), 0),
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
      this.command.stopReplay(this);
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
    // ordinarily to be avoided, but we don't want to start a new replay
    // to take the update from Replay.jsx
    this._replay.preflightCutoff = start;
    this._replay.postflightCutoff = end;

    this._timeSightFrames.forEach((frame, f) => {
      frame.isPreflight = frame.tickCount < start;
      frame.isPostflight = frame.tickCount > end;

      frame.objects.forEach((object) => {
        object.alpha = frame.tickCount >= start && frame.tickCount <= end ? 1 : object._timeSightAlpha;
      });
    });
  }

  cutoffTimeSightLeave() {
    this._timeSightFrames.forEach((frame) => {
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
      this.game.beginReplay(replay);
    }
  }

  beginRecording(recording) {
    this._recording = recording;
    recording.sceneSaveState = JSON.parse(JSON.stringify(this._initialSave));
    this.command.beginRecording(this, recording);
  }

  stopRecording() {
    const recording = this._recording;
    delete this._recording;
    this.command.stopRecording(this);
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
      this.game.beginReplay(replay);
    } else {
      this.replayParticleSystems();
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

    injectEmitterOpSeededRandom(emitter, reloadSeed || this.randFloat('particles'));

    if (onAdd) {
      onAdd(particles, emitter);
    }

    if (props.preemit || (reloadSeed && props.preemitOnReload)) {
      this.preemitEmitter(emitter);
    }

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

    const tween = this.tweens.add(massageTweenProps(target, props, options));

    return tween;
  }

  playSound(baseName, variants, volume = 1.0) {
    // preflight etc
    if (!this.scene.isVisible()) {
      return;
    }

    let name = baseName;
    if (variants) {
      name += 1 + Math.floor(this.randBetween(`sound/${name}`, 0, variants));
    }

    const sound = this.sound.add(name);

    sound.requestedVolume = volume;

    sound.setVolume(volume * this.game.volume);

    this.sounds.push(sound);

    sound.on('complete', () => {
      this.sounds = this.sounds.filter((s) => s !== sound);
    });

    sound.play();
  }

  changeVolume(newVolume) {
    const {sounds} = this;

    sounds.forEach((sound) => sound.setVolume(sound.requestedVolume * newVolume));
  }

  playMusic(name, forceRestart) {
    this.game.playMusic(name, forceRestart);
  }

  timer(callback, time) {
    const timer = {callback, time};
    this.timers.push(timer);
    return timer;
  }

  updateTimers(time, dt) {
    const {timers} = this;
    const newTimers = this.timers = [];

    timers.forEach((timer) => {
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
      const change = this.performanceProps.shift();

      const applyPropChanges = (keys) => {
        if (keys.length) {
          refreshUI();

          keys.filter((p) => isParticleProp(p)).forEach((p) => {
            this.replayParticleSystems(p);
          });
        }
      };

      let batch = true;
      const changedProps = [];
      const setProp = (key, value) => {
        changedProps.push(key);
        manageableProps[key] = value;

        if (!batch) {
          applyPropChanges([key]);
        }
      };

      if (typeof change === 'string') {
        setProp(change, true);
      } else if (typeof change === 'function') {
        change(setProp);
      }

      batch = false;

      // eslint-disable-next-line no-console
      console.log(`Performance seems iffy; applying ${change}`);

      applyPropChanges(changedProps);
    }
  }

  handlePointerEvent(event) {
    const camelName = event.name.charAt(0).toUpperCase() + event.name.slice(1);
    const method = `handle${camelName}`;
    if (this[method]) {
      this[method](event);
    } else if (prop('engine.debug')) {
      const debugMethod = `debugHandle${camelName}`;
      if (this[debugMethod]) {
        this[debugMethod](event);
      }
    }
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
            const previous = window.game._ldMapFiles;
            const nextMaps = parseMaps(text);

            if (!previous || !nextMaps) {
              return;
            }

            window.game._ldMapFiles = nextMaps;

            let reloadCurrent = true;

            const {scene} = window;
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
}
