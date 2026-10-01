import { createRoot } from 'react-dom/client';
import App from './App';
import { installComposerMarquee } from '@/lib/composer-marquee';

import './index.css';
import './pre.css';
import './composer-marquee.css';
import './arc-video.css';
import './spinoff.css';

installComposerMarquee();

createRoot(document.getElementById('root')!).render(<App />);
