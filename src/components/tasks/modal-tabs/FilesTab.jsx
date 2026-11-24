import { useEffect, useRef, useState } from 'react';
import { collectFiles, downloadFile, formatBytes, MAX_FILE_BYTES } from '../../common/FileViewer';
import StoredImage from '../../common/StoredImage';
import { useFileUrl } from '../../../hooks/useFileUrl';
import { readFileText } from '../../../api/protectedUrl';
import {
  Paperclip,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  File,
  Trash2,
  Download,
  Upload,
  Eye,
  X,
  Check,
} from 'lucide-react';
import { ATTACHMENT_TYPE_META } from '../../../data/mockData';
import { useApi } from '../../../context/ApiContext';

const typeIcon = {
  pdf: FileText,
  docx: FileText,
  xlsx: FileSpreadsheet,
  image: FileImage,
  zip: FileArchive,
  other: File,
};

const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'log', 'xml', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'yml', 'yaml'];
const MAX_TEXT_PREVIEW = 20000;

/** Infers a coarse file "type" bucket from a filename extension. */
function inferType(name) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xlsx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['zip', 'rar', '7z'].includes(ext)) return 'zip';
  return 'other';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** What kind of in-app preview (if any) a stored attachment supports. */
function previewKind(a) {
  if (!a.url) return null;
  const ext = a.name.split('.').pop()?.toLowerCase() || '';
  if (a.mime?.startsWith('image/') || a.type === 'image') return 'image';
  if (a.mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (a.mime?.startsWith('text/') || TEXT_EXTENSIONS.includes(ext)) return 'text';
  return 'none';
}

/** Inline preview panel for the file currently being viewed. */
function PreviewPanel({ attachment, onClose, onDownload }) {
  const kind = previewKind(attachment);
  const [text, setText] = useState(null);
  const src = useFileUrl(attachment.url);

  useEffect(() => {
    if (kind !== 'text') return undefined;
    let cancelled = false;
    readFileText(attachment.url)
      .then((t) => {
        if (!cancelled) setText(t.length > MAX_TEXT_PREVIEW ? `${t.slice(0, MAX_TEXT_PREVIEW)}\n\n… (preview truncated)` : t);
      })
      .catch(() => !cancelled && setText('Could not read this file.'));
    return () => {
      cancelled = true;
    };
  }, [attachment.url, kind]);

  return (
    <div className="rounded-xl border border-brand-600/30 bg-surface-card dark:bg-surface-darkcard shadow-soft overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-ink-500/10 dark:border-white/10 bg-brand-500/5">
        <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white truncate">{attachment.name}</p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-fluid-xs font-medium text-ink-700 dark:text-ink-300 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors"
          >
            <Download size={13} /> Download
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="p-1.5 rounded-md text-ink-500 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="max-h-[320px] overflow-auto">
        {kind === 'image' && (
          <div className="flex items-center justify-center p-3 bg-ink-500/5 dark:bg-white/5">
            <StoredImage url={attachment.url} alt={attachment.name} className="max-h-[290px] max-w-full rounded-md object-contain" placeholderClassName="w-48 h-32" />
          </div>
        )}
        {kind === 'pdf' && (
          src ? <iframe title={attachment.name} src={src} className="w-full h-[320px] border-0 bg-white" /> : <p className="text-fluid-sm text-ink-500 py-8 text-center">Loading…</p>
        )}
        {kind === 'text' && (
          <pre className="p-3.5 text-fluid-xs leading-relaxed text-ink-700 dark:text-ink-300 whitespace-pre-wrap break-words font-mono">
            {text ?? 'Loading…'}
          </pre>
        )}
        {kind === 'none' && (
          <div className="flex flex-col items-center text-center py-8 px-4 text-ink-500">
            <File size={22} className="mb-2 opacity-60" />
            <p className="text-fluid-sm">No in-app preview for this file type.</p>
            <p className="text-fluid-xs mt-0.5">Use Download to open it in the right app.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * File management tab: upload (click or drag-and-drop), then view, download
 * or delete each file. Files stay in the browser (object URLs) — nothing is
 * sent to a server — so they last for the session. Sample attachments that
 * ship without file data show disabled View/Download buttons.
 *
 * Works on either a saved task or a not-yet-created draft (the parent passes an `api`).
 *
 * @param {{ api: ReturnType<typeof import('../useTaskEditor').default>['api'] }} props
 */
export default function FilesTab({ api }) {
  const { addAttachment, removeAttachment } = api;
  const { api: dataApi, notify } = useApi(); // the data layer: files are uploaded first, then attached by id
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const attachments = api.attachments;
  const previewing = attachments.find((a) => a.id === previewId) || null;

  const handleFiles = async (fileList) => {
    // Copy the files out of the live FileList first, then reset the input.
    const { accepted, rejected } = collectFiles(fileList);
    if (inputRef.current) inputRef.current.value = '';
    setUploadError(rejected.length ? `${rejected.map((f) => f.name).join(', ')} ${rejected.length === 1 ? 'is' : 'are'} over ${formatBytes(MAX_FILE_BYTES)} and was skipped.` : '');
    for (const file of accepted) {
      try {
        const stored = await dataApi.files.uploadFile(file);
        await addAttachment({
          fileId: stored.id,
          name: stored.name,
          type: inferType(file.name),
          size: formatSize(file.size),
          mime: stored.mime,
          url: stored.url,
        });
      } catch (e) {
        setUploadError(e.message || 'That file could not be uploaded.');
      }
    }
  };

  const download = (a) => downloadFile(a).catch((e) => notify(e.message));

  const handleDelete = (a) => {
    removeAttachment(a.id);
    if (previewId === a.id) setPreviewId(null);
    setConfirmId(null);
  };

  const iconBtn =
    'p-1.5 rounded-md transition-colors shrink-0 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  return (
    <div className="space-y-4">
      {previewing && (
        <PreviewPanel attachment={previewing} onClose={() => setPreviewId(null)} onDownload={() => download(previewing)} />
      )}

      {attachments.length === 0 ? (
        <div className="flex flex-col items-center text-center py-6 text-ink-500">
          <Paperclip size={22} className="mb-2 opacity-60" />
          <p className="text-fluid-sm">No files attached yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => {
            const Icon = typeIcon[a.type] || File;
            const hasData = Boolean(a.url);
            const confirming = confirmId === a.id;
            const active = previewId === a.id;
            return (
              <li
                key={a.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  active ? 'border-brand-600/40 bg-brand-500/5' : 'border-ink-500/10 dark:border-white/10'
                }`}
              >
                {a.type === 'image' && hasData ? (
                  <StoredImage url={a.url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-ink-500/10 dark:border-white/10" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-ink-500/10 dark:bg-white/10 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-ink-700 dark:text-ink-300" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-fluid-sm font-medium text-ink-900 dark:text-white truncate">{a.name}</p>
                  <p className="text-fluid-xs text-ink-500 truncate">
                    {ATTACHMENT_TYPE_META[a.type]?.label || 'File'} · {a.size} · {a.uploadedBy}
                    {a.uploadedAt && ` · ${formatWhen(a.uploadedAt)}`}
                  </p>
                </div>

                {confirming ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-fluid-xs text-ink-500 mr-1 hidden sm:inline">Delete?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(a)}
                      className="inline-flex items-center gap-1 rounded-full bg-coral-500 text-white text-fluid-xs font-semibold px-2.5 py-1 hover:bg-coral-600 transition-colors"
                    >
                      <Check size={12} /> Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-full text-fluid-xs font-medium px-2.5 py-1 text-ink-700 dark:text-ink-300 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewId(active ? null : a.id)}
                      disabled={!hasData}
                      title={hasData ? (active ? 'Hide preview' : 'View file') : 'Sample file — no data to view'}
                      aria-label={`View ${a.name}`}
                      aria-pressed={active}
                      className={`${iconBtn} ${active ? 'text-brand-700 bg-brand-500/10' : 'text-ink-500 hover:bg-ink-500/10 dark:hover:bg-white/10'}`}
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => download(a)}
                      disabled={!hasData}
                      title={hasData ? 'Download file' : 'Sample file — no data to download'}
                      aria-label={`Download ${a.name}`}
                      className={`${iconBtn} text-ink-500 hover:bg-ink-500/10 dark:hover:bg-white/10`}
                    >
                      <Download size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(a.id)}
                      title="Delete file"
                      aria-label={`Delete ${a.name}`}
                      className={`${iconBtn} text-coral-600 hover:bg-coral-500/10`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={`w-full flex flex-col items-center justify-center gap-1.5 border border-dashed rounded-xl py-6 transition-colors ${
          dragging
            ? 'border-brand-600 bg-brand-500/10 text-brand-700'
            : 'border-ink-500/25 dark:border-white/20 text-ink-500 hover:border-brand-500/50 hover:text-brand-600'
        }`}
      >
        <Upload size={18} />
        <span className="text-fluid-xs font-medium">{dragging ? 'Drop to upload' : 'Click or drag files here to upload'}</span>
        <span className="text-fluid-xs text-ink-500">PDF, DOCX, XLSX, images, ZIP</span>
      </button>
      {uploadError && <p role="alert" className="text-fluid-xs text-coral-600">{uploadError}</p>}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
    </div>
  );
}
