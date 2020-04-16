export const builtinCoordFragments = [
  ['shockwave', {
    time: ['float', 0, null],
    center: ['vec2', [0.5, 0.5], null],
    scale: ['float', 10.0, 0, 500],
    range: ['float', 0.8, 0, 10],
    thickness: ['float', 0.1, 0, 10],
    speed: ['float', 3.0, 0, 50],
    inner: ['float', 0.09, 0, 1],
    dropoff: ['float', 40.0, 0, 500],
  }, `
      float shockwave_dt = (scene_time - shockwave_time) / 3333.0;
      if (shockwave_time > 0.0 && shockwave_dt < 10.0) {
        float dist = distance(uv, shockwave_center - camera_scroll);
        float t = shockwave_dt * shockwave_speed;
        if (dist <= t + shockwave_thickness && dist >= t - shockwave_thickness && dist >= shockwave_inner) {
          float diff = dist - t;
          float scaleDiff = 1.0 - pow(abs(diff * shockwave_scale), shockwave_range);
          float diffTime = diff * scaleDiff;
          vec2 diffTexCoord = normalize(uv - (shockwave_center - camera_scroll));
          uv += (diffTexCoord * diffTime) / (t * dist * shockwave_dropoff);
        }
      }
  `],
];

export const builtinColorFragments = [
  ['blur', {
    amount: ['float', 0, null],
  }, `
      if (blur_amount > 0.0) {
        float b = blur_amount / resolution.x;
        c *= 0.2270270270;
        c += texture2D(u_texture, vec2(uv.x - 4.0*b, uv.y - 4.0*b)) * 0.0162162162;
        c += texture2D(u_texture, vec2(uv.x - 3.0*b, uv.y - 3.0*b)) * 0.0540540541;
        c += texture2D(u_texture, vec2(uv.x - 2.0*b, uv.y - 2.0*b)) * 0.1216216216;
        c += texture2D(u_texture, vec2(uv.x - 1.0*b, uv.y - 1.0*b)) * 0.1945945946;
        c += texture2D(u_texture, vec2(uv.x + 1.0*b, uv.y + 1.0*b)) * 0.1945945946;
        c += texture2D(u_texture, vec2(uv.x + 2.0*b, uv.y + 2.0*b)) * 0.1216216216;
        c += texture2D(u_texture, vec2(uv.x + 3.0*b, uv.y + 3.0*b)) * 0.0540540541;
        c += texture2D(u_texture, vec2(uv.x + 4.0*b, uv.y + 4.0*b)) * 0.0162162162;
      }
  `],

  ['aberration', {
    red: ['vec2', [0, 0], null],
    green: ['vec2', [0, 0], null],
    blue: ['vec2', [0, 0], null],
  }, `
    c.r += texture2D(u_texture, vec2(uv.x - aberration_red.x, uv.y - aberration_red.y)).r;
    c.r -= texture2D(u_texture, vec2(uv.x + aberration_red.x, uv.y + aberration_red.y)).r;

    c.g += texture2D(u_texture, vec2(uv.x - aberration_green.x, uv.y - aberration_green.y)).g;
    c.g -= texture2D(u_texture, vec2(uv.x + aberration_green.x, uv.y + aberration_green.y)).g;

    c.b += texture2D(u_texture, vec2(uv.x - aberration_blue.x, uv.y - aberration_blue.y)).b;
    c.b -= texture2D(u_texture, vec2(uv.x + aberration_blue.x, uv.y + aberration_blue.y)).b;
  `],

  ['tint', {
    color: ['rgba', [1, 1, 1, 1]],
  }, `
      c.r *= tint_color.r * tint_color.a;
      c.g *= tint_color.g * tint_color.a;
      c.b *= tint_color.b * tint_color.a;
  `],
];

