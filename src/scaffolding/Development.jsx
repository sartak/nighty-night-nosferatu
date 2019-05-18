import React from 'react';
import './Development.css';
import Engine from './Engine';
import Manage from './Manage';
import Replay from './Replay';
import Logging from './Logging';
import {developmentDisplay} from '../../package.json';

export default class Development extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      game: null,
      activateGame: null,
    };
  }

  loadedGame = (game, activateGame) => {
    window.game = game;
    this.setState({game, activateGame});
  }

  render() {
    const {game, activateGame} = this.state;

    return (
      <div className="development">
        <Engine
          debug
          loadedGame={this.loadedGame}
        />

        <Logging game={game} />

        <div className="sidebar">
          <ul className="links">
            {developmentDisplay.links.map(([href, label]) => (
              <li key={href}>
                <a target="_blank" rel="noopener noreferrer" href={href}>{label}</a>
              </li>
            ))}
          </ul>

          <Manage />
          <Replay activateGame={activateGame} />
        </div>
      </div>
    );
  }
}
