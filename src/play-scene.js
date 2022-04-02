import SuperScene from "./scaffolding/SuperScene";
import prop from "./props";
import { NormalizeVector } from "./scaffolding/lib/vector";
import Phaser from "phaser";

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

    const sun = new Lamp({
      position: new Vec2(100, 250),
      distance: 10,
      radius: 6,
      samples: 1,
    });
    const corona = new Lamp({
      position: new Vec2(100, 250),
      color: "rgba(255, 0, 0, 0.8)",
      distance: 100,
      radius: 10,
      samples: 10,
    });
    const ambient = new Lamp({
      position: new Vec2(300, 50),
      color: "rgba(255, 200, 200, 1)",
      distance: 1400,
      radius: 10,
      samples: 10,
    });

    const objects = sprites.map(
      ({ x, y, width, height }) =>
        new RectangleObject({
          topleft: new Vec2(x - width / 2, y - height / 2),
          bottomright: new Vec2(x + width / 2, y + height / 2),
        })
    );

    const lighting1 = new Lighting({
      light: ambient,
      objects: objects,
    });
    const lighting2 = new Lighting({
      light: sun,
      objects: objects,
    });
    const lighting3 = new Lighting({
      light: corona,
      objects: objects,
    });

    const darkmask = new DarkMask({ lights: [ambient, sun] });

    lighting1.compute(canvas.width, canvas.height);
    lighting2.compute(canvas.width, canvas.height);
    lighting3.compute(canvas.width, canvas.height);
    darkmask.compute(canvas.width, canvas.height);

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = "lighter";
    lighting1.render(ctx);
    lighting2.render(ctx);
    lighting3.render(ctx);

    ctx.globalCompositeOperation = "source-over";
    darkmask.render(ctx);

    this.canvas = canvas;
    this.ctx = ctx;
    this.ambient = ambient;
    this.sun = sun;
    this.corona = corona;
    this.lighting1 = lighting1;
    this.lighting2 = lighting2;
    this.lighting3 = lighting3;
    this.darkmask = darkmask;

    this.input.on("pointermove", (pointer) => {
      this.x = pointer.x;
      this.y = pointer.y;
    });

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
      ambient,
      sun,
      corona,
      lighting1,
      lighting2,
      lighting3,
      darkmask,
    } = this;

    const speed = 50;
    const t = (time * speed) / 1000 - 10;
    const percent = t / 800;

    const points = [];
    points.push(new Phaser.Math.Vector2(10, 600));
    points.push(new Phaser.Math.Vector2(100, 200));
    points.push(new Phaser.Math.Vector2(400, 10));
    points.push(new Phaser.Math.Vector2(700, 200));
    points.push(new Phaser.Math.Vector2(790, 600));
    const spline = new Phaser.Curves.Spline(points);

    const { x, y } = percent > 1 ? { x: 0, y: 0 } : spline.getPoint(percent);

    ambient.position = sun.position = corona.position = new Vec2(x, y);
    ambient.color = `rgba(${255}, ${150 - 100 * percent}, ${150 -
      100 * percent}, ${percent / 4 + 0.5})`;

    lighting1.compute(canvas.width, canvas.height);
    lighting2.compute(canvas.width, canvas.height);
    lighting3.compute(canvas.width, canvas.height);
    darkmask.compute(canvas.width, canvas.height);

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = "lighter";
    lighting1.render(ctx);
    lighting2.render(ctx);
    lighting3.render(ctx);

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
