import { useFileUrl } from '../../hooks/useFileUrl';

/**
 * An <img> for a stored file's URL. Files served by the API need the session header, so the picture arrives a moment
 * after the first render; until then (or if it cannot be loaded) an empty box of the same classes is shown.
 */
export default function StoredImage({ url, alt = '', className = '', placeholderClassName = '', ...rest }) {
  const src = useFileUrl(url);
  if (!src) return <span role="img" aria-label={alt} className={`inline-block bg-ink-500/10 dark:bg-white/10 ${className} ${placeholderClassName}`} />;
  return <img src={src} alt={alt} className={className} {...rest} />;
}
