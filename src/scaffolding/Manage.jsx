import React from 'react';
import './Manage.css';
import gui from './lib/manage-gui';

export default class Manage extends React.Component {
  constructor(props) {
    super(props);
    this.ref = React.createRef();
  }

  componentDidMount() {
    this.ref.current.append(gui.domElement);
  }

  render() {
    return (
      <div className="Manage">
        <div ref={this.ref} />
      </div>
    );
  }
}
