'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error capturado por ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="p-8 border border-danger rounded-2xl bg-surface text-center">
          <Icon name="cancel" size={32} className="mx-auto text-danger mb-4" />
          <h3 className="text-lg font-bold text-ink">Algo salió mal</h3>
          <p className="text-sm text-muted mt-2 mb-4 break-words">
            {this.state.error?.message ?? 'Error desconocido.'}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="px-4 py-2 bg-accent text-accent-on rounded-lg text-sm font-semibold hover:bg-accent-ink transition-colors"
          >
            Recargar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}