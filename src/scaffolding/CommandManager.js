import _ from 'lodash';
import {commandKeys, gamepadKeys} from './lib/props';
import prop from '../props';

const GamepadButtons = {
  LEFT: '_LCLeft',
  RIGHT: '_LCRight',
  UP: '_LCTop',
  DOWN: '_LCBottom',
  A: '_RCBottom',
  Y: '_RCTop',
  X: '_RCLeft',
  B: '_RCRight',
  L1: '_FBLeftTop',
  L2: '_FBLeftBottom',
  R1: '_FBRightTop',
  R2: '_FBRightBottom',
};

const ButtonName = {};

export default class CommandManager {
  constructor(spec) {
    this._spec = spec;
    this._scenes = new Map();

    this.keyboard = {};
    this.gamepad = {};
    this.pointerEvents = [];
    this.executedProps = [];

    Object.keys(spec).forEach((name) => {
      if (this[name]) {
        throw new Error(`Conflicting command name ${name}`);
      }

      this[name] = {
        held: false,
        heldFrames: 0,
        started: false,
        continued: false,
        heldDuration: 0,
        releasedFrames: 0,
        released: false,
        releasedDuration: 0,
      };
    });
  }

  getManager(scene) {
    return this._scenes.get(scene);
  }

  managerList() {
    return [...this._scenes.values()];
  }

  attachScene(scene, suppressRepeatFrames) {
    this._scenes.set(scene, {
      scene,
      ignoreAlls: {},
      commands: scene.game.debug ? [] : null,
      tickCount: 0,
      suppressRepeatFrames,
    });
  }

  detachScene(scene) {
    this._scenes.delete(scene);
  }

