import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createConnection, websocketUrl } from './net/client';
import { clientStore } from './store';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing app root element');

const connection = createConnection({
  store: clientStore,
  WebSocket,
  url: websocketUrl(window.location),
});
connection.start();
import.meta.hot?.dispose(() => connection.stop());
createRoot(root).render(
  <StrictMode>
    <App send={connection.send} />
  </StrictMode>,
);