export const shaderTypeMeta = {
  float: [1, 'float', 'setFloat1'],
  bool: [1, 'float', 'setFloat1'],
  vec2: [2, 'vec2', 'setFloat2v', 'x', 'y'],
  vec3: [3, 'vec3', 'setFloat3v', 'x', 'y', 'z'],
  vec4: [4, 'vec4', 'setFloat4v', 'x', 'y', 'z', 'w'],
  rgb: [3, 'vec3', 'setFloat3v', 'r', 'g', 'b'],
  rgba: [4, 'vec4', 'setFloat4v', 'r', 'g', 'b', 'a'],
};

export function propNamesForUniform(fragmentName, uniformName, spec) {
  let [type] = spec;

  if (!type) {
    type = 'float';
  }

  const [count, , , ...subvariables] = shaderTypeMeta[type];

  if (type === 'rgb') {
    let sub = '';
    if (!uniformName.match(/color$/i)) {
      sub = '_color';
    }

    return [`shader.${fragmentName}.${uniformName}${sub}`];
  } else if (type === 'rgba') {
    return [
      `shader.${fragmentName}.${uniformName}_color`,
      `shader.${fragmentName}.${uniformName}_alpha`,
    ];
  } else if (count === 1) {
    return [`shader.${fragmentName}.${uniformName}`];
  } else {
    return subvariables.map((sub, i) => {
      return `shader.${fragmentName}.${uniformName}_${sub}`;
    });
  }
}

function injectBuiltinFragment(fragments, isCoord) {
  let primary = builtinColorFragments;
  let secondary = builtinCoordFragments;
  let primaryName = 'shaderColorFragments';
  let secondaryName = 'shaderCoordFragments';

  if (!fragments) {
    return [];
  }

  if (isCoord) {
    [primary, secondary] = [secondary, primary];
    [primaryName, secondaryName] = [secondaryName, primaryName];
  }

  if (fragments.length === 0) {
    fragments.push(...primary);
    return;
  }

  for (let i = 0; i < fragments.length; i += 1) {
    if (typeof fragments[i] === 'string') {
      const name = fragments[i];
      const replacement = primary.find(([p]) => name === p);
      if (replacement) {
        fragments[i] = replacement;
      } else {
        // eslint-disable-next-line no-console
        console.error(`Unable to find builtin ${primaryName} '${name}'; available are: ${primary.map(([p]) => p).join(', ')}`);

        const suggestion = secondary.find(([p]) => name === p);
        if (suggestion) {
          // eslint-disable-next-line no-console
          console.error(`Perhaps you meant the builtin ${secondaryName} '${name}'?`);
        }

        fragments.splice(i, 1);
        i -= 1;
      }
    }
  }
}

