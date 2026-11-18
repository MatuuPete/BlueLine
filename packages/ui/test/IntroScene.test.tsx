import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IntroScene } from '../src/components/IntroScene';

describe('IntroScene', () => {
  it('shows only the wordmark, the one line, the button and the slate', () => {
    render(
      <IntroScene
        theme="dark"
        paused={false}
        onTogglePause={() => {}}
        slate="Tonight · BOS @ NYK 7:30"
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('BlueLine');
    expect(screen.getByText('NBA player props, read against the line.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /enter the board/i })).toHaveAttribute('href', '/');
    expect(screen.getByText('Tonight · BOS @ NYK 7:30')).toBeInTheDocument();
  });

  it('pauses and resumes motion', () => {
    const onTogglePause = vi.fn();
    const { container, rerender } = render(
      <IntroScene theme="dark" paused={false} onTogglePause={onTogglePause} />,
    );
    expect(container.firstElementChild).toHaveAttribute('data-paused', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Pause motion' }));
    expect(onTogglePause).toHaveBeenCalledOnce();

    rerender(<IntroScene theme="light" paused onTogglePause={onTogglePause} />);
    expect(container.firstElementChild).toHaveAttribute('data-paused', 'true');
    expect(container.firstElementChild).toHaveAttribute('data-theme', 'light');
    expect(screen.getByRole('button', { name: 'Play motion' })).toBeInTheDocument();
  });

  it('streams a seamless, doubled run of bars', () => {
    const { container } = render(
      <IntroScene theme="dark" paused={false} onTogglePause={() => {}} />,
    );
    expect(container.querySelectorAll('[data-intro-bar]')).toHaveLength(144);
  });

  it('shows the theme toggle only when it can act', () => {
    const { rerender } = render(
      <IntroScene theme="dark" paused={false} onTogglePause={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /switch to/i })).not.toBeInTheDocument();
    rerender(
      <IntroScene theme="dark" paused={false} onTogglePause={() => {}} onToggleTheme={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });
});
