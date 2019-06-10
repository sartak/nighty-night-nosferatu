import React from 'react';
import './Manage.css';
import gui, {updateSearch} from './lib/manage-gui';

export default class Manage extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      search: '',
    };

    this.ref = React.createRef();
  }

  componentDidMount() {
    this.ref.current.append(gui.domElement);
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
            this.setState({search: e.target.value});
            updateSearch(e.target.value);
          }}
        />
        <div className={search === '' ? '' : 'searching'} ref={this.ref} />
      </div>
    );
  }
}
