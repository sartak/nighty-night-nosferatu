import Phaser from 'phaser';

const ParticleProps = [];
export function isParticleProp(prop) {
  return ParticleProps.filter((p) => prop.startsWith(p)).length > 0;
}

let injected = false;
export function injectEmitterOpSeededRandom(emitter, seed) {
  emitter.seed = seed;
  emitter.rnd = new Phaser.Math.RandomDataGenerator([seed]);

  if (injected) {
    return;
  }

  // eslint-disable-next-line no-proto
  const proto = emitter.delay.__proto__;

  proto.randomStaticValueEmit = function(particle, key) {
    const randomIndex = Math.floor(particle.emitter.rnd.frac() * this.propertyValue.length);
    return this.propertyValue[randomIndex];
  };

  proto.randomRangedValueEmit = function(particle, key) {
    const value = particle.emitter.rnd.realInRange(this.start, this.end);

    if (particle && particle.data[key]) {
      particle.data[key].min = value;
    }

    return value;
  };


  injected = true;
}

const defaultParticleProps = {
  image: null,

  /*
   * to investigate:
   * bounds: null (rectangle)
   * bounce: 0
   * collideBottom: true
   * collideLeft: true
   * collideRight: true
   * collideTop: true
   * defaultFrame: 0?
   * deathZone: null
   * emitZone: null
   * frameQuantity: 1 int
   * mask
  visible: [true],
  timeScale: [1, 0, 100],

  randomFrame: [true],
  moveToX: [0, 0, 1000],
  moveToY: [0, 0, 1000],
   * scrollFactorX: 1 number
   * scrollFactorY: 1 number
   *
   * followOffset: vec2
   * trackVisible: false
   *
   * maxVelocityX: 10000
   * maxVelocityY: 10000
   *
   * I suppose we don't need both gravity and acceleration?
  gravityX: [0, -1000, 1000],
  gravityY: [0, -1000, 1000],
   */

  /*
   * angle: {min: 0, max: 360}
  */
  frequency: [0, 0, 20000],
  lifespan: [1000, 0, 20000],

  accelerationX: [0, -1000, 1000],
  accelerationY: [0, -1000, 1000],
  alpha: [1, 0, 1],
  blendMode: ['NORMAL', ['NORMAL', 'ADD', 'MULTIPLY', 'SCREEN', 'ERASE']],
  delay: [0, 0, 20000],
  maxParticles: [0, 0, 1000],
  particleBringToTop: [true],
  quantity: [1, 0, 200, 1],
  radial: [true],
  rotate: [0, -1080, 1080, 1],
  scaleX: [1, 0, 100],
  scaleY: [1, 0, 100],
  speed: [0, 0, 1000],
  speedX: [0, -1000, 1000],
  speedY: [0, -1000, 1000],
  tint: [0xFFFFFF],
  tint_enabled: [false],
  x: [0, -1000, 1000],
  y: [0, -1000, 1000],
  visible: [true],

  preemit: [false],
  preemitOnReload: [false],
};

export function expandParticleProps(props, particleImages = ['set props/particleImages!']) {
  Object.entries(props).forEach(([name, spec]) => {
    if (name === 'scene.particles') {
      return;
    }

    if (name.endsWith('.particle')) {
      throw new Error(`Found ${name}; did you mean ${name}s?`);
    }

    if (!name.endsWith('.particles')) {
      return;
    }

    const prefix = name.substr(0, name.length - '.particles'.length);

    if (!Array.isArray(spec) || spec.length !== 1 || typeof spec[0] !== 'object') {
      throw new Error(`Expected ${name} prop to have the shape [{…}]; did you mean to end it in .particles?`);
    }

    delete props[name];

    ParticleProps.push(prefix);

    const [config] = spec;

    const seen = {...config};

    Object.entries(defaultParticleProps).forEach(([key, value]) => {
      const propKey = key.replace(/^tint/, 'tintColor');
      const options = key === 'image' ? [particleImages[0], particleImages] : value;

      if (key in config) {
        props[`${prefix}.${propKey}`] = [config[key], ...options.slice(1)];
        delete seen[key];
      } else if (key === 'preemitOnReload' && config.preemit) {
        props[`${prefix}.${propKey}`] = [true, ...options.slice(1)];
      } else if (key.endsWith('_enabled')) {
        const targetKey = key.substr(0, key.length - '_enabled'.length);
        props[`${prefix}.${propKey}`] = [targetKey in config];
      } else {
        props[`${prefix}.${propKey}`] = options;
      }
    });

    if (Object.keys(seen).length) {
      throw new Error(`Got unexpected particle config settings: ${Object.keys(seen).join(', ')}`);
    }
  });
}

export default function massageParticleProps({...props}) {
  const {massageProps} = props;

  delete props.onAdd;
  delete props.massageProps;
  delete props.image;

  if (props.tintColor_enabled) {
    props.tint = props.tintColor;
    delete props.tintColor_enabled;
  }

  // these accidentally take precedence over one another
  if (props.speedX === 0 && props.speedY === 0) {
    delete props.speedX;
    delete props.speedY;
  } else if (props.speed === 0) {
    delete props.speed;
  }

  // convert degrees to radians
  if (props.rotate) {
    if (typeof props.rotate === 'number') {
      props.rotate *= Math.PI / 180;
    }
    // TODO handle other input formats
  }

  if (massageProps) {
    massageProps(props);
  }

  return props;
}
