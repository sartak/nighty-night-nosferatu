import React from 'react';
import './Logging.css';
import {saveField, loadField} from './lib/store';

export default class Logging extends React.Component {
  constructor(props) {
    super(props);
    const log = loadField('log', []).map((line) => ({...line, recent: false, old: true}));
    this.state = {
      log,
    };
    this.logId = 1 + Number(log.map(({id}) => id).reduce((a, b) => (a > b ? a : b), 0));
    this.timers = [];
    this.ref = React.createRef();
  }

  componentDidMount() {
    this.original = {};
    const component = this;
    ['trace', 'debug', 'log', 'info', 'warn', 'error'].forEach((level) => {
      // eslint-disable-next-line no-console
      const original = this.original[level] = console[level];
      // eslint-disable-next-line no-console
      console[level] = function(...args) {
        const context = component.extractContext(...args);
        component.prependLog(args.join(' '), level, context);
        return original(...args);
      };
    });
  }

  componentDidUpdate(prevProps) {
    const {game} = this.props;
    if (!prevProps.game && game) {
      game.onDisableDebugUI(() => {
        this.removeLogging();
      });
    }
  }

  componentWillUnmount() {
    this.removeLogging();
  }

  removeLogging() {
    this.timers.forEach((timer) => {
      clearTimeout(timer);
    });

    Object.entries(this.original).forEach(([level, original]) => {
      // eslint-disable-next-line no-console
      console[level] = original;
    });
  }

  extractContext(msg) {
    if (msg instanceof Error) {
      const {stack} = msg;
      const match = stack.match(/ at (\w+) \(http/);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  prependLog(originalMsg, level, context) {
    const msg = originalMsg.replace(/^Error: /, '');

    if (msg.match(/https:\/\/phaser\.io/)) {
      return;
    }

    const id = (this.logId += 1);

    {
      const timer = setTimeout(() => {
        this.setState(({log}) => ({
          log: log.map((line) => (line.id === id ? {...line, recent: true} : line)),
        }));
      }, 500);

      this.timers.push(timer);
    }

    {
      const timer = setTimeout(() => {
        this.setState(({log}) => ({
          log: log.map((line) => (line.id === id ? {...line, recent: false, old: true} : line)),
        }));
      }, 5000);

      this.timers.push(timer);
    }

    this.ref.current.scrollTop = 0;

    this.setState(({log}) => {
      const newLog = [
        {
          msg, level, id, context,
        },
        ...log.filter((_, n) => n < 19),
      ];

      setTimeout(() => {
        saveField('log', newLog);
      });

      return {
        log: newLog,
      };
    });
  }

  render() {
    const {log} = this.state;
    return (
      <div className="Logging" ref={this.ref}>
        <ol>
          {log.map(({
            msg, level, id, recent, old, context,
          }) => (
            <li key={id} className={`${level} ${recent ? 'recent' : ''} ${old ? 'old' : ''}`}>
              <span className="level">{level}</span>
              <span className="msg">{msg}</span>
              {context && (
                <span className="context">
                  {context}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  }
}
