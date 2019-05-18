export default function parseLevel(content, tileSpecs, isRectangular) {
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
