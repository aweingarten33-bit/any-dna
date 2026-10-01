import { createRoot } from 'react-dom/client';
import App from './App';
import { installComposerMarquee } from '@/lib/composer-marquee';

import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './index.css';
import './pre.css';
import './composer-marquee.css';
import './arc-video.css';
import './spinoff.css';

installComposerMarquee();

createRoot(document.getElementById('root')!).render(<App />);
