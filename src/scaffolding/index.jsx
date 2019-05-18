import React from 'react';
import ReactDOM from 'react-dom';
import './base.css';
import App from './App';

const debug = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

ReactDOM.render(<App debug={debug} />, document.getElementById('root'));
