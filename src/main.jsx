import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/base.css';
import './styles/games.css';
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <main className="app-shell"><h1>页面暂时无法加载</h1><p>请刷新页面重试。</p><button onClick={() => location.reload()}>重新加载</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
// The preserved canvas engines are page-scoped. Reload on shell HMR to clean up global input listeners.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
