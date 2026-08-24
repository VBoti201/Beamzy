import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './global.css'

// Set before the first paint (splash screen included) so launching in light
// mode never flashes dark first — App's own theme effect only runs once
// getConfig() resolves, which is well after this.
document.documentElement.dataset.theme = window.api.getInitialTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
