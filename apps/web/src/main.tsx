import { render } from 'preact';
import './styles.css';
import './theme/chrome.css';
import './theme/title.css';
import { App } from './app';
import { mountSaves } from './saves';
import { installAudio } from './audio';

render(<App />, document.getElementById('app')!);
// the storage manager and the autosave warning sit beside the app, over any screen
mountSaves();
// music and interface sounds: nothing loads or plays before the first click or key press
installAudio();
