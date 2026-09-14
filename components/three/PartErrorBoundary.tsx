'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  category?: string
  onError?: (category: string, error: Error) => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class PartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[PartErrorBoundary] Failed to load part:', error.message, errorInfo)

    // Notify parent component of error
    if (this.props.onError && this.props.category) {
      this.props.onError(this.props.category, error)
    }
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      // Return custom fallback or default error UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI with retry button
      return (
        <group>
          {/* Invisible placeholder to prevent scene corruption */}
          <mesh position={[0, 0, 0]} visible={false}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        </group>
      )
    }

    return this.props.children
  }
}
