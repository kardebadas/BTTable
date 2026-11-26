import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LABELS } from '../labels';
import { Pagination, type PaginationProps } from './Pagination';

afterEach(cleanup);

function setup(props: Partial<PaginationProps> = {}) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  const all: PaginationProps = {
    labels: DEFAULT_LABELS,
    page: 2,
    pageCount: 5,
    pageSize: 25,
    pageSizeOptions: [25, 50, 100],
    onPageChange,
    onPageSizeChange,
    ...props,
  };
  render(<Pagination {...all} />);
  return { onPageChange, onPageSizeChange, user: userEvent.setup() };
}

const pageInput = () => screen.getByRole('spinbutton', { name: 'Page' });

describe('Pagination', () => {
  it('is a labelled nav with real buttons and the page count', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    expect(nav).toHaveTextContent('of 5');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(pageInput()).toHaveValue(2);
    expect(pageInput()).toHaveAttribute('min', '1');
    expect(pageInput()).toHaveAttribute('max', '5');
  });

  it('moves with the previous and next buttons, disabled at the ends', async () => {
    const { onPageChange, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    cleanup();
    setup({ page: 1, pageCount: 1 });
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('commits a typed page on Enter or blur, clamped into range', async () => {
    const { onPageChange, user } = setup();
    await user.clear(pageInput());
    await user.type(pageInput(), '4{Enter}');
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    await user.clear(pageInput());
    await user.type(pageInput(), '99');
    await user.tab();
    expect(onPageChange).toHaveBeenLastCalledWith(5);
    expect(pageInput()).toHaveValue(2);
    await user.clear(pageInput());
    await user.type(pageInput(), '-3{Enter}');
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('ignores an empty or unchanged page', async () => {
    const { onPageChange, user } = setup();
    await user.clear(pageInput());
    await user.tab();
    expect(pageInput()).toHaveValue(2);
    await user.clear(pageInput());
    await user.type(pageInput(), '2{Enter}');
    expect(onPageChange).not.toHaveBeenCalled();
    expect(pageInput()).toHaveValue(2);
  });

  it('does not submit a surrounding form on Enter', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const onPageChange = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <Pagination
          labels={DEFAULT_LABELS}
          page={1}
          pageCount={5}
          pageSize={25}
          pageSizeOptions={[25]}
          onPageChange={onPageChange}
          onPageSizeChange={() => {}}
        />
        <button type="submit">Save</button>
      </form>,
    );
    const user = userEvent.setup();
    await user.clear(pageInput());
    await user.type(pageInput(), '3{Enter}');
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('lists each page size once', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({ pageSize: 25, pageSizeOptions: [50, 25, 50, 25] });
    const select = screen.getByRole('combobox', { name: 'Rows per page' });
    expect(Array.from(select.querySelectorAll('option')).map((option) => option.value)).toEqual(['50', '25']);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('changes the page size with a labelled select of numbers, adding the current size when missing', async () => {
    const { onPageSizeChange, user } = setup({ pageSize: 10, pageSizeOptions: [25, 50, 0, 2.5] });
    const select = screen.getByRole('combobox', { name: 'Rows per page' });
    expect(Array.from(select.querySelectorAll('option')).map((option) => option.value)).toEqual(['10', '25', '50']);
    expect(select).toHaveValue('10');
    await user.selectOptions(select, '50');
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('uses the labels', () => {
    setup({ labels: { ...DEFAULT_LABELS, pagination: 'Páginas', pageOf: 'de {count}', nextPage: 'Seguinte' } });
    expect(screen.getByRole('navigation', { name: 'Páginas' })).toHaveTextContent('de 5');
    expect(screen.getByRole('button', { name: 'Seguinte' })).toBeInTheDocument();
  });
});

describe('Pagination wheel safety', () => {
  it('blurs the focused page input on wheel, so the page never steps, without cancelling the scroll', () => {
    const { onPageChange } = setup();
    const input = pageInput();
    input.focus();
    expect(fireEvent.wheel(input, { deltaY: -100 })).toBe(true);
    expect(input).not.toHaveFocus();
    expect(input).toHaveValue(2);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('ignores the wheel while the page input is not focused', () => {
    setup();
    const next = screen.getByRole('button', { name: DEFAULT_LABELS.nextPage });
    next.focus();
    fireEvent.wheel(pageInput());
    expect(next).toHaveFocus();
  });
});
