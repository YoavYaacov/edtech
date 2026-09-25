import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import styles from './Markdown.module.css';

// Safe Markdown + math (decision 51: LaTeX inside Markdown, rendered by KaTeX).
//  * $...$ inline math, $$...$$ display math. A literal dollar sign: \$
//  * Raw HTML is still skipped, so user text can never inject markup.
//  * Code blocks and inline code are untouched (math is parsed only in text).
//  * Math is LTR and bidi-isolated inside RTL Hebrew text; prose stays RTL.
//  * Invalid LaTeX renders as a small error mark instead of breaking the page.
const remarkPlugins = [remarkMath];
const rehypePlugins = [[rehypeKatex, { throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' }]];

const components = {
  pre: ({ children }) => <pre className={styles.pre} dir="ltr">{children}</pre>,
  code: ({ children, className }) => <code className={className} dir="ltr">{children}</code>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
};

export default function Markdown({ children, empty = null }) {
  if (!children || !children.trim()) return empty;
  return (
    <div className={styles.md}>
      <ReactMarkdown skipHtml remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
