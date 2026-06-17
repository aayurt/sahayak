import { render } from 'solid-js/web'
import { Router } from '@solidjs/router'
import { App } from './App'
import './styles/globals.css'

const root = document.getElementById('root')
if (root) {
  render(
    () => (
      <Router>
        <App />
      </Router>
    ),
    root,
  )
}
