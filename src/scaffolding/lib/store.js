import {name as project} from '../../../package.json';

const debug = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
const prefix = `${project}_${debug ? 'debug' : 'prod'}_`;

let frozen = false;
export function freezeStorage() {
  frozen = true;
}

export function saveField(name, value) {
  if (frozen) {
    return false;
  }

  try {
    const payload = JSON.stringify(value);
    localStorage.setItem(`${prefix}${name}`, payload);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return false;
  }

  return true;
}

export function removeField(name) {
  if (frozen) {
    return false;
  }

  try {
    localStorage.removeItem(`${prefix}${name}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return false;
  }

  return true;
}

export function removeAllFields(subprefix = '') {
  if (frozen) {
    return false;
  }

  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(`${prefix}${subprefix}`)) {
        localStorage.removeItem(key);
      }
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return false;
  }

  return true;
}

export function loadField(name, defaultValue) {
  let value = defaultValue;

  try {
    const payload = localStorage.getItem(`${prefix}${name}`);
    if (payload !== null && payload !== undefined) {
      value = JSON.parse(payload);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }

  if (typeof value === 'function') {
    value = value();
  }

  return value;
}
