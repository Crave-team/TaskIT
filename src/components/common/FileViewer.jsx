import { useEffect, useState } from 'react';
import { Download, File, FileText, FileImage, FileSpreadsheet, FileArchive, Eye } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import StoredImage from './StoredImage';
import { useApi } from '../../context/ApiContext';
import { useFileUrl } from '../../hooks/useFileUrl';
import { readFileText, resolveFileUrl } from '../../api/protectedUrl';

const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'log', 'xml', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'yml', 'yaml'];
const MAX_TEXT_PREVIEW = 20000;

/** Largest single file the mock uploader accepts (files stay in the browser). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const extOf = (name = '') => name.split('.').pop()?.toLowerCase() || '';

/** What kind of in-app preview a stored file supports. */
export function previewKindOf(file) {
  if (!file?.url) return null;
  const ext = extOf(file.name);
  if (file.mime?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (file.mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (file.mime?.startsWith('text/') || TEXT_EXTENSIONS.includes(ext)) return 'text';
  return 'none';
}

export function iconForFile(file) {
  const ext = extOf(file?.name);
  if (previewKindOf(file) === 'image') return FileImage;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['zip', 'rar', '7z'].includes(ext)) return FileArchive;
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return FileText;
  return File;
}

export function formatBytes(bytes) {
  if (typeof bytes === 'string') return bytes;
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Turns the files from an <input type="file"> / drop event into a plain array right away
 * (the live FileList is emptied as soon as the input is reset) and splits out the ones
 * that are too large.
 * @returns {{ accepted: File[], rejected: File[] }}
 */
export function collectFiles(fileList) {
  const all = Array.from(fileList || []);
  return {
    accepted: all.filter((f) => f.size <= MAX_FILE_BYTES),
    rejected: all.filter((f) => f.size > MAX_FILE_BYTES),
  };
}

/** Saves a stored file. Rejects with a readable message if it cannot be fetched (callers show it). */
export async function downloadFile(file) {
  if (!file?.url) return;
  const link = document.createElement('a');
  link.href = await resolveFileUrl(file.url);
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function Preview({ file }) {
  const kind = previewKindOf(file);
  const [text, setText] = useState(null);
  const src = useFileUrl(file.url);

  useEffect(() => {
    if (kind !== 'text') return undefined;
    let cancelled = false;
    readFileText(file.url)
      .then((t) => !cancelled && setText(t.length > MAX_TEXT_PREVIEW ? `${t.slice(0, MAX_TEXT_PREVIEW)}\n\n… (preview truncated)` : t))
      .catch(() => !cancelled && setText('Could not read this file.'));
    return () => { cancelled = true; };
  }, [file.url, kind]);

  if (kind === 'image') {
    return (
      <div className="flex items-center justify-center p-3 bg-ink-500/5 dark:bg-white/5 rounded-xl">
        <StoredImage url={file.url} alt={file.name} className="max-h-[60vh] max-w-full rounded-md object-contain" placeholderClassName="w-48 h-32" />
      </div>
    );
  }
  if (kind === 'pdf') return src ? <iframe title={file.name} src={src} className="w-full h-[60vh] rounded-xl border-0 bg-white" /> : <p className="text-fluid-sm text-ink-500 py-10 text-center">Loading…</p>;
  if (kind === 'text') {
    return (
      <pre className="max-h-[60vh] overflow-auto rounded-xl bg-ink-500/5 dark:bg-white/5 p-3.5 text-fluid-xs leading-relaxed text-ink-700 dark:text-ink-300 whitespace-pre-wrap break-words font-mono">
        {text ?? 'Loading…'}
      </pre>
    );
  }
  return (
    <div className="flex flex-col items-center text-center py-10 px-4 text-ink-500">
      <File size={26} className="mb-2 opacity-60" />
      <p className="text-fluid-sm">No in-app preview for this file type.</p>
      <p className="text-fluid-xs mt-0.5">Use Download to open it in the right app.</p>
    </div>
  );
}

/** Pop-up viewer for a single file (image, PDF and text are shown in place). */
export function FileViewerModal({ file, onClose }) {
  const { notify } = useApi();
  if (!file) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={file.name}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button icon={<Download size={14} />} onClick={() => downloadFile(file).catch((e) => notify(e.message))}>Download</Button>
        </>
      }
    >
      <Preview file={file} />
    </Modal>
  );
}

/**
 * A list of turned-in files with View + Download buttons on every row. `files` are
 * { name, size, url, mime }. Opening a file shows it in the viewer pop-up.
 */
export function FileList({ files = [], emptyText = 'No files attached.' }) {
  const [viewing, setViewing] = useState(null);
  const { notify } = useApi();
  if (files.length === 0) return <p className="text-fluid-xs text-ink-500">{emptyText}</p>;
  return (
    <>
      <ul className="space-y-1.5">
        {files.map((f, i) => {
          const Icon = iconForFile(f);
          return (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2.5 rounded-lg bg-surface-card dark:bg-white/5 border border-ink-500/10 dark:border-white/10 px-3 py-2">
              <span className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-700 dark:text-brand-300 flex items-center justify-center shrink-0"><Icon size={15} /></span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-fluid-sm font-medium text-ink-900 dark:text-white">{f.name}</span>
                <span className="block text-fluid-xs text-ink-500">{formatBytes(f.size)}</span>
              </span>
              {f.url ? (
                <>
                  <button type="button" onClick={() => setViewing(f)} aria-label={`View ${f.name}`} title="View file" className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-fluid-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-500/10 transition-colors">
                    <Eye size={13} /> View
                  </button>
                  <button type="button" onClick={() => downloadFile(f).catch((e) => notify(e.message))} aria-label={`Download ${f.name}`} title="Download" className="p-1.5 rounded-full text-ink-500 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors">
                    <Download size={14} />
                  </button>
                </>
              ) : (
                <span className="text-fluid-xs text-ink-500">Preview unavailable</span>
              )}
            </li>
          );
        })}
      </ul>
      <FileViewerModal file={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
