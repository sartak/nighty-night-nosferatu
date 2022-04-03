import {
  builtinPropSpecs,
  ManageableProps,
  PropLoader,
  makePropsWithPrefix,
  preprocessPropSpecs,
} from "./scaffolding/lib/props";

const particleImages = ["dot", "smoke"];

export const commands = {
  jump: {
    input: [
      "keyboard.UP",
      "keyboard.Z",
      "keyboard.W",
      "keyboard.SPACE",
      "gamepad.A",
      "gamepad.B",
      "gamepad.X",
      "gamepad.Y",
    ],
  },
  down: {
    input: ["keyboard.DOWN", "gamepad.DOWN", "keyboard.S"],
  },
  left: {
    input: ["keyboard.LEFT", "gamepad.LEFT", "keyboard.A"],
  },
  right: {
    input: ["keyboard.RIGHT", "gamepad.RIGHT", "keyboard.D"],
  },
  lstick: {
    input: ["gamepad.LSTICK.RAW"],
    joystick: true,
  },
  rstick: {
    input: ["gamepad.RSTICK.RAW"],
    joystick: true,
  },

  comet: {
    input: ["keyboard.M"],
    execute: "comet",
    unignorable: true,
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
  skip: {
    input: ["keyboard.N"],
    execute: "skipLevel",
    unignorable: true,
    unreplayable: true,
  },
  prev: {
    input: ["keyboard.P"],
    execute: "prevLevel",
    unignorable: true,
    unreplayable: true,
  },
  win: {
    input: ["keyboard.T"],
    execute: "wonLevel",
    debug: true,
    unignorable: true,
    unreplayable: true,
  },
};

export const shaderCoordFragments = ["shockwave"];
export const shaderColorFragments = null;
export const shaderPipelines = {};

export const propSpecs = {
  ...builtinPropSpecs(commands, shaderCoordFragments, shaderColorFragments),
  "command.ignore_all.spawn": [
    false,
    null,
    (scene) => scene.command.ignoreAll("spawn"),
  ],
  "command.ignore_all.dying": [
    false,
    null,
    (scene) => scene.command.ignoreAll("dying"),
  ],
  "command.ignore_all.winning": [
    false,
    null,
    (scene) => scene.command.ignoreAll("winning"),
  ],

  "player.speed": [150, 1, 1000],
  "player.drag": [0.3, 0, 1],
  "player.gravityBase": [3000, 1, 10000],
  "player.baseJumpVelocity": [300, 1, 1000],
  "player.touchingDown": [false, null, "level.player.body.touching.down"],
  "player.isJumping": [false, null, "level.player.isJumping"],
  "player.hasLiftedOff": [false, null, "level.player.hasLiftedOff"],
  "player.hasReleasedJump": [false, null, "level.player.hasReleasedJump"],
  "player.jumpStart": [0, null, "level.player.jumpStart"],
  "player.maxJumpTime": [200, 0, 10000],
  "player.maxJumpTrauma": [0.5, 0, 1],
  "player.jumpTraumaDivisor": [3000, 0, 10000],
  "player.invincible": [false],

  "sun.downsamplesLeft": [
    0,
    null,
    (scene) => scene.downsamples && scene.downsamples.length,
  ],
  "level.replaceDelay": [2000, 0, 10000],
  "level.fadeOutFactor": [10, 0, 100],
  "effects.firstCrumble.tween": [
    {
      duration: 200,
      ease: "Cubic.easeInOut",
      scaleX: 1.05,
      dy: 3,
      scaleY: 0.95,
      refreshPhysics: true,
      yoyo: true,
    },
  ],
  "effects.crumble.tween": [
    {
      duration: 800,
      ease: "Quad.easeOut",
      dy: 10,
      refreshPhysics: true,
      scaleX: 1.1,
      scaleY: 0.9,
      alpha: 0,
    },
  ],
  "effects.attract.tween": [
    {
      duration: 1000,
      ease: "Cubic.easeInOut",
      dy: 16,
      loop: 999,
      yoyo: true,
    },
  ],
  "effects.goodNight.tween": [
    {
      duration: 1000,
      ease: "Cubic.easeIn",
      dy: 100,
      alpha: 0,
    },
  ],
  "effects.playerDie.tween": [
    {
      duration: 200,
      alpha: 0,
    },
  ],
  "effects.playerDieHealthBar.tween": [
    {
      duration: 200,
      dy: 100,
      alpha: 0,
    },
  ],
  "effects.buttonPress.tween": [
    {
      duration: 500,
      ease: "Cubic.easeInOut",
      dy: 16,
      refreshPhysics: true,
      yoyo: true,
    },
  ],
  "effects.drawbridge.tween": [
    {
      duration: 1000,
      ease: "Bounce.easeOut",
      rotation: -90,
    },
  ],
  "effects.playerAsh.particles": [
    {
      image: "dot",
      blendMode: "ADD",
      accelerationY: 2000,
      lifespan: 500,
      speedX: 500,
      speedY: -1000,
      frequency: 1,
      quantity: 5,
    },
  ],
  "effects.lightAsh.particles": [
    {
      image: "dot",
      blendMode: "ADD",
      accelerationY: 2000,
      lifespan: 250,
      speedX: 250,
      speedY: -500,
      frequency: 100,
      quantity: 1,
    },
  ],
  "effects.playerSmoke.particles": [
    {
      image: "smoke",
      blendMode: "ADD",
      accelerationY: -100,
      lifespan: 1000,
      speedX: 100,
      speedY: -100,
      frequency: 1,
      quantity: 1,
    },
  ],
  "effects.stars.particles": [
    {
      image: "dot",
      blendMode: "ADD",
      lifespan: 2000,
      frequency: 1000,
      quantity: 25,
      preemit: true,
    },
  ],
  "effects.comet.particles": [
    {
      image: "dot",
      lifespan: 250,
      frequency: 1,
      quantity: 10,
    },
  ],
};

propSpecs["scene.camera.lerp"][0] = 0.005;
propSpecs["scene.camera.deadzoneX"][0] = 200;
propSpecs["scene.camera.deadzoneY"][0] = 200;

export const tileDefinitions = {
  ".": null, // background
  "#": {
    image: "solid",
    group: "wall",
    combine: "#",
    isStatic: true,
    shadow: true,
  },
  "|": {
    image: "translucent",
    group: "ground",
    combine: "|",
    preferCombineVertical: true,
    isStatic: true,
  },
  I: {
    image: "solid",
    group: "wall",
    combine: "I",
    preferCombineVertical: true,
    isStatic: true,
    shadow: true,
  },
  _: {
    image: "translucent",
    group: "ground",
    combine: "_",
    isStatic: true,
  },
  "/": {
    image: "spinner",
    group: "spinner",
    shadow: true,
  },
  "\\": {
    image: "spinner",
    group: "reverseSpinner",
    shadow: true,
  },
  "@": {
    image: "player",
    group: "player",
  },
  "~": {
    image: "crumble",
    group: "crumble",
    isStatic: true,
  },
  n: {
    image: "button",
    group: "button",
    isStatic: true,
  },
  "=": {
    image: "drawbridge",
    group: "drawbridge",
    shadow: true,
  },
};

preprocessPropSpecs(propSpecs, particleImages);

export const manageableProps = new ManageableProps(propSpecs);
export const propsWithPrefix = makePropsWithPrefix(propSpecs, manageableProps);
export default PropLoader(propSpecs, manageableProps);
