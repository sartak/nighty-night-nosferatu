import Phaser from 'phaser';
import prop, {propsWithPrefix, manageableProps} from '../props';
import {updatePropsFromStep, overrideProps} from './lib/manage-gui';
import massageParticleProps, {injectEmitterOpSeededRandom} from './lib/particles';
import {saveField, loadField} from './lib/store';

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
            tweens.update(time, dt);

            this.game._stepExceptions = 0;
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);

            this.game._stepExceptions = (this.game._stepExceptions || 0) + 1;
            if (this.game._stepExceptions > 100) {
              this.game.loop.sleep();
              // eslint-disable-next-line no-console
              console.error('Too many errors; pausing game loop until hot reload');
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

    this.scene.remove();

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

    if (replay.preflight) {
      this.game._replayPreflight += 1;
      command.beginPreflight(this);

      loop.sleep();
      this.scene.setVisible(false);
      while (command.hasPreflight(this)) {
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
        const manager = this.command.getManager(this);

        this._timeSightTargetEnded = () => {
          replay.timeSightFrameCallback(this, time, dt, manager.speculativeRecording, true);
        };

        while (!this._timeSightTargetDone) {
          replay.timeSightFrameCallback(this, time, dt, manager.speculativeRecording, false);
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
        timeSightFrameCallback: (scene, frameTime, frameDt, preflight, isLast) => {
          objectDt += frameDt;
          const objects = scene.renderTimeSightFrameInto(this, objectDt, frameTime, frameDt, isLast);
          if (!objects || !objects.length) {
            return;
          }

          updatePropsFromStep();

          this._timeSightFrames.push({
            objects,
            props: {...manageableProps},
            preflight: [...preflight],
          });
          objectDt = 0;
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

  beginTimeSightAlphaAnimation() {
    const frames = this._timeSightFrames;

    overrideProps(frames[0].props);

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
                    delay: 100 * frames.length + 1000,
                    callback: () => loopAlpha(frame, n),
                  });
                }
              },
            });
          },
        });
      });
    };

    frames.forEach((frame, n) => {
      frame.timer = this.time.addEvent({
        delay: 100 * n + 1000,
        callback: () => {
          loopAlpha(frame, n);
        },
      });
    });

    if (this._timeSightMouseInput) {
      frames.forEach((frame) => {
        frame.objects.forEach((object) => {
          object.alpha = object._timeSightAlpha;
        });
      });

      return;
    }

    this._timeSightMouseInput = true;

    this.input.topOnly = true;

    frames.forEach((frame) => {
      frame.objects.forEach((object) => {
        object.setInteractive();
        object._timeSightAlpha = object.alpha;
        object._timeSightFrame = frame;
      });
    });

    this.input.on('gameobjectover', (pointer, activeObject) => {
      if (this._timeSightRemoveFocusTimer) {
        this._timeSightRemoveFocusTimer.destroy();
      }

      this.game.canvas.style.cursor = 'pointer';

      let matchedFrame;
      frames.forEach((frame) => {
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

      const replay = this._replay;

      this.game.stopReplay();
      this.game.beginReplay({
        ...replay,
        timeSight: false,
        snapshot: true,
        preflight: activeObject._timeSightFrame.preflight,
        commands: [],
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
      console.error('Resetting after recovering from errors');
      this.game._stepExceptions = 0;
      this.game.loop.wake();
      this.replaceWithSelf();
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

  destroy() {
    this.command.detachScene(this);
  }
}
