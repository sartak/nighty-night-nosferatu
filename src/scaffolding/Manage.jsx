import React from 'react';
import './Manage.css';
import {initializeManage, updateSearch, serializeChangedProps, resetChangedProps} from './lib/manage-gui';

export default class Manage extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      search: '',
    };

    this.ref = React.createRef();
  }

  componentDidMount() {
    const gui = initializeManage();
    this.ref.current.append(gui.domElement);
  }

  copyChangedProps() {
    const tempNode = document.createElement('textarea');
    tempNode.value = serializeChangedProps();
    document.body.appendChild(tempNode);
    tempNode.select();
    document.execCommand('copy');
    document.body.removeChild(tempNode);
  }

  render() {
    const {search} = this.state;
    return (
      <div className="Manage">
        <input
          type="search"
          className="search"
          placeholder="Filter props…"
          value={search}
          onChange={(e) => {
            // eslint-disable-next-line react/destructuring-assignment
            const isStarted = this.state.search === '';
            this.setState({search: e.target.value});
            updateSearch(e.target.value, isStarted);
          }}
        />
        <input
          type="button"
          className="copy"
          value="Copy changes"
          onClick={() => this.copyChangedProps()}
        />
        <input
          type="button"
          className="reset"
          value="Reset to saved"
          onClick={() => resetChangedProps()}
        />
        <div className={search === '' ? '' : 'searching'} ref={this.ref} />
      </div>
    );
  }
}
