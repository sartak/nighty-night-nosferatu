const tweenEases = [
  'Linear',
  'Quad.easeIn',
  'Quad.easeOut',
  'Quad.easeInOut',
  'Cubic.easeIn',
  'Cubic.easeOut',
  'Cubic.easeInOut',
  'Quart.easeIn',
  'Quart.easeOut',
  'Quart.easeInOut',
  'Quint.easeIn',
  'Quint.easeOut',
  'Quint.easeInOut',
  'Sine.easeIn',
  'Sine.easeOut',
  'Sine.easeInOut',
  'Expo.easeIn',
  'Expo.easeOut',
  'Expo.easeInOut',
  'Circ.easeIn',
  'Circ.easeOut',
  'Circ.easeInOut',
  'Back.easeIn',
  'Back.easeOut',
  'Back.easeInOut',
  'Bounce.easeIn',
  'Bounce.easeOut',
  'Bounce.easeInOut',
];

const defaultTweenProps = {
  delay_enabled: [true],
  delay: [0, 0, 10000],
  duration: [0, 0, 10000],
  ease: ['Linear', tweenEases],

  dx: [0, -1000, 1000],
  dy: [0, -1000, 1000],
  alpha_enabled: [false],
  alpha: [1.0, 0, 1, 0.01],
  rotation_enabled: [false],
  rotation: [0.0, -10, 10, 0.1],
  scaleX_enabled: [false],
  scaleX: [1.0, 0, 10, 0.1],
  scaleY_enabled: [false],
  scaleY: [1.0, 0, 10, 0.1],

  yoyo: [false],
  loop: [0, -1, 100, 1],
  refreshPhysics: [false],
  destroyOnComplete: [false],
  animated: [true],
};

export function expandTweenProps(props) {
  Object.entries(props).forEach(([name, spec]) => {
    if (!name.endsWith('.tween')) {
      return;
    }

    const prefix = name.substr(0, name.length - '.tween'.length);

    if (!Array.isArray(spec) || spec.length !== 1 || typeof spec[0] !== 'object') {
      throw new Error(`Expected ${name} prop to have the shape [{…}]; did you mean to end it in .tween?`);
    }

    delete props[name];

    const [config] = spec;

    const seen = {...config};

    Object.entries(defaultTweenProps).forEach(([key, value]) => {
      if (key in config) {
        props[`${prefix}.${key}`] = [config[key], ...value.slice(1)];
        delete seen[key];
      } else if (key.endsWith('_enabled')) {
        const targetKey = key.substr(0, key.length - '_enabled'.length);
        props[`${prefix}.${key}`] = [targetKey in config];
      } else {
        props[`${prefix}.${key}`] = value;
      }
    });

    if (Object.keys(seen).length) {
      throw new Error(`Got unexpected tween config settings: ${Object.keys(seen).join(', ')}`);
    }
  });
}

export default function massageTweenProps(target, {...props}, options) {
  const {massageProps} = props;

  delete props.massageProps;

  Object.entries(props).forEach(([key, config]) => {
    if (key.endsWith('_enabled')) {
      const main = key.substr(0, key.length - '_enabled'.length);
      if (!config && !options[main]) {
        delete props[main];
      }
      delete props[key];
    }
  });

  props.targets = target;

  if (props.destroyOnComplete) {
    delete props.destroyOnComplete;
    const {onComplete} = props;
    if (onComplete) {
      props.onComplete = (...args) => {
        onComplete(...args);
        target.destroy();
      };
    } else {
      props.onComplete = () => {
        target.destroy();
      };
    }
  }

  const originalDx = props.dx;
  if (props.dx) {
    const {dx} = props;
    props.x = target.x + dx;
  }

  const originalDy = props.dy;
  if (props.dy) {
    const {dy} = props;
    props.y = target.y + dy;
  }

  if (props.refreshPhysics) {
    delete props.refreshPhysics;
    const {onUpdate} = props;
    if (onUpdate) {
      props.onUpdate = (...args) => {
        onUpdate(...args);
        if (target.body) {
          target.refreshBody();
        }
      };
    } else {
      props.onUpdate = () => {
        if (target.body) {
          target.refreshBody();
        }
      };
    }
  }

  if (massageProps) {
    massageProps(props);
  }

  if (props.dx !== originalDx) {
    const {dx} = props;
    props.x = target.x + dx;
  }
  delete props.dx;

  if (props.dy !== originalDy) {
    const {dy} = props;
    props.y = target.y + dy;
  }
  delete props.dy;

  if (!props.animated) {
    props.duration = 0;
    delete props.yoyo;
    delete props.loop;
  }
  delete props.animated;

  return props;
}
