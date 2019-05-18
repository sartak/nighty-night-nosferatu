import React from 'react';
import './Controls.css';

export default class Controls extends React.Component {
  render() {
    const {
      onMouseMove, volume, onVolumeChange, isFullscreen, enterFullscreen, exitFullscreen,
    } = this.props;
    return (
      <div id="controls" onMouseMove={onMouseMove}>
        <div className="volume">
          <span style={{fontSize: 20, transform: `scale(${0.5 + volume / 2})`}}>♫</span>
          &nbsp;&nbsp;
          <input
            type="range"
            min="0"
            max="100"
            value={volume * 100}
            onChange={(e) => onVolumeChange(e.target.value / 100)}
            onMouseUp={(e) => e.target.blur()}
          />
        </div>
        <div className="fullscreen">
          {isFullscreen ? (
            <div className="button" onClick={exitFullscreen}>
              <div className="label exit">╳</div>
            </div>
          ) : (
            <div className="button" onClick={enterFullscreen}>
              <div className="label enter">⇆</div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
