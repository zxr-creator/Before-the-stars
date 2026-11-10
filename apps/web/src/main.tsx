import { render } from 'preact';
import './styles.css';
import './theme/chrome.css';
import './theme/title.css';
import { App } from './app';

render(<App />, document.getElementById('app')!);
