import { render } from 'preact';
import './styles.css';
import './theme/chrome.css';
import './theme/title.css';
import { App } from './app';
import { mountSaves } from './saves';

render(<App />, document.getElementById('app')!);
// the storage manager and the autosave warning sit beside the app, over any screen
mountSaves();
