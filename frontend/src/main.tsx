import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root was not found in index.html.');

// Under XAMPP the SPA is served from /sih26108-project/ (VITE_BASE_PATH), so the
// router must strip that prefix or every deep link would render NotFound.
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
