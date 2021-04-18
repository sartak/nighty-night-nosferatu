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
    const {
      _traumaShake, time, timeScale, _traumaStart,
    } = scene;
    const {now} = time;

    if (!_traumaShake) {
      return;
    }

    const delta = now - _traumaStart;
    const t = delta * prop('scene.trauma.speed') / timeScale ** 2;
    const easeIn = Math.min(1, delta / (prop('scene.trauma.easeIn') * timeScale));

    const dx = easeIn * _traumaShake * prop('scene.trauma.dx') * noiseX.noise2D(_traumaStart, t);
    const dy = easeIn * _traumaShake * prop('scene.trauma.dy') * noiseY.noise2D(_traumaStart, t);
    const dt = easeIn * _traumaShake * prop('scene.trauma.dt') * noiseT.noise2D(_traumaStart, t);

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
