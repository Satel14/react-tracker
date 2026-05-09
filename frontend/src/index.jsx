import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import RouterLayout from './router/RouterLayout';
import { BrowserRouter } from 'react-router-dom';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RouterLayout />
    </BrowserRouter>
  </React.StrictMode>
);
