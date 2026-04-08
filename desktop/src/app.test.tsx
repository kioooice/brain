import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('shows the desktop loading shell', () => {
    render(<App />);

    expect(screen.getByText('Loading Brain Desktop...')).toBeInTheDocument();
  });
});
