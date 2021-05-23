import React from 'react';

export default class Spinner extends React.Component {
  render() {
    return (
      <div id="lds-spinner">
        <div className="lds-spinner">
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
        </div>
      </div>
    );
  }
}
