import {tweenEases} from './tweens';

export const transitionAnimations = [
  'fadeInOut',
  'crossFade',

  'pushLeft',
  'pushRight',
  'pushUp',
  'pushDown',

  'wipeLeft',
  'wipeRight',
  'wipeUp',
  'wipeDown',
];

const defaultTransitionProps = {
  animation: ['fadeInOut', transitionAnimations],

  duration: [0, 0, 10000],
  ease: ['Linear', tweenEases],

  delayNewSceneShader: [false],
  removeOldSceneShader: [false],
  suppressShaderCheck: [false],

  animated: [true],
};

export function expandTransitionProps(props) {
  Object.entries(props).forEach(([name, spec]) => {
    if (!name.endsWith('.transition')) {
      return;
    }

    const prefix = name.substr(0, name.length - '.transition'.length);

    if (!Array.isArray(spec) || spec.length !== 1 || typeof spec[0] !== 'object') {
      throw new Error(`Expected ${name} prop to have the shape [{…}]; did you mean to end it in .transition?`);
    }

    delete props[name];

    const [config] = spec;

    const seen = {...config};

    Object.entries(defaultTransitionProps).forEach(([key, value]) => {
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

    props[`${prefix}.execute`] = [(scene, game) => {
      scene.replaceWithSelf(false, null, prefix);
    }];

    if (Object.keys(seen).length) {
      throw new Error(`Got unexpected transition config settings: ${Object.keys(seen).join(', ')}`);
    }
  });
}

export default function massageTransitionProps(props, options) {
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

  if (massageProps) {
    massageProps(props);
  }

  if ('animated' in props && !props.animated) {
    props.duration = 0;
  }
  delete props.animated;

  return props;
}
