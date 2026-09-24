import ReactMarkdown from 'react-markdown';
import styles from './Markdown.module.css';

// Safe Markdown: raw HTML is skipped, so user text can never inject markup.
// Code blocks are LTR; prose stays RTL.
const components = {
  pre: ({ children }) => <pre className={styles.pre} dir="ltr">{children}</pre>,
  code: ({ children, className }) => <code className={className} dir="ltr">{children}</code>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
};

export default function Markdown({ children, empty = null }) {
  if (!children || !children.trim()) return empty;
  return (
    <div className={styles.md}>
      <ReactMarkdown skipHtml components={components}>{children}</ReactMarkdown>
    </div>
  );
}
