import Phaser from 'phaser';
import {expandParticleProps} from './particles';
import {expandTweenProps} from './tweens';
import {expandTransitionProps} from './transitions';
import {freezeStorage, removeAllFields, loadField} from './store';
import {builtinCoordFragments, builtinColorFragments} from './shaders.js';

const savedChangedProps = loadField('changedProps', {});
export {savedChangedProps};

const rendererName = {
  [Phaser.AUTO]: 'auto',
  [Phaser.CANVAS]: 'canvas',
  [Phaser.WEBGL]: 'webgl',
};

const debug = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

export function builtinPropSpecs(commands, shaderCoordFragments, shaderColorFragments) {
  if (!debug) {
    Object.keys(commands).forEach((key) => {
      if (commands[key].debug) {
        delete commands[key];
      }
    });
  }

  return {
    'engine.time': [0.01, null, 'loop.time'],
    'engine.frameTime': [0.01, null, 'loop.delta'],
    'engine.actualFps': [0.01, null, 'loop.actualFps'],
    'engine.targetFps': [0.01, null, 'loop.targetFps'],
    'engine.renderer': [rendererName[Phaser.AUTO], null, (scene, game) => rendererName[game.renderer.type]],
    'engine.focused': [false, null, 'scene.game.focused'],
    'engine.throttle': [false],
    'engine.stepping': [false, (value, scene, game) => (value ? game.loop.sleep() : game.loop.wake())],
    'engine.step': [(scene, game) => game.prop('engine.stepping') && game.loop.tick()],
    'engine.clearLocalStorage': [() => { removeAllFields(); freezeStorage(); window.location = window.location; }],
    'engine.clearGameState': [() => { removeAllFields('game_'); freezeStorage(); window.location = window.location; }],
    'engine.disableDebugUI': [(scene, game) => game.disableDebugUI()],

    'config.debug': [debug, null, () => debug],
    'config.width': [0, null, (scene, game) => game.config.width],
    'config.height': [0, null, (scene, game) => game.config.height],
    'config.tileWidth': [0, null, (scene, game) => game.config.tileWidth],
    'config.tileHeight': [0, null, (scene, game) => game.config.tileHeight],
    'config.xBorder': [0, null, (scene, game) => scene.xBorder],
    'config.yBorder': [0, null, (scene, game) => scene.xBorder],

    'scene.count': ['', null, 'scene.scenes.length'],
    'scene.commandScenes': ['', null, (scene) => scene.command._scenes.size],
    'scene.class': ['', null, (scene) => scene.constructor.name],
    'scene.key': ['', null, 'scene.key'],
    'scene.seed': ['', null, 'scene.settings.data.seed'],
    'scene.scene_time': [0.01, null, 'scene_time'],
    'scene.music': ['', null, 'currentMusicName'],
    'scene.timeScale': [0.01, null, 'timeScale'],
    'scene.physicsFps': [0.01, null, 'physics.world.fps'],
    'scene.images': [0, null, (scene) => scene.add.displayList.list.filter((node) => node.type === 'Image').length],
    'scene.sprites': [0, null, (scene) => scene.add.displayList.list.filter((node) => node.type === 'Sprite').length],
    'scene.particles': [0, null, (scene) => scene.add.displayList.list.filter((node) => node.type === 'ParticleEmitterManager').length],
    'scene.text': [0, null, (scene) => scene.add.displayList.list.filter((node) => node.type === 'Text').length],
    'scene.sounds': [0, null, 'sounds.length'],
    'scene.timers': [0, null, 'timers.length'],
    'scene.physicsColliders': [0, null, 'physics.world.colliders._active.length'],
    'scene.musicVolume': [1, 0, 1, (value, scene, game) => {
      game.changeVolume(game.volume);
    }],
    'scene.soundVolume': [1, 0, 1, (value, scene, game) => {
      game.changeVolume(game.volume);
    }],
    'scene.debugDraw': [false, (value, scene) => {
      if (value) {
        scene.physics.world.createDebugGraphic();
      } else {
        scene.physics.world.debugGraphic.destroy();
      }
    }],
    'scene.replaceWithSelf': [(scene) => scene.replaceWithSelf(false)],

    'scene.camera.width': [0, null, 'camera.width'],
    'scene.camera.height': [0, null, 'camera.height'],
    'scene.camera.alpha': [0.1, null, 'camera.alpha'],
    'scene.camera.zoom': [0.1, null, 'camera.zoom'],
    'scene.camera.rotation': [0.1, null, 'camera.rotation'],
    'scene.camera.x': [0, null, 'camera.x'],
    'scene.camera.y': [0, null, 'camera.y'],
    'scene.camera.scrollX': [0, null, 'camera.scrollX'],
    'scene.camera.scrollY': [0, null, 'camera.scrollY'],
    'scene.camera.centerX': [0, null, 'camera.centerX'],
    'scene.camera.centerY': [0, null, 'camera.centerY'],
    'scene.camera.boundsX': [0, null, 'camera._bounds.x'],
    'scene.camera.boundsY': [0, null, 'camera._bounds.y'],
    'scene.camera.boundsWidth': [0, null, 'camera._bounds.width'],
    'scene.camera.boundsHeight': [0, null, 'camera._bounds.height'],
    'scene.camera.useBounds': [true, null, 'camera.useBounds'],

    'scene.camera.follow': ['', null, objectIdentifier(
      (scene) => scene.level,
      (scene) => scene.camera._follow,
    )],
    'scene.camera.followOffsetX': [0, null, 'camera.followOffset.x'],
    'scene.camera.followOffsetY': [0, null, 'camera.followOffset.y'],

    'scene.camera.lerp': [1, 0, 1, (value, scene) => {
      scene.setCameraLerp();
    }],
    'scene.camera.deadzoneX': [0, 0, 1000, (value, scene) => {
      scene.setCameraDeadzone();
    }],
    'scene.camera.deadzoneY': [0, 0, 1000, (value, scene) => {
      scene.setCameraDeadzone();
    }],
    'scene.camera.hasBounds': [true, (value, scene) => {
      scene.setCameraBounds();
    }],

    ...commandKeyProps(commands),

    'command.gamepad.total': [0, null],
    'command.gamepad.A': [false, null],
    'command.gamepad.B': [false, null],
    'command.gamepad.X': [false, null],
    'command.gamepad.Y': [false, null],
    'command.gamepad.L1': [false, null],
    'command.gamepad.L2': [false, null],
    'command.gamepad.R1': [false, null],
    'command.gamepad.R2': [false, null],
    'command.gamepad.UP': [false, null],
    'command.gamepad.DOWN': [false, null],
    'command.gamepad.LEFT': [false, null],
    'command.gamepad.RIGHT': [false, null],
    'command.gamepad.LSTICKX': [0.01, null],
    'command.gamepad.LSTICKY': [0.01, null],
    'command.gamepad.RSTICKX': [0.01, null],
    'command.gamepad.RSTICKY': [0.01, null],

    'command.ignore_all.any': [false, null, (scene) => scene.command.ignoreAll(scene)],
    'command.ignore_all._transition': [false, null, (scene) => scene.command.ignoreAll(scene, '_transition')],

    ...commandProps(commands),
    ...shaderProps(shaderCoordFragments, shaderColorFragments),
  };
}

