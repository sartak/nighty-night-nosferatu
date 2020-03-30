import deepEqual from 'deep-equal';
import {tileDefinitions} from '../../props';

let tileSpecs;
export function updateTileDefinitions(newDefinitions) {
  const previousTileSpecs = tileSpecs;
  tileSpecs = preprocessTileDefinitions(newDefinitions);

  if (!previousTileSpecs) {
    return null;
  }

  const changes = [];

  const leftoverKeys = {};
  Object.keys(previousTileSpecs).forEach((key) => {
    leftoverKeys[key] = true;
  });

  Object.keys(tileSpecs).forEach((key) => {
    const oldValue = previousTileSpecs[key];
    const newValue = tileSpecs[key];

    if (key in previousTileSpecs) {
      delete leftoverKeys[key];
    }

    if (!deepEqual(oldValue, newValue)) {
      changes.push(key);
    }
  });

  changes.push(...Object.keys(leftoverKeys));
  return changes;
}

updateTileDefinitions(tileDefinitions);

export function tileSpec(glyph) {
  return tileSpecs[glyph];
}

function flattenInheritance(specs) {
  Object.entries(specs).forEach(([key, config]) => {
    if (!config || !config._inherit) {
      return;
    }

    const seen = {[key]: true};
    const nodes = [{...config}];

    let parent = config._inherit;
    if (!(parent in specs)) {
      throw new Error(`Inherited from nonexistent parent: ${key} → ${parent}`);
    }

    while (specs[parent]) {
      if (seen[parent]) {
        throw new Error(`Loop detected in tileDefinitions _inherit: ${[...Object.keys(seen), key].join(' → ')}`);
      }

      seen[parent] = true;
      nodes.unshift(specs[parent]);
      parent = specs[parent]._inherit;
    }

    Object.assign(config, ...nodes);
  });

  return specs;
}

export function preprocessTileDefinitions(specs) {
  return flattenInheritance(specs);
}

export default function parseLevel(content, isRectangular) {
  const allLines = content.split('\n');

  // trailing empty lines
  while (allLines[allLines.length - 1].length === 0) {
    allLines.pop();
  }

  // find last empty line
  let i;
  for (i = allLines.length - 1; i >= 0; i -= 1) {
    if (allLines[i].length === 0) {
      break;
    }
  }

  if (i < 0) {
    throw new Error('No empty line for parseLevel');
  }

  const lookups = {};
  const map = [];
  allLines.slice(0, i).forEach((line, y) => {
    const row = [];
    line.split('').forEach((glyph, x) => {
      if (!(glyph in tileSpecs)) {
        throw new Error(`Unknown glyph at (${x}, ${y}): ${glyph}`);
      }

      const tile = {
        x,
        y,
        glyph,
        ...tileSpecs[glyph],
      };

      row.push(tile);

      if (!lookups[glyph]) {
        lookups[glyph] = [];
      }
      lookups[glyph].push(tile);
    });

    map.push(row);
  });

  if (isRectangular) {
    map.forEach((row, y) => {
      if (y === map.length - 1) {
        return;
      }

      if (row.length !== map[y + 1].length) {
        throw new Error(`Inconsistent row width at ${y + 1}. Expected ${row.length}, got ${map[y + 1].length}`);
      }
    });
  }

  const config = JSON.parse(allLines.slice(i).join('\n'));

  return {map, config, lookups};
}

if (module.hot) {
  module.hot.accept('../../props', () => {
    try {
      const next = require('../../props');

      const changes = updateTileDefinitions(next.tileDefinitions);
      if (changes.length === 0) {
        return;
      }

      // eslint-disable-next-line no-console
      console.info(`Hot-loading tile definitions: ${changes}`);

      const {game} = window;
      const scene = game.topScene();
      if (scene._builtinHot) {
        scene._builtinHot();
      }
      if (scene._hot) {
        scene._hot();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });
}
