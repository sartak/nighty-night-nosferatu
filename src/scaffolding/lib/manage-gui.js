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

      const title = folders[folderKey].domElement.querySelector('li.title');
      title.addEventListener('click', () => {
        regenerateListenPropsCache();
      });
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

  if (key.endsWith('_enabled')) {
    const prefix = key.substr(0, key.length - '_enabled'.length);
    if (!(prefix in propSpecs)) {
      throw new Error(`Prop ${key} does not have corresponding ${prefix}`);
    }
    return;
  }

  const enabledKey = `${key}_enabled`;

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

    let enabledCheckbox;

    if (enabledKey in manageableProps) {
      const enabled = manageableProps[enabledKey];

      const container = document.createElement('div');
      container.classList.add('toggle');

      enabledCheckbox = document.createElement('input');
      enabledCheckbox.setAttribute('type', 'checkbox');
      if (enabled) {
        enabledCheckbox.setAttribute('checked', 'checked');
        enabledCheckbox.checked = true;
      }

      container.appendChild(enabledCheckbox);

      controller.domElement.closest('.cr').classList.add('disableable');

      const {parentNode} = controller.domElement;
      parentNode.appendChild(container);

      enabledCheckbox.onchange = (e) => {
        e.preventDefault();
        const {checked} = e.target;
        manageableProps[enabledKey] = checked;

        enabledCheckbox.__suppressChange = true;
        try {
          controller.__onChange(manageableProps[key]);
          controller.__onFinishChange(manageableProps[key]);
        } catch (err) {
          enabledCheckbox.__suppressChange = false;
          throw err;
        }

        enabledCheckbox.__suppressChange = false;
      };
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
        if (enabledCheckbox && !enabledCheckbox.__suppressChange) {
          manageableProps[enabledKey] = true;
          enabledCheckbox.setAttribute('checked', 'checked');
          enabledCheckbox.checked = true;
        }

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

  const container = controller.domElement.closest('.cr');
  container.title = key;
  container.dataset.prop = key;

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

const listenPropsCache = [];
function regenerateListenPropsCache() {
  listenPropsCache.length = 0;
  document.querySelectorAll('.Manage ul:not(.closed) > li.listen').forEach((node) => {
    const key = node.dataset.prop;
    const spec = propSpecs[key];
    listenPropsCache.push([key, spec]);
  });
}

export function updatePropsFromStep() {
  const {game} = window;
  const scene = game.topScene();

  listenPropsCache.forEach(([key, spec]) => {
    if (spec[1] === null) {
      if (!spec[2]) {
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

      regenerateListenPropsCache();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });
}