function commandProps(commands) {
  const props = {};

  Object.entries(commands).forEach(([name, config]) => {
    props[`command.${name}.held`] = [false, null];
    props[`command.${name}.started`] = [false, null];
    props[`command.${name}.continued`] = [false, null];
    props[`command.${name}.released`] = [false, null];

    props[`command.${name}.heldFrames`] = [0, null];
    props[`command.${name}.releasedFrames`] = [0, null];
    props[`command.${name}.heldDuration`] = [0, null];
    props[`command.${name}.releasedDuration`] = [0, null];

    props[`command.${name}.enabled`] = [true];

    if (config.execute) {
      const execute = typeof config.execute === 'function'
        ? (scene, game) => config.execute(scene, game)
        : (scene, game) => scene[config.execute](scene, game);
      props[`command.${name}.execute`] = [execute];
    }
  });

  return props;
}

const knownInputs = [
  'gamepad.A',
  'gamepad.B',
  'gamepad.X',
  'gamepad.Y',
  'gamepad.L1',
  'gamepad.L2',
  'gamepad.R1',
  'gamepad.R2',
  'gamepad.UP',
  'gamepad.DOWN',
  'gamepad.LEFT',
  'gamepad.RIGHT',
  'gamepad.LSTICK.UP',
  'gamepad.LSTICK.DOWN',
  'gamepad.LSTICK.LEFT',
  'gamepad.LSTICK.RIGHT',
  'gamepad.RSTICK.UP',
  'gamepad.RSTICK.DOWN',
  'gamepad.RSTICK.LEFT',
  'gamepad.RSTICK.RIGHT',

  ...(Object.keys(Phaser.Input.Keyboard.KeyCodes).map((x) => `keyboard.${x}`)),
].reduce((a, b) => {
  a[b] = true;
  return a;
}, {});

