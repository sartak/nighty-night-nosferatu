import {hot} from 'react-hot-loader/root';
import React from 'react';
import Development from './Development';
import Production from './Production';

class App extends React.Component {
  render() {
    const {debug} = this.props;
    const Layout = debug ? Development : Production;

    return <Layout />;
  }
}

export default hot(App);
