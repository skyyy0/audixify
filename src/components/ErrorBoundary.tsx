import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected interface error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Audixify UI boundary caught error:', error, info);
  }

  handleRecover = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[#EAEAE5] dark:bg-[#07080B] text-zinc-900 dark:text-zinc-100">
          <div className="max-w-md w-full rounded-[28px] ios-glass p-7 text-center space-y-4">
            <h1 className="font-display text-xl font-bold">Playback view interrupted</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{this.state.message}</p>
            <button
              type="button"
              onClick={this.handleRecover}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF4D2E] text-white text-sm font-semibold hover:bg-[#E63E21] active:scale-95 transition-transform"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Restore Audixify</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