export const shaderTypeMeta = {
  float: [1, 'float', 'setFloat1'],
  vec2: [2, 'vec2', 'setFloat2v', 'x', 'y'],
  vec3: [3, 'vec3', 'setFloat3v', 'x', 'y', 'z'],
  vec4: [4, 'vec4', 'setFloat4v', 'x', 'y', 'z', 'w'],
  rgb: [3, 'vec3', 'setFloat3v', 'r', 'g', 'b'],
  rgba: [4, 'vec4', 'setFloat4v', 'r', 'g', 'b', 'a'],
};

export function propNamesForUniform(fragmentName, uniformName, spec) {
  let [type] = spec;

  if (!type) {
    type = 'float';
  }

  const [count, , , ...subvariables] = shaderTypeMeta[type];

  if (type === 'rgb') {
    let sub = '';
    if (!uniformName.match(/color$/i)) {
      sub = '_color';
    }

    return [`shader.${fragmentName}.${uniformName}${sub}`];
  } else if (type === 'rgba') {
    return [
      `shader.${fragmentName}.${uniformName}_color`,
      `shader.${fragmentName}.${uniformName}_alpha`,
    ];
  } else if (count === 1) {
    return [`shader.${fragmentName}.${uniformName}`];
  } else {
    return subvariables.map((sub, i) => {
      return `shader.${fragmentName}.${uniformName}_${sub}`;
    });
  }
}

function injectBuiltinFragment(fragments, isCoord) {
  let primary = builtinColorFragments;
  let secondary = builtinCoordFragments;
  let primaryName = 'shaderColorFragments';
  let secondaryName = 'shaderCoordFragments';

  if (!fragments) {
    return [];
  }

  if (isCoord) {
    [primary, secondary] = [secondary, primary];
    [primaryName, secondaryName] = [secondaryName, primaryName];
  }

  if (fragments.length === 0) {
    fragments.push(...primary);
    return;
  }

  for (let i = 0; i < fragments.length; i += 1) {
    if (typeof fragments[i] === 'string') {
      const name = fragments[i];
      const replacement = primary.find(([p]) => name === p);
      if (replacement) {
        fragments[i] = replacement;
      } else {
        // eslint-disable-next-line no-console
        console.error(`Unable to find builtin ${primaryName} '${name}'; available are: ${primary.map(([p]) => p).join(', ')}`);

        const suggestion = secondary.find(([p]) => name === p);
        if (suggestion) {
          // eslint-disable-next-line no-console
          console.error(`Perhaps you meant the builtin ${secondaryName} '${name}'?`);
        }

        fragments.splice(i, 1);
        i -= 1;
      }
    }
  }
}

