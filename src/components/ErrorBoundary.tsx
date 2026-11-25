import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Props of `ErrorBoundary`. */
export type ErrorBoundaryProps = {
  children: ReactNode;
  /** Rendered in place of `children` after a render error. */
  fallback: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Changing it clears a caught error and renders `children` again. */
  resetKey?: unknown;
};

type ErrorBoundaryState = { error: Error | null };

/** The package error boundary: shows `fallback` after a render error and reports it to `onError`. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  /**
   * Clears an error that was already showing before this update once `resetKey` changes.
   * The update that catches an error is skipped, or a child that just threw would re-throw.
   */
  componentDidUpdate(previous: ErrorBoundaryProps, previousState: ErrorBoundaryState): void {
    if (!previousState.error || !this.state.error) return;
    if (!Object.is(previous.resetKey, this.props.resetKey)) this.setState({ error: null });
  }

  render(): ReactNode {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
