import { Component } from 'react';

/**
 * Глобальний запобіжник рендеру. Перехоплює винятки в дереві React,
 * щоб одна помилка не гасила весь застосунок, і показує екран відновлення.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('NutriSnap render error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '24px',
          textAlign: 'center',
          background: '#0b0f19',
          color: '#e5e7eb',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
      >
        <div style={{ fontSize: '44px' }}>⚠️</div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
          Щось пішло не так
        </h1>
        <p style={{ fontSize: '14px', maxWidth: '320px', color: '#9ca3af', margin: 0 }}>
          Застосунок наштовхнувся на помилку. Ваші збережені дані не втрачені.
          Спробуйте перезавантажити сторінку.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            marginTop: '8px',
            padding: '12px 24px',
            borderRadius: '12px',
            border: 'none',
            background: '#10b981',
            color: '#04221a',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Перезавантажити
        </button>
      </div>
    );
  }
}
