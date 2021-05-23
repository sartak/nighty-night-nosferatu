import {hot} from 'react-hot-loader/root';
import React from 'react';
import Development from './Development';
import Production from './Production';
import Embed from './Embed';
import {productionDisplay} from '../../package.json';

class App extends React.Component {
  render() {
    const {debug} = this.props;

    if (productionDisplay.embed) {
      return <Embed />;
    } else if (debug) {
      return <Development />;
    } else {
      return <Production />;
    }
  }
}

export default hot(App);
