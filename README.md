# Development

First install the dependencies with `npm install`.

Run `npm run start`, which should automatically open
[http://localhost:3000](http://localhost:3000).

The primary game code is in `src/play-scene.js`, with `src/props.js` and
`src/game.js` as supporting files. Assets are under `src/assets/`.

# Deployment

Update `package.json` as needed (e.g. for analytics, author name, etc).

Run `npm run build` then put the `build/` directory on a web server.

To deploy to a location other than `/`, update `homepage` in `package.json`.

# License

The MIT License; see `LICENSE.md`.