function shaderProps(coordFragments, colorFragments) {
  const props = {};

  injectBuiltinFragment(coordFragments, true);
  injectBuiltinFragment(colorFragments, false);

  [...(coordFragments || []), ...(colorFragments || [])].forEach(([fragmentName, uniforms]) => {
    props[`shader.${fragmentName}.enabled`] = [true, (value, scene, game) => game.recompileMainShaders()];

    Object.entries(uniforms).forEach(([uniformName, spec]) => {
      // eslint-disable-next-line prefer-const
      let [type, ...config] = spec;

      const name = `${fragmentName}_${uniformName}`;

      if (!type) {
        type = 'float';
      }

      if (!shaderTypeMeta[type]) {
        throw new Error(`Unknown type ${type} for shader ${name}`);
      }

      const [count, , setter, ...subvariables] = shaderTypeMeta[type];

      if (uniformName.match(/color$/i) && type !== 'rgb' && type !== 'rgba') {
        throw new Error(`Shader uniform ${name} ends with /color$/i but it isn't using type rgb or rgba`);
      }

      if (type === 'rgb') {
        if (config.length > 2
            || config.length === 0
            || !Array.isArray(config[0])
            || config[0].length !== 3
            || (config.length === 2 && config[1] !== null)) {
          throw new Error(`Expected rgb shader uniform ${name} to have shape ['rgb', [0.95, 0.25, 0.5]] or ['rgb', [0.95, 0.25, 0.5], null]`);
        }

        let sub = '';
        if (!uniformName.match(/color$/i)) {
          sub = '_color';
        }

        if (config[1] === null) {
          config.push((scene) => (scene[name] ? scene[name].map((c) => c * 255.0) : undefined));
        } else {
          config.push((_, scene, game) => {
            if (!scene.shader) {
              return;
            }
            const value = game.prop(`shader.${fragmentName}.${uniformName}${sub}`).map((c) => c / 255.0);
            scene.shader[setter](name, value);
          });
        }

        config[0] = config[0].map((c) => c * 255.0);
        props[`shader.${fragmentName}.${uniformName}${sub}`] = config;
      } else if (type === 'rgba') {
        if (config.length > 2
            || config.length === 0
            || !Array.isArray(config[0])
            || config[0].length !== 4
            || (config.length === 2 && config[1] !== null)) {
          throw new Error(`Expected rgbs shader uniform ${name} to have shape ['rgba', [0.95, 0.25, 0.5, 1]] or ['rgb', [0.95, 0.25, 0.5, 1], null]`);
        }

        const colorConfig = [config[0].filter((_, i) => i < 3)];
        const alphaConfig = [config[0][3]];

        if (config[1] === null) {
          colorConfig.push(null);
          alphaConfig.push(null);

          colorConfig.push((scene) => (scene[name] ? scene[name].filter((_, i) => i < 3).map((c) => c * 255.0) : undefined));
          alphaConfig.push((scene) => (scene[name] ? scene[name][3] : undefined));
        } else {
          alphaConfig.push(0, 1); // min and max

          const cb = (value, scene, game) => {
            if (!scene.shader) {
              return;
            }

            scene.shader[setter](name, [
              ...game.prop(`shader.${fragmentName}.${uniformName}_color`).map((c) => c / 255.0),
              game.prop(`shader.${fragmentName}.${uniformName}_alpha`),
            ])
          };
          colorConfig.push(cb);
          alphaConfig.push(cb);
        }

        colorConfig[0] = colorConfig[0].map((c) => c * 255.0);
        props[`shader.${fragmentName}.${uniformName}_color`] = colorConfig;
        props[`shader.${fragmentName}.${uniformName}_alpha`] = alphaConfig;
      } else if (count === 1) {
        if (config[1] === null) {
          config.push((scene) => scene[name]);
        } else if (typeof config[config.length - 1] !== 'function') {
          config.push((value, scene) => scene.shader && scene.shader[setter](name, value));
        }

        if (config[0] === 0 && config[1] === null) {
          config[0] = 0.1;
        }

        props[`shader.${fragmentName}.${uniformName}`] = config;
      } else {
        subvariables.forEach((sub, i) => {
          const c = [...config];
          c[0] = c[0][i];

          if (c[1] === null) {
            c.push((scene) => (scene[name] ? scene[name][i] : undefined));
          } else if (typeof c[c.length - 1] !== 'function') {
            c.push((_, scene, game) => {
              if (!scene.shader) {
                return;
              }

              const value = subvariables.map((s) => game.prop(`shader.${fragmentName}.${uniformName}_${s}`));
              scene.shader[setter](name, value);
            });
          }

          if (c[0] === 0 && c[1] === null) {
            c[0] = 0.1;
          }

          props[`shader.${fragmentName}.${uniformName}_${sub}`] = c;
        });
      }
    });
  });

  return props;
}

