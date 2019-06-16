import {
  builtinPropSpecs, ManageableProps, PropLoader, makePropsWithPrefix,
  preprocessPropSpecs, preprocessTileDefinitions,
} from './scaffolding/lib/props';

const particleImages = [
  '',
];

const commands = {
};

export {commands};

export const propSpecs = {
  ...builtinPropSpecs(commands),

};

export const tileDefinitions = preprocessTileDefinitions({
  '.': null, // background
});

preprocessPropSpecs(propSpecs, particleImages);

export const manageableProps = new ManageableProps(propSpecs);
export const propsWithPrefix = makePropsWithPrefix(propSpecs, manageableProps);
export default PropLoader(propSpecs, manageableProps);
