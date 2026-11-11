import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createSocket } from './socket';

const socket = createSocket();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App socket={socket} />
  </StrictMode>,
);
