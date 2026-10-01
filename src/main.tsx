import { createRoot } from 'react-dom/client';
import App from './App';

import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './index.css';
import './pre.css';
import './arc-video.css';
import './spinoff.css';
import './exercise.css';

createRoot(document.getElementById('root')!).render(<App />);
