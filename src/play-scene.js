import SuperScene from './scaffolding/SuperScene';
import prop from './props';
import analytics from './scaffolding/lib/analytics';

export default class PlayScene extends SuperScene {
  constructor() {
    super({
      input: {
        gamepad: true,
      },
      physics: {
        arcade: {
          fps: 60,
        },
      },
    });
  }

  initialSaveState() {
    return {
      createdAt: Date.now(),
    };
  }

  saveStateVersion() {
    return 1;
  }

  migrateSaveStateVersion1(save) {
  }

  init(config) {
    super.init(config);
  }

  preload() {
    super.preload();
  }

  create(config) {
    super.create(config);
  }

  fixedUpdate(time, dt) {
  }

  static shaderSource() {
    return `
      void main( void ) {
        vec2 uv = outTexCoord;
        vec4 c = texture2D(u_texture, uv);

        gl_FragColor = vec4(c.r*c.a, c.g*c.a, c.b*c.a, 1.0);
      }
    `;
  }

  shaderInitialization() {
  }

  shaderUpdate(time, dt) {
  }

  launchTimeSight() {
    const restore = super.launchTimeSight();

    return restore;
  }

  renderTimeSightFrameInto(scene, phantomDt, time, dt, isLast) {
    const objects = [];

    return objects;
  }

  _hot() {
  }
}
