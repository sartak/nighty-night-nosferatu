import React from 'react';
import './Replay.css';
import {saveField, loadField} from './lib/store';
import DoubleEnder from './DoubleEnder';

const ReplayEditFields = [
  'metadata', // must be first
  'commands',
  'sceneSaveState',
  'sceneTransitions',
];

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

      if (!('postflightCutoff' in replay)) {
        replay.postflightCutoff = replay.tickCount;
      }
    });

    this.state = {
      replays,
      activeRecording: null,
      activeReplay: loadField('activeReplay', null),
      tweaking: loadField('tweaking', null),
      editing: loadField('editing', null),
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
        this.setActiveReplay(replay);
      }
    };

    game.onReplayEnd = (replay) => {
      const {repeat} = this.state;

      if (repeat && !replay.snapshot) {
        setTimeout(() => {
          this.beginReplay(this.state.activeReplay);
        });
      } else {
        this.setActiveReplay(null);
      }
    };

    game.onReplayStop = (replay) => {
      this.setActiveReplay(null);
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

  beginReplay(replay, clearOtherEditing) {
    const {activateGame} = this.props;
    const {editing} = this.state;
    activateGame(() => {
      const {activeReplay} = this.state;
      let transition;

      if (activeReplay) {
        if (activeReplay.timestamp === replay.timestamp && !activeReplay.timeSight && replay.timeSight) {
          transition = window.game.topScene()._replayLatestTransition;
        }

        window.game.stopReplay();
      }

      if (clearOtherEditing && editing !== replay.timestamp) {
        this.setEditing(null);
      }

      window.game.beginReplay(replay, {
        startFromTransition: transition,
      });
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
    this.beginReplay({...activeReplay, timeSight: !activeReplay.timeSight}, true);
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

  saveReplays() {
    setTimeout(() => {
      const {replays, activeReplay, editing} = this.state;
      saveField('replays', replays);
      saveField('editing', editing);
      saveField('activeReplay', activeReplay);
    });
  }

  finishEdit(replay, skipFocus) {
    this.setEditing(null);
    this.saveReplays();
  }

  setEditing(editing) {
    this.setState({editing});
    saveField('editing', editing);
  }

  setActiveReplay(activeReplay) {
    this.setState({activeReplay});
    saveField('activeReplay', activeReplay);
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
    const snapshot = preflightCutoff > replay.postflightCutoff * 0.99;
    this.updateReplay(replay, {preflightCutoff, snapshot}, beginReplay);
  }

  editPostflightCutoff(replay, postflightCutoff, beginReplay) {
    const snapshot = replay.preflightCutoff > postflightCutoff * 0.99;
    this.updateReplay(replay, {postflightCutoff, snapshot}, beginReplay);
  }

  editCutoffs(replay, preflightCutoff, postflightCutoff, beginReplay) {
    const snapshot = preflightCutoff > postflightCutoff * 0.99;
    this.updateReplay(replay, {preflightCutoff, postflightCutoff, snapshot}, beginReplay);
  }

  deleteReplay({timestamp}) {
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

  copyReplay(replay) {
    const newReplay = {
      ...replay,
      timestamp: Date.now(),
      name: `Copy of ${replay.name}`,
    };

    this.setState(({replays}) => {
      const newReplays = [newReplay, ...replays];

      setTimeout(() => {
        saveField('replays', newReplays);
      });

      return {replays: newReplays};
    });
  }

  cutoffTimeSightEnter() {
    window.game.cutoffTimeSightEnter();
  }

  cutoffTimeSightChanged(start, end) {
    window.game.cutoffTimeSightChanged(start, end);
  }

  cutoffTimeSightLeave() {
    window.game.cutoffTimeSightLeave();
  }

  renderEditReplay(replay) {
    const {activeReplay} = this.state;
    let highlight1 = null;
    let highlight2 = null;

    const {game} = window;
    const scene = game && game.topScene();
    let cursor = scene && scene.command ? scene.command.replayTicks : null;

    if (activeReplay && activeReplay.timestamp !== replay.timestamp) {
      cursor = null;
    }

    if (activeReplay && activeReplay.timestamp === replay.timestamp && activeReplay.timeSight) {
      cursor = null;

      const {sceneTransitions} = replay;
      if (!sceneTransitions || sceneTransitions.length === 0) {
        highlight1 = replay.preflightCutoff;
        highlight2 = replay.postflightCutoff;
      } else {
        const latestTransition = scene && scene._replayLatestTransition;
        if (!scene) {
          // if we haven't rendered yet, the default is preflightCutoff until the next scene transition
          highlight1 = replay.preflightCutoff;
          for (let i = 0; i < sceneTransitions.length; i += 1) {
            if (sceneTransitions[i].tickCount > highlight1) {
              highlight2 = Math.min(replay.postflightCutoff, sceneTransitions[i].tickCount);
              break;
            }
          }
        } else if (!latestTransition) {
          // no transition yet, so take the first segment
          highlight1 = replay.preflightCutoff;
          highlight2 = Math.min(replay.postflightCutoff, sceneTransitions[0].tickCount);
        } else {
          // take the intersection of the scene's ticks and pre/post flight
          const firstTick = latestTransition ? (latestTransition.tickCount || 0) : 0;
          let lastTick = replay.postflightCutoff;

          highlight1 = Math.max(firstTick, replay.preflightCutoff);

          for (let i = 0; i < sceneTransitions.length; i += 1) {
            if (sceneTransitions[i].tickCount >= firstTick) {
              if (i + 1 < sceneTransitions.length) {
                lastTick = sceneTransitions[i + 1].tickCount;
              }
              break;
            }
          }

          highlight2 = Math.min(lastTick, replay.postflightCutoff);
        }
      }

      if (highlight1 > highlight2) {
        highlight1 = highlight2 = null;
      }
    }

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
        <span className="play button" title="Load snapshot (load state)" onClick={() => this.beginReplay({...replay, snapshot: true, commands: []})}>🎆</span>
        <span className="tweak button" title="Tweak replay" onClick={() => this.tweakReplay(replay)}>ℹ</span>
        <span className="copy button" title="Copy replay" onClick={() => this.copyReplay(replay)}>🔃</span>
        <span className="delete button" title="Delete replay" onClick={() => this.deleteReplay(replay)}>🚮</span>
        <span className="detail">
          {replay.preflightCutoff}
-
          {replay.postflightCutoff}
          {replay.postflightCutoff !== replay.tickCount && ` / ${replay.tickCount}`}
        </span>
        <br />
        <DoubleEnder
          min={0}
          max={replay.tickCount}
          value1={replay.preflightCutoff}
          value2={replay.postflightCutoff}
          highlight1={highlight1}
          highlight2={highlight2}
          cursor={cursor}
          notches={(replay.sceneTransitions || []).map((t) => ({value: t.tickCount, title: 'Scene transition'}))}
          replayTimestamp={replay.timestamp}
          onMouseEnter={(e) => {
            this._inCutoffs = true;
            if (activeReplay && activeReplay.timeSight && activeReplay.timestamp === replay.timestamp) {
              this.cutoffTimeSightEnter();
            }
          }}
          onMouseLeave={(e) => {
            this._inCutoffs = false;
            if (activeReplay && activeReplay.timeSight && activeReplay.timestamp === replay.timestamp) {
              if (!this._changingCutoffs) {
                this.cutoffTimeSightLeave();
              }
              this.saveReplays();
            }
          }}
          onBeginChange={(e) => {
            this._changingCutoffs = true;
          }}
          onEndChange={(e) => {
            this._changingCutoffs = false;

            if (activeReplay && activeReplay.timeSight && activeReplay.timestamp === replay.timestamp) {
              if (!this._inCutoffs) {
                this.cutoffTimeSightLeave();
              }
              this.saveReplays();
            } else {
              setTimeout(() => {
                const {replays} = this.state;
                const newReplay = replays.find((r) => r.timestamp === replay.timestamp);
                this.beginReplay(newReplay);
                this.saveReplays();
              });
            }
          }}
          onChange1={(preflight) => {
            this.editPreflightCutoff(replay, Math.floor(preflight));
            if (activeReplay && activeReplay.timeSight && activeReplay.timestamp === replay.timestamp) {
              setTimeout(() => {
                this.cutoffTimeSightChanged(Math.floor(preflight), this.state.activeReplay.postflightCutoff);
              });
            }
          }}
          onChange2={(postflight) => {
            this.editPostflightCutoff(replay, Math.floor(postflight));
            if (activeReplay && activeReplay.timeSight && activeReplay.timestamp === replay.timestamp) {
              setTimeout(() => {
                this.cutoffTimeSightChanged(this.state.activeReplay.preflightCutoff, Math.floor(postflight));
              });
            }
          }}
        />
        {(replay.preflightCutoff !== replay.originalPreflightCutoff || replay.postflightCutoff !== replay.tickCount) && (
          <input
            type="button"
            onClick={(e) => {
              e.preventDefault();
              this.editCutoffs(replay, replay.originalPreflightCutoff, replay.tickCount, true);
            }}
            value="⤺"
          />
        )}
      </form>
    );
  }

  tweakReplay(replay) {
    const metadata = {...replay};
    const tweaking = {replay};
    ReplayEditFields.forEach((field) => {
      if (field !== 'metadata') {
        tweaking[field] = JSON.stringify(metadata[field], null, 2);
        delete metadata[field];
      }
    });
    tweaking.metadata = JSON.stringify(metadata, null, 2);

    ReplayEditFields.forEach((field) => {
      tweaking[`${field}_original`] = tweaking[field];
    });

    this.setState({tweaking});
    saveField('tweaking', tweaking);
  }

  updateTweak(field, value) {
    this.setState(({tweaking}) => {
      const t = {
        ...tweaking,
        [field]: value,
        [`${field}_error`]: null,
        [`${field}_changed`]: value !== tweaking[`${field}_original`],
      };

      setTimeout(() => saveField('tweaking', t));

      return {tweaking: t};
    });
  }

  revertTweak(field) {
    // eslint-disable-next-line react/destructuring-assignment
    this.updateTweak(field, this.state.tweaking[`${field}_original`]);
  }

  discardTweaks() {
    setTimeout(() => { saveField('tweaking', null); });
    this.setState({
      tweaking: null,
    });
  }

  saveTweaks() {
    this.setState(({tweaking}) => {
      let replay;
      let sawError = false;
      const newState = {...tweaking};

      ReplayEditFields.forEach((field) => {
        try {
          const value = JSON.parse(tweaking[field]);
          if (field === 'metadata') {
            replay = value;
          } else {
            if (replay) {
              replay[field] = value;
            }
          }

          newState[`${field}_error`] = null;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(e);
          sawError = true;
          newState[`${field}_error`] = e.toString();
        }
      });

      if (sawError) {
        setTimeout(() => { saveField('tweaking', newState); });
        return {tweaking: newState};
      } else {
        setTimeout(() => {
          this.updateReplay(tweaking.replay, replay, false);
          setTimeout(() => { saveField('tweaking', null); });
        });

        return {tweaking: null};
      }
    });
  }

  renderTweaking() {
    const {tweaking} = this.state;

    return (
      <div className="Replay tweaking">
        <div className="controls tweaking">
          <span className="button" title="Cancel tweaks" onClick={() => this.discardTweaks()}>🚮</span>
          <span className="button" title="Save tweaks" onClick={() => this.saveTweaks()}>🆙</span>
        </div>
        <div className="fields">
          {ReplayEditFields.map((field) => (
            <div key={field} className={`field ${tweaking[`${field}_error`] ? 'error' : ''} ${tweaking[`${field}_changed`] ? 'changed' : ''}`}>
              <label>
                {field}
                {' '}
                <span style={{visibility: tweaking[`${field}_changed`] ? 'visible' : 'hidden'}} className="button" title="Discard these tweaks" onClick={() => this.revertTweak(field)}>🚮</span>
              </label>
              {tweaking[`${field}_error`] && (
                <span className="info">{tweaking[`${field}_error`]}</span>
              )}
              <textarea value={tweaking[field]} onChange={(e) => this.updateTweak(field, e.target.value)} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  render() {
    const {
      replays, activeRecording, activeReplay, editing, repeat, tweaking,
    } = this.state;

    if (tweaking) {
      return this.renderTweaking();
    }

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
                <span className="play button" title="Restart timeSight" onClick={() => this.beginReplay({...replay, timeSight: true}, true)}>⚛</span>
              )}
              {activeReplay && !activeReplay.timeSight && activeReplay.timestamp === replay.timestamp && (
                <span className="play button" title="Restart replay" onClick={() => this.beginReplay(replay, true)}>📺</span>
              )}
              {(!activeReplay || activeReplay.timestamp !== replay.timestamp) && !replay.snapshot && (
                <span className="play button" title="Start replay" onClick={() => this.beginReplay(replay, true)}>▶️</span>
              )}
              {(!activeReplay || activeReplay.timestamp !== replay.timestamp) && replay.snapshot && (
                <span className="play button" title="Load snapshot (load state)" onClick={() => this.beginReplay(replay, true)}>🎆</span>
              )}
              {editing === replay.timestamp && (
                this.renderEditReplay(replay)
              )}
              <span className="name" onClick={() => this.beginReplay(replay, true)}>{replay.name}</span>
              <span className="edit button" title="Edit replay" onClick={() => this.setEditing(replay.timestamp)}>ℹ</span>
            </li>
          ))}
        </ul>

      </div>
    );
  }
}
