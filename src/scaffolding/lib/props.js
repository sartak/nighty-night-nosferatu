import Phaser from 'phaser';
import {expandParticleProps} from './particles';
import {expandTweenProps} from './tweens';
import {freezeStorage, removeAllFields, loadField} from './store';

const savedChangedProps = loadField('changedProps', {});
export {savedChangedProps};

const rendererName = {
  [Phaser.AUTO]: 'auto',
  [Phaser.CANVAS]: 'canvas',
  [Phaser.WEBGL]: 'webgl',
};

const debug = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

export function builtinPropSpecs(commands) {
  if (!debug) {
    Object.keys(commands).forEach((key) => {
      if (commands[key].debug) {
        delete commands[key];
      }
    });
  }

  return {
    'engine.debug': [debug, null, () => debug],
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

    'scene.count': ['', null, 'scene.scenes.length'],
    'scene.commandScenes': ['', null, (scene) => scene.command._scenes.size],
    'scene.class': ['', null, (scene) => scene.constructor.name],
    'scene.key': ['', null, 'scene.key'],
    'scene.seed': ['', null, 'scene.settings.data.seed'],
    'scene.music': ['', null, 'currentMusicName'],
    'scene.physicsFps': [0.01, null, 'physics.world.fps'],
    'scene.images': [0, null, (scene) => scene.add.displayList.list.filter((node) => node.type === 'Image').length],
    'scene.sprites': [0, null, (scene) => scene.add.displayList.list.filter((node) => node.type === 'Sprite').length],
    'scene.particles': [0, null, (scene) => scene.add.displayList.list.filter((node) => node.type === 'ParticleEmitterManager').length],
    'scene.text': [0, null, (scene) => scene.add.displayList.list.filter((node) => node.type === 'Text').length],
    'scene.sounds': [0, null, 'sounds.length'],
    'scene.timers': [0, null, 'timers.length'],
    'scene.physicsColliders_length': [0, null, 'physics.world.colliders._active.length'],
    'scene.debugDraw': [false, (value, scene) => {
      if (value) {
        scene.physics.world.createDebugGraphic();
      } else {
        scene.physics.world.debugGraphic.destroy();
      }
    }],
    'scene.replaceWithSelf': [(scene) => scene.replaceWithSelf(false)],

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

    ...commandProps(commands),
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
          original(game.topScene(), game);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        }
      };
    }

    if (key in savedChangedProps) {
      const [current, original] = savedChangedProps[key];
      if (value === original) {
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
  return (prefix) => {
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

      if (!(name in propSpecs)) {
        throw new Error(`Invalid prop named ${name}`);
      }

      return p[name];
    };
  }

  return (name) => propSpecs[name][0];
}
