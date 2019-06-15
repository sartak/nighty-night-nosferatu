import _ from 'lodash';
import * as dat from 'dat.gui';
import {manageableProps, propSpecs} from '../../props';

const gui = new dat.GUI({autoPlace: false});
export default gui;

const folders = {};
const controllers = {};
const parentOfFolder = new Map();

let proxiedManageableProps = manageableProps;
const manageablePropsProxy = new Proxy({}, {
  get(target, key) {
    return proxiedManageableProps[key];
  },

  set(target, key, value) {
    proxiedManageableProps[key] = value;
    return true;
  },
});

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
    controller = folder.add(manageablePropsProxy, key).listen();
    controller.domElement.closest('.cr').classList.add('listen');
    controller.domElement.querySelectorAll('input, select').forEach((node) => {
      node.tabIndex = -1;
      node.onclick = (e) => {
        e.preventDefault();
      };
    });
  } else {
    let callback;
    if (options.length >= 1 && typeof options[options.length - 1] === 'function') {
      callback = options.pop();
    }

    const originalValue = manageableProps[key];

    if (key.match(/color/i)) {
      controller = folder.addColor(manageablePropsProxy, key, ...options);
    } else {
      controller = folder.add(manageablePropsProxy, key, ...options);
    }

    controller.__ldCallback = callback;

    const crNode = controller.domElement.closest('.cr');

    let enabledCheckbox;
    let enabledValue;

    if (enabledKey in manageableProps) {
      enabledValue = manageableProps[enabledKey];

      const container = document.createElement('div');
      container.classList.add('toggle');

      enabledCheckbox = document.createElement('input');
      enabledCheckbox.setAttribute('type', 'checkbox');
      if (enabledValue) {
        enabledCheckbox.setAttribute('checked', 'checked');
        enabledCheckbox.checked = true;
      }

      container.appendChild(enabledCheckbox);

      crNode.classList.add('disableable');

      const {parentNode} = controller.domElement;
      parentNode.appendChild(container);

      controller.__ldEnabledSpec = propSpecs[enabledKey];

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

    if (typeof originalValue !== 'function') {
      const container = document.createElement('div');
      container.classList.add('reset');

      const resetButton = document.createElement('input');
      resetButton.setAttribute('type', 'button');
      resetButton.value = '⤺';

      container.appendChild(resetButton);

      const {parentNode} = controller.domElement;
      parentNode.appendChild(container);

      resetButton.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        manageableProps[key] = originalValue;

        if (enabledCheckbox) {
          enabledCheckbox.__suppressChange = true;
          manageableProps[enabledKey] = enabledValue;
          if (enabledValue) {
            enabledCheckbox.setAttribute('checked', 'checked');
            enabledCheckbox.checked = true;
          } else {
            enabledCheckbox.removeAttribute('checked');
            enabledCheckbox.checked = false;
          }
        }

        controller.updateDisplay();

        try {
          controller.__onChange(manageableProps[key]);
          controller.__onFinishChange(manageableProps[key]);
        } catch (err) {
          if (enabledCheckbox) {
            enabledCheckbox.__suppressChange = false;
          }

          throw err;
        }

        if (enabledCheckbox) {
          enabledCheckbox.__suppressChange = false;
        }
      };
    }

    if (typeof originalValue !== 'function') {
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

          let isChanged = false;
          if (enabledCheckbox && manageableProps[enabledKey] !== enabledValue) {
            isChanged = true;
          } else if (value !== originalValue) {
            isChanged = true;
          }

          if (isChanged) {
            crNode.classList.add('changed');
          } else {
            crNode.classList.remove('changed');
          }

          if (controller.__ldCallback) {
            ret = controller.__ldCallback(value, scene, game);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        }

        return ret;
      });
    }
  }

  const container = controller.domElement.closest('.cr');
  container.title = key;
  container.dataset.prop = key;

  controllers[key] = controller;
  controller.__ldSpec = spec;

  if (open) {
    let f = folder;
    while (f) {
      f.open();
      f = parentOfFolder.get(f);
    }
  }

  return controller;
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
  document.querySelectorAll('.Manage ul:not(.closed) > li.listen:not(.filtered)').forEach((node) => {
    const key = node.dataset.prop;
    const spec = propSpecs[key];
    listenPropsCache.push([key, spec]);
  });
}

export function updatePropsFromStep(skipCache) {
  const {game} = window;
  const scene = game.topScene();

  const updateProp = ([key, spec]) => {
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
  };

  if (skipCache) {
    Object.entries(propSpecs).forEach(updateProp);
  } else {
    listenPropsCache.forEach(updateProp);
  }
}

export function overrideProps(newProps) {
  Object.entries(propSpecs).forEach(([key, spec]) => {
    if (spec[1] === null) {
      manageableProps[key] = newProps[key];
    }
  });
}

