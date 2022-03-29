import {
  builtinPropSpecs,
  ManageableProps,
  PropLoader,
  makePropsWithPrefix,
  preprocessPropSpecs,
} from "./scaffolding/lib/props";

const particleImages = [""];

export const commands = {
  /*
  jump: {
    input: ['keyboard.Z', 'gamepad.A'],
  },
  */

  up: {
    input: ["keyboard.UP", "gamepad.UP"],
  },
  down: {
    input: ["keyboard.DOWN", "gamepad.DOWN"],
  },
  left: {
    input: ["keyboard.LEFT", "gamepad.LEFT"],
  },
  right: {
    input: ["keyboard.RIGHT", "gamepad.RIGHT"],
  },
  lstick: {
    input: ["gamepad.LSTICK.RAW"],
    joystick: true,
  },
  rstick: {
    input: ["gamepad.RSTICK.RAW"],
    joystick: true,
  },

  restart: {
    input: ["keyboard.R"],
    execute: (scene) => scene.replaceWithSelf(),
    debug: true,
    unignorable: true,
    unreplayable: true,
  },
  quit: {
    input: ["keyboard.Q"],
    execute: "forceQuit",
    debug: true,
    unignorable: true,
    unreplayable: true,
  },
  recordCycle: {
    input: ["gamepad.R1"],
    unreplayable: true,
    debug: true,
    unignorable: true,
    execute: (scene, game) => {
      const { _replay, _recording } = game;
      if (_replay && _replay.timeSight) {
        game.stopReplay();
      } else if (_replay) {
        setTimeout(() => {
          game.stopReplay();
          game.beginReplay({ ..._replay, timeSight: true });
        });
      } else if (_recording) {
        game.stopRecording();
      } else {
        game.beginRecording();
      }
    },
  },
};

export const shaderCoordFragments = null;
export const shaderColorFragments = null;
export const shaderPipelines = {};

export const propSpecs = {
  ...builtinPropSpecs(commands, shaderCoordFragments, shaderColorFragments),
};

export const tileDefinitions = {
  ".": null, // background
};

preprocessPropSpecs(propSpecs, particleImages);

export const manageableProps = new ManageableProps(propSpecs);
export const propsWithPrefix = makePropsWithPrefix(propSpecs, manageableProps);
export default PropLoader(propSpecs, manageableProps);
