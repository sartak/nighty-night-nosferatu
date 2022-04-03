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

let CoronaSamples = 0;
let AmbientSamples = 20;
const Downsamples = [[0, 4], [0, 1]];

const Downsample = (t) => {
  if (Downsamples.length) {
    console.log("downsampling to ", Downsamples[0]);
    [CoronaSamples, AmbientSamples] = Downsamples.shift();
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
      deaths: 0,
      level: 0,
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
        { x: x - w * originX, y: y - h * originY },
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
    this.add
      .image(lightX, lightY, key)
      .setOrigin(0, 0)
      .setDepth(-100);
  }

  createSun(x, y, objects, backwards) {
    let coronaPrimary = 255;
    let coronaSecondary = 0;
    let ambientPrimary = 255;
    let ambientSecondary = 200;

    const bead = this.add.image(x, y, "bead");

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
      light: corona,
      objects: [],
    });

    const lamps = [corona, ambient];
    const lightings = [lighting1, lighting2];

    const set = { bead, corona, ambient, lamps, lightings, backwards };

    this.suns.push(set);

    this.dark = new DarkMask({
      lights: _.flatMap(this.suns, ({ lamps }) => lamps),
    });

    return set;
  }

  resampleSuns() {
    (this.suns || []).forEach(({ corona, ambient }) => {
      corona.samples = CoronaSamples;
      ambient.samples = AmbientSamples;
    });
  }

  createHealthBar(owner) {
    const border = this.add.sprite(owner.x, owner.y, "hpbar");
    const fill = this.add.sprite(owner.x, owner.y, "hpbar");
    const healthBar = {
      fill,
      border,
    };

    fill.setCrop(1, 1, fill.width - 2, fill.height - 2);
    fill.tint = 0xff0000;

    border.tint = 0;
    border.visible = fill.visible = false;
    owner.healthBar = healthBar;
  }

  updateHealthBarFor(owner, percent) {
    const { healthBar } = owner;
    const { fill, border } = healthBar;

    if (percent <= 0) {
      border.visible = fill.visible = false;
      return;
    }

    border.visible = fill.visible = true;
    border.x = owner.x;
    border.y = owner.y - owner.height;
    fill.x = owner.x;
    fill.y = owner.y - owner.height;

    fill.setCrop(1, 1, fill.width * percent - 2, fill.height - 2);
  }

  createSmoker(player) {
    const lightAsh = {};
    this.particleSystem("effects.lightAsh", {
      follow: player,
      x: { min: -player.width / 2, max: player.width / 2 },
      y: { min: -player.height / 2, max: player.height / 2 },
      alpha: { start: 1, end: 0 },
      scale: { start: 0.75, end: 1.125 },
      speedY: {
        min: 0.5 * prop("effects.lightAsh.speedY"),
        max: prop("effects.lightAsh.speedY"),
      },
      speedX: {
        min: -prop("effects.lightAsh.speedX"),
        max: prop("effects.lightAsh.speedX"),
      },
      tint: [0xf6c456, 0xec5b55, 0xaaaaaa],
      onAdd: (particles, emitter) => {
        lightAsh.particles = particles;
        lightAsh.emitter = emitter;
        emitter.on = false;
      },
    });

    player.smoker = {
      lightAsh,
    };
  }

  createStars(level) {
    this.particleSystem("effects.stars", {
      x: { min: -100, max: 900 },
      y: { min: -100, max: 700 },
      lifespan: {
        min: prop("effects.stars.lifespan") * 0.5,
        max: prop("effects.stars.lifespan") * 2,
      },
      scale: {
        start: 0,
        end: 1,
        ease: (t) => (t < 0.2 ? 5 * t : 1 - (t - 0.2)),
      },
      alpha: {
        start: 0,
        end: 0.75,
        ease: (t) => (t < 0.2 ? 5 * t : 1 - (t - 0.2)),
      },
      tint: [0xf6c456, 0xec5b55, 0xaaaaaa],
      onAdd: (particles, emitter) => {
        particles.setDepth(-1);
        level.stars = { particles, emitter };
      },
    });
  }

  createLevel(id) {
    const levelId = this.levelIds()[id];
    const level = super.createLevel(levelId);

    level.index = id;
    level.player = level.groups.player.objects[0];
    level.player.setGravityY(prop("player.gravityBase"));
    //level.player.anims.play("idle");

    this.cameraFollow(level.player);

    this.createHealthBar(level.player);
    this.createSmoker(level.player);
    this.createStars(level);

    level.blockingObjects = [];
    Object.entries(level.groups).forEach(([name, group]) => {
      const { objects, shadow } = group;
      if (shadow) {
        level.blockingObjects.push(...objects);
      }
      switch (name) {
        case "spinner":
        case "reverseSpinner":
          objects.forEach((obj) => {
            obj.setScale(5, 1);
            obj.setImmovable();
            if (name === "reverseSpinner") {
              obj.body.setAngularVelocity(-30);
              // This 180 is misleading, it's radians
              obj.rotation = 180;
            } else {
              obj.body.setAngularVelocity(30);
            }
          });
          break;
        case "drawbridge":
          objects.forEach((obj) => {
            obj.setScale(8, 1);
            obj.setImmovable();
            obj.body.pushable = false;
            obj.setOrigin(1, 0.5);
            obj.angle = prop("effects.drawbridge.rotation");
            obj.body.enable = false;

            const alternate = group.group.create(obj.x, obj.y, "drawbridge");
            alternate.setScale(1, 8);
            alternate.setOrigin(0.5, 0);
            alternate.setImmovable();
            alternate.body.pushable = false;

            alternate.visible = false;

            obj.alternate = alternate;
          });
          break;
        default:
          break;
      }
    });

    level.shadowObjects = [level.player, ...level.blockingObjects];

    return level;
  }

  create(config) {
    super.create(config);

    // lol doh!
    let levelIndex;
    if (config.levelIndex !== undefined) {
      levelIndex = config.levelIndex;
    } else if (this.save.level !== undefined) {
      levelIndex = this.save.level;
    } else {
      levelIndex = 0;
    }

    levelIndex = levelIndex % this.levelIds().length;

    this.save.level = levelIndex;
    this.saveState();

    this.respawn = config.respawn;

    const level = this.createLevel(levelIndex);

    this.createLightCanvas();

    level.illObjects = level.shadowObjects.map((sprite) => {
      const occ = new PolygonObject({ points: this.rotatedVecs(sprite) });
      sprite.occ = occ;
      return occ;
    });

    this.createSun(0, 0, level.illObjects);
    if (level.dualSun) {
      this.createSun(0, 0, level.illObjects, true);
    }

    this.hud = this.createHud();
    this.setupPhysics();

    this.command.ignoreAll("winning", false);
    this.command.ignoreAll("dying", false);

    this.spawn();
  }

  spawn() {
    const { level, save } = this;

    // make absolutely sure :D
    this.timer(() => {
      this.command.ignoreAll("winning", false);
      this.command.ignoreAll("dying", false);
    }, 300);

    if (level.lastLevel) {
      const wait = 500;
      this.speak(400, 300, level.hi, {
        duration: wait,
        noOut: true,
        onAdd: (label) => {
          this.timer(() => {
            this.tween("effects.attract", label);
          }, wait);
        },
      });

      let label;
      const { deaths } = save;
      switch (deaths) {
        case 0:
          label = "You won without dying!!! You are inevitable!";
          break;
        case 1:
          label = "You perished only once!!";
          break;
        default:
          label = `You delayed the inevitable, but perished ${deaths} times`;
          break;
      }

      this.timer(() => {
        this.speak(400, 400, label, {
          duration: wait,
          noOut: true,
          onAdd: (label) => {
            this.timer(() => {
              this.tween("effects.attract", label);
            }, wait);
          },
        });
      }, wait);
    } else {
      if (!this.respawn) {
        this.speak("@", level.hi, { dy: -50 });
      }
    }
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
    const { level, physics } = this;
    const { player, groups } = level;
    const { wall, ground, crumble, button, drawbridge } = groups;

    physics.add.collider(player, wall.group);
    physics.add.collider(player, ground.group);
    physics.add.collider(player, drawbridge.group);
    physics.add.collider(player, crumble.group, (...args) =>
      this.crumble(...args)
    );
    physics.add.collider(player, button.group, (...args) =>
      this.button(...args)
    );
  }

  crumble(player, block) {
    if (block.crumbling) {
      return;
    }

    if (player.y + player.height * 0.9 >= block.y) {
      return;
    }

    const { level } = this;
    const { map } = level;
    const [tile] = block.tiles;
    const { x, y } = tile;

    const platform = [];

    map[y].forEach((t) => {
      if (tile.glyph === t.glyph && Math.abs(t.x - x) < 3) {
        platform.push(t.object);
      }
    });

    platform.forEach((block) => {
      block.crumbling = true;
      this.tween("effects.firstCrumble", block, {
        onComplete: () => {
          this.tween("effects.crumble", block, {
            onComplete: () => {
              block.disableBody(true, false);
            },
          });
        },
      });
    });
  }

  button(player, button) {
    if (player.y + player.height * 0.9 >= button.y) {
      return;
    }

    if (player.pressingButton) {
      return;
    }
    player.pressingButton = true;

    if (button.toggling) {
      return;
    }
    button.toggling = true;

    const [drawbridge] = this.level.groups.drawbridge.objects;
    const alternate = drawbridge.alternate;

    this.tween("effects.buttonPress", button, {
      onComplete: () => {
        button.toggling = false;
      },
    });

    if (button.pressed) {
      button.pressed = false;
      alternate.body.enable = true;
      drawbridge.body.enable = false;
      this.tween("effects.drawbridge", drawbridge, {});
    } else {
      alternate.body.enable = false;
      drawbridge.body.enable = true;
      button.pressed = true;
      this.tween("effects.drawbridge", drawbridge, {
        rotation: 0,
      });
    }
  }

  setupAnimations() {
    this.anims.create({
      key: "player",
      frames: [
        {
          key: "idle",
          frame: 0,
        },
      ],
    });
  }

  processInput(time, dt) {
    const { command, level } = this;
    const { player } = level;

    let dx = 0;
    let dy = 0;
    let stickInput = false;

    const touchingDown = player.body.touching.down;
    if (touchingDown) {
      player.lastTouchDown = time;
    }

    const canJump = player.lastTouchDown > time - 75 && !player.isJumping;
    if (command.jump.started) {
      if (canJump) {
        player.isJumping = true;
        player.hasLiftedOff = false;
        player.hasReleasedJump = false;
        player.jumpStart = time;
        player.setVelocityY(
          player.body.velocity.y - prop("player.baseJumpVelocity")
        );
      }
    }

    if (command.down.held) {
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

    let vx = player.body.velocity.x + dx * prop("player.speed");
    vx *= 1 - prop("player.drag");
    player.setVelocityX(vx);

    // squash and stretch
    {
      let targetX = 1;
      let targetY = 1;

      const { x, y } = player.body.velocity;
      let dx = Math.abs(x) / (24 * 24);
      let dy = Math.abs(y) / (24 * 24);

      if (dx + dy > 0.1) {
        [dx, dy] = [(dx - dy) / (dx + dy), (dy - dx) / (dx + dy)];

        // intentionally flipped
        const max = 0.1;
        targetX = dy * max + 1;
        targetY = dx * max + 1;
      }

      const lerp = 0.1;
      const sx = player.scaleX + (targetX - player.scaleX) * lerp;
      const sy = player.scaleY + (targetY - player.scaleY) * lerp;
      player.setScale(sx, sy);
    }
  }

  processJumping(time, dt) {
    const { command, level } = this;
    const { player } = level;

    if (!command.jump.held) {
      player.hasReleasedJump = true;
    }

    const touchingDown = player.body.touching.down;
    if (touchingDown) {
      player.lastTouchDown = time;
    }

    if (!touchingDown) {
      player.pressingButton = false;
    }

    if (player.isJumping && !player.hasLiftedOff && !touchingDown) {
      player.hasLiftedOff = true;
    }

    if (player.isJumping && player.hasLiftedOff && touchingDown) {
      player.hasLiftedOff = false;
      player.isJumping = false;
      this.trauma(
        Math.min(
          prop("player.maxJumpTrauma"),
          player.previousVelocityY / prop("player.jumpTraumaDivisor")
        )
      );
    }

    let vy = player.body.velocity.y;
    if (player.isJumping && !player.hasReleasedJump) {
      if (time - player.jumpStart > prop("player.maxJumpTime")) {
        player.hasReleasedJump = true;
      } else {
        vy -= prop("player.baseJumpVelocity");
        vy *= 1 - prop("player.drag");
        player.setVelocityY(vy);
      }
    }

    player.previousVelocityY = player.body.velocity.y;
  }

  sunPosition(percent = this.percent, backwards) {
    const firstKey = backwards ? "bwFirstPoint" : "firstPoint";
    const lastKey = backwards ? "bwLastPoint" : "lastPoint";
    const splineKey = backwards ? "bwSpline" : "spline";

    if (!this[splineKey]) {
      const points = [];
      if (backwards) {
        points.push(new Phaser.Math.Vector2(0, 750));
      } else {
        points.push(new Phaser.Math.Vector2(10, 600));
      }

      points.push(new Phaser.Math.Vector2(100, 200));
      points.push(new Phaser.Math.Vector2(400, 10));
      points.push(new Phaser.Math.Vector2(700, 200));
      points.push(new Phaser.Math.Vector2(800, 750));
      this[firstKey] = points[0];
      this[lastKey] = points[points.length - 1];
      this[splineKey] = new Phaser.Curves.Spline(points);
    }

    let p;
    if (percent < 0) {
      p = this[firstKey];
    } else if (this.winning || percent > 1) {
      p = this[lastKey];
    } else {
      p = this[splineKey].getPoint(percent);
    }

    return [p.x, p.y];
  }

  spinnered() {
    const { level, lightX, lightY } = this;
    const { player, groups } = level;
    const { spinner, reverseSpinner } = groups;

    const bounds = player.getBounds();

    return [...spinner.objects, ...reverseSpinner.objects].some(({ occ }) => {
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
        return Phaser.Geom.Intersects.LineToRectangle(edge, bounds);
      });
    });
  }

  crispingSun() {
    const { suns, percent, lightX, lightY, level } = this;
    const { player, blockingObjects } = level;

    const { x: playerX, y: playerY } = player;

    const sunrays = suns.map((sun) => {
      const { backwards } = sun;
      const [sunX, sunY] = this.sunPosition(
        backwards ? 1 - percent : percent,
        backwards
      );
      const ray = new Phaser.Geom.Line(sunX, sunY, playerX, playerY);
      return [sun, ray, Phaser.Geom.Line.Length(ray)];
    });

    const touchingSunrays = sunrays.filter(([_sun, sunray]) => {
      return !blockingObjects.some((obj) => {
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

  moveShadowObjects() {
    const { level } = this;

    level.shadowObjects.forEach((s) => {
      const { occ } = s;
      occ.points = this.rotatedVecs(s);
    });
  }

  fixedUpdate(time, dt) {
    const { level } = this;
    const { player } = level;

    const rawTime = (this.t = (this.t || 0) + dt);
    const speed = this.level.sunSpeed;
    const t = (rawTime * speed) / 1000;
    this.percent = t / 800;

    const invincible = prop("player.invincible");

    this.processInput(time, dt);
    this.processJumping(time, dt);
    this.moveShadowObjects();

    const maxCrisp = 2000;
    level.stars.emitter.on = true;
    level.stars.particles.visible = true;

    if (this.playerDying) {
      player.smoker.lightAsh.emitter.on = false;
    } else {
      if (this.spinnered()) {
        this.playerDie(true);
      }

      this.crispingSuns =
        !this.winning && this.percent < 0.9 && this.crispingSun();
      if (this.level.dualSun && this.percent < 0.1) {
        this.crispingSuns = undefined;
      }

      if (this.crispingSuns) {
        this.crispTime = Math.min(maxCrisp, (this.crispTime || 0) + dt);
        player.smoker.lightAsh.emitter.on = true;
      } else {
        this.crispTime = Math.max(0, (this.crispTime || 0) - dt);
        player.smoker.lightAsh.emitter.on = false;
      }

      this.crispPercent = this.crispTime / maxCrisp;
      player.smoker.lightAsh.emitter.frequency = 100 * (1 - this.crispPercent);
    }

    let desiredTimeScale = 1;
    let desiredZoom = 1;
    if (this.crispPercent >= 0.6) {
      level.stars.emitter.on = false;
      level.stars.particles.visible = false;
    }

    this.minTrauma = 0;
    if (this.crispPercent >= 1) {
      if (!invincible) {
        this.playerDie(true);
      }
    } else if (!this.playerDying && this.crispPercent >= 0.3) {
      if (this.crispPercent >= 0.6) {
        if (this.crispingSuns) {
          desiredTimeScale = 1.5;
          desiredZoom = 1.02;
        }
        this.minTrauma = 0.2;
      } else {
        this.minTrauma = 0.1;
      }

      if (invincible) {
        this.minTrauma = 0;
        desiredTimeScale = 1;
        desiredZoom = 1;
      }
      this.trauma(0);
    }

    const factor = this.crispingSuns && !this.playerDying ? 0.01 : 0.4;
    this.timeScale =
      this.timeScale + (desiredTimeScale - this.timeScale) * factor;
    this.camera.zoom =
      this.camera.zoom + (desiredZoom - this.camera.zoom) * (factor * 1.5);

    const grace = 200;
    if (
      player.x < -grace ||
      player.x > grace + level.width ||
      player.y < -grace ||
      player.y > grace + level.height
    ) {
      this.playerDie(false);
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

  playerDie(explode) {
    const { level, save } = this;
    const { player } = level;
    if (this.playerDying) {
      return;
    }

    save.deaths = (save.deaths || 0) + 1;
    this.saveState();

    this.playerDying = true;
    this.unlightObject(player);
    this.shockwave(player.x, player.y);
    this.command.ignoreAll("dying", true);
    this.trauma(1);

    if (explode) {
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
        scale: { start: 0.75, end: 1 },
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
      this.particleSystem("effects.playerSmoke", {
        x: {
          min: player.x - player.width * 0.4,
          max: player.x + player.width * 0.4,
        },
        y: {
          min: player.y - player.height * 0.4,
          max: player.y + player.height * 0.4,
        },
        alpha: { start: 1, end: 0 },
        //scale: { start: 0.25, end: 0.5 },
        scale: { start: 0.5, end: 1 },
        rotate: { start: 0, end: 360 },
        speedY: {
          min: 0.5 * prop("effects.playerSmoke.speedY"),
          max: prop("effects.playerSmoke.speedY"),
        },
        speedX: {
          min: -prop("effects.playerSmoke.speedX"),
          max: prop("effects.playerSmoke.speedX"),
        },
        tint: [0x333333, 0x777777, 0xaaaaaa, 0xff9999],
        onAdd: (particles, emitter) => {
          this.timer(() => {
            emitter.stop();
          }, prop("effects.playerDie.duration") * 2 /* + prop("level.replaceDelay") - prop("effects.playerAsh.lifespan") */);
        },
      });
      this.tween("effects.playerDieHealthBar", player.healthBar.fill);
      this.tween("effects.playerDieHealthBar", player.healthBar.border);
    }

    this.tween("effects.playerDie", player, {
      onComplete: () => {
        this.timer(() => {
          this.replaceWithSelf(
            true,
            { respawn: true },
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
    const { level } = this;
    const { player } = level;
    this.renderLights();
    this.updateHealthBarFor(player, this.crispPercent);
  }

  skipLevel() {
    const { level } = this;
    if (level.index === this.levelIds().length - 1) {
      this.goToLevel(0);
    } else {
      this.goToLevel(level.index + 1);
    }
  }

  prevLevel() {
    const { level } = this;
    if (level.index === 0) {
      return;
    }

    this.goToLevel(level.index - 1);
  }

  goToLevel(id) {
    this.replaceWithSelf(
      true,
      { respawn: false, levelIndex: id },
      {
        animation: "crossFade",
        duration: 200,
        delayNewSceneShader: true,
        removeOldSceneShader: true,
      }
    );
  }

  wonLevel() {
    const { level } = this;
    const { player, groups } = level;
    const {
      wall,
      ground,
      spinner,
      reverseSpinner,
      crumble,
      drawbridge,
      button,
    } = groups;

    if (this.winning) {
      return;
    }

    this.winning = true;
    this.command.ignoreAll("winning", true);

    const dynamic = [player];
    const images = [];

    [spinner, reverseSpinner, crumble, drawbridge, button].forEach(
      ({ objects }) => {
        dynamic.push(...objects);
      }
    );

    [wall, ground].forEach(({ objects }) => {
      objects.forEach(({ tiles }) => {
        images.push(...tiles.map(({ image }) => image));
      });
    });

    dynamic.forEach((object) => {
      object.disableBody(true, false);
    });

    [...dynamic, ...images].forEach((obj) => {
      this.timer(
        () => {
          this.tween("effects.goodNight", obj, {
            dy:
              this.randBetween("goodnight", 0.5, 1) *
              prop("effects.goodNight.dy"),
          });
        },
        obj === player ? 3000 : this.randBetween("goodnight", 0, 1000)
      );
    });

    this.save.level = level.index + 1;
    this.saveState();

    this.timer(() => {
      this.speak(400, 300, level.bye, {
        scrollFactor: 0,
        onExit: () => {
          this.replaceWithSelf(
            true,
            { respawn: false, levelIndex: level.index + 1 },
            {
              animation: "crossFade",
              duration: 200,
              delayNewSceneShader: true,
              removeOldSceneShader: true,
            }
          );
        },
      });
    }, 2000);
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
      percent,
    } = this;
    if (!lightTexture) {
      return;
    }
    const ctx = lightTexture.context;

    lightTexture.refresh();
    ctx.clearRect(0, 0, lightWidth, lightHeight);

    suns.forEach((sun) => {
      const { bead, lamps, ambient, corona, backwards } = sun;
      const [x, y] = this.sunPosition(
        backwards ? 1 - percent : percent,
        backwards
      );

      const pos = new Vec2(x - lightX, y - lightY);
      lamps.forEach((lamp) => {
        lamp.position = pos;
      });
      bead.x = x;
      bead.y = y;

      const crispingColor = {
        r: 255,
        g: 100,
        b: 100,
      };

      const safeColor = {
        r: 150,
        g: 255,
        b: 150,
      };
      let alpha = (0.3 + this.crispPercent * 0.5) / suns.length;
      if (this.winning || this.percent > 1) {
        const extra = this.winning ? 100 : this.percent - 1;
        alpha = alpha - extra * prop("level.fadeOutFactor");

        if (alpha <= 0) {
          alpha = 0;
          this.wonLevel();
        }
      }

      const tint = Phaser.Display.Color.Interpolate.ColorWithColor(
        safeColor,
        crispingColor,
        100,
        100 * crispPercent
      );
      const { r, g, b } = tint;

      ambient.color = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      if (this.winning) {
        if (backwards) {
          corona.color = `rgba(0, 0, 255, ${alpha})`;
        } else {
          corona.color = `rgba(255, 0, 0, ${alpha})`;
        }
      }
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
    if (this.level.lastLevel) {
      return "#f6c456";
      //return "rgb(255, 0, 255)";
    } else {
      return "rgb(255, 0, 0)";
    }
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
    const { level } = this;
    const { player } = level;
    super.launchTimeSight();
    player.visible = false;
  }

  renderTimeSightFrameInto(scene, phantomDt, time, dt, isLast) {
    const { level } = this;
    const { player } = level;
    const objects = [];

    if (!this.timeSightX) {
      this.timeSightX = this.timeSightY = 0;
    }

    const prevX = this.timeSightX;
    const prevY = this.timeSightY;

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
    this.level.player.x = x;
    this.level.player.y = y;
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