  attachKey(scene, code) {
    const {keyboard} = scene.input;

    keyboard.on(`keydown-${code}`, (e) => {
      const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        return;
      }

      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }

      e.preventDefault();
      this.keyboard[code] = true;
    });

    keyboard.on(`keyup-${code}`, (e) => {
      const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        return;
      }

      e.preventDefault();
      this.keyboard[code] = false;
    });

    if (!(code in this.keyboard)) {
      this.keyboard[code] = false;
    }
  }

  detachKey(scene, code) {
    delete this.keyboard[code];
  }

  attachInputs(scene) {
    commandKeys(this._spec).forEach((code) => {
      this.attachKey(scene, code);
    });

    if (scene.input.gamepad) {
      scene.input.gamepad.on('down', (gamepad, button) => {
        let buttonName = ButtonName[button.index];
        if (!buttonName) {
          Object.entries(GamepadButtons).forEach(([name, method]) => {
            if (button === gamepad[method]) {
              buttonName = ButtonName[button.index] = name;
            }
          });
        }

        this.gamepad[buttonName] = true;
      });

      scene.input.gamepad.on('up', (gamepad, button) => {
        let buttonName = ButtonName[button.index];
        if (!buttonName) {
          Object.entries(GamepadButtons).forEach(([name, method]) => {
            if (button === gamepad[method]) {
              buttonName = ButtonName[button.index] = name;
            }
          });
        }

        this.gamepad[buttonName] = false;
      });
    }

    const canvas = document.querySelector('#engine canvas');

    ['pointerdown', 'pointerup'].forEach((name) => {
      scene.input.on(name, (pointer) => {
        // fix issue with dat.gui not releasing focus
        if (!document.activeElement || !document.activeElement.contains || document.activeElement.contains(canvas)) {
          this.pointerEvents.push({
            name,
            x: pointer.x,
            y: pointer.y,
          });
        } else {
          // timeout to avoid 2x input events
          setTimeout(() => {
            document.activeElement.blur();
          });
        }
      });
    });
  }

  readRawGamepad(scenes) {
    const {gamepad} = this;
    let seenGamepad = false;

    scenes.forEach((scene) => {
      const rawGamepad = scene.input.gamepad;
      if (!rawGamepad.total) {
        return;
      }

      if (!seenGamepad) {
        seenGamepad = true;

        gamepad.total = 0;
        gamepad.LSTICKX = 0;
        gamepad.LSTICKY = 0;
        gamepad.RSTICKX = 0;
        gamepad.RSTICKY = 0;
      }

      if (gamepad.total < rawGamepad.total) {
        gamepad.total = rawGamepad.total;
      }

      rawGamepad.gamepads.filter((pad) => pad).forEach((rawPad) => {
        const {leftStick, rightStick} = rawPad;
        if (Math.abs(leftStick.x) > Math.abs(gamepad.LSTICKX)) {
          gamepad.LSTICKX = leftStick.x;
        }

        if (Math.abs(leftStick.y) > Math.abs(gamepad.LSTICKY)) {
          gamepad.LSTICKY = leftStick.y;
        }

        if (Math.abs(rightStick.x) > Math.abs(gamepad.RSTICKX)) {
          gamepad.RSTICKX = rightStick.x;
        }

        if (Math.abs(rightStick.y) > Math.abs(gamepad.RSTICKY)) {
          gamepad.RSTICKY = rightStick.y;
        }
      });
    });
  }

  heldCommands(onlyUnignorable) {
    const {gamepad} = this;
    const spec = this._spec;
    const frame = {_repeat: 0};

    Object.entries(spec).forEach(([name, config]) => {
      if (onlyUnignorable && !config.unignorable) {
        return;
      }

      let held = false;
      if (config.input) {
        config.input.forEach((path) => {
          let keyHeld;

          if (gamepad.total) {
            if (path === 'gamepad.LSTICK.UP') {
              keyHeld = gamepad.LSTICKY < -0.2;
            } else if (path === 'gamepad.LSTICK.DOWN') {
              keyHeld = gamepad.LSTICKY > 0.2;
            } else if (path === 'gamepad.LSTICK.LEFT') {
              keyHeld = gamepad.LSTICKX < -0.2;
            } else if (path === 'gamepad.LSTICK.RIGHT') {
              keyHeld = gamepad.LSTICKX > 0.2;
            } else if (path === 'gamepad.RSTICK.UP') {
              keyHeld = gamepad.RSTICKY < -0.2;
            } else if (path === 'gamepad.RSTICK.DOWN') {
              keyHeld = gamepad.RSTICKY > 0.2;
            } else if (path === 'gamepad.RSTICK.LEFT') {
              keyHeld = gamepad.RSTICKX < -0.2;
            } else if (path === 'gamepad.RSTICK.RIGHT') {
              keyHeld = gamepad.RSTICKX > 0.2;
            } else {
              keyHeld = _.get(this, path);
            }
          } else {
            keyHeld = _.get(this, path);
          }

          if (keyHeld) {
            held = true;
          }
        });

        this[name].held = held;

        if (held) {
          frame[name] = held;
        }
      }
    });

    if (this.pointerEvents.length) {
      if (!onlyUnignorable) {
        frame._pointer = [...this.pointerEvents];
      }
      this.pointerEvents.length = 0;
    }

    if (this.executedProps.length) {
      if (!onlyUnignorable) {
        frame._executedProps = [...this.executedProps];
      }
      this.executedProps.length = 0;
    }

    return frame;
  }

  replayFrame(frame) {
    const spec = this._spec;

    Object.entries(spec).forEach(([name, config]) => {
      if (frame[name] && config.unreplayable) {
        this[name].held = false;
      } else {
        this[name].held = frame[name];
      }
    });
  }

  mergeUnignorable(frame) {
    const spec = this._spec;

    Object.entries(spec).forEach(([name, config]) => {
      if (frame[name] && config.unignorable && !config.unreplayable) {
        this[name].held = true;
      }
    });
  }

  addFrameToList(suppressRepeatFrames, list, frame) {
    if (!suppressRepeatFrames && list.length) {
      const prevFrame = list[list.length - 1];
      let isSame = true;
      if (frame._pointer || prevFrame._pointer) {
        isSame = false;
      } else if (frame._executedProps || prevFrame._executedProps) {
        isSame = false;
      } else {
        Object.keys(this._spec).forEach((key) => {
          if (prevFrame[key] !== frame[key]) {
            isSame = false;
          }
        });
      }

      if (isSame) {
        list.pop();
        list.push({...prevFrame, _repeat: prevFrame._repeat + 1});
        return;
      }
    }

    list.push(frame);
  }

  ignoreAll(scene, type, newValue) {
    const manager = this.getManager(scene);
    const {ignoreAlls} = manager;

    if (type === undefined) {
      let ignoreAny = false;
      Object.values(ignoreAlls).forEach((ignore) => {
        if (ignore) {
          ignoreAny = true;
        }
      });
      return ignoreAny;
    }

    if (newValue === undefined) {
      return ignoreAlls[type];
    }

    ignoreAlls[type] = !!newValue;
    return ignoreAlls[type];
  }

  processCommands(manager, frame, dt) {
    const spec = this._spec;
    const {scene} = manager;

    const ignoreAll = this.ignoreAll(scene);

    Object.entries(spec).forEach(([name, config]) => {
      const command = this[name];

      if (!prop(`command.${name}.enabled`) || (ignoreAll && !config.unignorable)) {
        command.held = false;
      }

      if (command.held) {
        command.heldFrames += 1;
        command.heldDuration += dt;
        command.started = command.heldFrames === 1;
        command.continued = command.heldFrames > 1;
        command.released = false;
        command.releasedFrames = 0;
        command.releasedDuration = 0;
      } else {
        command.held = false;
        command.heldFrames = 0;
        command.heldDuration = 0;
        command.started = false;
        command.continued = false;
        command.released = command.releasedFrames === 1;
        command.releasedFrames += 1;
        command.releasedDuration += dt;
      }

      if (command.started && config.execute) {
        if (typeof config.execute === 'function') {
          config.execute(scene, scene.game);
        } else {
          const scenePath = _.get(scene, config.execute);
          if (scenePath) {
            scenePath.call(scene);
          } else {
            const gamePath = _.get(scene.game, config.execute);
            if (gamePath) {
              gamePath.call(scene.game);
            } else {
              throw new Error(`Invalid execute for command '${name}'; expected a function or a scene/game method name, got ${config.execute}`);
            }
          }
        }
      }
    });

    if (!ignoreAll && frame._pointer) {
      frame._pointer.forEach((event) => {
        scene.handlePointerEvent(event);
      });
    }

    if (this.replay && frame._executedProps) {
      frame._executedProps.forEach((propName) => {
        const fn = prop(propName);
        if (typeof fn === 'function') {
          fn();
        } else {
          // eslint-disable-next-line no-console
          console.error(`Recorded prop ${propName} is no longer a function? It's ${fn}`);
        }
      });
    }
  }

  injectReplayFrame() {
    if (!this.replay) {
      return null;
    }

    if (this.replayFrameIndex >= this.replay.commands.length || this.replayTicks >= this.replay.postflightCutoff) {
      this.endedReplay();
      return null;
    }

    const frame = this.replay.commands[this.replayFrameIndex];

    if (frame._repeat) {
      this.replayRepeatRun += 1;

      if (this.replayRepeatRun > frame._repeat) {
        this.replayRepeatRun = 0;
        this.replayFrameIndex += 1;
      }
    } else {
      this.replayFrameIndex += 1;
    }

    this.replayTicks += 1;

    this.replayFrame(frame);
    this.heldCommands(true);
    this.mergeUnignorable(frame);

    return {...frame, _repeat: 0};
  }

  processInput(scene, time, dt, onlyUnignorable) {
    const manager = this.getManager(scene);

    if (manager.scene.timeSightFrozen) {
      const frame = this.heldCommands(onlyUnignorable);
      this.processCommands(manager, frame, dt);
      return;
    }

    const frame = this.injectReplayFrame()
      || this.heldCommands(onlyUnignorable);

    if (manager.commands) {
      this.addFrameToList(manager.suppressRepeatFrames, manager.commands, frame);
    }
    if (this.recording) {
      this.addFrameToList(manager.suppressRepeatFrames, this.recording.commands, frame);
    }

    manager.tickCount += 1;

    if (this.recording) {
      this.recording.tickCount += 1;
    }

    this.processCommands(manager, frame, dt);
  }

  recordPropExecution(propName) {
    this.executedProps.push(propName);
  }

  beginRecording(scene, recording) {
    const manager = this.getManager(scene);
    this.recording = recording;
    recording.commands = [...manager.commands];
    recording.originalPreflightCutoff = recording.preflightCutoff = recording.tickCount = manager.tickCount;
  }

  stopRecording() {
    const {recording} = this;
    delete this.recording;
    recording.postflightCutoff = recording.tickCount;
    return recording;
  }

  beginReplay(replay, replayOptions) {
    this.replay = replay;
    this.replayFrameIndex = 0;
    this.replayRepeatRun = 0;
    this.replayTicks = 0;
    this.replayOptions = replayOptions;

    if (replay.startTick) {
      for (let i = 0; i < replay.startTick; i += 1) {
        this.injectReplayFrame();
      }
    }
  }

  endedReplay() {
    if (!this.replay) {
      return;
    }

    const {onEnd} = this.replayOptions;

    delete this.replay;
    delete this.replayOptions;
    delete this.replayFrameIndex;
    delete this.replayRepeatRun;
    delete this.replayTicks;

    if (onEnd) {
      onEnd();
    }
  }

  stopReplay() {
    if (!this.replay) {
      return;
    }

    const {onStop} = this.replayOptions;

    delete this.replay;
    delete this.replayOptions;
    delete this.replayFrameIndex;
    delete this.replayRepeatRun;
    delete this.replayTicks;

    if (onStop) {
      onStop();
    }
  }

  hasPreflight() {
    if (!this.replay) {
      return false;
    }

    if (this.replayTicks >= this.replay.postflightCutoff) {
      return false;
    }

    return this.replayTicks < (this.replayOptions.preflightCutoff || this.replay.preflightCutoff);
  }

  updateCommandsFromReload(next) {
    const prev = this._spec;

    this.updateSpecFromReload(prev, next);
    this.updateInputsFromReload(prev, next, true);
    this.updateInputsFromReload(prev, next, false);
  }

  updateSpecFromReload(prev, next) {
    this._spec = next;
    const addCommands = [];
    const removeCommands = [];
    const updateCommands = [];

    const seen = {};

    Object.entries(next).forEach(([name, config]) => {
      if (!prev[name]) {
        addCommands.push(name);
      } else {
        seen[name] = true;

        const prevJson = {};
        Object.entries(prev[name]).forEach(([key, value]) => {
          if (typeof value === 'function') {
            prevJson[key] = String(value);
          } else {
            prevJson[key] = value;
          }
        });

        const nextJson = {};
        Object.entries(next[name]).forEach(([key, value]) => {
          if (typeof value === 'function') {
            nextJson[key] = String(value);
          } else {
            nextJson[key] = value;
          }
        });

        if (JSON.stringify(prevJson) !== JSON.stringify(nextJson)) {
          updateCommands.push(name);
        }
      }
    });

    Object.keys(prev).forEach((name) => {
      if (!seen[name]) {
        removeCommands.push(name);
      }
    });

    if (addCommands.length === 0 && removeCommands.length === 0 && updateCommands.length === 0) {
      return;
    }

    const changes = [];
    if (addCommands.length) {
      changes.push(`+[${addCommands.join(', ')}]`);
    }
    if (removeCommands.length) {
      changes.push(`-[${removeCommands.join(', ')}]`);
    }
    if (updateCommands.length) {
      changes.push(`Δ[${updateCommands.join(', ')}]`);
    }

    // eslint-disable-next-line no-console
    console.info(`Hot-loading command changes (${changes.join(', ')})`);
  }

  updateInputsFromReload(prev, next, isKeyboard) {
    const nextKeys = {};
    const prevKeys = {};

    const keyLister = isKeyboard ? commandKeys : gamepadKeys;

    keyLister(next).forEach((code) => {
      nextKeys[code] = true;
    });

    keyLister(prev, true).forEach((code) => {
      prevKeys[code] = true;
    });

    const addKeys = [];
    Object.keys(nextKeys).forEach((code) => {
      if (prevKeys[code]) {
        delete prevKeys[code];
      } else {
        addKeys.push(code);
      }
    });
    const removeKeys = Object.keys(prevKeys);

    if (addKeys.length === 0 && removeKeys.length === 0) {
      return;
    }

    if (isKeyboard) {
      this.managerList().forEach((manager) => {
        addKeys.forEach((code) => {
          this.attachKey(manager.scene, code);
        });
        removeKeys.forEach((code) => {
          this.detachKey(manager.scene, code);
        });
      });
    }

    const changes = [];
    if (addKeys.length) {
      changes.push(`+[${addKeys.join(', ')}]`);
    }
    if (removeKeys.length) {
      changes.push(`-[${removeKeys.join(', ')}]`);
    }

    // eslint-disable-next-line no-console
    console.info(`Hot-loading ${isKeyboard ? 'keyboard' : 'gamepad'} input changes (${changes.join(', ')})`);
  }
}