export function shaderProps(coordFragments, colorFragments) {
  const props = {};

  injectBuiltinFragment(coordFragments, true);
  injectBuiltinFragment(colorFragments, false);

  [...(coordFragments || []), ...(colorFragments || [])].forEach(([fragmentName, uniforms]) => {
    props[`shader.${fragmentName}.enabled`] = [true, (value, scene, game) => game.recompileMainShaders()];

    Object.entries(uniforms).forEach(([uniformName, spec]) => {
      // eslint-disable-next-line prefer-const
      let [type, ...config] = spec;

      const name = `${fragmentName}_${uniformName}`;

      if (!type) {
        type = 'float';
      }

      if (!shaderTypeMeta[type]) {
        throw new Error(`Unknown type ${type} for shader ${name}`);
      }

      const [count, , setter, ...subvariables] = shaderTypeMeta[type];

      if (uniformName.match(/color$/i) && type !== 'rgb' && type !== 'rgba') {
        throw new Error(`Shader uniform ${name} ends with /color$/i but it isn't using type rgb or rgba`);
      }

      if (type === 'rgb') {
        if (config.length > 2
            || config.length === 0
            || !Array.isArray(config[0])
            || config[0].length !== 3
            || (config.length === 2 && config[1] !== null)) {
          throw new Error(`Expected rgb shader uniform ${name} to have shape ['rgb', [0.95, 0.25, 0.5]] or ['rgb', [0.95, 0.25, 0.5], null]`);
        }

        let sub = '';
        if (!uniformName.match(/color$/i)) {
          sub = '_color';
        }

        if (config[1] === null) {
          config.push((scene) => (scene[name] ? scene[name].map((c) => c * 255.0) : undefined));
        } else {
          config.push((_, scene, game) => {
            if (!scene.shader) {
              return;
            }
            const value = game.prop(`shader.${fragmentName}.${uniformName}${sub}`).map((c) => c / 255.0);
            scene.shader[setter](name, value);
          });
        }

        config[0] = config[0].map((c) => c * 255.0);
        props[`shader.${fragmentName}.${uniformName}${sub}`] = config;
      } else if (type === 'rgba') {
        if (config.length > 2
            || config.length === 0
            || !Array.isArray(config[0])
            || config[0].length !== 4
            || (config.length === 2 && config[1] !== null)) {
          throw new Error(`Expected rgbs shader uniform ${name} to have shape ['rgba', [0.95, 0.25, 0.5, 1]] or ['rgb', [0.95, 0.25, 0.5, 1], null]`);
        }

        const colorConfig = [config[0].filter((_, i) => i < 3)];
        const alphaConfig = [config[0][3]];

        if (config[1] === null) {
          colorConfig.push(null);
          alphaConfig.push(null);

          colorConfig.push((scene) => (scene[name] ? scene[name].filter((_, i) => i < 3).map((c) => c * 255.0) : undefined));
          alphaConfig.push((scene) => (scene[name] ? scene[name][3] : undefined));
        } else {
          alphaConfig.push(0, 1); // min and max

          const cb = (value, scene, game) => {
            if (!scene.shader) {
              return;
            }

            scene.shader[setter](name, [
              ...game.prop(`shader.${fragmentName}.${uniformName}_color`).map((c) => c / 255.0),
              game.prop(`shader.${fragmentName}.${uniformName}_alpha`),
            ]);
          };
          colorConfig.push(cb);
          alphaConfig.push(cb);
        }

        colorConfig[0] = colorConfig[0].map((c) => c * 255.0);
        props[`shader.${fragmentName}.${uniformName}_color`] = colorConfig;
        props[`shader.${fragmentName}.${uniformName}_alpha`] = alphaConfig;
      } else if (type === 'bool') {
        if (config[1] === null) {
          config.push((scene) => scene[name]);
        } else if (typeof config[config.length - 1] !== 'function') {
          config.push((value, scene) => scene.shader && scene.shader[setter](name, value ? 1.0 : 0.0));
        }

        props[`shader.${fragmentName}.${uniformName}`] = config;
      } else if (count === 1) {
        if (config[1] === null) {
          config.push((scene) => scene[name]);
        } else if (typeof config[config.length - 1] !== 'function') {
          config.push((value, scene) => scene.shader && scene.shader[setter](name, value));
        }

        if (config[0] === 0 && config[1] === null) {
          config[0] = 0.1;
        }

        props[`shader.${fragmentName}.${uniformName}`] = config;
      } else {
        subvariables.forEach((sub, i) => {
          const c = [...config];
          c[0] = c[0][i];

          if (c[1] === null) {
            c.push((scene) => (scene[name] ? scene[name][i] : undefined));
          } else if (typeof c[c.length - 1] !== 'function') {
            c.push((_, scene, game) => {
              if (!scene.shader) {
                return;
              }

              const value = subvariables.map((s) => game.prop(`shader.${fragmentName}.${uniformName}_${s}`));
              scene.shader[setter](name, value);
            });
          }

          if (c[0] === 0 && c[1] === null) {
            c[0] = 0.1;
          }

          props[`shader.${fragmentName}.${uniformName}_${sub}`] = c;
        });
      }
    });
  });

  return props;
}