function specDiffers(old, next) {
  let differsInCallback;

  if ((!next && old) || (!old && next)) {
    return true;
  }

  if (old.length !== next.length) {
    return true;
  }

  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (i === next.length - 1 && typeof next[i] === 'function' && typeof old[i] === 'function') {
      differsInCallback = true;
    } else if (i === 1 && Array.isArray(next[i]) && Array.isArray(old[i])) {
      // compare enum values
      const nextArray = next[i];
      const oldArray = old[i];

      if (nextArray.length !== oldArray.length) {
        return false;
      }

      for (let j = nextArray.length - 1; j >= 0; j -= 1) {
        if (nextArray[j] !== oldArray[j]) {
          return false;
        }
      }
    } else if (next[i] !== old[i]) {
      return true;
    }
  }

  if (differsInCallback) {
    return 'callback';
  }

  return false;
}

function requiresControllerRecreation(key, next) {
  const spec = next[key];
  const controller = controllers[key];
  const oldSpec = controller.__ldSpec;

  // listeners don't need to regenerate unless the type changes
  if (oldSpec[1] === null && spec[1] === null) {
    if (typeof oldSpec[0] !== typeof spec[0]) {
      return true;
    }

    return false;
  }

  const nextEnabledSpec = next[`${key}_enabled`];
  if ('__ldEnabledSpec' in controller) {
    if (specDiffers(controller.__ldEnabledSpec, nextEnabledSpec)) {
      return true;
    }
  } else if (nextEnabledSpec) {
    return true;
  }

  return specDiffers(oldSpec, spec);
}

function updatePropsFromReload(oldValues, nextSpecs) {
  const leftoverKeys = {};
  Object.keys(controllers).forEach((key) => {
    leftoverKeys[key] = true;
  });

  Object.keys(nextSpecs).forEach((key) => addNestedFolder(key, true));

  Object.entries(nextSpecs).forEach(([key, spec]) => {
    if (!(key in controllers)) {
      addController(key, spec, true);
    } else {
      delete leftoverKeys[key];
      const controller = controllers[key];

      const requiresRecreation = requiresControllerRecreation(key, nextSpecs);
      if (!requiresRecreation || requiresRecreation === 'callback') {
        manageableProps[key] = oldValues[key];

        if (requiresRecreation === 'callback') {
          controller.__ldCallback = spec[spec.length - 1];
        }

        return;
      }

      // regenerate this controller with the new config
      const container = controller.domElement.closest('.cr');
      const parent = container.parentNode;
      const {children} = parent;
      const index = Array.prototype.indexOf.call(children, container);
      const nextContainer = index > -1 ? children[index + 1] : null;

      controller.remove();

      const newController = addController(key, spec, true);

      if (nextContainer) {
        const newContainer = newController.domElement.closest('.cr');
        parent.removeChild(newContainer);
        parent.insertBefore(newContainer, nextContainer);
      }
    }
  });

  Object.keys(leftoverKeys).forEach(removeProp);
  removeEmptyFolders();

  // refresh UI with new values
  refreshUI();
}

function queryize(query) {
  const characters = query.split('');
  let hasUppercase = false;

  const escapedCharacters = characters.map((character) => {
    if (character !== character.toLowerCase()) {
      hasUppercase = true;
    }

    if ('.*+?^${}()|[]\\'.includes(character)) {
      return `\\${character}`;
    } else {
      return character;
    }
  });

  const subsequence = escapedCharacters.join('.*');

  return new RegExp(subsequence, hasUppercase ? '' : 'i');
}

export function updateSearch(query, isStarted) {
  const queryRegex = queryize(query);

  const container = document.querySelector('.Manage .dg.main');
  if (query === '') {
    Object.values(folders).forEach((folder) => folder.close());
    container.querySelectorAll('.filtered').forEach((node) => {
      node.classList.remove('filtered');
    });
  } else {
    Object.values(folders).forEach((folder) => {
      if (isStarted) {
        folder.open();
      }

      folder.domElement.classList.add('filtered');
    });

    container.querySelectorAll('li[data-prop]').forEach((node) => {
      const {prop} = node.dataset;
      if (prop.match(queryRegex)) {
        let folder = node;
        while (folder) {
          folder.classList.remove('filtered');
          folder = folder.parentNode.closest('.filtered');
        }
      } else {
        node.classList.add('filtered');
      }
    });
  }
  regenerateListenPropsCache();
}

if (module.hot) {
  module.hot.accept('../../props', () => {
    try {
      const next = require('../../props');

      // eslint-disable-next-line no-console
      console.info('Hot-loading props');

      const oldProps = proxiedManageableProps;
      proxiedManageableProps = next.manageableProps;
      updatePropsFromReload(oldProps, next.propSpecs);

      const {game} = window;
      game.command.updateCommandsFromReload(next.commands);

      regenerateListenPropsCache();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });
}
