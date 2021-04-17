export const Distance = (dx, dy) => {
  return Math.sqrt(dx ** 2 + dy ** 2);
};

export const NormalizeVector = (dx, dy) => {
  const d = Distance(dx, dy);
  return [dx / d, dy / d];
};

export const NormalizeVectorWithDistance = (dx, dy) => {
  const d = Distance(dx, dy);
  return [dx / d, dy / d, d];
};

export const SumVectors = (vs) => {
  let tx = 0;
  let ty = 0;

  vs.foreach((vx, vy) => {
    tx += vx;
    ty += vy;
  });

  return [tx, ty];
};

export const CentroidPoints = (ps) => {
  let tx = 0;
  let ty = 0;

  ps.foreach((px, py) => {
    tx += px;
    ty += py;
  });

  return [tx / ps.length, ty / ps.length];
};
