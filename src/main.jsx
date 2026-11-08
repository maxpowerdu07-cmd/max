import React from 'react';
import { createRoot } from 'react-dom/client';
import './storageShim.js';
import App from './DrydockSafetyDemo.jsx';

createRoot(document.getElementById('root')).render(<App />);
