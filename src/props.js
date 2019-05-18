import {
  builtinPropSpecs, ManageableProps, PropLoader, makePropsWithPrefix,
} from './scaffolding/lib/props';

const particleImages = [
  ''
];

const commands = {
};

export {commands};

export const propSpecs = {
  ...builtinPropSpecs(commands),

};

export const tileDefinitions = {
  '.': null, // background
};

export const manageableProps = new ManageableProps(propSpecs, particleImages);
export const propsWithPrefix = makePropsWithPrefix(propSpecs, manageableProps);
export default PropLoader(propSpecs, manageableProps);
