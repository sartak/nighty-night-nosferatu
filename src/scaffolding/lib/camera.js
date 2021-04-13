import SimplexNoise from 'simplex-noise';
import prop from '../../props';

const noiseX = new SimplexNoise('X');
const noiseY = new SimplexNoise('Y');
const noiseT = new SimplexNoise('T');

let injected = false;
export function injectCameraShake(camera) {
  if (injected || !camera) {
    return injected;
  }

  // eslint-disable-next-line no-proto
  const proto = camera.__proto__;

  const origPreRender = proto.preRender;

  proto.preRender = function(...args) {
    origPreRender.call(this, ...args);

    if (prop('scene.trauma.legacy')) {
      return;
    }

    const {width, height, scene} = this;
    const {_traumaShake, time} = scene;
    const {now} = time;

    if (!_traumaShake) {
      return;
    }

    const speed = prop('scene.trauma.speed');

    const dx = _traumaShake * prop('scene.trauma.dx') * noiseX.noise2D(0, now * speed);
    const dy = _traumaShake * prop('scene.trauma.dy') * noiseY.noise2D(0, now * speed);
    const dt = _traumaShake * prop('scene.trauma.dt') * noiseT.noise2D(0, now * speed);

    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // rotate about the center
    this.matrix.translate(halfWidth, halfHeight);
    this.matrix.rotate(dt);
    this.matrix.translate(-halfWidth, -halfHeight);

    this.matrix.translate(dx, dy);
  };

  injected = true;

  return injected;
}
