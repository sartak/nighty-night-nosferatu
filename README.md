[![Nighty Night, Nosferatu](https://github.com/sartak/nighty-night-nosferatu/blob/master/src/assets/cover.png?raw=true)](https://nosferatu.shawn.dev/)

[![Nighty Night, Nosferatu](https://github.com/sartak/nighty-night-nosferatu/blob/master/src/assets/gameplay.gif?raw=true)](https://nosferatu.shawn.dev/)

# Play Live

[https://nosferatu.shawn.dev/](https://nosferatu.shawn.dev/)

# Development

First install the dependencies with `npm install`.

Run `npm run start`, which should automatically open
[http://localhost:3000](http://localhost:3000).

The primary game code is in `src/play-scene.js`, with `src/props.js` and
`src/game.js` as supporting files. Assets are under `src/assets/`.

# Deployment

Update `package.json` as needed (e.g. for game name, author name, etc).

Run `npm run build` then put the `build/` directory on a web server.

To deploy to a location other than `/`, update `homepage` in `package.json`.

# License

The MIT License; see `LICENSE.md`.

