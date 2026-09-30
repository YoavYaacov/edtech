import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import CodeEditor from '../CodeEditor';

describe('CodeEditor languages', () => {
  it('renders C# code with syntax tokens (legacy-modes clike)', async () => {
    const { container } = render(<CodeEditor value={'public class A { static void Main() { int x = 1; } }'} language="csharp" readOnly label="c#" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('.cm-content').textContent).toContain('class A');
  });
  it('still renders Java', async () => {
    const { container } = render(<CodeEditor value={'public class A {}'} language="java" readOnly label="java" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('.cm-content').textContent).toContain('class A');
  });
});
