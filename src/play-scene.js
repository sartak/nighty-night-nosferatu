import SuperScene from "./scaffolding/SuperScene";
import prop from "./props";
import { NormalizeVector } from "./scaffolding/lib/vector";

const Illuminated = window.illuminated,
  Lamp = Illuminated.Lamp,
  RectangleObject = Illuminated.RectangleObject,
  DiscObject = Illuminated.DiscObject,
  DarkMask = Illuminated.DarkMask,
  Vec2 = Illuminated.Vec2,
  Lighting = Illuminated.Lighting;

// DELAY THE INEVITABLE

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

    this.performanceProps = [];
    this.mapsAreRectangular = true;
  }

  initialSaveState() {
    return {
      createdAt: Date.now(),
    };
  }

  saveStateVersion() {
    return 1;
  }

  migrateSaveStateVersion1(save) {}

  init(config) {
    super.init(config);
  }

  preload() {
    super.preload();
  }

  create(config) {
    super.create(config);

    const canvas = document.getElementById("illuminated");
    const ctx = canvas.getContext("2d");

    const sprites = [1, 1, 1, 1, 1, 1, 1, 11, 1, 1, 1, 1, 1, 1, 1].map(
      (_, i) => {
        const s = this.physics.add.sprite(
          20 + 50 * i,
          200 + Math.random() * 200,
          "test"
        );
        return s;
      }
    );

    {
      if (1) {
        const light1 = new Lamp({
          position: new Vec2(100, 250),
          distance: 200,
          radius: 10,
          samples: 50,
        });
        const light2 = new Lamp({
          position: new Vec2(300, 50),
          color: "#CCF",
          distance: 200,
          radius: 10,
          samples: 50,
        });

        const objects = sprites.map(
          ({ x, y, width, height }) =>
            new RectangleObject({
              topleft: new Vec2(x - width / 2, y - height / 2),
              bottomright: new Vec2(x + width / 2, y + height / 2),
            })
        );

        const lighting1 = new Lighting({
          light: light1,
          objects: objects,
        });
        const lighting2 = new Lighting({
          light: light2,
          objects: objects,
        });

        const darkmask = new DarkMask({ lights: [light1, light2] });

        lighting1.compute(canvas.width, canvas.height);
        lighting2.compute(canvas.width, canvas.height);
        darkmask.compute(canvas.width, canvas.height);

        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.globalCompositeOperation = "lighter";
        lighting1.render(ctx);
        lighting2.render(ctx);

        ctx.globalCompositeOperation = "source-over";
        darkmask.render(ctx);

        this.canvas = canvas;
        this.ctx = ctx;
        this.light1 = light1;
        this.light2 = light2;
        this.lighting1 = lighting1;
        this.lighting2 = lighting2;
        this.darkmask = darkmask;
      }
    }

    this.hud = this.createHud();
    this.setupPhysics();
  }

  createHud() {
    const hud = {};
    /*
    const score = hud.score = this.text(x, y, text, {color: 'rgb(255, 255, 255)'});
    scoreSteady.setScrollFactor(0);
    scoreSteady.setDepth(1000);
    */
    return hud;
  }

  setupPhysics() {}

  setupAnimations() {}

  processInput(time, dt) {
    const { command } = this;

    let dx = 0;
    let dy = 0;
    let stickInput = false;

    if (command.up.held) {
      dy = -1;
    } else if (command.down.held) {
      dy = 1;
    }

    if (command.right.held) {
      dx = 1;
    } else if (command.left.held) {
      dx = -1;
    }

    if (command.lstick.held) {
      [dx, dy] = command.lstick.held;
      stickInput = true;
    } else if (command.rstick.held) {
      [dx, dy] = command.rstick.held;
      stickInput = true;
    }

    if (stickInput) {
      if (Math.abs(dx) > 0.9) {
        dx = dx < 0 ? -1 : 1;
        dy = 0;
      } else if (Math.abs(dy) > 0.9) {
        dy = dy < 0 ? -1 : 1;
        dx = 0;
      }
    }

    if (dx || dy) {
      [dx, dy] = NormalizeVector(dx, dy);
    } else {
      dx = dy = 0;
    }
  }

  fixedUpdate(time, dt) {
    this.processInput(time, dt);
  }

  renderUpdate(time, dt) {
    const {
      canvas,
      ctx,
      light1,
      light2,
      lighting1,
      lighting2,
      darkmask,
    } = this;

    const t = Math.round(100 * Math.cos(time / 1000));
    light1.position = new Vec2(200 - t, 150 + t);
    light2.position = new Vec2(200 + t, 150 - t);

    lighting1.compute(canvas.width, canvas.height);
    lighting2.compute(canvas.width, canvas.height);
    darkmask.compute(canvas.width, canvas.height);

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = "lighter";
    lighting1.render(ctx);
    lighting2.render(ctx);

    ctx.globalCompositeOperation = "source-over";
    darkmask.render(ctx);
  }

  textSize(options) {
    return "24px";
  }

  textColor(options) {
    return "rgb(255, 0, 0)";
  }

  strokeColor(options) {
    return "rgb(0, 0, 0)";
  }

  strokeWidth(options) {
    return 6;
  }

  cameraColor() {
    return null;
  }

  musicName() {
    // return this.level && this.level.music;
    return undefined;
  }

  launchTimeSight() {
    super.launchTimeSight();
  }

  renderTimeSightFrameInto(scene, phantomDt, time, dt, isLast) {
    const objects = [];

    if (!this.timeSightX) {
      this.timeSightX = this.timeSightY = 0;
    }

    const prevX = this.timeSightX;
    const prevY = this.timeSightY;

    /*
    const {player} = this.level;
    if (isLast || Math.sqrt((player.x - prevX) * (player.x - prevX) + (player.y - prevY) * (player.y - prevY)) >= 28) {
      const phantom = scene.physics.add.sprite(player.x, player.y, 'spritePlayerDefault');
      phantom.anims.play(animation);
      phantom.setFlipX(player.flipX);
      phantom.setScale(player.scaleX, player.scaleY);
      phantom.alpha = 0.4;

      objects.push(phantom);
      this.timeSightX = player.x;
      this.timeSightY = player.y;
    }
    */

    if (objects.length === 0) {
      return null;
    }

    objects.forEach((object) => {
      object.anims.stop();
    });

    return objects;
  }

  debugHandlePointerdown(event) {
    let { x, y } = event;

    x += this.camera.scrollX;
    y += this.camera.scrollY;
  }

  _hotReloadCurrentLevel() {
    super
      ._hotReloadCurrentLevel(
        {},
        {
          animation: "crossFade",
          duration: 200,
          delayNewSceneShader: true,
          removeOldSceneShader: true,
        }
      )
      .then((scene) => {});
  }

  _hot() {}
}
