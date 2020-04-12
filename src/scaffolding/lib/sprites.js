let injected = false;
export function injectAddSpriteTimeScale(scene) {
  if (injected) {
    return;
  }

  // eslint-disable-next-line no-proto
  const proto = scene.physics.add.__proto__;

  const origAdd = proto.sprite;

  proto.sprite = function(...args) {
    const sprite = origAdd.call(this, ...args);
    if (sprite && sprite.anims) {
      sprite.anims.setTimeScale(sprite.scene.timeScale);
    }
    return sprite;
  };

  injected = true;
}
