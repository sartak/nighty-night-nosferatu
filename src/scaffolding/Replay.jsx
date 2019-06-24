import React from 'react';
import './Replay.css';
import {saveField, loadField} from './lib/store';

export default class Replay extends React.Component {
  constructor(props) {
    super(props);

    const replays = loadField('replays', []);

    // migrate old replays
    replays.forEach((replay) => {
      if (replay.preflight) {
        replay.commands = [
          ...replay.preflight,
          ...(replay.commands || []),
        ];
        replay.preflightCutoff = replay.preflight.reduce((cutoff, frame) => cutoff + (frame._repeat || 1), 0);
        delete replay.preflight;
      }

      if (!('tickCount' in replay)) {
        replay.tickCount = replay.commands.reduce((cutoff, frame) => cutoff + (frame._repeat || 1), 0);
      }

      if (!('originalPreflightCutoff' in replay)) {
        replay.originalPreflightCutoff = replay.preflightCutoff;
      }
    });

    this.state = {
      replays,
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
          this.beginReplay(this.state.activeReplay);
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

  finishEdit(replay) {
    this.setState({editing: null});

    setTimeout(() => {
      const {replays, activeReplay} = this.state;
      saveField('replays', replays);

      if (activeReplay && activeReplay.timestamp === replay.timestamp) {
        saveField('activeReplay', activeReplay);
      }
    });
  }

  updateReplay({timestamp}, changes, beginReplay) {
    this.setState(({activeReplay, replays}) => {
      let newReplay;
      const newState = {
        replays: replays.map((replay) => {
          if (replay.timestamp === timestamp) {
            newReplay = {
              ...replay,
              ...changes,
            };
            return newReplay;
          }
          return replay;
        }),
      };

      if (activeReplay && activeReplay.timestamp === timestamp) {
        newState.activeReplay = {
          ...activeReplay,
          ...changes,
        };
      }

      if (newReplay && beginReplay) {
        setTimeout(() => {
          this.beginReplay({
            ...newReplay,
            timeSight: activeReplay && activeReplay.timeSight,
          });
        });
      }

      return newState;
    });
  }

  editName(replay, name, beginReplay) {
    this.updateReplay(replay, {name}, beginReplay);
  }

  editPreflightCutoff(replay, preflightCutoff, beginReplay) {
    const snapshot = preflightCutoff > replay.tickCount * 0.99;
    this.updateReplay(replay, {preflightCutoff, snapshot}, beginReplay);
  }

  deleteReplay({timestamp}, name) {
    this.setState(({activeReplay, replays}) => {
      const newReplays = replays.filter((replay) => replay.timestamp !== timestamp);

      setTimeout(() => {
        saveField('replays', newReplays);
      });

      if (activeReplay && activeReplay.timestamp === timestamp) {
        setTimeout(() => this.stopReplay());
      }

      return {replays: newReplays};
    });
  }

  preflightCutoffTimeSightEnter() {
    window.game.preflightCutoffTimeSightEnter();
  }

  preflightCutoffTimeSightMoved(e, tickCount) {
    const mouseX = e.clientX;
    const {x, width} = e.target.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (mouseX - x) / width));
    const tick = Math.floor(percent * tickCount);

    if (this.preflightCutoffTimeSightTick === tick) {
      return;
    }

    this.preflightCutoffTimeSightTick = tick;
    window.game.preflightCutoffTimeSightMoved(tick);
  }

  preflightCutoffTimeSightLeave() {
    window.game.preflightCutoffTimeSightLeave();
    delete this.preflightCutoffTimeSightTick;
  }

  renderEditReplay(replay) {
    const {activeReplay} = this.state;

    return (
      <form onSubmit={(e) => {
        e.preventDefault();
        this.finishEdit(replay);
      }}
      >
        <input
          type="text"
          autoFocus
          value={replay.name}
          onChange={(e) => this.editName(replay, e.target.value)}
        />
        <span className="delete button" title="Delete replay" onClick={() => this.deleteReplay(replay)}>🚮</span>
        <br />
        <input
          type="range"
          min="0"
          max={replay.tickCount}
          value={replay.preflightCutoff}
          onChange={(e) => this.editPreflightCutoff(replay, e.target.value)}
          onMouseUp={() => this.beginReplay({
            ...replay,
            timeSight: activeReplay && activeReplay.timeSight,
          })}
          onMouseEnter={(e) => activeReplay && activeReplay.timeSight && activeReplay.timestamp === replay.timestamp && this.preflightCutoffTimeSightEnter()}
          onMouseMove={(e) => activeReplay && activeReplay.timeSight && activeReplay.timestamp === replay.timestamp && this.preflightCutoffTimeSightMoved(e, replay.tickCount)}
          onMouseLeave={(e) => activeReplay && activeReplay.timeSight && activeReplay.timestamp === replay.timestamp && this.preflightCutoffTimeSightLeave()}
        />
        {replay.preflightCutoff !== replay.originalPreflightCutoff && (
          <input
            type="button"
            onClick={(e) => {
              e.preventDefault();
              this.editPreflightCutoff(replay, replay.originalPreflightCutoff, true);
            }}
            value="⤺"
          />
        )}
      </form>
    );
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
                <span className="play button" title="Restart timeSight" onClick={() => this.beginReplay({...replay, timeSight: true})}>⚛</span>
              )}
              {activeReplay && !activeReplay.timeSight && activeReplay.timestamp === replay.timestamp && (
                <span className="play button" title="Restart replay" onClick={() => this.beginReplay(replay)}>📺</span>
              )}
              {(!activeReplay || activeReplay.timestamp !== replay.timestamp) && !replay.snapshot && (
                <span className="play button" title="Start replay" onClick={() => this.beginReplay(replay)}>▶️</span>
              )}
              {(!activeReplay || activeReplay.timestamp !== replay.timestamp) && replay.snapshot && (
                <span className="play button" title="Load snapshot (load state)" onClick={() => this.beginReplay(replay)}>🎆</span>
              )}
              {editing === replay.timestamp && (
                this.renderEditReplay(replay)
              )}
              <span className="name" onClick={() => this.beginReplay(replay)}>{replay.name}</span>
              <span className="edit button" title="Edit replay" onClick={() => this.setState({editing: replay.timestamp})}>ℹ</span>
            </li>
          ))}
        </ul>

      </div>
    );
  }
}
