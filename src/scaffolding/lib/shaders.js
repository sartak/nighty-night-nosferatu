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

