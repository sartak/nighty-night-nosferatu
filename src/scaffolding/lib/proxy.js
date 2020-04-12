// one-arg form:
// takes a class and hollows it out, replacing most methods (except constructor
// or those prefixed with __) with a call into a proxy object. we do this so
// it's much more robust for the hot reloader to update that proxy than to try
// to update the class in-place. returns the proxy object

// three-arg form:
// takes the next version of a class, an instance (or array of instances) of
// that class, and the proxy that was returned previously. updates the proxy
// with the new implementations from the next version of the class, and hollows
// out any newly-created methods we also call ._hot on instance(s) which have
// it to give them a chance to run code on hot reload
export default function(originalFrom, originalTo = originalFrom, proxy = {}) {
  let from = originalFrom;
  let to = originalTo;

  // convert a class to an instance so we can access its methods
  if (typeof from === 'function') {
    from = new from();
  }

  // ditto, except stash the original object so we can call ._hot() later
  let current;
  if (typeof to === 'function') {
    to = new to();
  } else {
    current = to;
  }

  // eslint-disable-next-line no-proto
  from = from.__proto__;

  // eslint-disable-next-line no-proto
  to = to.__proto__;

  const leftover = {};
  Object.getOwnPropertyNames(to).forEach((name) => {
    leftover[name] = true;
  });

  Object.getOwnPropertyNames(from).forEach((name) => {
    delete leftover[name];

    // constructor has special behavior, React injects a __ method
    if (name === 'constructor' || name.startsWith('__')) {
      return;
    }

    if (proxy[name]) {
      // updating an existing method that was hotloaded
      proxy[name] = from[name];
    } else {
      // adding a new method
      const implementation = from[name];
      proxy[name] = implementation;

      // we bind `this` because our phaser scene classes need it set correctly
      to[name] = function(...args) {
        return proxy[name].bind(this)(...args);
      };
    }
  });

  Object.keys(leftover).forEach((name) => {
    delete proxy[name];
    delete to[name];
  });

  // hack to update shaderSource
  // https://stackoverflow.com/a/35581512
  Object.getOwnPropertyNames(from.constructor).filter((prop) => typeof from.constructor[prop] === 'function').forEach((name) => {
    to.constructor[name] = from.constructor[name];
  });

  // give the hotloaded object(s) a chance to run code, maybe injected code
  // that would have ran as part of initialization, or a one-off fixup
  if (current) {
    if (current instanceof Array) {
      current.forEach((c) => {
        if (c._builtinHot) {
          c._builtinHot();
        }
        if (c._hot) {
          c._hot();
        }
      });
    } else {
      if (current._builtinHot) {
        current._builtinHot();
      }
      if (current._hot) {
        current._hot();
      }
    }
  }

  // this is what the caller should provide in subsequent invocations
  return proxy;
}
