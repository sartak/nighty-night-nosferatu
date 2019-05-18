import _ from 'lodash';
import * as dat from 'dat.gui';
import {manageableProps, propSpecs} from '../../props';

const gui = new dat.GUI({autoPlace: false});
export default gui;

const folders = {};
const controllers = {};
const parentOfFolder = new Map();

Object.keys(propSpecs).forEach((key) => addNestedFolder(key));
Object.keys(propSpecs).forEach((key) => addController(key, propSpecs[key]));

function upcase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function sentenceCase(name) {
  const words = name.split(/[-_ ]/);
  return words.map(upcase).join(' ');
}

function addNestedFolder(key) {
  const sections = key.split('.');
  let folderKey = '';
  let folder = gui;

  while (sections.length > 1) {
    const section = sections.shift();
    folderKey += `.${section}`;

    if (!folders[folderKey]) {
      folders[folderKey] = folder.addFolder(sentenceCase(section));
      parentOfFolder.set(folders[folderKey], folder);
    }

    folder = folders[folderKey];
  }

  return folder;
}

function removeEmptyFolders() {
  let deletedFolder = false;

  Object.entries(folders).forEach(([name, folder]) => {
    if (folder.__controllers.length || Object.keys(folder.__folders).length) {
      return;
    }

    const parent = parentOfFolder.get(folder);
    parent.removeFolder(folder);

    parentOfFolder.delete(folder);
    delete folders[name];

    deletedFolder = true;
  });

  // recurse now that the parent of the deleted folder could now be empty
  if (deletedFolder) {
    removeEmptyFolders();
  }
}

function addController(key, spec, open) {
  const [, ...options] = propSpecs[key];
  const folder = addNestedFolder(key);

  let controller;
  if (options.length >= 1 && options[0] === null) {
    controller = folder.add(manageableProps, key).listen();
    controller.domElement.closest('.cr').classList.add('listen');
    controller.domElement.querySelectorAll('input, select').forEach((node) => {
      node.onclick = (e) => {
        e.preventDefault();
      };
    });
  } else {
    let callback;
    if (options.length >= 1 && typeof options[options.length - 1] === 'function') {
      callback = options.pop();
    }

    if (key.match(/color/i)) {
      controller = folder.addColor(manageableProps, key, ...options);
    } else {
      controller = folder.add(manageableProps, key, ...options);
    }

    controller.onFinishChange((value) => {
      let ret;
      try {
        const {game} = window;
        const scene = game.topScene();
        scene.propDidFinishChange(key, value);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }

      return ret;
    });

    controller.onChange((value) => {
      let ret;
      try {
        const {game} = window;
        const scene = game.topScene();
        scene.propDidChange(key, value);
        if (callback) {
          ret = callback(value, scene, game);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }

      return ret;
    });
  }

  controllers[key] = controller;

  if (open) {
    let f = folder;
    while (f) {
      f.open();
      f = parentOfFolder.get(f);
    }
  }
}

function removeProp(key) {
  const controller = controllers[key];
  const folder = addNestedFolder(key);
  folder.remove(controller);
  delete controllers[key];
}

function refreshUI() {
  gui.updateDisplay();
  Object.values(folders).forEach((folder) => folder.updateDisplay());
}

const intervals = {};
export function updatePropsFromStep() {
  const {game} = window;
  const scene = game.topScene();

  Object.entries(propSpecs).forEach(([key, spec]) => {
    if (spec[1] !== null) {
      if (key.endsWith('.executeRepeatedly')) {
        const executeKey = key.replace(/\.executeRepeatedly$/, '.execute');
        const intervalKey = `${key}interval`;
        if (manageableProps[key]) {
          if (!intervals[intervalKey]) {
            const effect = manageableProps[executeKey];
            effect();
            intervals[intervalKey] = setInterval(effect, 2000);
          }
        } else if (intervals[intervalKey]) {
          clearInterval(intervals[intervalKey]);
          delete intervals[intervalKey];
        }
      }
    } else if (!spec[2]) {
      manageableProps[key] = _.get(game, key) || _.get(scene, key);
    } else if (typeof spec[2] === 'string') {
      manageableProps[key] = _.get(game, spec[2]) || _.get(scene, spec[2]);
    } else if (typeof spec[2] === 'function') {
      try {
        manageableProps[key] = spec[2](game.topScene(), game);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    }
  });
}

export function overrideProps(newProps) {
  Object.entries(propSpecs).forEach(([key, spec]) => {
    if (spec[1] === null) {
      manageableProps[key] = newProps[key];
    }
  });
}

function updatePropsFromReload(next) {
  const leftoverKeys = {};
  Object.keys(controllers).forEach((key) => {
    leftoverKeys[key] = true;
  });

  Object.keys(next).forEach((key) => addNestedFolder(key, true));

  Object.entries(next).forEach(([key, spec]) => {
    if (!(key in controllers)) {
      addController(key, spec, true);
    } else {
      delete leftoverKeys[key];

      // regenerate this controller with the new config
      const controller = controllers[key];
      controller.remove();
      addController(key, spec);
    }
  });

  Object.keys(leftoverKeys).forEach(removeProp);
  removeEmptyFolders();

  // refresh UI with new values
  refreshUI();
}

if (module.hot) {
  module.hot.accept('../../props', () => {
    try {
      const next = require('../../props');

      // eslint-disable-next-line no-console
      console.info('Hot-loading props');

      updatePropsFromReload(next.propSpecs);

      const {game} = window;
      game.command.updateCommandsFromReload(next.commands);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });
}
