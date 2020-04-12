import React from 'react';
import './Engine.css';
import Spinner from './Spinner';
import Controls from './Controls';
import Game from '../game';
import cover from '../assets/cover.png';
import {saveField, loadField} from './lib/store';

export default class Engine extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      activating: false,
      activated: false,
      focused: true,
      volume: loadField('volume', 0.66),
      scale: null,
    };
  }

  componentDidMount() {
    const {loadedGame, debug} = this.props;
    const {volume} = this.state;

    window.addEventListener('visibilitychange', this.didVisibilityChange);
    window.addEventListener('blur', this.didBlur);
    document.addEventListener('blur', this.didBlur);
    window.addEventListener('focus', this.didFocus);
    document.addEventListener('focus', this.didFocus);

    const body = document.querySelector('body');
    body.classList.add('natural');

    this.game = new Game({debug});
    this.game.changeVolume(volume);

    if (loadedGame) {
      loadedGame(this.game, (callback) => this.activateGame(callback));
    }
  }

  componentWillUnmount() {
    window.removeEventListener('visibilitychange', this.didVisibilityChange);
    window.removeEventListener('blur', this.didBlur);
    document.removeEventListener('blur', this.didBlur);
    window.removeEventListener('focus', this.didFocus);
    document.removeEventListener('focus', this.didFocus);
  }

  onMouseMove() {
    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout);
    } else {
      document.querySelector('body').classList.add('mouseMoved');
    }

    this.moveTimeout = setTimeout(() => {
      this.clearMove(false);
    }, 3000);
  }

  setVolume(volume) {
    this.setState({volume});

    this.game.changeVolume(volume);

    saveField('volume', volume);
  }

  didVisibilityChange = () => {
    const hidden = document.visibilityState === 'hidden';
    this.setState({focused: !hidden});
    this.game.setFocused(!hidden);
  };

  didBlur = () => {
    this.setState({focused: false});
    this.game.setFocused(false);
  };

  didFocus = () => {
    this.setState({focused: true});
    this.game.setFocused(true);
  };

  activateGame(callback) {
    const {activated} = this.state;

    if (activated) {
      if (callback) {
        callback();
      }
      return;
    }

    this.setState({activating: true});

    this.game.activateGame(() => {
      // might happen multiple times
      this.setState({activated: true});
      this.clearMove(true);
      if (callback) {
        callback();
      }
    });
  }

  clearMove(instant) {
    if (!this.moveTimeout) {
      return;
    }

    clearTimeout(this.moveTimeout);
    this.moveTimeout = null;

    if (instant) {
      const controls = document.querySelector('#controls');
      controls.style.transition = 'none';
      setTimeout(() => {
        controls.style.transition = '';
      });
    }

    document.querySelector('body').classList.remove('mouseMoved');
  }

  enterFullscreen() {
    const body = document.querySelector('body');
    const engine = document.querySelector('#engine');

    if (body && engine) {
      body.classList.add('scaled');
      body.classList.remove('natural');

      engine.style.overflow = '';

      this.resizeHandler = () => {
        const {width, height} = this.game.config;
        const scale = 0.95 * Math.min(window.innerWidth / width, window.innerHeight / height);
        this.setState({scale});
      };
      this.resizeHandler();

      window.addEventListener('resize', this.resizeHandler);

      if (!this.fullscreenHandler) {
        this.fullscreenHandler = () => {
          const isInFullScreen = document.fullscreenElement
            || document.webkitFullscreenElement
            || document.mozFullScreenElement
            || document.msFullscreenElement;

          if (!isInFullScreen) {
            this.exitFullscreen(true);
          }
        };

        document.addEventListener('webkitfullscreenchange', this.fullscreenHandler, false);
        document.addEventListener('mozfullscreenchange', this.fullscreenHandler, false);
        document.addEventListener('fullscreenchange', this.fullscreenHandler, false);
        document.addEventListener('MSFullscreenChange', this.fullscreenHandler, false);
      }

      if (body.requestFullscreen) {
        body.requestFullscreen();
      } else if (body.mozRequestFullScreen) {
        body.mozRequestFullScreen();
      } else if (body.webkitRequestFullScreen) {
        body.webkitRequestFullScreen();
      } else if (body.msRequestFullscreen) {
        body.msRequestFullscreen();
      }
    }
  }

  exitFullscreen(skipBrowserFullscreen) {
    const body = document.querySelector('body');
    const engine = document.querySelector('#engine');
    if (body && engine) {
      body.classList.add('natural');
      body.classList.remove('scaled');

      engine.style.overflow = 'hidden';

      this.setState({scale: null});

      if (this.moveTimeout) {
        clearTimeout(this.moveTimeout);
        this.moveTimeout = null;
      }

      window.removeEventListener('resize', this.resizeHandler);
      window.removeEventListener('mousemove', this.moveHandler);
    }

    if (!skipBrowserFullscreen) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  render() {
    const {
      activating, scale, volume, focused,
    } = this.state;

    const classes = [];
    classes.push(activating ? 'activated' : 'activate');
    classes.push(focused ? 'focused' : 'blurred');

    return (
      <div className={classes.join(' ')} id="engine-container">
        <div
          id="engine"
          onMouseMove={() => this.onMouseMove()}
          onClick={() => this.activateGame()}
          style={scale ? {transform: `scale(${scale})`} : {}}
          ref={(container) => {
            if (this.gameContainerRef) {
              return;
            }

            this.gameContainerRef = container;
          }}
        >
          <div style={{backgroundImage: `url(${cover})`}} id="cover" />
          <Spinner />
        </div>
        <Controls
          onMouseMove={() => this.onMouseMove()}
          volume={volume}
          onVolumeChange={(v) => this.setVolume(v)}
          isFullscreen={scale}
          enterFullscreen={() => this.enterFullscreen()}
          exitFullscreen={() => this.exitFullscreen()}
        />
      </div>
    );
  }
}
