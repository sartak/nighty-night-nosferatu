import React from 'react';
import './Production.css';
import Engine from './Engine';

export default class Embed extends React.Component {
  render() {
    return (
      <div className="production embed">
        <Engine disableFullscreen />
      </div>
    );
  }
}
