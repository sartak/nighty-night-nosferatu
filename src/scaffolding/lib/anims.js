let injected = false;
export function injectAnimationUpdate(animation) {
  if (injected || !animation) {
    return injected;
  }

  // eslint-disable-next-line no-proto
  const proto = animation.__proto__;

  const origUpdate = proto.update;

  proto.update = function(...args) {
    if (this.parent.scene._paused.anims && !this.ignoresScenePause) {
      return;
    }

    return origUpdate.call(this, ...args);
  };

  injected = true;

  return injected;
}
