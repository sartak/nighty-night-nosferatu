import React from 'react';
import './Replay.css';
import {saveField, loadField} from './lib/store';

export default class Replay extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      replays: loadField('replays', []),
      activeRecording: null,
      activeReplay: loadField('activeReplay', null),
      editing: null,
      repeat: loadField('repeat', true),
    };
  }

  componentDidMount() {
    this.beginAutoReplay();
    this.installGameCallbacks();
  }

  componentDidUpdate(prevProps) {
    const {activateGame} = this.props;
    if (activateGame !== prevProps.activateGame) {
      this.installGameCallbacks();
      this.beginAutoReplay();
    }
  }

  installGameCallbacks() {
    const {game} = window;
    if (!game || game.onRecordBegin) {
      return;
    }

    game.onRecordBegin = (activeRecording) => {
      this.setState({activeRecording});
    };

    game.onRecordStop = (replay) => {
      this.setState({activeRecording: null});

      if (this._trashNextRecording) {
        delete this._trashNextRecording;
        return;
      }

      this.setState(({replays}) => {
        const newReplays = [replay, ...replays];

        setTimeout(() => {
          saveField('replays', newReplays);

          if (!replay.snapshot) {
            this.beginReplay(replay);
          }
        });

        return {
          replays: newReplays,
        };
      });
    };

    game.onReplayBegin = (replay) => {
      if (!replay.snapshot) {
        this.setState({activeReplay: replay});
        saveField('activeReplay', replay);
      }
    };

    game.onReplayEnd = (replay) => {
      const {repeat} = this.state;

      if (repeat && !replay.snapshot) {
        setTimeout(() => {
          this.beginReplay(replay);
        });
      } else {
        this.setState({activeReplay: null});
        saveField('activeReplay', null);
      }
    };

    game.onReplayStop = (replay) => {
      this.setState({activeReplay: null});
      saveField('activeReplay', null);
    };
  }

  beginAutoReplay() {
    const {activateGame} = this.props;
    const {activeReplay} = this.state;

    if (!activateGame) {
      return;
    }

    if (!activeReplay) {
      return;
    }

    this.beginReplay(activeReplay);
  }

  beginReplay(replay) {
    const {activateGame} = this.props;
    activateGame(() => {
      const {activeReplay} = this.state;
      if (activeReplay) {
        window.game.stopReplay();
      }

      window.game.beginReplay(replay);
    });
  }

  stopReplay() {
    const {activateGame} = this.props;
    activateGame(() => {
      window.game.stopReplay();
    });
  }

  beginRecording(options) {
    const {activateGame} = this.props;
    activateGame(() => {
      window.game.beginRecording(options);
    });
  }

  stopRecording() {
    const {activateGame} = this.props;
    activateGame(() => {
      window.game.stopRecording();
    });
  }

  trashRecording() {
    this._trashNextRecording = true;
    this.stopRecording();
  }

  toggleTimeSight() {
    const {activeReplay} = this.state;
    this.beginReplay({...activeReplay, timeSight: !activeReplay.timeSight});
  }

  toggleRepeat() {
    this.setState(({repeat}) => {
      setTimeout(() => {
        saveField('repeat', !repeat);
      });

      return {
        repeat: !repeat,
      };
    });
  }

  blurEdit() {
    this.setState({editing: null});

    setTimeout(() => {
      const {replays} = this.state;
      saveField('replays', replays);
    });
  }

  editName({timestamp}, name) {
    this.setState(({replays}) => ({
      replays: replays.map((replay) => (replay.timestamp === timestamp ? {...replay, name} : replay)),
    }));
  }

  deleteReplay({timestamp}, name) {
    this.setState(({replays}) => {
      const newReplays = replays.filter((replay) => replay.timestamp !== timestamp);

      setTimeout(() => {
        saveField('replays', newReplays);
      });

      return {replays: newReplays};
    });
  }

  render() {
    const {
      replays, activeRecording, activeReplay, editing, repeat,
    } = this.state;

    return (
      <div className="Replay">
        <div className={`controls ${activeReplay ? 'active-replay' : ''} ${activeReplay && activeReplay.timeSight ? 'timeSight' : ''}`}>
          {activeReplay && (
            <React.Fragment>

              <span
                className={`button repeat ${repeat ? 'repeat-on' : 'repeat-off'}`}
                title={repeat ? 'Disable automatic repeat' : 'Enable automatic repeat'}
                onClick={() => this.toggleRepeat()}
              >
                🔁
              </span>
              <span className="button" title="Stop replay" onClick={() => this.stopReplay()}>⏹</span>
              {activeReplay.timeSight && (
                <span className="button" title="Disable timeSight" onClick={() => this.toggleTimeSight()}>📺</span>
              )}
              {!activeReplay.timeSight && (
                <span className="button" title="Enable timeSight" onClick={() => this.toggleTimeSight()}>⚛</span>
              )}
            </React.Fragment>
          )}
          {!activeReplay && (
            activeRecording ? (
              <React.Fragment>
                <span className="recording button" title="Stop recording" onClick={() => this.stopRecording()}>⏺️</span>
                <span className="button" title="Discard recording" onClick={() => this.trashRecording()}>🚮</span>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <span className="record button" title="Start recording replay" onClick={() => this.beginRecording()}>🎦</span>
                <span className="snapshot button" title="Take snapshot (save state)" onClick={() => this.beginRecording({snapshot: true})}>🎆</span>
              </React.Fragment>
            )
          )}
        </div>
        <ul className="replays">
          {replays.map((replay) => (
            <li
              className={`
                replay
                ${activeReplay && activeReplay.timestamp === replay.timestamp ? 'active' : ''}
                ${editing === replay.timestamp ? 'editing' : ''}
              `}
              key={replay.timestamp}
            >
              <span className="drag">⋮⋮</span>
              {activeReplay && activeReplay.timeSight && activeReplay.timestamp === replay.timestamp && (
                <span className="button" title="Restart timeSight" onClick={() => this.beginReplay({...replay, timeSight: true})}>⚛</span>
              )}
              {activeReplay && !activeReplay.timeSight && activeReplay.timestamp === replay.timestamp && (
                <span className="button" title="Restart replay" onClick={() => this.beginReplay(replay)}>📺</span>
              )}
              {(!activeReplay || activeReplay.timestamp !== replay.timestamp) && !replay.snapshot && (
                <span className="button" title="Start replay" onClick={() => this.beginReplay(replay)}>▶️</span>
              )}
              {(!activeReplay || activeReplay.timestamp !== replay.timestamp) && replay.snapshot && (
                <span className="button" title="Load snapshot (load state)" onClick={() => this.beginReplay(replay)}>🎆</span>
              )}
              {editing === replay.timestamp && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  this.blurEdit();
                }}
                >
                  <input
                    type="text"
                    autoFocus
                    value={replay.name}
                    onBlur={() => this.blurEdit()}
                    onChange={(e) => this.editName(replay, e.target.value)}
                  />
                </form>
              )}
              <span className="name" onClick={() => this.beginReplay(replay)}>{replay.name}</span>
              <span className="edit button" title="Edit replay" onClick={() => this.setState({editing: replay.timestamp})}>ℹ</span>
              <span className="delete button" title="Delete replay" onClick={() => this.deleteReplay(replay)}>🚮</span>
            </li>
          ))}
        </ul>

      </div>
    );
  }
}
