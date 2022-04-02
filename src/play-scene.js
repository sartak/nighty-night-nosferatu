import _ from "lodash";
import SuperScene from "./scaffolding/SuperScene";
import prop from "./props";
import { NormalizeVector } from "./scaffolding/lib/vector";
import Phaser from "phaser";

const Illuminated = window.illuminated;
const {
  Lamp,
  PolygonObject,
  //DiscObject,
  DarkMask,
  Vec2,
  Lighting,
} = Illuminated;

// DELAY THE INEVITABLE

let BeadSamples = 1;
let CoronaSamples = 10;
let AmbientSamples = 20;
const Downsamples = [[1, 2, 4], [1, 1, 1], [0, 0, 1]];

const Downsample = (t) => {
  if (Downsamples.length) {
    console.log("downsampling to ", Downsamples[0]);
    [BeadSamples, CoronaSamples, AmbientSamples] = Downsamples.shift();
    t();
  }
};

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

    this.downsamples = Downsamples;
    this.performanceProps = [
      ...Downsamples.map(() => () => Downsample(() => this.resampleSuns())),
    ];

    this.mapsAreRectangular = true;
    this.suns = [];
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

  rotatedVecs(rect) {
    const { lightX, lightY } = this;
    const vecs = [];
    const {
      originX,
      originY,
      rotation,
      width,
      height,
      x: offsetX,
      y: offsetY,
      scaleX,
      scaleY,
    } = rect;

    const w = width * scaleX;
    const h = height * scaleY;

    [[0, 0], [0, h], [w, h], [w, 0]].forEach(([x, y]) => {
      const { x: newX, y: newY } = Phaser.Math.RotateAround(
        { x: x - w / 2, y: y - h / 2 },
        originX,
        originY,
        rotation
      );
      vecs.push(new Vec2(newX + offsetX - lightX, newY + offsetY - lightY));
    });
    return vecs;
  }

  createLightCanvas() {
    const key = (this.lightKey = "light-" + Date.now());
    const lightWidth = (this.lightWidth = 1000);
    const lightHeight = (this.lightHeight = 800);
    // const lightWidth = (this.lightWidth = 800);
    // const lightHeight = (this.lightHeight = 600);
    const lightX = (this.lightX = (800 - this.lightWidth) / 2);
    const lightY = (this.lightY = (600 - this.lightHeight) / 2);
    this.lightTexture = this.textures.createCanvas(
      key,
      lightWidth,
      lightHeight
    );
    this.add.image(lightX, lightY, key).setOrigin(0, 0);
  }

  createSun(x, y, objects, backwards) {
    let coronaPrimary = 255;
    let coronaSecondary = 0;
    let ambientPrimary = 255;
    let ambientSecondary = 200;

    const bead = new Lamp({
      position: new Vec2(x - this.lightX, y - this.lightY),
      distance: 10,
      radius: 6,
      samples: BeadSamples,
    });
    const corona = new Lamp({
      position: new Vec2(x - this.lightX, y - this.lightY),
      color: `rgba(${
        backwards ? coronaSecondary : coronaPrimary
      }, ${coronaSecondary}, ${
        backwards ? coronaPrimary : coronaSecondary
      }, 0.8)`,
      distance: 100,
      radius: 10,
      samples: CoronaSamples,
    });
    const ambient = new Lamp({
      position: new Vec2(x - this.lightX, y - this.lightY),
      color: `rgba(${
        backwards ? ambientSecondary : ambientPrimary
      }, ${ambientSecondary}, ${
        backwards ? ambientPrimary : ambientSecondary
      }, 1)`,
      distance: 1400,
      radius: 10,
      samples: AmbientSamples,
    });

    const lighting1 = new Lighting({
      light: ambient,
      objects,
    });
    const lighting2 = new Lighting({
      light: bead,
      objects,
    });
    const lighting3 = new Lighting({
      light: corona,
      objects,
    });

    const lamps = [bead, corona, ambient];
    const lightings = [lighting1, lighting2, lighting3];

    const set = { bead, corona, ambient, lamps, lightings, backwards };

    this.suns.push(set);

    this.dark = new DarkMask({
      lights: _.flatMap(this.suns, ({ lamps }) => lamps),
    });

    return set;
  }

  resampleSuns() {
    (this.suns || []).forEach(({ bead, corona, ambient }) => {
      bead.samples = BeadSamples;
      corona.samples = CoronaSamples;
      ambient.samples = AmbientSamples;
    });
  }

  create(config) {
    super.create(config);

    this.createLightCanvas();

    const player = (this.player = this.physics.add.sprite(400, 570, "player"));
    this.player.setVelocityX(-1 * prop("player.speed"));

    const sprites = (this.objects = [1, 1, 1, 1, 1, 1, 1, 1].map((_, i) => {
      const s = this.physics.add.sprite(
        20 + 100 * i,
        200 + this.randFloat("sprite") * 200,
        "test"
      );
      //s.setScale(this.randBetween("x", 0.5, 3), this.randBetween("y", 0.5, 3));
      s.setScale(this.randBetween("x", 2, 5), 1);
      s.setAngularVelocity(this.randBetween("r", 10, 50));
      s.setVelocityX(this.randBetween("dx", -50, 50));
      s.setVelocityY(this.randBetween("dy", -50, 50));
      s.setRotation(this.randBetween("t", 0, 2 * Math.PI));

      return s;
    }));

    const objects = [...sprites, player].map((sprite) => {
      const occ = new PolygonObject({ points: this.rotatedVecs(sprite) });
      sprite.occ = occ;
      return occ;
    });

    this.createSun(0, 0, objects);
    //this.createSun(0, 0, objects, true);

    this.hud = this.createHud();
    this.setupPhysics();

    this.command.ignoreAll("spawn", true);
    this.command.ignoreAll("dying", false);

    this.spawn();
  }

  spawn() {
    this.timer(() => {
      this.command.ignoreAll("spawn", false);
    }, 500);
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

  setupPhysics() {
    this.objects.forEach((obj) => {
      this.physics.add.collider(this.player, obj);
    });
  }

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

    this.player.setVelocityX(dx * prop("player.speed"));
    this.player.setVelocityY(dy * prop("player.speed"));
  }

  sunPosition(percent = this.percent) {
    if (percent < 0 || percent > 1) {
      return [0, 0];
    }

    if (!this.spline) {
      const points = [];
      points.push(new Phaser.Math.Vector2(10, 600));
      points.push(new Phaser.Math.Vector2(100, 200));
      points.push(new Phaser.Math.Vector2(400, 10));
      points.push(new Phaser.Math.Vector2(700, 200));
      points.push(new Phaser.Math.Vector2(790, 600));
      this.spline = new Phaser.Curves.Spline(points);
    }

    const { x, y } = this.spline.getPoint(percent);
    return [x, y];
  }

  crispingSun() {
    const { suns, percent, lightX, lightY } = this;

    const { x: playerX, y: playerY } = this.player;

    const sunrays = suns.map((sun) => {
      const { backwards } = sun;
      const [sunX, sunY] = this.sunPosition(backwards ? 1 - percent : percent);
      const ray = new Phaser.Geom.Line(sunX, sunY, playerX, playerY);
      return [sun, ray, Phaser.Geom.Line.Length(ray)];
    });

    const touchingSunrays = sunrays.filter(([_sun, sunray]) => {
      return !this.objects.some((obj) => {
        const { occ } = obj;
        const { points } = occ;
        return [[0, 1], [1, 2], [2, 3], [3, 0]].some(([i1, i2]) => {
          const p1 = points[i1];
          const p2 = points[i2];
          const edge = new Phaser.Geom.Line(
            p1.x + lightX,
            p1.y + lightY,
            p2.x + lightX,
            p2.y + lightY
          );
          return Phaser.Geom.Intersects.LineToLine(sunray, edge);
        });
      });
    });

    if (!touchingSunrays.length) {
      return;
    }

    return touchingSunrays;
  }

  fixedUpdate(time, dt) {
    this.processInput(time, dt);

    const rawTime = (this.t = (this.t || 0) + dt);
    const speed = prop("sun.speed");
    const t = (rawTime * speed) / 1000;
    this.percent = t / 800;

    [this.player, ...this.objects].forEach((s) => {
      const { occ } = s;
      occ.points = this.rotatedVecs(s);
    });

    const maxCrisp = 2000;
    this.crispingSuns = this.crispingSun();
    if (this.crispingSuns) {
      this.crispTime = Math.min(maxCrisp, (this.crispTime || 0) + dt);
    } else {
      this.crispTime = Math.max(0, (this.crispTime || 0) - dt);
    }
    this.crispPercent = this.crispTime / maxCrisp;

    if (this.crispPercent >= 1) {
      this.playerDie();
    }
  }

  unlightObject(obj) {
    const { suns } = this;
    const { occ } = obj;
    suns.forEach(({ lightings }) => {
      lightings.forEach((lighting) => {
        lighting.objects = lighting.objects.filter((o) => o !== occ);
      });
    });
  }

  playerDie() {
    const { player } = this;
    if (this.playerDying) {
      return;
    }
    this.playerDying = true;
    this.unlightObject(player);
    this.shockwave(player.x, player.y);
    this.command.ignoreAll("dying", true);
    this.trauma(1);
    this.particleSystem("effects.playerAsh", {
      x: {
        min: player.x - player.width * 0.4,
        max: player.x + player.width * 0.4,
      },
      y: {
        min: player.y - player.height * 0.4,
        max: player.y + player.height * 0.4,
      },
      alpha: { start: 1, end: 0 },
      scale: { start: 1, end: 1.5 },
      speedY: {
        min: 0.5 * prop("effects.playerAsh.speedY"),
        max: prop("effects.playerAsh.speedY"),
      },
      speedX: {
        min: -prop("effects.playerAsh.speedX"),
        max: prop("effects.playerAsh.speedX"),
      },
      tint: [0xf6c456, 0xec5b55, 0xaaaaaa],
      onAdd: (particles, emitter) => {
        this.timer(() => {
          emitter.stop();
        }, prop("effects.playerDie.duration") * 2 /* + prop("level.replaceDelay") - prop("effects.playerAsh.lifespan") */);
      },
    });
    this.tween("effects.playerDie", player, {
      onComplete: () => {
        this.timer(() => {
          this.replaceWithSelf(
            true,
            {},
            {
              animation: "crossFade",
              duration: 200,
              delayNewSceneShader: true,
              removeOldSceneShader: true,
            }
          );
        }, prop("level.replaceDelay"));
      },
    });
  }

  renderUpdate() {
    this.renderLights();
  }

  renderLights() {
    const {
      lightTexture,
      lightWidth,
      lightHeight,
      lightX,
      lightY,
      suns,
      dark,
      crispPercent,
    } = this;
    if (!lightTexture) {
      return;
    }
    const ctx = lightTexture.context;

    lightTexture.refresh();
    ctx.clearRect(0, 0, lightWidth, lightHeight);

    const { percent } = this;

    suns.forEach((sun) => {
      const { lamps, ambient, backwards } = sun;
      const [x, y] = this.sunPosition(backwards ? 1 - percent : percent);

      const pos = new Vec2(x - lightX, y - lightY);
      lamps.forEach((lamp) => {
        lamp.position = pos;
      });

      const crispingColor = {
        r: 255,
        g: 150,
        b: 150,
      };

      const safeColor = {
        r: 150,
        g: 255,
        b: 150,
      };
      let alpha = (0.3 + this.crispPercent * 0.7) / suns.length;

      const tint = Phaser.Display.Color.Interpolate.ColorWithColor(
        safeColor,
        crispingColor,
        100,
        100 * crispPercent
      );
      const { r, g, b } = tint;

      ambient.color = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    });

    suns.forEach(({ lightings }) => {
      lightings.forEach((lighting) => {
        lighting.compute(lightWidth, lightHeight);
      });
    });
    dark.compute(lightWidth, lightHeight);

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, lightWidth, lightHeight);

    ctx.globalCompositeOperation = "lighter";
    suns.forEach(({ lightings }) => {
      lightings.forEach((lighting) => {
        lighting.render(ctx);
      });
    });

    ctx.globalCompositeOperation = "source-over";
    dark.render(ctx);
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
    return 0x000000;
  }

  musicName() {
    // return this.level && this.level.music;
    return undefined;
  }

  launchTimeSight() {
    super.launchTimeSight();
    this.player.visible = false;
  }

  renderTimeSightFrameInto(scene, phantomDt, time, dt, isLast) {
    const objects = [];

    if (!this.timeSightX) {
      this.timeSightX = this.timeSightY = 0;
    }

    const prevX = this.timeSightX;
    const prevY = this.timeSightY;

    const { player } = this;
    if (
      isLast ||
      Math.sqrt(
        (player.x - prevX) * (player.x - prevX) +
          (player.y - prevY) * (player.y - prevY)
      ) >= 28
    ) {
      const phantom = scene.physics.add.sprite(player.x, player.y, "player");
      // phantom.anims.play(animation);
      // phantom.setFlipX(player.flipX);
      // phantom.setScale(player.scaleX, player.scaleY);
      phantom.alpha = 0.4;

      objects.push(phantom);
      this.timeSightX = player.x;
      this.timeSightY = player.y;
    }

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
    this.shockwave(x, y);
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
