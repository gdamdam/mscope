/**
 * The "mscope" wordmark in Unicode block-art. Rendered inside a <pre> so the
 * glyphs stay flush (no letter-spacing / line-height gaps would split them); the
 * <pre> is aria-hidden and the accessible heading name comes from the
 * visually-hidden span, so screen readers announce "mscope", not block symbols.
 */
const WORDMARK = "▛▛▌▛▘▛▘▛▌▛▌█▌\n▌▌▌▄▌▙▖▙▌▙▌▙▖\n         ▌";

export function Logo(): JSX.Element {
  return (
    <h1 className="scope__title">
      <pre className="scope__logo" aria-hidden="true">{WORDMARK}</pre>
      <span className="visually-hidden">mscope</span>
      <span className="scope__version">v{__APP_VERSION__}</span>
    </h1>
  );
}
