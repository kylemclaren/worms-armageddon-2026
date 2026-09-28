import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './engine/layers.css';
import './styles/game.css';
import App from './App';
import { boot } from './engine/controller.js';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
boot();