export function keysWithPrefix(commands, prefix, skipWarning) {
  const keys = [];

  Object.entries(commands).forEach(([command, config]) => {
    if (!config.input) {
      return;
    }

    config.input.forEach((inputPath) => {
      if (!knownInputs[inputPath]) {
        if (!skipWarning) {
          // eslint-disable-next-line no-console
          console.error(`Unknown input path ${inputPath} for command ${command}`);
        }
        return;
      }

      if (inputPath.startsWith(prefix)) {
        keys.push(inputPath.substr(prefix.length));
      }
    });
  });

  return keys;
}

export function commandKeys(commands, skipWarning) {
  return keysWithPrefix(commands, 'keyboard.', skipWarning);
}

export function gamepadKeys(commands, skipWarning) {
  return keysWithPrefix(commands, 'gamepad.', skipWarning);
}

export function commandKeyProps(commands) {
  const props = {};

  commandKeys(commands).sort().forEach((key) => {
    props[`command.keyboard.${key}`] = [false, null];
  });

  return props;
}

export function preprocessPropSpecs(propSpecs, particleImages) {
  expandParticleProps(propSpecs, particleImages);
  expandTweenProps(propSpecs, particleImages);
  expandTransitionProps(propSpecs, particleImages);
}

export function ManageableProps(propSpecs) {
  Object.entries(propSpecs).forEach(([key, spec]) => {
    if (!Array.isArray(spec)) {
      throw new Error(`Invalid spec for prop ${key}; expected array, got ${spec}`);
    }

    let [value] = spec;
    // interject the scene and game, and wrap in a try
    if (typeof value === 'function') {
      const original = value;
      value = () => {
        try {
          const {game} = window;
          const scene = game.topScene();
          scene.command.recordPropExecution(key);
          original(scene, game);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        }
      };
    }

    if (key in savedChangedProps) {
      const [current, original] = savedChangedProps[key];
      if (JSON.stringify(value) === JSON.stringify(original)) {
        value = current;
      } else {
        delete savedChangedProps[key];
      }
    }

    this[key] = value;
  });
}

export function makePropsWithPrefix(propSpecs, manageableProps) {
  if (debug) {
    return (prefix) => {
      const props = {};
      Object.entries(manageableProps).forEach(([key, value]) => {
        if (key.startsWith(prefix)) {
          const name = key.substr(prefix.length);
          props[name] = value;
        }
      });
      return props;
    };
  }

  const cache = {};
  return (prefix, clearCache) => {
    if (clearCache) {
      if (prefix) {
        delete cache[prefix];
      } else {
        Object.keys(cache).forEach((key) => delete cache[key]);
      }
    }

    if (!cache[prefix]) {
      const props = {};
      Object.entries(propSpecs).forEach(([key, spec]) => {
        if (key.startsWith(prefix)) {
          const [value] = spec;
          const name = key.substr(prefix.length);
          props[name] = value;
        }
      });
      cache[prefix] = props;
    }
    return cache[prefix];
  };
}

export function PropLoader(propSpecs, manageableProps) {
  if (debug) {
    let p = manageableProps;
    return (name, update) => {
      if (update) {
        p = update;
        return;
      }

      if (!(name in p)) {
        throw new Error(`Invalid prop named ${name}`);
      }

      return p[name];
    };
  }

  return (name) => propSpecs[name][0];
}

export function objectIdentifier(getContainer, getObject) {
  let cacheInput;
  let cacheOutput;
  return (...args) => {
    const object = getObject(...args);
    if (object === cacheInput) {
      return cacheOutput;
    }

    cacheInput = object;

    if (!object) {
      cacheOutput = object;
      return cacheOutput;
    }

    if (typeof object === 'object' && object.name) {
      cacheOutput = object.name;
      return cacheOutput;
    }

    const container = getContainer(...args);
    if (container && typeof container === 'object') {
      // eslint-disable-next-line guard-for-in, no-restricted-syntax
      for (const key in container) {
        const value = container[key];

        if (value === object) {
          cacheOutput = key;
          return cacheOutput;
        }
      }
    }

    if (typeof object === 'object' && object.texture && object.texture.key) {
      cacheOutput = object.texture.key;
      return cacheOutput;
    }

    cacheOutput = undefined;
    return cacheOutput;
  };
}
